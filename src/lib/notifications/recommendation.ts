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
