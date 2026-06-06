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

import { thbToSatang } from '@/lib/money/satang'

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
  /** Actual room type label from accommodation_daily_metrics.room_type_
   *  breakdown jsonb (e.g. "Suite", "Deluxe2"). Never the literal 'all'
   *  — property-level recs are emitted as separate signals by the rest
   *  of the engine, not as a per-room row. */
  roomType: string
  /** Rack rate captured for this type on the latest day (THB integer).
   *  THB fields are retained for the brief renderer which displays in
   *  baht; the *_satang fields below are the persistence units. */
  currentRateThb: number
  suggestedRateThb: number
  /** Same values in satang (1 THB = 100 satang). These are the canonical
   *  values stored in branch_rate_recommendations and rate_approvals.
   *  Computed via thbToSatang() at engine output time so callers don't
   *  do unit conversion. */
  currentRateSatang: number
  suggestedRateSatang: number
  direction: 'increase' | 'hold' | 'decrease'
  reasonTh: string
  reasonEn: string
  /** |suggestedRateThb − currentRateThb|; used by the brief builder to
   *  cap to top N by impact when many room types are present. */
  impactThb: number
}

/** One entry of the authoritative room-type roster — typically derived
 *  from the Room types settings / room-config source (see
 *  deriveRoomTypesFromBreakdowns). Lets the engine guarantee a row for
 *  EVERY known room type, not only the ones that happened to sell on
 *  the latest day. */
export interface RoomTypeRosterEntry {
  /** Display label, exactly as it appears in room_type_breakdown. */
  roomType: string
  /** Inventory (rooms) from the config source, if known. Presence of a
   *  positive inventory is what lets the engine treat an absent type as
   *  0% occupancy ("had rooms, sold none") rather than "no data". */
  inventory?: number
  /** Rack rate (THB) from the config source. Used as the rate-baseline
   *  fallback when the type didn't sell anywhere in the window. */
  rackRateThb?: number
}

export interface RecommendPerRoomTypeOptions {
  /** Authoritative room-type roster (Room types settings / room-config).
   *  Every entry is guaranteed exactly one row in the output — even when
   *  the type sold nothing on every recent day. The per-window union of
   *  types seen in `days` is merged on top, so a type present in the
   *  data but missing from config still gets a row. When omitted, the
   *  roster is the union of types across `days`. */
  roster?: ReadonlyArray<RoomTypeRosterEntry>
}

