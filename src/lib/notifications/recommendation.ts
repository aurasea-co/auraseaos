/**
 * Data-driven recommendation engine for the morning flash + weekly report.
 *
 * Rules read multiple signals (current vs target, last-7-day trend, supporting
 * metrics like cost ratio / avg spend) and pick the highest-priority message.
 * Ordering matters — the first matching branch returns, so put the most
 * actionable signal first.
 */

export interface HotelRecommendationData {
  adr: number
  adrTarget: number
  occupancy: number
  occupancyTarget: number
  revenue: number
  roomsAvailable: number
  recentMetrics: Array<{
    adr: number | null
    occupancy_rate: number | null
    revenue: number | null
    metric_date: string
  }>
}

export interface FnbRecommendationData {
  /** 30-day rolling avg gross margin. */
  marginAvg: number
  /** Latest day's gross margin, null when cost wasn't entered or the
   *  computed value falls outside the sanity band. */
  latestMargin: number | null
  marginTarget: number
  covers: number
  coversTarget: number
  avgSpend: number
  revenue: number
  recentMetrics: Array<{
    revenue: number | null
    additional_cost_today: number | null
    total_customers: number | null
    metric_date: string
  }>
}

export function generateHotelRecommendation(data: HotelRecommendationData): string {
  const { adr, adrTarget, occupancy, occupancyTarget, roomsAvailable, recentMetrics } = data
  const adrGap = adr - adrTarget
  const occGap = occupancy - occupancyTarget

  // Consecutive days ending today where ADR fell short. We iterate the
  // most-recent → oldest order via a non-mutating reversed copy.
  const recentAdr = recentMetrics.filter((m) => m.adr != null && (m.adr as number) > 0)
  const recentAdrRev = recentAdr.slice().reverse()
  const firstAdrAtTarget = recentAdrRev.findIndex((m) => (m.adr as number) >= adrTarget)
  const adrDaysBelow = firstAdrAtTarget === -1 ? recentAdr.length : firstAdrAtTarget

  // Revenue trend across the visible 7-day window
  const revenues = recentMetrics
    .filter((m) => m.revenue != null && (m.revenue as number) > 0)
    .map((m) => m.revenue as number)
  const revTrend = revenues.length >= 2 ? revenues[revenues.length - 1] - revenues[0] : 0

  const adrGapAbs = Math.abs(Math.round(adrGap))
  const occGapAbs = Math.abs(Math.round(occGap))

  // Both metrics struggling
  if (adrGap < -100 && occGap < -20) {
    return `ตรวจสอบ rate parity ใน OTA ทุกช่องทาง — ADR ต่ำกว่าเป้า ฿${adrGapAbs} และ Occ ต่ำกว่าเป้า ${occGapAbs}%`
  }

  // ADR below target multiple days in a row
  if (adrDaysBelow >= 5 && adrGap < -80) {
    return `เพิ่ม direct booking ลด OTA commission — ADR ต่ำกว่าเป้า ฿${adrGapAbs} ติดต่อกัน ${adrDaysBelow} วัน`
  }

  // Lots of empty rooms — push last-minute supply
  if (roomsAvailable > 30 && occGap < -25) {
    return `ส่ง last-minute offer ให้ลูกค้าเก่าวันนี้ — ห้องว่าง ${roomsAvailable} ห้อง Occ ${Math.round(occupancy)}% ต่ำกว่าเป้า ${occGapAbs}%`
  }

  // Revenue climbing, ADR still soft — pricing headroom
  if (revTrend > 2000 && adrGap < -50) {
    return `ปรับ ADR ขึ้น ฿50-100 ได้แล้ว — รายได้เพิ่มขึ้นต่อเนื่อง แต่ ADR ยังต่ำกว่าเป้า ฿${adrGapAbs}`
  }

  // ADR ok, occupancy lagging
  if (adrGap >= -30 && occGap < -20) {
    return `เพิ่ม package หรือ promotion ดึงลูกค้า — ราคาใกล้เป้าแล้ว แต่ Occ ต่ำกว่าเป้า ${occGapAbs}%`
  }

  // ADR below but occupancy ok — upsell instead of discount
  if (adrGap < -80 && occGap >= -10) {
    return `ห้องเต็มดี โอกาสขึ้นราคา — เพิ่ม ADR ได้อีก ฿${adrGapAbs} ลอง upsell breakfast หรือ upgrade`
  }

  // Minor ADR gap
  if (adrGap < -30 && adrGap >= -80) {
    return `เพิ่ม upsell เช่น breakfast package หรือ early check-in — ADR ต่ำกว่าเป้า ฿${adrGapAbs}`
  }

  // Revenue declining
  if (revTrend < -3000) {
    return 'ตรวจสอบ OTA ranking และ review score ที่อาจกระทบ booking — รายได้ลดลงต่อเนื่องตลอด 7 วัน'
  }

  // Both on target
  if (adrGap >= 0 && occGap >= 0) {
    return 'ทั้ง ADR และ Occupancy ตามเป้า — พิจารณา yield management ช่วง peak weekend หน้า'
  }

  return 'ADR ตามเป้า — รักษาระดับราคาและ review score เพื่อ ranking ที่ดีใน OTA'
}

