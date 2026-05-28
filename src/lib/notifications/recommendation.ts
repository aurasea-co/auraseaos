/**
 * Data-driven recommendation engine for the morning flash + weekly report.
 *
 * Rules read multiple signals (current vs target, last-7-day trend, supporting
 * metrics like cost ratio / avg spend) and pick the highest-priority message.
 * Ordering matters — the first matching branch returns, so put the most
 * actionable signal first.
 *
 * Each rule returns one of several wording variants via `pick()` so the
 * morning flash doesn't feel like a stuck record when underlying data
 * doesn't move day-to-day. Same data + same Bangkok day = same pick
 * (idempotent for retries) but adjacent days are guaranteed to differ.
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

/**
 * Deterministically picks one variant from an array seeded by the given
 * date interpreted in Bangkok time. Same date + same variants = same
 * pick (idempotent for retries); adjacent dates with N variants are
 * guaranteed to differ because (dayOfYear % N) maps consecutive days to
 * consecutive indices.
 *
 * Exported so tests can advance the date without mocking the clock.
 * Production callers go through `pick()` which seeds with `new Date()`.
 */
export function pickVariantForDate(variants: string[], date: Date): string {
  // Shift the instant into Bangkok wall time (UTC+7), then read every
  // calendar part *as UTC* so the computation doesn't depend on the host
  // machine's timezone. The previous version anchored on
  // `new Date(year, 0, 0)` which is interpreted in the host's local TZ —
  // on a dev box set to Asia/Bangkok the year-start drifted 7 h east,
  // and the day-of-year flipped early in the day.
  const bkkMs = date.getTime() + 7 * 60 * 60 * 1000
  const year = new Date(bkkMs).getUTCFullYear()
  const startOfYearUTC = Date.UTC(year, 0, 1)
  const dayOfYear = Math.floor((bkkMs - startOfYearUTC) / 86400000)
  return variants[dayOfYear % variants.length]
}

