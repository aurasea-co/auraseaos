// F&B recommendation engine. Mirror of lib/recommendations/hotel/engine.ts
// but for restaurants/cafés. Pure functions — no I/O, no clock reads.
//
// Inputs come from two layers:
//   - fnb_daily_metrics (the existing aggregate-entry table) — revenue,
//     covers, cost_food, cost_nonfood per day
//   - fnb_daily_sales × menu_items (the SKU-grained layer, migration 034)
//     — units_sold per (date × menu_item), joined with price + cost
//     from menu_items
//
// Outputs are FnbRecommendation rows: structured signals with urgency
// + bilingual messages, ready to render on MenuDesk or pipe into the
// future LINE brief. Same shape philosophy as the hotel engine so
// downstream code (composer, dedup, brief builder) can stay parallel.
//
// THB integers throughout per AURASEA_HOUSE_STYLE.md.

export type FnbRecommendationType =
  | 'low_margin'
  | 'high_food_cost'
  | 'top_mover'
  | 'dead_item'
  | 'weekend_opportunity'
  | 'revenue_drop'
  | 'no_data_alert'

export interface FnbRecommendation {
  type: FnbRecommendationType
  /** Date the rec applies to — usually tomorrow. */
  date: string
  messageTh: string
  messageEn: string
  urgency: 'high' | 'medium' | 'low'
  supportingData: Record<string, unknown>
  /** Minimum days needed to even generate this rec type. */
  requiresMinDays: number
}

// What the engine needs per day. A minimal subset of FnbDailyMetric.
// itemSales is the per-menu-item breakdown for the day; when absent
// (manual aggregate entries without POS / CSV sales), the SKU-level
// signals (top_mover, dead_item) won't fire.
export interface FnbRecommendationInput {
  date: string
  /** THB. */
  revenueThb: number
  /** Covers / customers. Optional — some F&B branches don't track. */
  totalCovers: number | null
  /** Food cost (cost_food column). Null when not entered for this day. */
  costFoodThb: number | null
  /** Non-food cost (cost_nonfood). Null when not entered. */
  costNonFoodThb: number | null
  /** Per-item sales for the day. Optional — only present when
   *  attachItemSales() runs on a window that has POS/CSV data. */
  itemSales?: ReadonlyArray<{
    menuItemId: string
    name: string
    category: string | null
    unitsSold: number
    priceThb: number
    costThb: number | null
  }>
}

// ── Helpers ────────────────────────────────────────────────────────────────

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function pickLatest(days: FnbRecommendationInput[]): FnbRecommendationInput {
  return days[days.length - 1]
}

function avgRevenue(days: FnbRecommendationInput[]): number {
  if (days.length === 0) return 0
  return days.reduce((s, d) => s + d.revenueThb, 0) / days.length
}

// ── Signals ────────────────────────────────────────────────────────────────

// High food cost % — fires when (sum cost_food / sum revenue) over
// the recent 3-day window exceeds 40%. 40% is the conventional
// industry ceiling for ฿-priced casual dining; full-service might
// run higher and the owner can override the target via /settings/targets
// in a future iteration. For now the threshold is hard-coded.
export function detectHighFoodCost(days: FnbRecommendationInput[]): FnbRecommendation[] {
  if (days.length < 3) return []
  const recent = days.slice(-3)
  // Only fire when EVERY day in the window has cost_food filled —
  // partial data would give a misleading aggregate.
  const allHaveCost = recent.every((d) => d.costFoodThb != null && d.costFoodThb > 0)
  if (!allHaveCost) return []
  const totalRev = recent.reduce((s, d) => s + d.revenueThb, 0)
  const totalCost = recent.reduce((s, d) => s + (d.costFoodThb ?? 0), 0)
  if (totalRev <= 0) return []
  const foodCostPct = (totalCost / totalRev) * 100
  if (foodCostPct <= 40) return []
  const latest = pickLatest(days)
  const pctRounded = foodCostPct.toFixed(1)
  return [{
    type: 'high_food_cost',
    date: addDays(latest.date, 1),
    messageTh: `Food cost ${pctRounded}% สูงกว่าเป้า 40% ใน 3 วัน — พิจารณาปรับราคาขายหรือลด yield loss`,
    messageEn: `Food cost ${pctRounded}% above 40% target over 3 days — consider raising prices or reducing yield loss`,
    urgency: foodCostPct > 45 ? 'high' : 'medium',
    supportingData: { foodCostPct, days: 3, totalRevThb: totalRev, totalCostThb: totalCost },
    requiresMinDays: 3,
  }]
}