// Weekly variants — same priority-walks but with weekly signals (revenue
// change vs prior week, hit-rate across 7 days, lowest-margin day, etc.)
// instead of single-day snapshots. Used by the weekly-report builder.

export interface WeeklyHotelRecommendationData {
  avgAdr: number
  adrTarget: number
  avgOccupancy: number
  occupancyTarget: number
  totalRevenue: number
  prevWeekRevenue: number
  bestDayRevenue: number
  worstDayRevenue: number
  daysAboveAdrTarget: number
  daysAboveOccTarget: number
  totalDays: number
}

export interface WeeklyFnbRecommendationData {
  avgMargin: number
  marginTarget: number
  totalCovers: number
  /** Weekly target = daily covers target × 7. */
  coversTarget: number
  avgSpend: number
  totalRevenue: number
  prevWeekRevenue: number
  bestDayRevenue: number
  worstDayRevenue: number
  daysWithCost: number
  totalDays: number
  lowestMarginDay: string | null
}

export function generateWeeklyHotelRecommendation(data: WeeklyHotelRecommendationData): string {
  const { avgAdr, adrTarget, avgOccupancy, occupancyTarget, totalRevenue, prevWeekRevenue,
    daysAboveAdrTarget, daysAboveOccTarget, totalDays } = data

  const adrGap = avgAdr - adrTarget
  const occGap = avgOccupancy - occupancyTarget
  const revenueChange = prevWeekRevenue > 0 ? ((totalRevenue - prevWeekRevenue) / prevWeekRevenue) * 100 : 0
  const adrHitRate = totalDays > 0 ? daysAboveAdrTarget / totalDays : 0
  const occHitRate = totalDays > 0 ? daysAboveOccTarget / totalDays : 0

  const adrGapAbs = Math.abs(Math.round(adrGap))
  const occGapAbs = Math.abs(Math.round(occGap))
  const revChangeAbs = Math.abs(Math.round(revenueChange))
  const adrHitPct = Math.round(adrHitRate * 100)
  const occHitPct = Math.round(occHitRate * 100)

  // Worst combined slide first — both metrics down and revenue collapsed.
  if (revenueChange < -20 && adrGap < 0 && occGap < 0) {
    return `ทบทวน pricing strategy และจัด promotion สัปดาห์หน้า — รายได้ลด ${revChangeAbs}% เทียบสัปดาห์ก่อน ADR ต่ำกว่าเป้า ฿${adrGapAbs} Occ ต่ำกว่าเป้า ${occGapAbs}%`
  }

  // Pricing held but rooms empty
  if (adrHitRate >= 0.7 && occHitRate < 0.3) {
    return `ปรับ rate ลงช่วง low demand และเพิ่ม package ดึงลูกค้า — ADR ถึงเป้า ${adrHitPct}% ของสัปดาห์ แต่ Occ ถึงเป้าแค่ ${occHitPct}%`
  }

  // Full house but underpriced — money on the table
  if (occHitRate >= 0.7 && adrHitRate < 0.3) {
    return `ขึ้น ADR ฿${Math.max(50, adrGapAbs)}-${Math.max(100, adrGapAbs + 50)} ผ่าน dynamic pricing ช่วง peak — Occ ถึงเป้า ${occHitPct}% ของสัปดาห์ แต่ ADR ต่ำกว่าเป้า ฿${adrGapAbs}`
  }

  // Inconsistent week — both hit rates around half
  if (adrHitRate < 0.5 && occHitRate < 0.5) {
    return `วิเคราะห์ best vs worst day แล้วทำ playbook สัปดาห์หน้า — ADR ถึงเป้า ${daysAboveAdrTarget}/${totalDays} วัน Occ ถึงเป้า ${daysAboveOccTarget}/${totalDays} วัน`
  }

  // Strong ADR but rooms still empty
  if (adrGap >= 0 && occGap < -10) {
    return `เปิด last-minute deal 3 วันล่วงหน้าผ่าน LINE/direct — ADR เกินเป้า ฿${Math.round(adrGap)} แต่ Occ ต่ำกว่าเป้า ${occGapAbs}%`
  }

  // Revenue rebounding but pricing soft
  if (adrGap < -50 && revenueChange > 0) {
    return `ค่อยๆ ปรับ ADR ขึ้น ฿30-50 รักษา momentum — รายได้เพิ่ม ${revChangeAbs}% แต่ ADR ยังต่ำกว่าเป้า ฿${adrGapAbs}`
  }

  // Clean win — both metrics on target
  if (adrGap >= 0 && occGap >= 0) {
    return `รักษามาตรฐานและเพิ่ม upsell breakfast/spa สัปดาห์หน้า — ADR เกินเป้า ฿${Math.round(adrGap)} Occ เกินเป้า ${Math.round(occGap)}%`
  }

  // Revenue trending up — capacity planning
  if (revenueChange > 10) {
    return `เตรียม staff และ inventory รับ demand สัปดาห์หน้า — รายได้เพิ่ม ${revChangeAbs}% เทียบสัปดาห์ก่อน`
  }

  return `ทดลอง direct booking campaign ผ่าน LINE/Facebook สัปดาห์หน้า — ADR ต่ำกว่าเป้า ฿${adrGapAbs} เฉลี่ยทั้งสัปดาห์`
}