function pick(variants: string[]): string {
  return pickVariantForDate(variants, new Date())
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
    return pick([
      `ตรวจสอบ rate parity ใน OTA ทุกช่องทาง — ADR ต่ำกว่าเป้า ฿${adrGapAbs} และ Occ ต่ำกว่าเป้า ${occGapAbs}%`,
      `เปรียบราคากับโรงแรมใกล้เคียง — ADR ต่ำกว่าเป้า ฿${adrGapAbs} Occ ต่ำกว่าเป้า ${occGapAbs}% พร้อมกัน`,
      `ทบทวน channel mix และ minimum rate — ADR และ Occ ต่ำกว่าเป้าพร้อมกัน ฿${adrGapAbs} และ ${occGapAbs}%`,
    ])
  }

  // ADR below target multiple days in a row
  if (adrDaysBelow >= 5 && adrGap < -80) {
    return pick([
      `เพิ่ม direct booking ลด OTA commission — ADR ต่ำกว่าเป้า ฿${adrGapAbs} ติดต่อกัน ${adrDaysBelow} วัน`,
      `ลอง promote ผ่าน LINE OA ของโรงแรมวันนี้ — ADR ต่ำกว่าเป้า ฿${adrGapAbs} มา ${adrDaysBelow} วันติด`,
      `ตรวจสอบว่า OTA กำลัง undercut ราคาหรือไม่ — ADR ต่ำกว่าเป้า ฿${adrGapAbs} ติดต่อกัน ${adrDaysBelow} วัน`,
    ])
  }

  // Lots of empty rooms — push last-minute supply
  if (roomsAvailable > 30 && occGap < -25) {
    return pick([
      `ส่ง last-minute offer ให้ลูกค้าเก่าวันนี้ — ห้องว่าง ${roomsAvailable} ห้อง Occ ${Math.round(occupancy)}% ต่ำกว่าเป้า ${occGapAbs}%`,
      `เปิด walk-in rate พิเศษวันนี้ — ห้องว่างเหลือ ${roomsAvailable} ห้อง Occ ต่ำกว่าเป้า ${occGapAbs}%`,
      `แจ้ง OTA ว่ายังมีห้องว่าง ${roomsAvailable} ห้อง — ลอง last-minute deal ราคาพิเศษวันนี้`,
    ])
  }

  // Revenue climbing, ADR still soft — pricing headroom
  if (revTrend > 2000 && adrGap < -50) {
    return pick([
      `ปรับ ADR ขึ้น ฿50-100 ได้แล้ว — รายได้เพิ่มขึ้นต่อเนื่อง แต่ ADR ยังต่ำกว่าเป้า ฿${adrGapAbs}`,
      `โอกาสขึ้นราคา ฿50 ทดสอบตลาดวันนี้ — demand กำลังดีขึ้น ADR ยังต่ำกว่าเป้า ฿${adrGapAbs}`,
      `รายได้ trend ดี ลอง close OTA บางช่องและขาย direct ราคาสูงขึ้น — ADR ต่ำกว่าเป้า ฿${adrGapAbs}`,
    ])
  }

  // ADR ok, occupancy lagging
  if (adrGap >= -30 && occGap < -20) {
    return pick([
      `เพิ่ม package หรือ promotion ดึงลูกค้า — ราคาใกล้เป้าแล้ว แต่ Occ ต่ำกว่าเป้า ${occGapAbs}%`,
      `ลอง 2-night minimum stay package เพื่อเพิ่ม Occ — ราคาดีแต่ห้องเต็มช้า ต่ำกว่าเป้า ${occGapAbs}%`,
      `เพิ่ม visibility ใน OTA ด้วย photo update หรือ promo rate — Occ ต่ำกว่าเป้า ${occGapAbs}%`,
    ])
  }

  // ADR below but occupancy ok — upsell instead of discount
  if (adrGap < -80 && occGap >= -10) {
    return pick([
      `ห้องเต็มดี โอกาสขึ้นราคา — เพิ่ม ADR ได้อีก ฿${adrGapAbs} ลอง upsell breakfast หรือ upgrade`,
      `ปิด OTA ที่ commission สูง ขายตรงราคาพิเศษแทน — Occ ดีแต่ ADR ต่ำกว่าเป้า ฿${adrGapAbs}`,
      `เพิ่ม mandatory breakfast package เพื่อดัน ADR — ห้องเต็มอยู่แล้ว ยัง upside ได้ ฿${adrGapAbs}`,
    ])
  }

  // Minor ADR gap
  if (adrGap < -30 && adrGap >= -80) {
    return pick([
      `เพิ่ม upsell เช่น breakfast package หรือ early check-in — ADR ต่ำกว่าเป้า ฿${adrGapAbs}`,
      `ลอง late check-out fee หรือ room upgrade offer — ADR ต่ำกว่าเป้า ฿${adrGapAbs} เล็กน้อย`,
      `เพิ่ม ancillary revenue เช่น parking, laundry, spa — ADR ต่ำกว่าเป้า ฿${adrGapAbs}`,
    ])
  }

  // Revenue declining
  if (revTrend < -3000) {
    return pick([
      'ตรวจสอบ OTA ranking และ review score ที่อาจกระทบ booking — รายได้ลดลงต่อเนื่องตลอด 7 วัน',
      'ตอบ review เก่าๆ ใน Booking.com และ Google — review score กระทบ ranking และรายได้โดยตรง',
      'เช็ค rate ว่าต่ำกว่าหรือสูงกว่าคู่แข่งใกล้เคียงในช่วงนี้ — รายได้ลดต่อเนื่อง 7 วัน',
    ])
  }

  // Both on target
  if (adrGap >= 0 && occGap >= 0) {
    return pick([
      'ทั้ง ADR และ Occupancy ตามเป้า — พิจารณา yield management ช่วง peak weekend หน้า',
      'ผลงานดี รักษาระดับ — ลอง upsell F&B หรือ spa เพื่อเพิ่ม total revenue per room',
      'ADR และ Occ ตามเป้าทั้งคู่ — วันนี้เหมาะทบทวน rate strategy สำหรับเดือนหน้า',
    ])
  }

  return pick([
    'ADR ตามเป้า — รักษาระดับราคาและ review score เพื่อ ranking ที่ดีใน OTA',
    'ADR ตามเป้า — ตรวจสอบ competitor rate วันนี้เพื่อให้มั่นใจยังอยู่ในตำแหน่งที่ดี',
    'ADR ตามเป้า — focus เพิ่ม direct booking เพื่อลด OTA commission สัปดาห์นี้',
  ])
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
    return pick([
      `ทบทวน pricing strategy และจัด promotion สัปดาห์หน้า — รายได้ลด ${revChangeAbs}% ADR ต่ำกว่าเป้า ฿${adrGapAbs} Occ ต่ำกว่าเป้า ${occGapAbs}%`,
      `ประชุมทีมขายและตั้ง weekly target ใหม่ — รายได้ลด ${revChangeAbs}% เทียบสัปดาห์ก่อน ADR/Occ หลุดเป้าทั้งคู่ ฿${adrGapAbs}/${occGapAbs}%`,
      `เปิด flash sale 48 ชม. ผ่าน direct + LINE OA — รายได้ลด ${revChangeAbs}% ADR ต่ำกว่าเป้า ฿${adrGapAbs} Occ ต่ำกว่าเป้า ${occGapAbs}%`,
    ])
  }

  // Pricing held but rooms empty
  if (adrHitRate >= 0.7 && occHitRate < 0.3) {
    return pick([
      `ปรับ rate ลงช่วง low demand และเพิ่ม package ดึงลูกค้า — ADR ถึงเป้า ${adrHitPct}% ของสัปดาห์ แต่ Occ ถึงเป้าแค่ ${occHitPct}%`,
      `ลอง stay-3-pay-2 package สำหรับ midweek — ADR ตามเป้า ${adrHitPct}% แต่ Occ ถึงแค่ ${occHitPct}% ของสัปดาห์`,
      `เปิด corporate rate / long-stay discount — ADR ${adrHitPct}% hit rate ดี แต่ Occ ต่ำที่ ${occHitPct}% ต้องเติม volume`,
    ])
  }

  // Full house but underpriced — money on the table
  if (occHitRate >= 0.7 && adrHitRate < 0.3) {
    return pick([
      `ขึ้น ADR ฿${Math.max(50, adrGapAbs)}-${Math.max(100, adrGapAbs + 50)} ผ่าน dynamic pricing ช่วง peak — Occ ถึงเป้า ${occHitPct}% ของสัปดาห์ แต่ ADR ต่ำกว่าเป้า ฿${adrGapAbs}`,
      `ปิด OTA commission สูงในวัน peak ขายตรงราคาเต็ม — Occ ${occHitPct}% ของสัปดาห์ ADR ยังต่ำกว่าเป้า ฿${adrGapAbs}`,
      `เพิ่ม mandatory breakfast หรือ resort fee ดัน ADR — ห้องเต็ม ${occHitPct}% แต่ ADR ต่ำกว่าเป้า ฿${adrGapAbs}`,
    ])
  }

  // Inconsistent week — both hit rates around half
  if (adrHitRate < 0.5 && occHitRate < 0.5) {
    return pick([
      `วิเคราะห์ best vs worst day แล้วทำ playbook สัปดาห์หน้า — ADR ถึงเป้า ${daysAboveAdrTarget}/${totalDays} วัน Occ ถึงเป้า ${daysAboveOccTarget}/${totalDays} วัน`,
      `เลือกวันที่ดีที่สุดของสัปดาห์มาเป็น template — ADR ถึงเป้า ${daysAboveAdrTarget}/${totalDays} วัน Occ ${daysAboveOccTarget}/${totalDays} วัน`,
      `ตั้ง daily standup สั้นๆ ทบทวนกลยุทธ์รายวัน — สัปดาห์นี้ ADR ถึงเป้า ${daysAboveAdrTarget}/${totalDays} วัน Occ ${daysAboveOccTarget}/${totalDays} วัน`,
    ])
  }

  // Strong ADR but rooms still empty
  if (adrGap >= 0 && occGap < -10) {
    return pick([
      `เปิด last-minute deal 3 วันล่วงหน้าผ่าน LINE/direct — ADR เกินเป้า ฿${Math.round(adrGap)} แต่ Occ ต่ำกว่าเป้า ${occGapAbs}%`,
      `เพิ่ม OTA visibility (photo, promo tag) ดึง volume — ADR เกินเป้า ฿${Math.round(adrGap)} Occ ยังต่ำกว่าเป้า ${occGapAbs}%`,
      `ลอง remarketing campaign กับลูกค้าเก่า — ADR เกินเป้า ฿${Math.round(adrGap)} แต่ Occ ต่ำกว่าเป้า ${occGapAbs}%`,
    ])
  }

  // Revenue rebounding but pricing soft
  if (adrGap < -50 && revenueChange > 0) {
    return pick([
      `ค่อยๆ ปรับ ADR ขึ้น ฿30-50 รักษา momentum — รายได้เพิ่ม ${revChangeAbs}% แต่ ADR ยังต่ำกว่าเป้า ฿${adrGapAbs}`,
      `ทดสอบขึ้นราคา ฿30 เฉพาะวัน weekend ก่อน — รายได้เพิ่ม ${revChangeAbs}% ADR ต่ำกว่าเป้า ฿${adrGapAbs}`,
      `เพิ่ม upsell package พร้อมขยับ base rate ขึ้น ฿30 — รายได้ trend ดี ${revChangeAbs}% แต่ ADR ต่ำกว่าเป้า ฿${adrGapAbs}`,
    ])
  }

  // Clean win — both metrics on target
  if (adrGap >= 0 && occGap >= 0) {
    return pick([
      `รักษามาตรฐานและเพิ่ม upsell breakfast/spa สัปดาห์หน้า — ADR เกินเป้า ฿${Math.round(adrGap)} Occ เกินเป้า ${Math.round(occGap)}%`,
      `ลองทดสอบขึ้น ADR ฿20-50 ในวัน peak — ADR เกินเป้า ฿${Math.round(adrGap)} Occ เกินเป้า ${Math.round(occGap)}% มีพื้นที่`,
      `ทำ guest survey ระหว่าง check-out เก็บ insight — ADR/Occ เกินเป้าทั้งคู่ ฿${Math.round(adrGap)}/${Math.round(occGap)}%`,
    ])
  }

  // Revenue trending up — capacity planning
  if (revenueChange > 10) {
    return pick([
      `เตรียม staff และ inventory รับ demand สัปดาห์หน้า — รายได้เพิ่ม ${revChangeAbs}% เทียบสัปดาห์ก่อน`,
      `ขยาย housekeeping rota รับวัน peak — รายได้เพิ่ม ${revChangeAbs}% เทียบสัปดาห์ก่อน demand กำลังขึ้น`,
      `จอง stock breakfast / amenities ล่วงหน้า — รายได้เพิ่ม ${revChangeAbs}% ป้องกัน supply ขาดช่วง peak`,
    ])
  }

  return pick([
    `ทดลอง direct booking campaign ผ่าน LINE/Facebook สัปดาห์หน้า — ADR ต่ำกว่าเป้า ฿${adrGapAbs} เฉลี่ยทั้งสัปดาห์`,
    `เพิ่ม email retargeting ลูกค้าที่เคยพักก่อน 6 เดือน — ADR ต่ำกว่าเป้า ฿${adrGapAbs} เฉลี่ยทั้งสัปดาห์`,
    `ลอง Google Hotel Ads bid ที่สูงขึ้นเฉพาะ weekend — ADR ต่ำกว่าเป้า ฿${adrGapAbs} เฉลี่ยทั้งสัปดาห์`,
  ])
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
    return pick([
      `กรอกข้อมูลต้นทุนทุกวันเพื่อให้ margin calculation แม่นยำ — กรอกแค่ ${daysWithCost}/${totalDays} วันสัปดาห์นี้`,
      `ตั้งเตือนรายวัน 21:00 ให้ทีมกรอก cost ก่อนปิดร้าน — กรอกแค่ ${daysWithCost}/${totalDays} วันสัปดาห์นี้`,
      `กรอก cost ย้อนหลังให้ครบสัปดาห์เพื่อดูแนวโน้มจริง — กรอกแค่ ${daysWithCost}/${totalDays} วัน`,
    ])
  }

  // Revenue and margin both falling — biggest signal
  if (revenueChange < -15 && marginGap < -10) {
    return pick([
      `ทบทวน top เมนูและปรับราคาขายสัปดาห์หน้า — รายได้ลด ${revChangeAbs}% และ Margin ต่ำกว่าเป้า ${marginGapAbs}%`,
      `ตัด menu ที่ขายไม่ดีและ margin ต่ำออก — รายได้ลด ${revChangeAbs}% Margin ต่ำกว่าเป้า ${marginGapAbs}%`,
      `จัด combo set ที่ margin สูงเป็นตัวชู — รายได้ลด ${revChangeAbs}% Margin ต่ำกว่าเป้า ${marginGapAbs}%`,
    ])
  }

  // Volume up but margin compressed — cost problem
  if (revenueChange > 0 && marginGap < -15) {
    return pick([
      `ตรวจสอบ waste, portion size และราคาซื้อวัตถุดิบ — รายได้เพิ่ม ${revChangeAbs}% แต่ Margin ต่ำกว่าเป้า ${marginGapAbs}%`,
      `เปรียบราคา supplier 2-3 เจ้าก่อนสั่งครั้งหน้า — รายได้เพิ่ม ${revChangeAbs}% Margin ต่ำกว่าเป้า ${marginGapAbs}%`,
      `ฝึก kitchen ชั่งวัตถุดิบทุก order — รายได้เพิ่ม ${revChangeAbs}% Margin ต่ำกว่าเป้า ${marginGapAbs}% น่าจะ portion drift`,
    ])
  }

  // Margin good, traffic problem
  if (coversGap < -30 && marginGap >= 0) {
    return pick([
      `จัด promotion buy 2 get 1 หรือ happy hour สัปดาห์หน้า — ลูกค้าน้อยกว่าเป้า ${coversGapAbs} คน แต่ Margin ยังตามเป้า`,
      `โพสต์รูปอาหารใน Google Maps + IG วันละ 1 รูป — ลูกค้าน้อยกว่าเป้า ${coversGapAbs} คน Margin ยังตามเป้า`,
      `ลอง partnership กับร้านข้างเคียง cross-promote — ลูกค้าน้อยกว่าเป้า ${coversGapAbs} คน Margin ตามเป้า`,
    ])
  }

  // Low ticket size with margin under pressure
  if (avgSpend < 150 && marginGap < 0) {
    return pick([
      `ฝึก upsell เครื่องดื่ม+dessert อย่างน้อย 1 รายการต่อโต๊ะ — Avg spend ฿${Math.round(avgSpend)}/คน และ Margin ต่ำกว่าเป้า ${marginGapAbs}%`,
      `ตั้ง suggestive selling script ให้ staff ใช้ — Avg spend ฿${Math.round(avgSpend)}/คน Margin ต่ำกว่าเป้า ${marginGapAbs}%`,
      `เพิ่ม set menu ราคา ฿199-249 ดัน ticket size — Avg spend ฿${Math.round(avgSpend)}/คน Margin ต่ำกว่าเป้า ${marginGapAbs}%`,
    ])
  }

  // Single bad day — investigate that day specifically
  if (lowestMarginDay && marginGap < -5) {
    return pick([
      `เช็ค ${lowestMarginDay} ว่ามีการสั่งวัตถุดิบพิเศษหรือ waste ผิดปกติ — Margin ต่ำสุดของสัปดาห์ตกวันนั้น เฉลี่ยต่ำกว่าเป้า ${marginGapAbs}%`,
      `ดูใบเสร็จ supplier ของ ${lowestMarginDay} ว่ามีรายการพิเศษไหม — Margin ต่ำสุดของสัปดาห์ตกวันนั้น เฉลี่ยต่ำกว่าเป้า ${marginGapAbs}%`,
      `ถาม shift lead ของ ${lowestMarginDay} ว่ามีอะไรผิดปกติ — Margin ต่ำสุดของสัปดาห์ เฉลี่ยต่ำกว่าเป้า ${marginGapAbs}%`,
    ])
  }

  // Strong week — keep doing what works
  if (revenueChange > 15 && marginGap >= 0) {
    return pick([
      `รักษา recipe standard และ portion control — รายได้เพิ่ม ${revChangeAbs}% Margin เกินเป้า ${Math.round(marginGap)}%`,
      `บันทึก best-selling combo ไว้เป็น template — รายได้เพิ่ม ${revChangeAbs}% Margin เกินเป้า ${Math.round(marginGap)}%`,
      `เริ่มสะสมเงินไว้ลงทุน equipment ที่ลด labour — รายได้เพิ่ม ${revChangeAbs}% Margin เกินเป้า ${Math.round(marginGap)}%`,
    ])
  }

  // Margin well above target — quality check
  if (marginGap >= 5) {
    return pick([
      `ตรวจสอบ quality และ portion size ลูกค้าได้ value ครบ — Margin เกินเป้า ${Math.round(marginGap)}% อาจกระทบความพึงพอใจ`,
      `ลองสุ่มถามลูกค้าว่า portion พอไหม — Margin เกินเป้า ${Math.round(marginGap)}% ระวัง perceived value`,
      `อ่าน review สัปดาห์นี้ดูว่ามี comment เรื่อง portion ไหม — Margin เกินเป้า ${Math.round(marginGap)}%`,
    ])
  }

  // Both on target — incremental experiments
  if (marginGap >= 0 && coversGap >= 0) {
    return pick([
      `เพิ่ม new menu item test market สัปดาห์หน้า — Margin เกินเป้า ${Math.round(marginGap)}% และลูกค้าเกินเป้า ${Math.round(coversGap)} คน`,
      `ลองทดสอบขึ้นราคาเมนูขายดี ฿5-10 — Margin เกินเป้า ${Math.round(marginGap)}% ลูกค้าเกินเป้า ${Math.round(coversGap)} คน`,
      `ขยายเวลาเปิดเพิ่ม 1-2 ชม. ลองรับ demand — Margin/ลูกค้าเกินเป้าทั้งคู่ ${Math.round(marginGap)}%/${Math.round(coversGap)} คน`,
    ])
  }

  return pick([
    `วิเคราะห์ top 5 เมนูขายดีว่า food cost % อยู่ที่เท่าไหร่ — Margin ต่ำกว่าเป้า ${marginGapAbs}% เฉลี่ยทั้งสัปดาห์`,
    `รวบรวมใบเสร็จ supplier และเปรียบ unit price — Margin ต่ำกว่าเป้า ${marginGapAbs}% เฉลี่ยทั้งสัปดาห์`,
    `นับ stock จริงเทียบ POS เพื่อหา shrinkage — Margin ต่ำกว่าเป้า ${marginGapAbs}% เฉลี่ยทั้งสัปดาห์`,
  ])
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
    return pick([
      `ตรวจสอบ portion size และ waste — food cost ratio สูงถึง ${Math.round(avgCostRatio)}% เฉลี่ย ${daysWithCost.length} วัน`,
      `นับ stock วันนี้เทียบกับที่สั่งมา — food cost ratio ${Math.round(avgCostRatio)}% สูงกว่าปกติ อาจมี waste หรือ theft`,
      `ทบทวน recipe ว่า portion ตรงกับที่กำหนดไหม — food cost ratio สูงถึง ${Math.round(avgCostRatio)}%`,
    ])
  }

  // Margin below target multiple days in a row
  if (marginDaysBelow >= 4 && marginGap < -10) {
    return pick([
      `ทบทวน recipe cost ทุกเมนู — Margin ต่ำกว่าเป้า ${marginGapAbs}% ติดต่อกัน ${marginDaysBelow} วัน`,
      `เลือก top 3 เมนูขายดีและคำนวณ food cost % ใหม่ — Margin ต่ำกว่าเป้า ${marginGapAbs}% มา ${marginDaysBelow} วัน`,
      `ปรับราคาขายเมนูที่ cost สูงขึ้น ฿5-10 — Margin ต่ำกว่าเป้า ${marginGapAbs}% ติดต่อกัน ${marginDaysBelow} วัน`,
    ])
  }

  // Good margin but low covers — traffic problem
  if (marginGap >= 0 && coversGap < -15) {
    return pick([
      `Margin ดี แต่ลูกค้าน้อยกว่าเป้า ${coversGapAbs} คน — ลอง LINE OA promotion หรือ Google Maps post วันนี้`,
      `โพสต์รูปเมนูใหม่ใน Facebook/Instagram วันนี้ — Margin ดีแต่ลูกค้าต่ำกว่าเป้า ${coversGapAbs} คน`,
      `ลดราคา set lunch พิเศษดึงลูกค้าช่วงกลางวัน — Margin ดีแต่ traffic น้อยกว่าเป้า ${coversGapAbs} คน`,
    ])
  }

  // Low avg spend with margin below target
  if (avgSpend < 160 && marginGap < -5) {
    return pick([
      `เพิ่ม avg spend ด้วย upsell เครื่องดื่มและ dessert — ปัจจุบัน ฿${Math.round(avgSpend)}/คน ต่ำกว่าเป้า และ margin ต่ำกว่าเป้า ${marginGapAbs}%`,
      `ฝึก staff แนะนำ add-on ทุก order — Avg spend ฿${Math.round(avgSpend)}/คน และ margin ต่ำกว่าเป้า ${marginGapAbs}%`,
      `เพิ่ม combo set ที่มี margin สูง — Avg spend ฿${Math.round(avgSpend)}/คน ต่ำ margin ต่ำกว่าเป้า ${marginGapAbs}%`,
    ])
  }

  // Revenue declining + margin under pressure
  if (revTrend < -1500 && marginGap < 0) {
    return pick([
      'ตรวจสอบว่ามีคู่แข่งใหม่ในพื้นที่หรือ quality ลดลง — รายได้และ margin ลดลงพร้อมกันตลอด 7 วัน',
      'ลอง customer survey ง่ายๆ ถามว่าชอบหรือไม่ชอบอะไร — รายได้และ margin ลดลงพร้อมกัน 7 วัน',
      'ทบทวน menu ว่ามีอะไรควรตัดออกหรือปรับราคา — รายได้และ margin ลดต่อเนื่อง',
    ])
  }

  // Both on target
  if (marginGap >= 0 && coversGap >= 0) {
    return pick([
      'Margin และลูกค้าตามเป้าทั้งคู่ — ทดลอง new menu item เพื่อเพิ่ม avg spend สัปดาห์หน้า',
      'ผลงานดีวันนี้ — ถ่ายรูปเมนูขายดีโพสต์ social media เพื่อดึงลูกค้าใหม่',
      'Margin และลูกค้าตามเป้า — วันนี้เหมาะทบทวน supplier price เพื่อ protect margin',
    ])
  }

  // Margin slightly below
  if (marginGap < -5 && marginGap >= -15) {
    return pick([
      `เช็ค top 3 เมนูขายดีว่า food cost % อยู่ที่เท่าไหร่ — Margin ต่ำกว่าเป้า ${marginGapAbs}%`,
      `ตรวจสอบราคาซื้อวัตถุดิบกับ supplier เทียบกับเดือนที่แล้ว — Margin ต่ำกว่าเป้า ${marginGapAbs}%`,
      `เพิ่ม high-margin item ในเมนูแนะนำวันนี้ — Margin ต่ำกว่าเป้า ${marginGapAbs}%`,
    ])
  }

  // Covers low only
  if (coversGap < -20 && marginGap >= -5) {
    return pick([
      `ลอง happy hour หรือ set lunch พิเศษเพื่อดึงลูกค้าช่วง off-peak — ลูกค้าน้อยกว่าเป้า ${coversGapAbs} คน`,
      `โพสต์ offer พิเศษใน LINE OA วันนี้ — ลูกค้าน้อยกว่าเป้า ${coversGapAbs} คน traffic ต้องการ boost`,
      `เพิ่ม Google Maps post รูปอาหารวันนี้ — ลูกค้าน้อยกว่าเป้า ${coversGapAbs} คน`,
    ])
  }

  return pick([
    `ตรวจสอบ waste และ portion control วันนี้ — Margin ต่ำกว่าเป้า ${marginGapAbs}%`,
    `เปรียบราคาซื้อ top 5 วัตถุดิบกับ supplier รายอื่น — Margin ต่ำกว่าเป้า ${marginGapAbs}%`,
    `นับ stock วันนี้เพื่อหา gap ระหว่างที่ซื้อมาและที่ใช้จริง — Margin ต่ำกว่าเป้า ${marginGapAbs}%`,
  ])
}