// Top mover surfacing — when itemSales data is present, surface the
// best-selling item over the recent 7 days as a low-urgency
// "this is what's driving you" reminder. Useful for menu engineering:
// the owner knows what to keep stocked / well-staffed.
export function detectTopMover(days: FnbRecommendationInput[]): FnbRecommendation[] {
  const recent = days.slice(-7)
  const withSales = recent.filter((d) => Array.isArray(d.itemSales) && (d.itemSales?.length ?? 0) > 0)
  // Need ≥2 days of SKU data to call something a "mover" — one day
  // could be a fluke. Earlier threshold was 3 but kept the signal
  // hidden for branches that imported sparse historical data.
  if (withSales.length < 2) return []

  // Aggregate units across the window.
  const byItem = new Map<string, { name: string; category: string | null; units: number }>()
  for (const d of withSales) {
    for (const s of d.itemSales ?? []) {
      const prev = byItem.get(s.menuItemId) || { name: s.name, category: s.category, units: 0 }
      prev.units += s.unitsSold
      byItem.set(s.menuItemId, prev)
    }
  }
  if (byItem.size === 0) return []

  const sorted = Array.from(byItem.values()).sort((a, b) => b.units - a.units)
  const top = sorted[0]
  if (top.units <= 0) return []
  const totalUnits = sorted.reduce((s, x) => s + x.units, 0)
  const sharePct = Math.round((top.units / totalUnits) * 100)
  const latest = pickLatest(days)

  return [{
    type: 'top_mover',
    date: addDays(latest.date, 1),
    messageTh: `เมนูขายดีสุดสัปดาห์นี้: ${top.name} (${top.units} หน่วย · ${sharePct}% ของยอดขายรวม)`,
    messageEn: `Top mover this week: ${top.name} (${top.units} units · ${sharePct}% of total volume)`,
    urgency: 'low',
    supportingData: { menuItem: top.name, units: top.units, sharePct, daysOfData: withSales.length },
    requiresMinDays: 3,
  }]
}

// Dead-item detection — items in the catalog that have ZERO sales
// across the recent 14 days despite having had sales in the prior
// 14 days. Catches the "we kept making this but nobody buys it
// anymore" case. Surfaces only ONE rec naming up to 3 items, not
// per-item recs (don't spam the brief).
export function detectDeadItems(days: FnbRecommendationInput[]): FnbRecommendation[] {
  const recent = days.slice(-14)
  const prior = days.slice(-28, -14)
  if (recent.length < 7 || prior.length < 7) return []

  const inputsWithSales = (window: FnbRecommendationInput[]) =>
    window.filter((d) => Array.isArray(d.itemSales) && (d.itemSales?.length ?? 0) > 0)
  if (inputsWithSales(recent).length < 5 || inputsWithSales(prior).length < 5) return []

  const itemsInWindow = (window: FnbRecommendationInput[]) => {
    const map = new Map<string, { name: string; units: number }>()
    for (const d of window) {
      for (const s of d.itemSales ?? []) {
        const prev = map.get(s.menuItemId) || { name: s.name, units: 0 }
        prev.units += s.unitsSold
        map.set(s.menuItemId, prev)
      }
    }
    return map
  }

  const recentMap = itemsInWindow(recent)
  const priorMap = itemsInWindow(prior)

  // Dead = was sold in prior window, zero (or absent) in recent window.
  // Use Array.from to avoid relying on Map iterator downleveling
  // (tsconfig has no explicit target so the default may not allow
  // direct for-of on .entries()).
  const dead: Array<{ name: string; priorUnits: number }> = []
  for (const [id, p] of Array.from(priorMap.entries())) {
    if (p.units < 10) continue  // ignore low-traffic items — too noisy
    const r = recentMap.get(id)
    if (!r || r.units === 0) {
      dead.push({ name: p.name, priorUnits: p.units })
    }
  }
  if (dead.length === 0) return []

  // Cap to 3 names to keep the message readable.
  const top = dead.sort((a, b) => b.priorUnits - a.priorUnits).slice(0, 3)
  const names = top.map((x) => x.name).join(', ')
  const latest = pickLatest(days)
  return [{
    type: 'dead_item',
    date: addDays(latest.date, 1),
    messageTh: `เมนูที่ไม่มียอดขายใน 14 วันที่ผ่านมา (เคยขายดี): ${names} — พิจารณาถอดออกจากเมนู`,
    messageEn: `Items with zero sales in last 14 days (were selling before): ${names} — consider removing from the menu`,
    urgency: 'medium',
    supportingData: { count: dead.length, items: top.map((x) => x.name) },
    requiresMinDays: 21,
  }]
}

// Weekend opportunity — F&B weekend (Fri/Sat) revenue significantly
// higher than weekday suggests price-sensitive weekday demand. Same
// shape as the hotel version's signal.
export function detectFnbWeekendOpportunity(days: FnbRecommendationInput[]): FnbRecommendation[] {
  if (days.length < 7) return []
  const weekend = days.filter((d) => {
    const dow = new Date(`${d.date}T00:00:00Z`).getUTCDay()
    return dow === 5 || dow === 6
  })
  const weekday = days.filter((d) => {
    const dow = new Date(`${d.date}T00:00:00Z`).getUTCDay()
    return dow !== 5 && dow !== 6
  })
  if (weekend.length === 0 || weekday.length === 0) return []
  const wkndRev = avgRevenue(weekend)
  const wdayRev = avgRevenue(weekday)
  if (wdayRev <= 0 || wkndRev <= wdayRev * 1.3) return []
  const latest = pickLatest(days)
  const wkndStr = Math.round(wkndRev).toLocaleString('th-TH')
  const wdayStr = Math.round(wdayRev).toLocaleString('th-TH')
  return [{
    type: 'weekend_opportunity',
    date: latest.date,
    messageTh: `รายได้วันศุกร์-เสาร์ ฿${wkndStr} สูงกว่าวันธรรมดา ฿${wdayStr} มาก — พิจารณาโปรโมชั่นวันธรรมดา`,
    messageEn: `Weekend revenue ฿${wkndStr} far above weekday ฿${wdayStr} — consider weekday promo to fill the gap`,
    urgency: 'medium',
    supportingData: { weekendAvgThb: wkndRev, weekdayAvgThb: wdayRev },
    requiresMinDays: 7,
  }]
}