// The invariant this function guarantees: the rate sheet ALWAYS lists
// every room type in the roster. A type is never silently dropped just
// because it sold nothing — zero bookings is a 0%-occupancy DECREASE
// signal, not missing data. The only thing that drops a type is a
// genuinely unrecoverable rack rate (no rate anywhere + no config rate),
// and that case is logged.
export function recommendPerRoomTypeRates(
  days: RecommendationInput[],
  options: RecommendPerRoomTypeOptions = {},
): PerRoomTypeRate[] {
  const configRoster = options.roster ?? []
  if (days.length === 0 && configRoster.length === 0) return []

  // ── Build the COMPLETE room-type roster ──────────────────────────
  // Union of (a) every type seen in any day's breakdown across the
  // recent window and (b) the authoritative config roster. Each entry
  // carries the best inventory + last-known rack rate we can recover so
  // a type that didn't sell still gets a sensible baseline.
  //
  // Order: latest day's types first (matches the dashboard /
  // settings-rooms order the owner already sees), then types seen only
  // on earlier days, then config-only types — so the sheet reads the
  // same way every morning.
  interface RosterMeta {
    roomType: string
    /** Max totalRooms observed across the window (best-guess inventory). */
    inventory: number
    /** Most recent positive rateThb seen in the window. */
    lastRateThb: number
    lastRateDate: string
    /** Rack rate from the config roster — fallback when the type never
     *  carried a positive rate in the window (it didn't sell). */
    configRackThb: number
  }
  const meta = new Map<string, RosterMeta>()
  const order: string[] = []
  const ensure = (roomType: string): RosterMeta => {
    let m = meta.get(roomType)
    if (!m) {
      m = { roomType, inventory: 0, lastRateThb: 0, lastRateDate: '', configRackThb: 0 }
      meta.set(roomType, m)
      order.push(roomType)
    }
    return m
  }

  // Walk latest → earliest so the latest day's type order leads.
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i]
    for (const b of d.roomTypeBreakdown ?? []) {
      if (!b.roomType) continue
      const m = ensure(b.roomType)
      m.inventory = Math.max(m.inventory, b.totalRooms || 0)
      if (d.date > m.lastRateDate && (b.rateThb || 0) > 0) {
        m.lastRateThb = b.rateThb
        m.lastRateDate = d.date
      }
    }
  }
  // Config roster — authoritative inventory + rack-rate fallback. Adds
  // config-only types to the end of the order.
  for (const entry of configRoster) {
    if (!entry.roomType) continue
    const m = ensure(entry.roomType)
    if (entry.inventory && entry.inventory > m.inventory) m.inventory = entry.inventory
    if (entry.rackRateThb && entry.rackRateThb > 0) m.configRackThb = entry.rackRateThb
  }

  // 3-day window mirrors the property-level engine. We don't gate on a
  // hard "≥3 days" quorum like suggestRates() — for the per-type output
  // a 'hold'/'decrease' is still useful when data is thin; we tag the
  // reason copy accordingly.
  const recent = days.slice(-3)
  const rows: PerRoomTypeRate[] = []

  for (const roomType of order) {
    const m = meta.get(roomType)!

    // Rate-baseline fallback order (per spec):
    //   1. the type's last-known rateThb in the recent window
    //   2. the Room types config rack rate
    //   3. skip — only when truly no rate is recoverable (and log it)
    const baselineThb = m.lastRateThb > 0 ? m.lastRateThb : m.configRackThb
    if (baselineThb <= 0) {
      console.warn(
        `[recommendPerRoomTypeRates] no recoverable rack rate for room type "${roomType}" — skipping`,
      )
      continue
    }
    const currentRate = Math.round(baselineThb)
    const knownInventory = m.inventory > 0

    // Per-type occupancy over the recent window. Two ways a day counts:
    //   - row present with inventory → occupiedRooms / totalRooms
    //   - row ABSENT but the type is known to have inventory → 0%
    //     (it had rooms to sell and sold none — the zero-bookings
    //     signal). A day where the type is absent AND inventory is
    //     unknown contributes nothing (genuinely no data for it).
    const occs: number[] = []
    for (const d of recent) {
      const row = (d.roomTypeBreakdown ?? []).find((r) => r.roomType === roomType)
      if (row && row.totalRooms > 0) {
        occs.push(row.occupiedRooms / row.totalRooms)
      } else if (!row && knownInventory) {
        occs.push(0)
      }
      // row present with totalRooms<=0: malformed/no inventory that day
      // — no contribution.
    }

    // Inline helper — composes a PerRoomTypeRate. The satang conversion
    // happens here, exactly once, so every emitting path shares the
    // boundary.
    const buildRow = (
      currentThb: number,
      suggestedThb: number,
      direction: PerRoomTypeRate['direction'],
      reasonTh: string,
      reasonEn: string,
    ): PerRoomTypeRate => ({
      roomType,
      currentRateThb: currentThb,
      suggestedRateThb: suggestedThb,
      currentRateSatang: thbToSatang(currentThb),
      suggestedRateSatang: thbToSatang(suggestedThb),
      direction,
      reasonTh,
      reasonEn,
      impactThb: Math.abs(suggestedThb - currentThb),
    })

    if (occs.length === 0) {
      // Case (b): no occupancy evidence anywhere in the window AND no
      // inventory to infer a zero from — genuinely thin data. Hold at
      // the rack-rate baseline so the sheet STILL lists the type.
      rows.push(buildRow(
        currentRate,
        currentRate,
        'hold',
        'ข้อมูลยังไม่พอ — คงราคาไว้ก่อน',
        'Not enough data yet — hold current rate',
      ))
      continue
    }

    const avgOcc = occs.reduce((s, v) => s + v, 0) / occs.length
    const occPct = Math.round(avgOcc * 100)
    const nothingSold = occs.every((o) => o === 0)

    if (avgOcc > 0.85) {
      // High-demand band — same 10% lift the property-level engine
      // uses, applied to this type's own rack rate.
      const lift = Math.round(currentRate * 0.10)
      const suggested = currentRate + lift
      rows.push(buildRow(
        currentRate,
        suggested,
        'increase',
        `Occupancy ${occPct}% สูง — แนะนำขึ้น`,
        `${occPct}% occupancy — suggest raise`,
      ))
    } else if (avgOcc < 0.35) {
      // Low-demand band. Slightly tighter than the 40% threshold the
      // blended path uses — a single bad night in a sparse type can
      // drag a 3-day avg under 40% even when demand is healthy on the
      // other two days. 35% keeps the decrease signal high-quality.
      //
      // Case (a): distinguish "had rooms, sold zero" from "sold a
      // little but soft" — both decrease, but the copy differs so the
      // owner knows which is which.
      const drop = Math.round(currentRate * 0.06)
      const suggested = Math.max(0, currentRate - drop)
      rows.push(buildRow(
        currentRate,
        suggested,
        'decrease',
        nothingSold
          ? 'ไม่มีการจองห้องนี้ — พิจารณาลดราคา'
          : `Occupancy ${occPct}% ต่ำ — พิจารณาลด`,
        nothingSold
          ? 'No bookings — consider lowering'
          : `${occPct}% occupancy — consider lower`,
      ))
    } else {
      // Comfortable middle band — explicit hold so the owner sees the
      // type was considered. impactThb = 0 means this row sorts last
      // when the brief caps to top N by impact.
      rows.push(buildRow(
        currentRate,
        currentRate,
        'hold',
        `Occupancy ${occPct}% — ราคาเหมาะสม`,
        `${occPct}% occupancy — current rate is appropriate`,
      ))
    }
  }
  // Roster order (latest-day types first) — matches the order the owner
  // sees on the dashboard / settings rooms page. The brief builder is
  // free to sort by impact for the cap decision, but the natural order
  // is what we hand back so non-capped renders read consistently.
  return rows
}

