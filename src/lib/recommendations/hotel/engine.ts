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
  | 'competitor_undercut'

export interface HotelRecommendation {
  type: HotelRecommendationType
  /** The date the recommendation applies to. Usually tomorrow. */
  date: string
  /** THB integer; present when the rec proposes a new rate. */
  suggestedRateThb?: number
  /** THB integer at the time of the rec (latest day's ADR). */
  currentRateThb?: number
  /** Room type the rec applies to — present when the rec is room-type
   *  specific (multi-room-type hotels). Absent for property-level recs
   *  (weekend signal, undercut signal, blended hold/increase/decrease). */
  roomType?: string
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
  /** Competitor rates captured on this date. Optional — many days
   *  won't carry any (the owner hasn't logged that day yet). The
   *  competitor signals require ≥3 days where this array is
   *  non-empty before they fire. */
  competitorRates?: ReadonlyArray<{
    name: string
    rateThb: number
    /** Channel the rate was captured from. The undercut + overpricing
     *  signals filter to OTA-only since that's what guests actually
     *  shop. Legacy data without a channel (rows from before
     *  migration 033) is treated as OTA for backward-compat. */
    channel?: string
  }>
  /** Per-room-type breakdown for the day. Populated from the
   *  accommodation_daily_metrics.room_type_breakdown jsonb when
   *  available (CSV imports + per-room-type manual entry). When two
   *  or more types are present the engine emits per-room-type rate
   *  signals instead of a single blended suggestion (which is
   *  meaningless when each room type has a different rate). */
  roomTypeBreakdown?: ReadonlyArray<{
    roomType: string
    totalRooms: number
    occupiedRooms: number
    rateThb: number
  }>
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

  // Multi-room-type dispatch. When the latest day carries a breakdown
  // with two or more room types, a single blended ADR suggestion is
  // meaningless (Suite at ฿1,920 + Deluxe2 at ฿950 → blended ฿669
  // doesn't correspond to any real rate). Emit per-room-type signals
  // instead so the owner sees actionable, accurately-priced advice.
  // Falls back to blended logic when the per-room signals don't fire
  // (e.g. every room type is within the hold band) so the owner still
  // gets a hold/increase/decrease signal at the property level.
  const latest = pickLatest(days)
  const hasMultiRoomBreakdown =
    Array.isArray(latest.roomTypeBreakdown) && latest.roomTypeBreakdown.length > 1
  if (hasMultiRoomBreakdown) {
    const perRoom = suggestRatesPerRoomType(days)
    if (perRoom.length > 0) return perRoom
    // No per-room signal — fall through to blended (yields rate_hold
    // most likely, which is the right property-level signal).
  }

  return suggestBlendedRate(days)
}