export function generateWeeklyFnbRecommendation(data: WeeklyFnbRecommendationData): string {
  const { avgMargin, marginTarget, totalCovers, coversTarget, avgSpend, totalRevenue,
    prevWeekRevenue, daysWithCost, totalDays, lowestMarginDay } = data

  const marginGap = avgMargin - marginTarget
  const coversGap = totalCovers - coversTarget
  const revenueChange = prevWeekRevenue > 0 ? ((totalRevenue - prevWeekRevenue) / prevWeekRevenue) * 100 : 0
  const costEntryRate = totalDays > 0 ? daysWithCost / totalDays : 0

  const marginGapAbs = Math.abs(Math.round(marginGap))
  const coversGapAbs = Math.abs(Math.round(coversGap))
  const revChangeAbs = Math.abs(Math.round(revenueChange))

  // Data-quality nag fires first — every other signal depends on cost.
  if (costEntryRate < 0.5) {
    return `กรอกข้อมูลต้นทุนทุกวันเพื่อให้ margin calculation แม่นยำ — กรอกแค่ ${daysWithCost}/${totalDays} วันสัปดาห์นี้`
  }

  // Revenue and margin both falling — biggest signal
  if (revenueChange < -15 && marginGap < -10) {
    return `ทบทวน top เมนูและปรับราคาขายสัปดาห์หน้า — รายได้ลด ${revChangeAbs}% และ Margin ต่ำกว่าเป้า ${marginGapAbs}%`
  }

  // Volume up but margin compressed — cost problem
  if (revenueChange > 0 && marginGap < -15) {
    return `ตรวจสอบ waste, portion size และราคาซื้อวัตถุดิบ — รายได้เพิ่ม ${revChangeAbs}% แต่ Margin ต่ำกว่าเป้า ${marginGapAbs}%`
  }

  // Margin good, traffic problem
  if (coversGap < -30 && marginGap >= 0) {
    return `จัด promotion buy 2 get 1 หรือ happy hour สัปดาห์หน้า — ลูกค้าน้อยกว่าเป้า ${coversGapAbs} คน แต่ Margin ยังตามเป้า`
  }

  // Low ticket size with margin under pressure
  if (avgSpend < 150 && marginGap < 0) {
    return `ฝึก upsell เครื่องดื่ม+dessert อย่างน้อย 1 รายการต่อโต๊ะ — Avg spend ฿${Math.round(avgSpend)}/คน และ Margin ต่ำกว่าเป้า ${marginGapAbs}%`
  }

  // Single bad day — investigate that day specifically
  if (lowestMarginDay && marginGap < -5) {
    return `เช็ค ${lowestMarginDay} ว่ามีการสั่งวัตถุดิบพิเศษหรือ waste ผิดปกติ — Margin ต่ำสุดของสัปดาห์ตกวันนั้น เฉลี่ยทั้งสัปดาห์ต่ำกว่าเป้า ${marginGapAbs}%`
  }

  // Strong week — keep doing what works
  if (revenueChange > 15 && marginGap >= 0) {
    return `รักษา recipe standard และ portion control — รายได้เพิ่ม ${revChangeAbs}% Margin เกินเป้า ${Math.round(marginGap)}%`
  }

  // Margin well above target — quality check
  if (marginGap >= 5) {
    return `ตรวจสอบ quality และ portion size ลูกค้าได้ value ครบ — Margin เกินเป้า ${Math.round(marginGap)}% อาจกระทบความพึงพอใจ`
  }

  // Both on target — incremental experiments
  if (marginGap >= 0 && coversGap >= 0) {
    return `เพิ่ม new menu item test market สัปดาห์หน้า — Margin เกินเป้า ${Math.round(marginGap)}% และลูกค้าเกินเป้า ${Math.round(coversGap)} คน`
  }

  return `วิเคราะห์ top 5 เมนูขายดีว่า food cost % อยู่ที่เท่าไหร่ — Margin ต่ำกว่าเป้า ${marginGapAbs}% เฉลี่ยทั้งสัปดาห์`
}

