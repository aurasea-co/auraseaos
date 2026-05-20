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

  // 7-day trends (need >= 3 valid samples to call it a trend).
  const validAdr = recentMetrics.filter((m) => m.adr != null && m.adr > 0).map((m) => m.adr as number)
  const adrTrend = validAdr.length >= 3 ? validAdr[validAdr.length - 1] - validAdr[0] : 0
  const validOcc = recentMetrics.filter((m) => m.occupancy_rate != null).map((m) => m.occupancy_rate as number)
  const occTrend = validOcc.length >= 3 ? validOcc[validOcc.length - 1] - validOcc[0] : 0

  // Priority 1: both ADR + Occupancy well below target — worst case
  if (adrGap < -100 && occGap < -20) {
    return 'ADR และ Occupancy ต่ำกว่าเป้าพร้อมกัน — ตรวจสอบราคาคู่แข่งและช่องทางการขาย'
  }

  // Priority 2: occupancy very low, ADR holding
  if (occGap < -30 && adrGap >= -50) {
    if (roomsAvailable > 20) return 'ห้องว่างมาก — ลองโปรโมชั่น walk-in หรือ last-minute rate วันนี้'
    return 'Occupancy ต่ำ — พิจารณาเพิ่มช่องทาง OTA หรือลด minimum stay'
  }

  // Priority 3: ADR trending down
  if (adrTrend < -50 && adrGap < 0) {
    return 'ADR ลดลงต่อเนื่อง 7 วัน — ตรวจสอบว่า OTA กำลัง undercut ราคาหรือไม่'
  }

  // Priority 4: occupancy rising, ADR lagging — pricing opportunity
  if (occTrend > 5 && adrGap < -50) {
    return 'Occupancy กำลังดีขึ้น — โอกาสปรับ ADR ขึ้นได้อีก ฿50-100'
  }

  // Priority 5: ADR below target
  if (adrGap < -100) {
    return 'ADR ต่ำกว่าเป้า — ลดการพึ่งพา OTA เพิ่ม direct booking ผ่าน LINE หรือ Facebook'
  }
  if (adrGap < -50) {
    return 'ADR ต่ำกว่าเป้าเล็กน้อย — ลองเพิ่ม upsell เช่น breakfast package หรือ early check-in'
  }

  // Priority 6: occupancy below target
  if (occGap < -15) {
    return 'Occupancy ต่ำกว่าเป้า — ตรวจสอบ rate parity ใน OTA ทุกช่องทาง'
  }

  // Priority 7: both on target
  if (adrGap >= 0 && occGap >= 0) {
    return 'ADR และ Occupancy ตามเป้าทั้งคู่ — รักษาระดับ และพิจารณา yield management ช่วง peak'
  }
  if (adrGap >= 0) {
    return 'ADR ตามเป้า — โฟกัสเพิ่ม Occupancy โดยเปิดรับ walk-in หรือ group booking'
  }

  return 'ADR ตามเป้า — รักษาระดับราคาและ service quality'
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

  if (revenueChange < -20 && adrGap < 0 && occGap < 0) {
    return 'รายได้ลดลง 20%+ เทียบสัปดาห์ก่อน — ทบทวน pricing strategy และเพิ่ม promotion สัปดาห์หน้า'
  }
  if (adrHitRate >= 0.7 && occHitRate < 0.3) {
    return 'ราคาดี แต่ Occupancy ต่ำ — ลองปรับ rate ช่วง low demand และเพิ่ม package ดึงดูดลูกค้า'
  }
  if (occHitRate >= 0.7 && adrHitRate < 0.3) {
    return 'ห้องเต็มดี แต่ ADR ต่ำ — โอกาสขึ้นราคาได้ ลอง dynamic pricing ช่วง peak demand'
  }
  if (adrHitRate < 0.5 && occHitRate < 0.5) {
    return 'ผลงานไม่สม่ำเสมอทั้งสัปดาห์ — วิเคราะห์ว่าวันไหนดี/ไม่ดี และหาปัจจัยที่ต่างกัน'
  }
  if (adrGap >= 0 && occGap < -10) {
    return 'สัปดาห์ดี แต่ยังมีห้องว่าง — สัปดาห์หน้าลองเพิ่ม last-minute deals ช่วง 3 วันล่วงหน้า'
  }
  if (adrGap < -50 && revenueChange > 0) {
    return 'รายได้ดีขึ้น แต่ ADR ยังต่ำกว่าเป้า — รักษา momentum แต่ค่อยๆ ปรับราคาขึ้น'
  }
  if (adrGap >= 0 && occGap >= 0) {
    return 'สัปดาห์ยอดเยี่ยม ทั้ง ADR และ Occupancy ตามเป้า — รักษามาตรฐานและวางแผน upsell สัปดาห์หน้า'
  }
  if (revenueChange > 10) {
    return 'รายได้เพิ่มขึ้นดี — ติดตามว่าเป็น trend ต่อเนื่องหรือ one-off และวางแผนรับ demand สัปดาห์หน้า'
  }
  return 'ADR ต่ำกว่าเป้า — สัปดาห์หน้าทดลอง direct booking campaign ผ่าน LINE หรือ Facebook'
}