/** Plain-language "what to do today" line synthesised from the per-
 *  room rate mix. Used by the morning LINE brief to give the owner a
 *  one-glance action — the rate sheet shows WHAT to change, this line
 *  says WHY and WHAT ELSE to consider.
 *
 *  Pure function. Always returns something when given a non-empty set,
 *  so the brief never lacks an action line — the previous behaviour of
 *  relying on `detectLowOccupancy` / `detectWeekendOpportunity` left
 *  branches with <3 days of data with no actionable guidance at all. */
export interface DailyAction {
  messageTh: string
  messageEn: string
}

/** Extra signals the action-line builder uses to make the line
 *  SITUATIONAL — so two different days produce visibly different,
 *  accurate guidance rather than the same static template. All optional:
 *  when nothing is supplied the builder still names the weakest/strongest
 *  room types (which already vary day to day), it just can't reference
 *  trend / weekend / target / competitor context. */
export interface DailyActionContext {
  /** Engine inputs (occupancy history + competitor data) — the same
   *  list fed to recommendPerRoomTypeRates. The last entry is the most
   *  recent day. Drives trend, weekend-vs-weekday, and competitor-gap
   *  framing. */
  inputs?: ReadonlyArray<RecommendationInput>
  /** Target occupancy. Accepts a 0..1 fraction or a 0..100 percent
   *  (normalised internally). Drives the "X pts below target" framing. */
  targetOccupancy?: number | null
}

// Derived, presentation-ready view of the day's situation. Null when no
// inputs are supplied (the builder degrades to type-name-only copy).
interface DerivedDayContext {
  occPct: number
  /** Positive points below target; null when at/above target or no target. */
  belowTargetPct: number | null
  trend: 'worsening' | 'improving' | 'steady'
  /** True when TOMORROW (the night the rec applies to) is Fri/Sat. */
  isWeekend: boolean
  /** Competitors priced this many % above us (≥16%); null otherwise. */
  competitorHigherPct: number | null
}

function deriveDayContext(context: DailyActionContext): DerivedDayContext | null {
  const inputs = context.inputs ?? []
  if (inputs.length === 0) return null
  const latest = inputs[inputs.length - 1]
  const occNow = latest.occupancyRate

  // Trend: latest day vs the average of up to 3 prior days. ±5pts is the
  // band for "steady" — below that it's noise.
  const prior = inputs.slice(Math.max(0, inputs.length - 4), inputs.length - 1)
  const priorAvg = prior.length
    ? prior.reduce((s, d) => s + d.occupancyRate, 0) / prior.length
    : occNow
  const delta = occNow - priorAvg
  const trend = delta <= -0.05 ? 'worsening' : delta >= 0.05 ? 'improving' : 'steady'

  // Weekend context keys on the night the rec applies to (tomorrow).
  const tomorrowDow = new Date(`${addDays(latest.date, 1)}T00:00:00Z`).getUTCDay()
  const isWeekend = tomorrowDow === 5 || tomorrowDow === 6

  let targetOcc = context.targetOccupancy ?? null
  if (targetOcc != null && targetOcc > 1) targetOcc = targetOcc / 100
  const belowTargetPct =
    targetOcc != null && targetOcc > occNow ? Math.round((targetOcc - occNow) * 100) : null

  const cmp = competitorComparison(inputs as RecommendationInput[])
  const competitorHigherPct = cmp && cmp.gapRatio > 0.15 ? Math.round(cmp.gapRatio * 100) : null

  return { occPct: Math.round(occNow * 100), belowTargetPct, trend, isWeekend, competitorHigherPct }
}