// Revenue drop — recent 7-day avg revenue is meaningfully below the
// prior 7-day window. Catches the "we're slipping" trend before the
// monthly review notices. ~15% drop threshold avoids noise.
export function detectRevenueDrop(days: FnbRecommendationInput[]): FnbRecommendation[] {
  if (days.length < 14) return []
  const recent = days.slice(-7)
  const prior = days.slice(-14, -7)
  const recentAvg = avgRevenue(recent)
  const priorAvg = avgRevenue(prior)
  if (priorAvg <= 0) return []
  const dropRatio = (priorAvg - recentAvg) / priorAvg
  if (dropRatio < 0.15) return []  // less than 15% drop is noise
  const dropPct = Math.round(dropRatio * 100)
  const latest = pickLatest(days)
  return [{
    type: 'revenue_drop',
    date: latest.date,
    messageTh: `รายได้เฉลี่ย 7 วันที่ผ่านมาลดลง ${dropPct}% เมื่อเทียบกับสัปดาห์ก่อน — ตรวจสอบสาเหตุ`,
    messageEn: `7-day average revenue down ${dropPct}% vs the previous week — investigate causes`,
    urgency: dropPct > 25 ? 'high' : 'medium',
    supportingData: { dropPct, recentAvgThb: recentAvg, priorAvgThb: priorAvg },
    requiresMinDays: 14,
  }]
}

// ── Composer ──────────────────────────────────────────────────────────────

export function generateFnbDailyRecommendations(
  days: FnbRecommendationInput[],
): FnbRecommendation[] {
  if (days.length === 0) return []
  const all = [
    ...detectHighFoodCost(days),
    ...detectTopMover(days),
    ...detectDeadItems(days),
    ...detectFnbWeekendOpportunity(days),
    ...detectRevenueDrop(days),
  ]
  // Dedupe by type, keep highest urgency on collisions.
  const order: Record<FnbRecommendation['urgency'], number> = { high: 0, medium: 1, low: 2 }
  const byType = new Map<FnbRecommendationType, FnbRecommendation>()
  for (const r of all) {
    const existing = byType.get(r.type)
    if (!existing || order[r.urgency] < order[existing.urgency]) byType.set(r.type, r)
  }
  return Array.from(byType.values())
    .sort((a, b) => order[a.urgency] - order[b.urgency])
    .slice(0, 5)
}

// ── Adapters ──────────────────────────────────────────────────────────────

// Project fnb_daily_metrics rows into the engine's input shape.
// Skips rows where revenue is null/zero so empty days don't dilute
// the signals' averages.
export interface FnbRowForRec {
  metric_date: string
  revenue: number | null
  total_customers: number | null
  cost_food: number | null
  cost_nonfood: number | null
}

export function toFnbRecommendationInputs(rows: FnbRowForRec[]): FnbRecommendationInput[] {
  const out: FnbRecommendationInput[] = []
  for (const r of rows) {
    const rev = Number(r.revenue) || 0
    if (rev <= 0) continue
    out.push({
      date: r.metric_date,
      revenueThb: rev,
      totalCovers: r.total_customers,
      costFoodThb: r.cost_food,
      costNonFoodThb: r.cost_nonfood,
    })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

// Decorate per-day inputs with item-sales data (from fnb_daily_sales
// × menu_items joined client-side). Same pattern as
// attachCompetitorRates() for hotels — pure function, returns the
// input list with itemSales populated on matching dates.
export interface FnbDailySaleRow {
  date: string
  menuItemId: string
  name: string
  category: string | null
  unitsSold: number
  priceThb: number
  costThb: number | null
}

export function attachItemSales(
  inputs: FnbRecommendationInput[],
  sales: FnbDailySaleRow[],
): FnbRecommendationInput[] {
  const byDate = new Map<string, FnbDailySaleRow[]>()
  for (const s of sales) {
    const arr = byDate.get(s.date) || []
    arr.push(s)
    byDate.set(s.date, arr)
  }
  return inputs.map((i) => {
    const hits = byDate.get(i.date)
    if (!hits || hits.length === 0) return i
    return {
      ...i,
      itemSales: hits.map((s) => ({
        menuItemId: s.menuItemId,
        name: s.name,
        category: s.category,
        unitsSold: s.unitsSold,
        priceThb: s.priceThb,
        costThb: s.costThb,
      })),
    }
  })
}