export function generateWeeklyFnbRecommendation(data: WeeklyFnbRecommendationData): string {
  const { avgMargin, marginTarget, totalCovers, coversTarget, avgSpend, totalRevenue,
    prevWeekRevenue, daysWithCost, totalDays, lowestMarginDay } = data

  const marginGap = avgMargin - marginTarget
  const coversGap = totalCovers - coversTarget
  const revenueChange = prevWeekRevenue > 0 ? ((totalRevenue - prevWeekRevenue) / prevWeekRevenue) * 100 : 0
  const costEntryRate = totalDays > 0 ? daysWithCost / totalDays : 0

  // Data-quality nag fires first — every other signal depends on cost.
  if (costEntryRate < 0.5) {
    return `กรอกต้นทุนไม่ครบ ${daysWithCost}/${totalDays} วัน — กรอกข้อมูลต้นทุนทุกวันเพื่อให้ margin calculation แม่นยำ`
  }
  if (revenueChange < -15 && marginGap < -10) {
    return 'รายได้และ Margin ลดลงพร้อมกัน — ทบทวนเมนูที่ขายดีและต้นทุน พิจารณาปรับราคาขายสัปดาห์หน้า'
  }
  if (revenueChange > 0 && marginGap < -15) {
    return 'ขายดีแต่ Margin ต่ำ — ต้นทุนสูงเกินไป ตรวจสอบ waste, portion size และราคาซื้อวัตถุดิบ'
  }
  if (coversGap < -30 && marginGap >= 0) {
    return `ลูกค้าน้อยกว่าเป้า ${Math.abs(Math.round(coversGap))} คน — ลอง promotion สัปดาห์หน้า เช่น buy 2 get 1 หรือ happy hour`
  }
  if (avgSpend < 150 && marginGap < 0) {
    return 'Avg spend ต่ำกว่า ฿150 — ฝึก upsell เครื่องดื่มและ dessert อย่างน้อย 1 รายการต่อโต๊ะ'
  }
  if (lowestMarginDay && marginGap < -5) {
    return `วันที่ ${lowestMarginDay} margin ต่ำสุดสัปดาห์นี้ — ตรวจสอบว่ามีการสั่งวัตถุดิบพิเศษหรือของเสียมากผิดปกติ`
  }
  if (revenueChange > 15 && marginGap >= 0) {
    return 'สัปดาห์ดีมาก รายได้และ Margin ตามเป้า — รักษา recipe standard และ portion control ต่อไป'
  }
  if (marginGap >= 5) {
    return 'Margin ดีกว่าเป้า — ตรวจสอบว่า quality ยังคงมาตรฐาน ลูกค้าพึงพอใจหรือไม่'
  }
  if (marginGap >= 0 && coversGap >= 0) {
    return 'สัปดาห์ตามเป้าทั้ง Margin และลูกค้า — สัปดาห์หน้าลองเพิ่ม new menu item เพื่อ test market'
  }
  return 'Margin ต่ำกว่าเป้า — วิเคราะห์ top 5 เมนูที่ขายดีว่า food cost % อยู่ที่เท่าไหร่'
}

