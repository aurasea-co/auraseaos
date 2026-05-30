// RateDesk rate-optimisation engine. Pure functions only — no
// Supabase, no I/O, no clock reads except as injectable parameters
// so tests stay deterministic. Money is THB integers (matches the
// canonical CanonicalHotelDay shape; the spec's `_satang` suffixes
// don't apply to this codebase). All functions degrade gracefully:
// when the input has fewer days than a signal requires, they return
// [] instead of throwing — see requiresMinDays on each output.

export type HotelRecommendationType =
  | 'rate_increase'
  | 'rate_decrease'
  | 'rate_hold'
  | 'low_occupancy_alert'
  | 'weekend_opportunity'

export interface HotelRecommendation {
  type: HotelRecommendationType
  /** The date the recommendation applies to. Usually tomorrow. */
  date: string
  /** THB integer; present when the rec proposes a new rate. */
  suggestedRateThb?: number
  /** THB integer at the time of the rec (latest day's ADR). */
  currentRateThb?: number
  messageTh: string
  messageEn: string
  urgency: 'high' | 'medium' | 'low'
  supportingData: Record<string, unknown>
  /** Minimum days needed to even generate this rec type. */
  requiresMinDays: number
}

// What the engine needs per day. A minimal subset of CanonicalHotelDay
// that the dashboard's MetricRow can be projected into via
// toRecommendationInputs() below.
export interface RecommendationInput {
  /** YYYY-MM-DD, Bangkok-day. */
  date: string
  /** 0..1 float. */
  occupancyRate: number
  /** THB. */
  adrThb: number
}

// ── Helpers ────────────────────────────────────────────────────────────────