// Blended suggestion — used for single-room-type properties, properties
// without breakdown data, and as a fallback when per-room signals don't
// fire on a multi-room property. Behaviour identical to the original
// pre-multi-room engine.
function suggestBlendedRate(days: RecommendationInput[]): HotelRecommendation[] {
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

// Per-room-type rate signals — fired when the latest day's breakdown
// carries 2+ room types. Computes each type's 3-day rolling occupancy
// from the breakdown rows on each day (handling types that don't appear
// in every day), then emits rate_increase / rate_decrease using the
// SAME thresholds as the blended path (85% / 40%) so the owner's
// mental model translates cleanly between single-room and multi-room
// hotels.
//
// Note: we widen the hold band slightly per-room (40% lower band stays;
// emit decrease only at <35% to avoid noise for short room-type lists
// where one bad night can drag the 3-day avg down) — keeps the signal
// quality high.
function suggestRatesPerRoomType(days: RecommendationInput[]): HotelRecommendation[] {
  const recent = days.slice(-3)
  const latest = pickLatest(days)
  const tomorrow = addDays(latest.date, 1)

  // Union of room types that appear in the latest day's breakdown.
  const latestBreakdown = latest.roomTypeBreakdown ?? []
  const recs: HotelRecommendation[] = []

  for (const rt of latestBreakdown) {
    // Gather this room type's occupancy across the last 3 days.
    const rtOccupancies: number[] = []
    for (const d of recent) {
      const row = (d.roomTypeBreakdown ?? []).find((r) => r.roomType === rt.roomType)
      if (!row || row.totalRooms <= 0) continue
      rtOccupancies.push(row.occupiedRooms / row.totalRooms)
    }
    // Need at least 2 days of data to compute a stable signal.
    if (rtOccupancies.length < 2) continue

    const avgOcc = rtOccupancies.reduce((s, v) => s + v, 0) / rtOccupancies.length
    const currentRate = Math.round(rt.rateThb)
    if (currentRate <= 0) continue
    const occPct = Math.round(avgOcc * 100)

    if (avgOcc > 0.85) {
      const lift = Math.round(currentRate * 0.10)
      const newRate = currentRate + lift
      recs.push({
        type: 'rate_increase',
        date: tomorrow,
        roomType: rt.roomType,
        suggestedRateThb: newRate,
        currentRateThb: currentRate,
        messageTh: `${rt.roomType}: Occupancy ${occPct}% สูง — แนะนำขึ้น ฿${currentRate.toLocaleString('th-TH')} → ฿${newRate.toLocaleString('th-TH')}`,
        messageEn: `${rt.roomType}: ${occPct}% occupancy — suggest ฿${currentRate.toLocaleString('en-US')} → ฿${newRate.toLocaleString('en-US')}`,
        urgency: 'high',
        supportingData: { roomType: rt.roomType, avgOccupancy: avgOcc, days: rtOccupancies.length, currentRateThb: currentRate, liftThb: lift },
        requiresMinDays: 3,
      })
    } else if (avgOcc < 0.35) {
      const drop = Math.round(currentRate * 0.06)
      const newRate = Math.max(0, currentRate - drop)
      recs.push({
        type: 'rate_decrease',
        date: tomorrow,
        roomType: rt.roomType,
        suggestedRateThb: newRate,
        currentRateThb: currentRate,
        messageTh: `${rt.roomType}: Occupancy ${occPct}% ต่ำ — พิจารณาลด ฿${currentRate.toLocaleString('th-TH')} → ฿${newRate.toLocaleString('th-TH')}`,
        messageEn: `${rt.roomType}: ${occPct}% occupancy — consider ฿${currentRate.toLocaleString('en-US')} → ฿${newRate.toLocaleString('en-US')}`,
        urgency: 'medium',
        supportingData: { roomType: rt.roomType, avgOccupancy: avgOcc, days: rtOccupancies.length, currentRateThb: currentRate, dropThb: drop },
        requiresMinDays: 3,
      })
    }
    // Silence in the 35%–85% band is the hold signal at the room level
    // — no per-room hold rec to avoid bubble clutter on a 4-room-type
    // property where most rooms are sitting in the comfortable middle.
  }
  return recs
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

// Per-room-type rate recommendation, one row per active room type.
// Distinct from `suggestRatesPerRoomType` (which only emits
// increase/decrease signals into the property-level recommendation
// stream): this output always lists EVERY active room type, including
// holds, because the morning brief now displays the full rate sheet
// rather than a single blended number.
//
// Shape:
//   - currentRateThb: rack rate captured on the latest day
//   - suggestedRateThb: engine's tomorrow rate; equals currentRateThb
//                       when direction = 'hold'
//   - direction: 'increase' | 'hold' | 'decrease'
//   - reasonTh/reasonEn: short, scannable Thai/English copy
//   - impactThb: |suggested − current|; used by the brief builder
//                to pick the top N when capping for bubble overflow
//                (Crystal Resort: 4 types → all 4 fit; an 8-type
//                property gets the 6 biggest moves + "+2 more")
export interface PerRoomTypeRate {
  roomType: string
  currentRateThb: number
  suggestedRateThb: number
  direction: 'increase' | 'hold' | 'decrease'
  reasonTh: string
  reasonEn: string
  impactThb: number
}

export function recommendPerRoomTypeRates(
  days: RecommendationInput[],
): PerRoomTypeRate[] {
  if (days.length === 0) return []
  const latest = pickLatest(days)
  const types = latest.roomTypeBreakdown ?? []
  if (types.length === 0) return []

  // 3-day window mirrors the property-level engine. We don't gate on
  // a hard "≥3 days" quorum like suggestRates() because for the per-
  // type output a 'hold' is still useful information when data is
  // thin — we just tag the reason copy accordingly.
  const recent = days.slice(-3)

  const rows: PerRoomTypeRate[] = []
  for (const rt of types) {
    const currentRate = Math.round(rt.rateThb)
    // Skip types whose rack rate isn't captured — we can't render a
    // sensible "฿X → ฿Y" line without a baseline. These are usually
    // import errors that the dashboard surfaces separately.
    if (currentRate <= 0) continue

    // Per-type occupancy over the recent window. Days where the type
    // has no row (e.g. mid-week when only Standard was booked) don't
    // contribute — we don't want a sparse type to read 0% just because
    // its rows are missing.
    const occs: number[] = []
    for (const d of recent) {
      const row = (d.roomTypeBreakdown ?? []).find((r) => r.roomType === rt.roomType)
      if (!row || row.totalRooms <= 0) continue
      occs.push(row.occupiedRooms / row.totalRooms)
    }

    if (occs.length === 0) {
      // No occupancy data for this type yet — hold at current with a
      // reason copy that calls out the data gap so the owner knows
      // why no move is being suggested.
      rows.push({
        roomType: rt.roomType,
        currentRateThb: currentRate,
        suggestedRateThb: currentRate,
        direction: 'hold',
        reasonTh: 'ข้อมูลยังไม่พอ — คงราคาไว้ก่อน',
        reasonEn: 'Not enough data yet — hold current rate',
        impactThb: 0,
      })
      continue
    }

    const avgOcc = occs.reduce((s, v) => s + v, 0) / occs.length
    const occPct = Math.round(avgOcc * 100)

    if (avgOcc > 0.85) {
      // High-demand band — same 10% lift the property-level engine
      // uses, applied to this type's own rack rate.
      const lift = Math.round(currentRate * 0.10)
      const suggested = currentRate + lift
      rows.push({
        roomType: rt.roomType,
        currentRateThb: currentRate,
        suggestedRateThb: suggested,
        direction: 'increase',
        reasonTh: `Occupancy ${occPct}% สูง — แนะนำขึ้น`,
        reasonEn: `${occPct}% occupancy — suggest raise`,
        impactThb: Math.abs(suggested - currentRate),
      })
    } else if (avgOcc < 0.35) {
      // Low-demand band. Slightly tighter than the 40% threshold the
      // blended path uses — a single bad night in a sparse type can
      // drag a 3-day avg under 40% even when demand is healthy on the
      // other two days. 35% keeps the decrease signal high-quality.
      const drop = Math.round(currentRate * 0.06)
      const suggested = Math.max(0, currentRate - drop)
      rows.push({
        roomType: rt.roomType,
        currentRateThb: currentRate,
        suggestedRateThb: suggested,
        direction: 'decrease',
        reasonTh: `Occupancy ${occPct}% ต่ำ — พิจารณาลด`,
        reasonEn: `${occPct}% occupancy — consider lower`,
        impactThb: Math.abs(suggested - currentRate),
      })
    } else {
      // Comfortable middle band — explicit hold so the owner sees the
      // type was considered. impactThb = 0 means this row sorts last
      // when the brief caps to top N by impact.
      rows.push({
        roomType: rt.roomType,
        currentRateThb: currentRate,
        suggestedRateThb: currentRate,
        direction: 'hold',
        reasonTh: `Occupancy ${occPct}% — ราคาเหมาะสม`,
        reasonEn: `${occPct}% occupancy — current rate is appropriate`,
        impactThb: 0,
      })
    }
  }
  // Preserve breakdown input order (matches the order the owner sees
  // on the dashboard / settings rooms page). Brief builder is free to
  // sort by impact for the cap decision, but the natural order is what
  // we hand back so non-capped renders read consistently.
  return rows
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

// ── Competitor signals ────────────────────────────────────────────────────

// Internal: shared per-day comparison block reused by the two
// competitor-aware signals. Returns null when the input doesn't carry
// at least 3 days with competitor data.
function competitorComparison(days: RecommendationInput[]): null | {
  ourAvgAdrThb: number
  competitorAvgThb: number
  topCompetitor: { name: string; rateThb: number }
  gapRatio: number // (competitorAvg - ourAdr) / ourAdr; can be negative
  daysWithCompetitor: number
} {
  // Filter to OTA channel (and legacy unspecified) per day BEFORE the
  // 3-day quorum check. A day where the owner only logged walk-in
  // rates shouldn't satisfy the threshold for the OTA-aware signal.
  const isOtaOrLegacy = (r: { channel?: string }): boolean =>
    !r.channel || r.channel === 'ota'
  const daysWithCompetitor = days
    .map((d) => ({
      ...d,
      competitorRates: (d.competitorRates ?? []).filter(isOtaOrLegacy),
    }))
    .filter((d) => d.competitorRates.length > 0)
  if (daysWithCompetitor.length < 3) return null
  const recent = daysWithCompetitor.slice(-3)
  const ourAvgAdrThb = recent.reduce((s, d) => s + d.adrThb, 0) / recent.length
  const flatRates = recent.flatMap((d) => d.competitorRates ?? [])
  if (flatRates.length === 0) return null
  const competitorAvgThb = flatRates.reduce((s, r) => s + r.rateThb, 0) / flatRates.length
  const topCompetitor = flatRates.reduce((max, r) => (r.rateThb > max.rateThb ? r : max))
  const gapRatio = ourAvgAdrThb > 0 ? (competitorAvgThb - ourAvgAdrThb) / ourAvgAdrThb : 0
  return {
    ourAvgAdrThb,
    competitorAvgThb,
    topCompetitor,
    gapRatio,
    daysWithCompetitor: daysWithCompetitor.length,
  }
}

export function detectCompetitorUndercutting(
  days: RecommendationInput[],
): HotelRecommendation[] {
  const cmp = competitorComparison(days)
  if (!cmp) return []
  // Only fire when competitors are >15% higher than us for 3+ days.
  // Smaller gaps are noise; a 5% delta isn't actionable.
  if (cmp.gapRatio <= 0.15) return []
  const latest = pickLatest(days)
  const currentRate = Math.round(cmp.ourAvgAdrThb)
  const gapThb = Math.round(cmp.competitorAvgThb - cmp.ourAvgAdrThb)
  // Suggest closing ~60% of the gap. Conservative — don't chase
  // parity in one move; reassess after the change beds in.
  const suggested = Math.round(cmp.ourAvgAdrThb + (cmp.competitorAvgThb - cmp.ourAvgAdrThb) * 0.6)
  const gapPct = Math.round(cmp.gapRatio * 100)
  return [{
    type: 'competitor_undercut',
    date: addDays(latest.date, 1),
    suggestedRateThb: suggested,
    currentRateThb: currentRate,
    messageTh: `${cmp.topCompetitor.name} ตั้งราคาสูงกว่าคุณ ฿${gapThb.toLocaleString('th-TH')} — มีโอกาสปรับราคาขึ้นได้ (แนะนำ ฿${suggested.toLocaleString('th-TH')})`,
    messageEn: `${cmp.topCompetitor.name} is pricing ฿${gapThb.toLocaleString('en-US')} above you — opportunity to raise rates (suggested ฿${suggested.toLocaleString('en-US')})`,
    // > 25% gap is loud; 15-25% is medium.
    urgency: cmp.gapRatio > 0.25 ? 'high' : 'medium',
    supportingData: {
      ourAvgAdrThb: currentRate,
      competitorAvgThb: Math.round(cmp.competitorAvgThb),
      gapThb,
      gapPercent: gapPct,
      topCompetitor: cmp.topCompetitor.name,
      daysOfData: cmp.daysWithCompetitor,
    },
    requiresMinDays: 3,
  }]
}

// Inverse signal — we're priced ABOVE competitors AND occupancy is
// soft, so we're risking bookings. Goes out as a rate_decrease so it
// dedupes against the occupancy-driven rate_decrease from
// suggestRates() (the composer keeps the highest-urgency rec per
// type, so this only wins when this signal's urgency outranks).
export function detectOverpricing(
  days: RecommendationInput[],
): HotelRecommendation[] {
  const cmp = competitorComparison(days)
  if (!cmp) return []
  // Note we invert gapRatio here — for this signal we care about
  // ourAvg > competitorAvg, i.e. negative gapRatio.
  const ourGapRatio = cmp.competitorAvgThb > 0
    ? (cmp.ourAvgAdrThb - cmp.competitorAvgThb) / cmp.competitorAvgThb
    : 0
  if (ourGapRatio <= 0.20) return []
  // ...and only when occupancy is soft (≤60% over the recent 3-day
  // competitor-data window). If occupancy is healthy at a premium,
  // the premium is working — don't fight it.
  const recent = days.slice(-3)
  const recentAvgOcc = avgOccupancy(recent)
  if (recentAvgOcc > 0.60) return []
  const latest = pickLatest(days)
  const currentRate = Math.round(cmp.ourAvgAdrThb)
  const gapThb = Math.round(cmp.ourAvgAdrThb - cmp.competitorAvgThb)
  const suggested = Math.round(cmp.competitorAvgThb * 1.05)
  const occPct = Math.round(recentAvgOcc * 100)
  return [{
    type: 'rate_decrease',
    date: addDays(latest.date, 1),
    suggestedRateThb: suggested,
    currentRateThb: currentRate,
    messageTh: `ราคาของคุณสูงกว่าคู่แข่ง ฿${gapThb.toLocaleString('th-TH')} และ Occupancy อยู่ที่ ${occPct}% — พิจารณาปรับราคาลง`,
    messageEn: `Your rate is ฿${gapThb.toLocaleString('en-US')} above competitors with ${occPct}% occupancy — consider lowering rate`,
    urgency: 'medium',
    supportingData: {
      ourAvgAdrThb: currentRate,
      competitorAvgThb: Math.round(cmp.competitorAvgThb),
      recentOccupancy: recentAvgOcc,
    },
    requiresMinDays: 3,
  }]
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
    ...detectCompetitorUndercutting(days),
    ...detectOverpricing(days),
  ]
  // Dedupe by (type, roomType) so that on a multi-room property the
  // per-room rate_increase / rate_decrease recs survive side-by-side
  // (a property might want both "Suite +10%" and "Deluxe -6%" on the
  // same day). Property-level recs (no roomType) keep the historical
  // behaviour: one row per type.
  const order: Record<HotelRecommendation['urgency'], number> = { high: 0, medium: 1, low: 2 }
  const byKey = new Map<string, HotelRecommendation>()
  for (const r of all) {
    const key = `${r.type}|${r.roomType ?? ''}`
    const existing = byKey.get(key)
    if (!existing || order[r.urgency] < order[existing.urgency]) byKey.set(key, r)
  }
  return Array.from(byKey.values())
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
  /** Optional per-room-type breakdown from the daily metrics row's
   *  jsonb column. When 2+ types are present, the engine emits per-room
   *  rate signals instead of a blended ADR suggestion. */
  room_type_breakdown?: ReadonlyArray<{
    roomType: string
    totalRooms: number
    occupiedRooms: number
    rateThb: number
  }> | null
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
    // Pass breakdown through when it's a non-empty array. Defensive
    // against malformed jsonb (e.g. legacy CSV imports that wrote a
    // string or an object) — only arrays make it through.
    const breakdown = Array.isArray(r.room_type_breakdown) && r.room_type_breakdown.length > 0
      ? r.room_type_breakdown.filter((b) => b && typeof b.roomType === 'string')
      : undefined
    out.push({
      date: r.metric_date,
      occupancyRate: sold / available,
      adrThb: revenue / sold,
      ...(breakdown ? { roomTypeBreakdown: breakdown } : {}),
    })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

// Merge competitor-rate rows from the `competitor_rates` table into
// the engine's per-day input list. Caller already has the inputs
// (from toRecommendationInputs above) and the raw competitor rows
// (one row per competitor × room_type × captured_at, THB). We group
// the rows by captured_at and decorate the matching input. Inputs
// without competitor data for that day are returned unchanged —
// the competitor-aware signals require ≥3 days with data before
// firing, so undecorated inputs naturally don't contribute.
export interface CompetitorRateRowForRec {
  captured_at: string
  competitor_name: string
  rate: number | string | null
  /** Channel from migration 033; absent on rows from before the
   *  migration ran (treated as 'ota' by the engine). */
  channel?: string | null
}

export function attachCompetitorRates(
  inputs: RecommendationInput[],
  rates: CompetitorRateRowForRec[],
): RecommendationInput[] {
  const byDate = new Map<string, Array<{ name: string; rateThb: number; channel?: string }>>()
  for (const r of rates) {
    const rateNum = Number(r.rate)
    if (!Number.isFinite(rateNum) || rateNum <= 0) continue
    const arr = byDate.get(r.captured_at) || []
    arr.push({
      name: r.competitor_name,
      rateThb: rateNum,
      ...(r.channel ? { channel: r.channel } : {}),
    })
    byDate.set(r.captured_at, arr)
  }
  return inputs.map((i) => {
    const hits = byDate.get(i.date)
    return hits && hits.length > 0 ? { ...i, competitorRates: hits } : i
  })
}