export function generateFnbRecommendation(data: FnbRecommendationData): string {
  const { marginAvg, latestMargin, marginTarget, covers, coversTarget, avgSpend, recentMetrics } = data
  const displayMargin = latestMargin ?? marginAvg
  const marginGap = displayMargin - marginTarget
  const coversGap = covers - coversTarget
  const marginGapAbs = Math.abs(Math.round(marginGap))
  const coversGapAbs = Math.abs(Math.round(coversGap))

  // 7-day variable-cost ratio (additional_cost_today / revenue), averaged
  const daysWithCost = recentMetrics.filter(
    (m) => m.additional_cost_today != null && (m.additional_cost_today as number) > 0 && m.revenue != null && (m.revenue as number) > 0,
  )
  const costRatios = daysWithCost.map(
    (m) => ((m.additional_cost_today as number) / (m.revenue as number)) * 100,
  )
  const avgCostRatio = costRatios.length > 0
    ? costRatios.reduce((a, b) => a + b, 0) / costRatios.length
    : 0

  // 7-day revenue trend
  const revenues = recentMetrics
    .filter((m) => m.revenue != null && (m.revenue as number) > 0)
    .map((m) => m.revenue as number)
  const revTrend = revenues.length >= 2 ? revenues[revenues.length - 1] - revenues[0] : 0

  // Consecutive days ending today where margin fell short. Walk
  // most-recent → oldest using a non-mutating reversed copy.
  const marginsWithData = recentMetrics.filter(
    (m) => m.additional_cost_today != null && (m.additional_cost_today as number) > 0 && m.revenue != null && (m.revenue as number) > 0,
  )
  const marginsRev = marginsWithData.slice().reverse()
  const firstAtTarget = marginsRev.findIndex((m) => {
    const r = m.revenue as number
    const c = m.additional_cost_today as number
    return ((r - c) / r * 100) >= marginTarget
  })
  const marginDaysBelow = firstAtTarget === -1 ? marginsWithData.length : firstAtTarget

  // High cost ratio — ingredient cost problem
  if (avgCostRatio > 45 && marginGap < -15) {
    return `ตรวจสอบ portion size และ waste — food cost ratio สูงถึง ${Math.round(avgCostRatio)}% เฉลี่ย ${daysWithCost.length} วัน`
  }

  // Margin below target multiple days in a row
  if (marginDaysBelow >= 4 && marginGap < -10) {
    return `ทบทวน recipe cost ทุกเมนู — Margin ต่ำกว่าเป้า ${marginGapAbs}% ติดต่อกัน ${marginDaysBelow} วัน`
  }

  // Good margin but low covers — traffic problem
  if (marginGap >= 0 && coversGap < -15) {
    return `Margin ดี แต่ลูกค้าน้อยกว่าเป้า ${coversGapAbs} คน — ลอง LINE OA promotion หรือ Google Maps post วันนี้`
  }

  // Low avg spend with margin below target
  if (avgSpend < 160 && marginGap < -5) {
    return `เพิ่ม avg spend ด้วย upsell เครื่องดื่มและ dessert — ปัจจุบัน ฿${Math.round(avgSpend)}/คน ต่ำกว่าเป้า และ margin ต่ำกว่าเป้า ${marginGapAbs}%`
  }

  // Revenue declining + margin under pressure
  if (revTrend < -1500 && marginGap < 0) {
    return 'ตรวจสอบว่ามีคู่แข่งใหม่ในพื้นที่หรือ quality ลดลง — รายได้และ margin ลดลงพร้อมกันตลอด 7 วัน'
  }

  // Both on target
  if (marginGap >= 0 && coversGap >= 0) {
    return 'Margin และลูกค้าตามเป้าทั้งคู่ — ทดลอง new menu item เพื่อเพิ่ม avg spend สัปดาห์หน้า'
  }

  // Margin slightly below
  if (marginGap < -5 && marginGap >= -15) {
    return `เช็ค top 3 เมนูขายดีว่า food cost % อยู่ที่เท่าไหร่ — Margin ต่ำกว่าเป้า ${marginGapAbs}%`
  }

  // Covers low only
  if (coversGap < -20 && marginGap >= -5) {
    return `ลอง happy hour หรือ set lunch พิเศษเพื่อดึงลูกค้าช่วง off-peak — ลูกค้าน้อยกว่าเป้า ${coversGapAbs} คน`
  }

  return `ตรวจสอบ waste และ portion control วันนี้ — Margin ต่ำกว่าเป้า ${marginGapAbs}%`
}