// Name up to two room types, sorted by impact (the biggest movers).
function topTwoNames(rates: ReadonlyArray<PerRoomTypeRate>): string[] {
  return rates
    .slice()
    .sort((a, b) => b.impactThb - a.impactThb)
    .slice(0, 2)
    .map((r) => r.roomType)
}

/** Plain-language "what to do today" line synthesised from the per-room
 *  rate mix AND the day's situational signals. The rate sheet shows WHAT
 *  to change; this line says WHY and WHAT ELSE to consider — and, unlike
 *  the old static template, it varies as the numbers vary (weakest types,
 *  occupancy vs target, trend, weekend/weekday, competitor gap), so two
 *  different days don't read identically.
 *
 *  Pure function. Always returns something for a non-empty rate set. The
 *  `context` is optional so existing callers / tests keep working — but
 *  the morning-flash loader passes it, so LINE and email both get the
 *  situational line (parity). */
export function summarizePerRoomRates(
  rates: ReadonlyArray<PerRoomTypeRate>,
  context: DailyActionContext = {},
): DailyAction | null {
  if (rates.length === 0) return null

  const increases = rates.filter((r) => r.direction === 'increase')
  const decreases = rates.filter((r) => r.direction === 'decrease')
  const holds = rates.filter((r) => r.direction === 'hold')
  const ctx = deriveDayContext(context)

  // Shared "where we are" fragment — occupancy and (when known) the gap
  // to target. Interpolating these is what makes the line move day to
  // day even when the dominant signal is unchanged.
  const occTh = ctx
    ? ` (occ ${ctx.occPct}%${ctx.belowTargetPct != null ? `, ต่ำกว่าเป้า ${ctx.belowTargetPct}%` : ''})`
    : ''
  const occEn = ctx
    ? ` (occ ${ctx.occPct}%${ctx.belowTargetPct != null ? `, ${ctx.belowTargetPct}pts below target` : ''})`
    : ''

  // ── MIXED / equal split — demand is polarised with both ends present
  // in equal measure. Name both ends so the owner manages by type
  // rather than blanket. Checked first so an even split doesn't get
  // mis-routed into the soft/hot single-sided copy. ──
  if (increases.length > 0 && decreases.length > 0 && increases.length === decreases.length) {
    const topUp = increases.slice().sort((a, b) => b.impactThb - a.impactThb)[0]
    const topDown = decreases.slice().sort((a, b) => b.impactThb - a.impactThb)[0]
    return {
      messageTh: `ดีมานด์แยกตามห้อง: ขึ้น ${topUp.roomType}, ดัน ${topDown.roomType}${occTh} — บริหารราคาตามประเภทห้อง`,
      messageEn: `Demand is split: raise ${topUp.roomType}, push ${topDown.roomType}${occEn} — manage rates by room type`,
    }
  }

  // ── SOFT DEMAND — decreases dominate (more types need a push than
  // need a raise). Name the weakest types; tailor the action to
  // weekend/weekday, trend, and competitor gap. ──
  if (decreases.length > increases.length) {
    const names = topTwoNames(decreases)
    const nameTh = names.join(' และ ')
    const nameEn = names.join(' and ')
    const more = decreases.length - names.length
    const moreTh = more > 0 ? ` (+${more} ห้องอื่น)` : ''
    const moreEn = more > 0 ? ` (+${more} more)` : ''

    let tailTh: string
    let tailEn: string
    if (ctx?.competitorHigherPct != null) {
      // Competitors are priced above us yet we're soft — it's a
      // visibility/promo problem, not a price-too-high one.
      tailTh = `คู่แข่งราคาสูงกว่า ${ctx.competitorHigherPct}% — ดึงยอดด้วยดีลและโปรบน OTA แทนการลดลึก`
      tailEn = `competitors price ${ctx.competitorHigherPct}% higher — win bookings with an OTA deal, not a deep cut`
    } else if (ctx?.isWeekend) {
      tailTh =
        ctx.trend === 'worsening'
          ? 'สุดสัปดาห์ยังว่าง — เปิดดีล last-minute บน OTA และดันโพสต์โซเชียลคืนนี้'
          : 'จัดโปรสุดสัปดาห์และเพิ่มการมองเห็นบน OTA'
      tailEn =
        ctx.trend === 'worsening'
          ? 'weekend still open — push a last-minute OTA deal and boost social tonight'
          : 'run a weekend promo and lift OTA visibility'
    } else {
      tailTh =
        ctx?.trend === 'worsening'
          ? 'ยอดอ่อนลง — เปิดดีลกลางสัปดาห์/ลูกค้าองค์กรและกระตุ้น OTA วันนี้'
          : 'เพิ่มช่องทาง OTA และโปรพักกลางสัปดาห์'
      tailEn =
        ctx?.trend === 'worsening'
          ? 'demand slipping — open a midweek/corporate deal and nudge OTA today'
          : 'add an OTA channel and a midweek stay offer'
    }

    return {
      messageTh: `${nameTh} ว่างมาก${moreTh}${occTh} — ${tailTh}`,
      messageEn: `${nameEn} sitting soft${moreEn}${occEn} — ${tailEn}`,
    }
  }

  // ── HOT DEMAND — increases dominate (and outnumber decreases). Name
  // the strongest types; the risk is standing online discounts leaving
  // money on the table. ──
  if (increases.length > 0 && increases.length > decreases.length) {
    const names = topTwoNames(increases)
    const nameTh = names.join(' และ ')
    const nameEn = names.join(' and ')

    let tailTh: string
    let tailEn: string
    if (ctx?.competitorHigherPct != null) {
      tailTh = `คู่แข่งสูงกว่า ${ctx.competitorHigherPct}% — ยังมีช่องขึ้นราคาได้อีก ปิดส่วนลดออนไลน์`
      tailEn = `competitors ${ctx.competitorHigherPct}% higher — room to raise further, close online discounts`
    } else if (ctx?.isWeekend) {
      tailTh = 'ปิดส่วนลดออนไลน์และตั้ง weekend premium'
      tailEn = 'close online discounts and set a weekend premium'
    } else {
      tailTh = 'ปิดส่วนลดและปรับราคาขึ้นตามดีมานด์'
      tailEn = 'close discounts and raise rates with demand'
    }

    return {
      messageTh: `${nameTh} ดีมานด์สูง${occTh} — ${tailTh}`,
      messageEn: `${nameEn} in high demand${occEn} — ${tailEn}`,
    }
  }

  // ── ALL HOLD — rates sit in the comfortable band. Lever is volume,
  // not price; vary the nudge by competitor gap / weekend / trend. ──
  if (holds.length === rates.length) {
    if (ctx?.competitorHigherPct != null) {
      return {
        messageTh: `ราคาทุกห้องเหมาะสม แต่คู่แข่งสูงกว่า ${ctx.competitorHigherPct}% — ทดลองขยับราคาขึ้นเล็กน้อย`,
        messageEn: `All rates healthy, but competitors price ${ctx.competitorHigherPct}% higher — test a small increase`,
      }
    }
    if (ctx?.isWeekend) {
      return {
        messageTh: `ราคาทุกห้องเหมาะสม${occTh} — ดันยอดสุดสัปดาห์ผ่าน OTA และรีวิว`,
        messageEn: `All rates appropriate${occEn} — drive weekend volume via OTA and reviews`,
      }
    }
    const tail =
      ctx?.trend === 'improving'
        ? { th: 'โมเมนตัมดีขึ้น เก็บรีวิวเพิ่มเพื่อรักษาราคา', en: 'momentum improving — gather reviews to hold rates' }
        : ctx?.trend === 'worsening'
          ? { th: 'ยอดเริ่มอ่อน เพิ่มช่องทางขายก่อนต้องลดราคา', en: 'demand softening — add channels before cutting price' }
          : { th: 'เน้นเพิ่มช่องทางขายและรีวิวเพื่อขับยอด', en: 'focus on expanding channels and reviews' }
    return {
      messageTh: `ราคาทุกห้องเหมาะสม${occTh} — ${tail.th}`,
      messageEn: `All rates appropriate${occEn} — ${tail.en}`,
    }
  }

  // Safety net — the branches above are exhaustive over the (increase,
  // decrease, hold) count space, but TypeScript needs a terminal return
  // and a future direction value would land here. Generic by-type copy.
  return {
    messageTh: `บริหารราคาตามประเภทห้อง${occTh}`,
    messageEn: `Manage rates by room type${occEn}`,
  }
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