function addDays(dateStr: string, n: number): string {
  // String-arithmetic so we don't accidentally roll a TZ boundary
  // when the host is in PT/UTC etc. The input is a pure Bangkok
  // calendar date; we treat the date as the canonical anchor.
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function nextWeekend(dateStr: string): string {
  // "Weekend" is Friday (DOW 5) — the night that fills first in
  // Thai hospitality. If today already IS Friday, jump to next Friday.
  const d = new Date(`${dateStr}T00:00:00Z`)
  const dow = d.getUTCDay()
  const daysUntilFri = (5 - dow + 7) % 7 || 7
  return addDays(dateStr, daysUntilFri)
}

function avgOccupancy(days: RecommendationInput[]): number {
  if (days.length === 0) return 0
  return days.reduce((s, d) => s + d.occupancyRate, 0) / days.length
}

function pickLatest(days: RecommendationInput[]): RecommendationInput {
  return days[days.length - 1]
}

// ── Signals ────────────────────────────────────────────────────────────────

export function suggestRates(days: RecommendationInput[]): HotelRecommendation[] {
  // 3-day window — minimum quorum Crystal Resort has during the
  // launch debugging cycle. Anything stricter would silently produce
  // nothing for a brand-new branch.
  if (days.length < 3) return []
  const recent = days.slice(-3)
  const occ = avgOccupancy(recent)
  const latest = pickLatest(days)
  const currentRate = Math.round(latest.adrThb)
  const occPct = Math.round(occ * 100)

  if (occ > 0.85) {
    const lift = Math.round(currentRate * 0.10)
    const newRate = currentRate + lift
    return [{
      type: 'rate_increase',
      date: addDays(latest.date, 1),
      suggestedRateThb: newRate,
      currentRateThb: currentRate,
      messageTh: `Occupancy สูง ${occPct}% ติดต่อกัน 3 วัน — แนะนำขึ้นราคา ฿${lift.toLocaleString('th-TH')} (฿${currentRate.toLocaleString('th-TH')} → ฿${newRate.toLocaleString('th-TH')})`,
      messageEn: `High occupancy ${occPct}% for 3 days — suggest raising rate by ฿${lift.toLocaleString('en-US')} (฿${currentRate.toLocaleString('en-US')} → ฿${newRate.toLocaleString('en-US')})`,
      urgency: 'high',
      supportingData: { avgOccupancy: occ, days: 3, currentRateThb: currentRate, liftThb: lift },
      requiresMinDays: 3,
    }]
  }
  if (occ < 0.40) {
    const drop = Math.round(currentRate * 0.06)
    const newRate = currentRate - drop
    return [{
      type: 'rate_decrease',
      date: addDays(latest.date, 1),
      suggestedRateThb: newRate,
      currentRateThb: currentRate,
      messageTh: `Occupancy ต่ำ ${occPct}% ติดต่อกัน 3 วัน — พิจารณาลดราคา ฿${drop.toLocaleString('th-TH')} เพื่อกระตุ้นการจอง`,
      messageEn: `Low occupancy ${occPct}% for 3 days — consider reducing rate by ฿${drop.toLocaleString('en-US')}`,
      urgency: 'medium',
      supportingData: { avgOccupancy: occ, days: 3, currentRateThb: currentRate, dropThb: drop },
      requiresMinDays: 3,
    }]
  }
  return [{
    type: 'rate_hold',
    date: addDays(latest.date, 1),
    currentRateThb: currentRate,
    messageTh: `Occupancy ${occPct}% — ราคาปัจจุบันเหมาะสม`,
    messageEn: `Occupancy ${occPct}% — current rate is appropriate`,
    urgency: 'low',
    supportingData: { avgOccupancy: occ, days: 3, currentRateThb: currentRate },
    requiresMinDays: 3,
  }]
}

export function detectLowOccupancy(days: RecommendationInput[]): HotelRecommendation[] {
  if (days.length < 3) return []
  const recent = days.slice(-3)
  const occ = avgOccupancy(recent)
  if (occ >= 0.30) return []
  const latest = pickLatest(days)
  const occPct = Math.round(occ * 100)
  return [{
    type: 'low_occupancy_alert',
    date: latest.date,
    messageTh: `⚠ Occupancy ต่ำมาก ${occPct}% ใน 3 วันที่ผ่านมา — พิจารณาโปรโมชันหรือช่องทาง OTA เพิ่ม`,
    messageEn: `⚠ Very low occupancy ${occPct}% over last 3 days — consider promotions or additional OTA channels`,
    urgency: 'high',
    supportingData: { avgOccupancy: occ, days: 3 },
    requiresMinDays: 3,
  }]
}

export function detectWeekendOpportunity(days: RecommendationInput[]): HotelRecommendation[] {
  if (days.length < 7) return []
  const weekend = days.filter((d) => {
    const dow = new Date(`${d.date}T00:00:00Z`).getUTCDay()
    return dow === 5 || dow === 6 // Friday + Saturday nights
  })
  const weekday = days.filter((d) => {
    const dow = new Date(`${d.date}T00:00:00Z`).getUTCDay()
    return dow !== 5 && dow !== 6
  })
  if (weekend.length === 0 || weekday.length === 0) return []
  const wkndOcc = avgOccupancy(weekend)
  const wdayOcc = avgOccupancy(weekday)
  if (wkndOcc <= wdayOcc * 1.2) return []
  const latest = pickLatest(days)
  const wkndPct = Math.round(wkndOcc * 100)
  const wdayPct = Math.round(wdayOcc * 100)
  return [{
    type: 'weekend_opportunity',
    date: nextWeekend(latest.date),
    messageTh: `Weekend occupancy ${wkndPct}% สูงกว่า weekday ${wdayPct}% — ตั้งราคา weekend premium`,
    messageEn: `Weekend occupancy ${wkndPct}% vs weekday ${wdayPct}% — consider a weekend premium rate`,
    urgency: 'medium',
    supportingData: { weekendOccupancy: wkndOcc, weekdayOccupancy: wdayOcc },
    requiresMinDays: 7,
  }]
}

export function forecastTomorrow(
  days: RecommendationInput[],
): { expectedOccupancy: number; suggestedRateThb: number } | null {
  if (days.length < 3) return null
  const latest = pickLatest(days)
  const tomorrowDow = new Date(`${addDays(latest.date, 1)}T00:00:00Z`).getUTCDay()
  const sameDow = days.filter(
    (d) => new Date(`${d.date}T00:00:00Z`).getUTCDay() === tomorrowDow,
  )
  const rolling = days.slice(-7)
  const rollingAvg = avgOccupancy(rolling)
  const dowAvg = sameDow.length > 0 ? avgOccupancy(sameDow) : rollingAvg
  // 60/40 weighting: same-day-of-week history dominates but the
  // rolling average grounds the forecast when DOW history is thin.
  const expectedOccupancy = dowAvg * 0.6 + rollingAvg * 0.4
  const currentRate = Math.round(latest.adrThb)
  const suggested =
    expectedOccupancy > 0.75
      ? Math.round(currentRate * 1.05)
      : expectedOccupancy < 0.35
        ? Math.round(currentRate * 0.95)
        : currentRate
  return { expectedOccupancy, suggestedRateThb: suggested }
}

// ── Composition ────────────────────────────────────────────────────────────

export function generateDailyRecommendations(
  days: RecommendationInput[],
): HotelRecommendation[] {
  if (days.length === 0) return []
  const all = [
    ...suggestRates(days),
    ...detectLowOccupancy(days),
    ...detectWeekendOpportunity(days),
  ]
  // Dedupe by type, keep highest urgency on collisions.
  const order: Record<HotelRecommendation['urgency'], number> = { high: 0, medium: 1, low: 2 }
  const byType = new Map<HotelRecommendationType, HotelRecommendation>()
  for (const r of all) {
    const existing = byType.get(r.type)
    if (!existing || order[r.urgency] < order[existing.urgency]) byType.set(r.type, r)
  }
  return Array.from(byType.values())
    .sort((a, b) => order[a.urgency] - order[b.urgency])
    .slice(0, 5)
}

// ── Adapter ────────────────────────────────────────────────────────────────

// Project the dashboard's accommodation_daily_metrics rows into the
// engine's RecommendationInput shape. Computes per-day occupancy and
// ADR on the fly so the engine doesn't need to know the column layout.
// Skips rows where the math would divide by zero so the engine input
// stays clean.
export interface AccommodationRowForRec {
  metric_date: string
  rooms_available: number | null
  rooms_sold: number | null
  revenue: number | null
}

export function toRecommendationInputs(
  rows: AccommodationRowForRec[],
): RecommendationInput[] {
  const out: RecommendationInput[] = []
  for (const r of rows) {
    const available = r.rooms_available ?? 0
    const sold = r.rooms_sold ?? 0
    const revenue = r.revenue ?? 0
    if (available <= 0 || sold <= 0) continue
    out.push({
      date: r.metric_date,
      occupancyRate: sold / available,
      adrThb: revenue / sold,
    })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}