export function generateFnbRecommendation(data: FnbRecommendationData): string {
  const { marginAvg, latestMargin, marginTarget, covers, coversTarget, avgSpend, recentMetrics } = data
  const displayMargin = latestMargin ?? marginAvg
  const marginGap = displayMargin - marginTarget
  const coversGap = covers - coversTarget

  // 7-day revenue trend
  const validRevenue = recentMetrics
    .filter((m) => m.revenue != null && m.revenue > 0)
    .map((m) => m.revenue as number)
  const revenueTrend = validRevenue.length >= 3 ? validRevenue[validRevenue.length - 1] - validRevenue[0] : 0

  // 7-day variable-cost ratio (additional_cost_today / revenue), averaged
  const recentCostRatios = recentMetrics
    .filter((m) => m.additional_cost_today != null && (m.additional_cost_today as number) > 0 && m.revenue != null && (m.revenue as number) > 0)
    .map((m) => ((m.additional_cost_today as number) / (m.revenue as number)) * 100)
  const avgCostRatio = recentCostRatios.length > 0
    ? recentCostRatios.reduce((a, b) => a + b, 0) / recentCostRatios.length
    : 0

  // Priority 1: margin critically low
  if (marginGap < -20) {
    if (avgCostRatio > 45) return 'ต้นทุนวัตถุดิบสูงมาก — ตรวจสอบราคาซื้อและ portion size โดยด่วน'
    return 'Margin ต่ำกว่าเป้ามาก — วิเคราะห์เมนูที่ขายดีว่า margin ต่ำหรือไม่'
  }

  // Priority 2: both margin + covers below
  if (marginGap < -10 && coversGap < -10) {
    return 'Margin และลูกค้าต่ำกว่าเป้าพร้อมกัน — พิจารณา set menu หรือ combo เพื่อเพิ่มทั้งคนและ margin'
  }

  // Priority 3: margin below target
  if (marginGap < -10) {
    return 'Margin ต่ำกว่าเป้า — ตรวจสอบของเสียและ portion control สัปดาห์นี้'
  }

  // Priority 4: revenue trending down + margin under pressure
  if (revenueTrend < -1000 && marginGap < 0) {
    return 'รายได้ลดลงต่อเนื่อง — ลองจัด promotion ช่วงเย็นหรือ weekday special'
  }

  // Priority 5: traffic problem — covers down but margin healthy
  if (coversGap < -15 && marginGap >= 0) {
    return 'ลูกค้าน้อยกว่าเป้า — เพิ่มการมองเห็นใน Google Maps และ LINE OA'
  }

  // Priority 6: low avg spend on a thin margin
  if (avgSpend < 150 && marginGap < 0) {
    return 'Avg spend ต่ำ — ฝึกพนักงาน upsell เครื่องดื่มหรือ dessert ทุก order'
  }

  // Priority 7: positive cases
  if (marginGap >= 0 && coversGap >= 0) {
    return 'Margin และลูกค้าตามเป้าทั้งคู่ — วันนี้ดี รักษามาตรฐาน portion และ quality'
  }
  if (marginGap >= 5) {
    return 'Margin ดีกว่าเป้า — ตรวจสอบว่า quality ยังคงมาตรฐานหรือไม่'
  }
  if (marginGap >= 0) {
    return 'Margin ตามเป้า — โฟกัสเพิ่มจำนวนลูกค้าในช่วง off-peak'
  }

  return 'Margin ต่ำกว่าเป้า — ตรวจสอบต้นทุนวัตถุดิบและของเสีย'
}
