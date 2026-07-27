// RateDesk rate-optimisation engine. Pure functions only — no
// Supabase, no I/O, no clock reads except as injectable parameters
// so tests stay deterministic. Money is THB integers (matches the
// canonical CanonicalHotelDay shape; the spec's `_satang` suffixes
// don't apply to this codebase). All functions degrade gracefully:
// when the input has fewer days than a signal requires, they return
// [] instead of throwing — see requiresMinDays on each output.

// Type-only — no runtime dependency, so the engine stays pure/I-O-free.
import type { CalendarDemandSignal } from '@/lib/demand-calendar/classify'

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
     *  signals (and the "today's action" competitor gap) filter to
     *  OTA-only since that's the only channel comparable to our own
     *  blended achieved rate — see isOtaChannel(). A missing channel is
     *  excluded, not defaulted to OTA. */
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

function median(values: ReadonlyArray<number>): number {
  const s = values.slice().sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// Weekday display names, indexed by getUTCDay() (0 = Sunday) — the same
// DOW derivation deriveDayContext/forecastTomorrow already use on the
// raw Bangkok calendar date.
const WEEKDAY_TH = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสฯ', 'วันศุกร์', 'วันเสาร์'] as const
const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

function dowOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay()
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
  /** Present only when a demandContext was supplied AND it actually
   *  fired (modifier != 0) — the forward calendar signal that nudged
   *  this row's band decision. Explainability channel only: reasonTh/
   *  reasonEn above are NOT rewritten by this; a future pass can have
   *  the brief cite this field directly instead of re-deriving it. */
  calendarContext?: { level: CalendarDemandSignal['level']; modifier: number; reasonEn: string | null; reasonTh: string | null }
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
  /** Dates to exclude when computing each type's matched-weekday
   *  baseline (see computeWeekdayBaseline) — holidays/bridge days/long-
   *  weekend members/school-break days/other calendar events, so a
   *  holiday Sunday doesn't pollute "what a normal Sunday looks like". */
  excludeDatesFromBaseline?: ReadonlySet<string>
  /** Calendar & Context Tier 1 forward demand signal for the night this
   *  recommendation applies to (tomorrow — see per-branch-loader.ts).
   *  CONSERVATIVE and BOUNDED: only nudges which occupancy BAND a room
   *  type lands in (see effectiveOcc below), never the lift/drop
   *  magnitude, and classifyCalendarContext already clamps the modifier
   *  itself. Omit when no calendar context is available (e.g. tests) —
   *  behaviour is then identical to before this option existed. */
  demandContext?: CalendarDemandSignal
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

  // Matched-weekday anchor for the reason copy: the latest ACTUAL day.
  // (The target night is the future — it has no occupancy to compare.)
  // An earlier revision cited the target night's weekday norm next to
  // the 3-day figure, which read as comparable when the windows weren't
  // — every number a reason sentence compares now comes from the same
  // weekday. TEXT-ONLY: direction and every satang value come from the
  // 3-day math above, unchanged.
  const latestDay = days.length > 0 ? days[days.length - 1] : null
  const latestDow = latestDay ? dowOf(latestDay.date) : null
  const demandSignal = options.demandContext ?? null

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
      ...(demandSignal && demandSignal.modifier !== 0
        ? {
            calendarContext: {
              level: demandSignal.level,
              modifier: demandSignal.modifier,
              reasonEn: demandSignal.reasonEn,
              reasonTh: demandSignal.reasonTh,
            },
          }
        : {}),
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

    // Matched-weekday clause: the latest day's own single-day occupancy
    // for THIS type vs that same weekday's median — like-for-like, with
    // the delta stated. Null when the type lacks ≥3 true same-weekday
    // samples (sparse Suite history) or has no usable latest-day value;
    // those types keep the plain 3-day wording below, stay on the
    // sheet, and state no fabricated delta.
    let matched: { th: string; en: string } | null = null
    if (latestDay && latestDow != null) {
      const latestRow = (latestDay.roomTypeBreakdown ?? []).find((r) => r.roomType === roomType)
      const latestOcc = latestRow && latestRow.totalRooms > 0
        ? latestRow.occupiedRooms / latestRow.totalRooms
        : !latestRow && knownInventory
          ? 0
          : null
      if (latestOcc != null) {
        const wb = computeWeekdayBaseline(days, latestDay.date, roomType, options.excludeDatesFromBaseline)
        if (!wb.insufficient && wb.source === 'weekday' && wb.occupancyMedian != null) {
          const basePct = Math.round(wb.occupancyMedian * 100)
          const todayPct = Math.round(latestOcc * 100)
          const delta = todayPct - basePct
          const dayTh = WEEKDAY_TH[latestDow].replace(/^วัน/, '')
          const dayEn = WEEKDAY_EN[latestDow]
          const posTh = Math.abs(delta) < 5
            ? 'ใกล้เคียงปกติ'
            : delta > 0
              ? `สูงกว่าปกติ ${delta}pts`
              : `ต่ำกว่าปกติ ${Math.abs(delta)}pts`
          const posEn = Math.abs(delta) < 5
            ? 'near norm'
            : delta > 0
              ? `${delta}pts above norm`
              : `${Math.abs(delta)}pts below norm`
          matched = {
            th: `${dayTh}นี้ ${todayPct}% · ปกติ${dayTh} ${basePct}% (n=${wb.sampleCount}) → ${posTh}`,
            en: `${dayEn} ${todayPct}% vs ${dayEn} norm ${basePct}% (n=${wb.sampleCount}) → ${posEn}`,
          }
        }
      }
    }

    // Forward calendar modifier nudges which BAND this type lands in —
    // never the lift/drop magnitude below, which stays keyed off
    // currentRate. Bounded: classifyCalendarContext already clamps
    // demandSignal.modifier to [-0.05, 0.15] (see classify.ts), so this
    // can push a 'decrease' at most into 'hold' (0.35 - 0 + 0.15 = 0.50,
    // still short of the 0.85 'increase' floor) — it can never turn a
    // cut straight into a raise on its own. occPct above stays the true
    // trailing occupancy; only the band comparison below is adjusted.
    const demandModifier = demandSignal?.modifier ?? 0
    const effectiveOcc = Math.max(0, Math.min(1, avgOcc + demandModifier))
    if (demandModifier !== 0) {
      const naiveBand = avgOcc > 0.85 ? 'increase' : avgOcc < 0.35 ? 'decrease' : 'hold'
      const effectiveBand = effectiveOcc > 0.85 ? 'increase' : effectiveOcc < 0.35 ? 'decrease' : 'hold'
      if (naiveBand !== effectiveBand) {
        console.info(
          `[recommendPerRoomTypeRates] ${roomType}: calendar signal (${demandSignal?.reasonEn ?? 'unknown'}, modifier=${demandModifier}) shifted band ${naiveBand} -> ${effectiveBand} (occ=${occPct}%)`,
        )
      }
    }

    if (effectiveOcc > 0.85) {
      // High-demand band — same 10% lift the property-level engine
      // uses, applied to this type's own rack rate.
      const lift = Math.round(currentRate * 0.10)
      const suggested = currentRate + lift
      // Matched form drops the 3-day occPct from the sentence entirely:
      // a 3-day mean next to a one-weekday median reads as comparable
      // when it isn't. The 3-day math still decides direction/rate; the
      // sentence's qualitative verb carries that verdict.
      rows.push(buildRow(
        currentRate,
        suggested,
        'increase',
        matched
          ? `ดีมานด์สูง — แนะนำขึ้น · ${matched.th}`
          : `Occupancy ${occPct}% สูง — แนะนำขึ้น`,
        matched
          ? `High demand — suggest raise · ${matched.en}`
          : `${occPct}% occupancy — suggest raise`,
      ))
    } else if (effectiveOcc < 0.35) {
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
          ? `ไม่มีการจองห้องนี้ — พิจารณาลดราคา${matched ? ` · ${matched.th}` : ''}`
          : matched
            ? `ดีมานด์ต่ำ — พิจารณาลด · ${matched.th}`
            : `Occupancy ${occPct}% ต่ำ — พิจารณาลด`,
        nothingSold
          ? `No bookings — consider lowering${matched ? ` · ${matched.en}` : ''}`
          : matched
            ? `Soft demand — consider lower · ${matched.en}`
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
        matched
          ? `ราคาเหมาะสม · ${matched.th}`
          : `Occupancy ${occPct}% — ราคาเหมาะสม`,
        matched
          ? `Current rate is appropriate · ${matched.en}`
          : `${occPct}% occupancy — current rate is appropriate`,
      ))
    }
  }
  // Roster order (latest-day types first) — matches the order the owner
  // sees on the dashboard / settings rooms page. The brief builder is
  // free to sort by impact for the cap decision, but the natural order
  // is what we hand back so non-capped renders read consistently.
  return rows
}

// ── Weekday-pattern baseline ───────────────────────────────────────────────

/** "What does this weekday normally do" — median-based so a single
 *  spike day can't drag the norm. Pure; display/narrative input only
 *  (never feeds rate arithmetic). */
export interface WeekdayBaseline {
  /** True when even the all-day fallback has < 3 samples. Consumers
   *  must say nothing about a norm rather than fabricate one. */
  insufficient: boolean
  /** Samples behind the returned medians (same-weekday count for
   *  source 'weekday', all-day count for 'all_day'; when insufficient,
   *  the same-weekday count that fell short). */
  sampleCount: number
  /** 0..1 median occupancy. Present when !insufficient. */
  occupancyMedian?: number
  /** Median of the positive THB rates observed (rounded). Display-only
   *  — never written anywhere. Null when no positive rate samples. */
  rateThbMedian?: number | null
  /** 'weekday' = true same-weekday history (≥3 samples); 'all_day' =
   *  fallback median across every day in the window. */
  source?: 'weekday' | 'all_day'
}

/** Same-weekday baseline for `targetDate` from the trailing window in
 *  `days`. Property-level when `roomType` is omitted; per-room-type
 *  from each day's room_type_breakdown row otherwise (a day counts for
 *  a type only when its row carries inventory — mirrors the occupancy
 *  convention in recommendPerRoomTypeRates). `targetDate` itself is
 *  excluded so a day never explains its own norm.
 *
 *  Fallback ladder: <3 same-weekday samples → all-day median in the
 *  window; still <3 → { insufficient: true }. Thin types (e.g. a
 *  sparse Suite) therefore degrade to honest silence, never to a
 *  fabricated norm — and since this function is narrative-only, a thin
 *  type is never dropped from the rate sheet because of it. */
export function computeWeekdayBaseline(
  days: ReadonlyArray<RecommendationInput>,
  targetDate: string,
  roomType?: string,
  /** Dates to skip when accumulating the baseline — holidays, bridge
   *  days, long-weekend members, school-break days, or any other
   *  demand_calendar event (see classify.ts's datesToExcludeFromBaseline).
   *  Without this, a holiday Sunday counts toward "what a normal Sunday
   *  looks like", pulling the baseline up/down with the event instead of
   *  reflecting a genuinely ordinary day. */
  excludeDates?: ReadonlySet<string>,
): WeekdayBaseline {
  const targetDow = dowOf(targetDate)

  const occAll: number[] = []
  const rateAll: number[] = []
  const occDow: number[] = []
  const rateDow: number[] = []
  for (const d of days) {
    if (d.date === targetDate) continue
    if (excludeDates?.has(d.date)) continue
    let occ: number | null = null
    let rate: number | null = null
    if (roomType == null) {
      occ = d.occupancyRate
      rate = d.adrThb > 0 ? d.adrThb : null
    } else {
      const row = (d.roomTypeBreakdown ?? []).find((r) => r.roomType === roomType)
      if (row && row.totalRooms > 0) {
        occ = row.occupiedRooms / row.totalRooms
        rate = row.rateThb > 0 ? row.rateThb : null
      }
    }
    if (occ == null) continue
    occAll.push(occ)
    if (rate != null) rateAll.push(rate)
    if (dowOf(d.date) === targetDow) {
      occDow.push(occ)
      if (rate != null) rateDow.push(rate)
    }
  }

  if (occDow.length >= 3) {
    return {
      insufficient: false,
      sampleCount: occDow.length,
      occupancyMedian: median(occDow),
      rateThbMedian: rateDow.length > 0 ? Math.round(median(rateDow)) : null,
      source: 'weekday',
    }
  }
  if (occAll.length >= 3) {
    return {
      insufficient: false,
      sampleCount: occAll.length,
      occupancyMedian: median(occAll),
      rateThbMedian: rateAll.length > 0 ? Math.round(median(rateAll)) : null,
      source: 'all_day',
    }
  }
  return { insufficient: true, sampleCount: occDow.length }
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
  /** A demand_calendar event (public holiday, festival, local event —
   *  see migration 039) overlapping TOMORROW (the night the rec applies
   *  to), if any. Purely informational: appended to the action line as
   *  context, never changes the scenario/pace classification — no
   *  seeded event carries a verified demand-impact magnitude
   *  (expected_impact_modifier is deliberately left unset on every row;
   *  see the seed migration's design rationale), so nothing here should
   *  quietly bias the numbers. Caller resolves which event wins when
   *  more than one overlaps (see pickPrimaryEvent in
   *  lib/demand-calendar/queries.ts). */
  demandCalendarEvent?: { nameTh: string; nameEn: string } | null
  /** Dates to exclude from the weekdayOccupancyBaseline computation
   *  below — see computeWeekdayBaseline's excludeDates param and
   *  classify.ts's datesToExcludeFromBaseline. Same exclusion set
   *  recommendPerRoomTypeRates uses, so the property-level "normal for
   *  this weekday" figure and the per-room-type one agree. */
  excludeDatesFromBaseline?: ReadonlySet<string>
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
  /** Signed % gap vs competitors (+ = they're priced higher, - = lower);
   *  null when the gap is under 15% OR the most recent competitor-rate
   *  entry is older than COMPETITOR_FRESHNESS_DAYS relative to the
   *  latest metrics day. A shop entered once and never refreshed must
   *  not keep printing the same fixed % for weeks. */
  competitorGapPct: number | null
  // ── Weekday-pattern context (additive; 3-day-tail fields above are
  // unchanged). Populated only from TRUE same-weekday history (≥3
  // samples) — the all_day fallback is deliberately not surfaced here,
  // because naming a weekday norm that isn't weekday-derived would be
  // dishonest copy. All null/0 when history is thin. ──
  /** Median occupancy (0..100 pct) of the latest data day's own weekday. */
  weekdayOccupancyBaseline: number | null
  /** Signed pts: latest day's occupancy − its weekday median
   *  (e.g. +18 = running 18pts above the weekday norm). */
  todayVsWeekdayNorm: number | null
  /** Last week's same-weekday occupancy vs the weekday median
   *  (±5pts band = 'on'). Null when last week's row is missing. */
  wowDirection: 'ahead' | 'on' | 'behind' | null
  /** Same-weekday samples behind the baseline. */
  weekdaySampleCount: number
  weekdayNameTh: string | null
  weekdayNameEn: string | null
  /** Passthrough of context.demandCalendarEvent — see that field's
   *  comment. Null when no event overlaps tomorrow. */
  demandCalendarEventNameTh: string | null
  demandCalendarEventNameEn: string | null
}

// Competitor data older than this (relative to the latest metrics day)
// is not trusted for the "today's action" gap framing. Without this, a
// shop entered once and never refreshed keeps feeding the same fixed %
// into the action line indefinitely — competitorComparison() below only
// checks "≥3 entries somewhere in the fetch window", not how long ago
// the most recent one was. Scoped to the action line only:
// detectCompetitorUndercutting / detectOverpricing (the rate-sheet red-
// dot recs) are unaffected — out of scope for this pass.
const COMPETITOR_FRESHNESS_DAYS = 2

function daysBetween(laterDate: string, earlierDate: string): number {
  const later = new Date(`${laterDate}T00:00:00Z`).getTime()
  const earlier = new Date(`${earlierDate}T00:00:00Z`).getTime()
  return Math.round((later - earlier) / 86_400_000)
}

const KNOWN_NON_OTA_CHANNELS = new Set(['walk_in', 'package', 'promo'])

/** Only true OTA rows are comparable to our own rate (which is a
 *  blended, all-channel achieved rate — see accommodation entry form
 *  copy: "Not the rack/walk-in rate" — there's no "our OTA-only rate"
 *  to compare a walk-in/package/promo competitor row against). Both
 *  competitor-aware signals (this freshness check and
 *  competitorComparison below) filter through this SAME predicate so a
 *  walk-in/package/promo row is consistently excluded everywhere, never
 *  folded into the "guests see this online" comparison.
 *
 *  `competitor_rates.channel` is NOT NULL with a CHECK constraint
 *  (migration 033) — every real DB row carries an explicit value. A
 *  missing/unrecognized channel here means the row didn't actually come
 *  through that constraint (hand-built RecommendationInput, or a new
 *  channel value added upstream without updating this list) — exclude
 *  it and say so, rather than silently defaulting it into the OTA
 *  bucket the way pre-migration-033 legacy rows once needed to. */
function isOtaChannel(r: { channel?: string | null }): boolean {
  if (r.channel === 'ota') return true
  if (r.channel == null || !KNOWN_NON_OTA_CHANNELS.has(r.channel)) {
    console.warn(
      `[competitor-rates] excluding row with missing/unrecognized channel "${r.channel}" from the OTA comparison`,
    )
  }
  return false
}

function latestCompetitorDataDate(inputs: ReadonlyArray<RecommendationInput>): string | null {
  let latest: string | null = null
  for (const d of inputs) {
    if ((d.competitorRates ?? []).some(isOtaChannel) && (latest == null || d.date > latest)) {
      latest = d.date
    }
  }
  return latest
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
  const latestCompetitorDate = latestCompetitorDataDate(inputs)
  const competitorFresh =
    latestCompetitorDate != null &&
    daysBetween(latest.date, latestCompetitorDate) <= COMPETITOR_FRESHNESS_DAYS
  const competitorGapPct =
    cmp && competitorFresh && Math.abs(cmp.gapRatio) > 0.15 ? Math.round(cmp.gapRatio * 100) : null

  // Weekday-pattern context: what the latest data day's own weekday
  // normally does, where today sits against that norm, and whether last
  // week's same weekday was already ahead/behind it (pattern drift).
  const wb = computeWeekdayBaseline(inputs, latest.date, undefined, context.excludeDatesFromBaseline)
  let weekdayOccupancyBaseline: number | null = null
  let todayVsWeekdayNorm: number | null = null
  let wowDirection: 'ahead' | 'on' | 'behind' | null = null
  let weekdayNameTh: string | null = null
  let weekdayNameEn: string | null = null
  if (!wb.insufficient && wb.source === 'weekday' && wb.occupancyMedian != null) {
    weekdayOccupancyBaseline = Math.round(wb.occupancyMedian * 100)
    todayVsWeekdayNorm = Math.round((occNow - wb.occupancyMedian) * 100)
    const dow = dowOf(latest.date)
    weekdayNameTh = WEEKDAY_TH[dow]
    weekdayNameEn = WEEKDAY_EN[dow]
    const lastWeek = inputs.find((d) => d.date === addDays(latest.date, -7))
    if (lastWeek) {
      const wowDelta = lastWeek.occupancyRate - wb.occupancyMedian
      wowDirection = wowDelta <= -0.05 ? 'behind' : wowDelta >= 0.05 ? 'ahead' : 'on'
    }
  }

  return {
    occPct: Math.round(occNow * 100),
    belowTargetPct,
    trend,
    isWeekend,
    competitorGapPct,
    weekdayOccupancyBaseline,
    todayVsWeekdayNorm,
    wowDirection,
    weekdaySampleCount: wb.sampleCount,
    weekdayNameTh,
    weekdayNameEn,
    demandCalendarEventNameTh: context.demandCalendarEvent?.nameTh ?? null,
    demandCalendarEventNameEn: context.demandCalendarEvent?.nameEn ?? null,
  }
}

// Name up to two room types, sorted by impact (the biggest movers).
function topTwoNames(rates: ReadonlyArray<PerRoomTypeRate>): string[] {
  return rates
    .slice()
    .sort((a, b) => b.impactThb - a.impactThb)
    .slice(0, 2)
    .map((r) => r.roomType)
}

// ── Situational classifier ──────────────────────────────────────────────
//
// The scenario the "today's action" line renders. THE RATE RECOMMENDA-
// TIONS ARE THE SINGLE SOURCE OF TRUTH FOR DIRECTION: the scenario is
// derived strictly from the per-room-type increase/decrease/hold counts
// engine.ts already computed (recommendPerRoomTypeRates). Property-level
// pace (today vs. this weekday's historical norm) is NEVER a scenario
// input — it used to be (see git history), which let the action assert
// "raise / close discounts" on a day the table actually cut 3 room types
// and held 1 (real Crystal Resort case, 2026-07-25: property pacing
// +7pts ahead of its Saturday norm, yet Deluxe6/Deluxe2/Suite were all
// cut and Deluxe5 held). Pace still surfaces — in the occTh/occEn
// parenthetical below — but purely as CONTEXT, never as something that
// can override or contradict what the rate sheet says.
export type DailyActionScenario =
  | 'MIXED_SPLIT'
  | 'ALL_RAISE_COMPS_HIGH'
  | 'ALL_RAISE_NO_COMPS'
  | 'ALL_CUT_COMPS_LOW'
  | 'ALL_CUT_COMPS_HIGH'
  | 'ALL_CUT_NO_COMPS'
  | 'ALL_HOLD_COMPS_HIGH'
  | 'ALL_HOLD_NO_COMPS'

/** Everything a scenario's phrasing needs, pre-formatted once so
 *  renderAction() never has to know how a name-list or the occupancy
 *  fragment gets built. */
export interface DailyActionFacts {
  raiseNameTh: string
  raiseNameEn: string
  raiseMoreTh: string
  raiseMoreEn: string
  cutNameTh: string
  cutNameEn: string
  cutMoreTh: string
  cutMoreEn: string
  /** Held room types — named explicitly (not silently folded into a
   *  generic "+N other rooms" count) so a mixed day like "3 cut, 1 hold"
   *  states what happens to EVERY type, not just the ones being trimmed. */
  holdNameTh: string
  holdNameEn: string
  holdMoreTh: string
  holdMoreEn: string
  /** Pre-built occupancy-vs-norm parenthetical (or plain occ%). */
  occTh: string
  occEn: string
  /** Signed, freshness-gated gap — see DerivedDayContext.competitorGapPct. */
  competitorGapPct: number | null
  isWeekend: boolean
  trend: 'worsening' | 'improving' | 'steady'
  /** A demand_calendar event overlapping tomorrow, if any — see
   *  DailyActionContext.demandCalendarEvent. Purely informational;
   *  renderAction appends it as a note, it never affects scenario
   *  choice. */
  demandCalendarEventNameTh: string | null
  demandCalendarEventNameEn: string | null
}

/** Inputs classifyDailyAction needs — a thin, pure-function-friendly
 *  slice of DerivedDayContext + the per-room rate split. Deliberately
 *  has NO pace field — see the module comment above. */
export interface DailySituationSignals {
  increases: ReadonlyArray<PerRoomTypeRate>
  decreases: ReadonlyArray<PerRoomTypeRate>
  holds: ReadonlyArray<PerRoomTypeRate>
  competitorGapPct: number | null
  isWeekend: boolean
  trend: 'worsening' | 'improving' | 'steady'
  occTh: string
  occEn: string
  demandCalendarEventNameTh: string | null
  demandCalendarEventNameEn: string | null
}

/** Maps the day's real signals to a scenario. THE RATE TABLE DECIDES:
 *  scenario selection is a pure function of increases.length /
 *  decreases.length — nothing else can flip it. This makes the
 *  consistency invariant (assertScenarioAgreesWithRates below) true BY
 *  CONSTRUCTION, not just by convention:
 *    - both sides present  → MIXED_SPLIT (name both, never a blanket verb)
 *    - only raises         → ALL_RAISE_* (decreases is guaranteed empty)
 *    - only cuts           → ALL_CUT_*   (increases is guaranteed empty)
 *    - neither             → ALL_HOLD_*
 *  Competitor gap (when fresh) only picks which TAIL PHRASING plays
 *  within that already-decided direction — it can add color, it can
 *  never flip raise into cut or vice versa. */
export function classifyDailyAction(
  signals: DailySituationSignals,
): { scenario: DailyActionScenario; facts: DailyActionFacts } {
  const {
    increases, decreases, holds, competitorGapPct, isWeekend, trend, occTh, occEn,
    demandCalendarEventNameTh, demandCalendarEventNameEn,
  } = signals

  const raiseNames = topTwoNames(increases)
  const cutNames = topTwoNames(decreases)
  const holdNames = topTwoNames(holds)
  const raiseMore = increases.length - raiseNames.length
  const cutMore = decreases.length - cutNames.length
  const holdMore = holds.length - holdNames.length

  const facts: DailyActionFacts = {
    raiseNameTh: raiseNames.join(' และ '),
    raiseNameEn: raiseNames.join(' and '),
    raiseMoreTh: raiseMore > 0 ? ` (+${raiseMore} ห้องอื่น)` : '',
    raiseMoreEn: raiseMore > 0 ? ` (+${raiseMore} more)` : '',
    cutNameTh: cutNames.join(' และ '),
    cutNameEn: cutNames.join(' and '),
    cutMoreTh: cutMore > 0 ? ` (+${cutMore} ห้องอื่น)` : '',
    cutMoreEn: cutMore > 0 ? ` (+${cutMore} more)` : '',
    holdNameTh: holdNames.join(' และ '),
    holdNameEn: holdNames.join(' and '),
    holdMoreTh: holdMore > 0 ? ` (+${holdMore} ห้องอื่น)` : '',
    holdMoreEn: holdMore > 0 ? ` (+${holdMore} more)` : '',
    occTh,
    occEn,
    competitorGapPct,
    isWeekend,
    trend,
    demandCalendarEventNameTh,
    demandCalendarEventNameEn,
  }

  const hasRaise = increases.length > 0
  const hasCut = decreases.length > 0

  if (hasRaise && hasCut) {
    return { scenario: 'MIXED_SPLIT', facts }
  }
  if (hasRaise) {
    // decreases is guaranteed empty here — never a raise scenario with
    // any cut hiding inside it.
    return {
      scenario: competitorGapPct != null && competitorGapPct > 0 ? 'ALL_RAISE_COMPS_HIGH' : 'ALL_RAISE_NO_COMPS',
      facts,
    }
  }
  if (hasCut) {
    // increases is guaranteed empty here — never a cut scenario with
    // any raise hiding inside it.
    let scenario: DailyActionScenario
    if (competitorGapPct != null && competitorGapPct < 0) scenario = 'ALL_CUT_COMPS_LOW'
    else if (competitorGapPct != null && competitorGapPct > 0) scenario = 'ALL_CUT_COMPS_HIGH'
    else scenario = 'ALL_CUT_NO_COMPS'
    return { scenario, facts }
  }
  // Neither increases nor decreases — every type holds.
  return {
    scenario: competitorGapPct != null && competitorGapPct > 0 ? 'ALL_HOLD_COMPS_HIGH' : 'ALL_HOLD_NO_COMPS',
    facts,
  }
}

// Scenario families used by the consistency invariant below.
const RAISE_SCENARIOS = new Set<DailyActionScenario>(['ALL_RAISE_COMPS_HIGH', 'ALL_RAISE_NO_COMPS'])
const CUT_SCENARIOS = new Set<DailyActionScenario>(['ALL_CUT_COMPS_LOW', 'ALL_CUT_COMPS_HIGH', 'ALL_CUT_NO_COMPS'])
const HOLD_SCENARIOS = new Set<DailyActionScenario>(['ALL_HOLD_COMPS_HIGH', 'ALL_HOLD_NO_COMPS'])

/** Consistency invariant: the scenario's IMPLIED direction must never
 *  contradict the rate recommendations it narrates. classifyDailyAction
 *  is built so this holds by construction, but this is exposed as a
 *  standalone, throwing check — a deliberate hard guarantee, not just an
 *  emergent property of how the classifier happens to be written today.
 *  summarizePerRoomRates calls this and catches the throw (logs + omits
 *  the line) rather than let a contradictory brief go out; a caller that
 *  wants the failure to be loud (e.g. a test) can call this directly. */
export function assertScenarioAgreesWithRates(
  scenario: DailyActionScenario,
  counts: { increases: number; decreases: number },
): void {
  const { increases, decreases } = counts
  if (RAISE_SCENARIOS.has(scenario) && decreases > 0) {
    throw new Error(
      `Today's action contradiction: scenario ${scenario} implies a rate RAISE, but the rate table shows ${decreases} decrease(s). Refusing to emit a contradictory brief.`,
    )
  }
  if (CUT_SCENARIOS.has(scenario) && increases > 0) {
    throw new Error(
      `Today's action contradiction: scenario ${scenario} implies a rate CUT, but the rate table shows ${increases} increase(s). Refusing to emit a contradictory brief.`,
    )
  }
  if (HOLD_SCENARIOS.has(scenario) && (increases > 0 || decreases > 0)) {
    throw new Error(
      `Today's action contradiction: scenario ${scenario} implies every rate holds, but the rate table shows ${increases} increase(s) and ${decreases} decrease(s). Refusing to emit a contradictory brief.`,
    )
  }
  if (scenario === 'MIXED_SPLIT' && (increases === 0 || decreases === 0)) {
    throw new Error(
      `Today's action contradiction: scenario MIXED_SPLIT implies both a raise and a cut, but the rate table shows ${increases} increase(s) and ${decreases} decrease(s).`,
    )
  }
}

// Deterministic, reproducible variant picker — a stand-in for
// Math.random() so the same day always renders the same phrasing (and
// tests can assert on it) while two different days can land on
// different, equally-valid wording for the same scenario.
function seedIndex(seed: string, count: number): number {
  if (count <= 1) return 0
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (Math.imul(hash, 31) + seed.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % count
}

/** Renders a scenario + facts into bilingual copy. 2-3 phrasings per
 *  scenario, picked deterministically from `dateSeed` (the latest
 *  metrics day, e.g. "2026-07-24") so the same day is reproducible but
 *  consecutive days in the same scenario don't read byte-identical. */
// Renders the scenario-specific text. Kept private — the exported
// renderAction below wraps this with the demand_calendar note so every
// scenario branch here stays untouched by that concern.
function renderBaseAction(
  scenario: DailyActionScenario,
  facts: DailyActionFacts,
  dateSeed: string,
): DailyAction {
  const pick = (variants: DailyAction[]): DailyAction => variants[seedIndex(dateSeed, variants.length)]
  const {
    raiseNameTh, raiseNameEn, raiseMoreTh, raiseMoreEn,
    cutNameTh, cutNameEn, cutMoreTh, cutMoreEn,
    holdNameTh, holdNameEn, holdMoreTh, holdMoreEn,
    occTh, occEn, competitorGapPct, isWeekend, trend,
  } = facts
  const gap = competitorGapPct ?? 0
  const gapAbs = Math.abs(gap)
  // Appended whenever some (but not all) room types hold, so a mixed
  // day like "3 cut, 1 hold" states what happens to EVERY type instead
  // of silently dropping the held one from the narrative.
  const holdClauseTh = holdNameTh ? `; ${holdNameTh}คงราคา${holdMoreTh}` : ''
  const holdClauseEn = holdNameEn ? `; ${holdNameEn} holding steady${holdMoreEn}` : ''

  switch (scenario) {
    // Both a raise and a cut are genuinely happening — name both sides,
    // never collapse to one blanket verb. increases/decreases are both
    // guaranteed non-empty here (see classifyDailyAction).
    case 'MIXED_SPLIT':
      return {
        messageTh: `ขึ้น ${raiseNameTh}${raiseMoreTh}, ลด ${cutNameTh}${cutMoreTh}${occTh} — บริหารราคาตามประเภทห้อง${holdClauseTh}`,
        messageEn: `Raise ${raiseNameEn}${raiseMoreEn}, cut ${cutNameEn}${cutMoreEn}${occEn} — manage rates by room type${holdClauseEn}`,
      }

    // decreases is guaranteed empty in both ALL_RAISE_* cases.
    case 'ALL_RAISE_COMPS_HIGH':
      return pick([
        {
          messageTh: `${raiseNameTh} ดีมานด์สูง${raiseMoreTh}${occTh} — คู่แข่งสูงกว่า ${gap}% ยังมีช่องขึ้นราคาได้อีก ปิดส่วนลดออนไลน์${holdClauseTh}`,
          messageEn: `${raiseNameEn} in high demand${raiseMoreEn}${occEn} — competitors ${gap}% higher, room to raise further, close online discounts${holdClauseEn}`,
        },
        {
          messageTh: `${raiseNameTh} คนจองเยอะ${raiseMoreTh}${occTh} — คู่แข่งราคาสูงกว่า ${gap}% ปิดดีลออนไลน์แล้วขึ้นราคา${holdClauseTh}`,
          messageEn: `${raiseNameEn} seeing strong demand${raiseMoreEn}${occEn} — competitors ${gap}% higher, close online deals and raise${holdClauseEn}`,
        },
      ])

    case 'ALL_RAISE_NO_COMPS':
      return pick(
        isWeekend
          ? [
              {
                messageTh: `${raiseNameTh} ดีมานด์สูง${raiseMoreTh}${occTh} — ปิดส่วนลดออนไลน์และตั้ง weekend premium${holdClauseTh}`,
                messageEn: `${raiseNameEn} in high demand${raiseMoreEn}${occEn} — close online discounts and set a weekend premium${holdClauseEn}`,
              },
              {
                messageTh: `${raiseNameTh} จองดีต่อเนื่อง${raiseMoreTh}${occTh} — ตั้งราคาพิเศษวันหยุดและงดส่วนลด${holdClauseTh}`,
                messageEn: `${raiseNameEn} booking strongly${raiseMoreEn}${occEn} — set a weekend premium and pause discounts${holdClauseEn}`,
              },
            ]
          : [
              {
                messageTh: `${raiseNameTh} ดีมานด์สูง${raiseMoreTh}${occTh} — ปิดส่วนลดและปรับราคาขึ้นตามดีมานด์${holdClauseTh}`,
                messageEn: `${raiseNameEn} in high demand${raiseMoreEn}${occEn} — close discounts and raise rates with demand${holdClauseEn}`,
              },
              {
                messageTh: `${raiseNameTh} จองดีต่อเนื่อง${raiseMoreTh}${occTh} — งดส่วนลดออนไลน์ ขยับราคาขึ้นตามยอดจอง${holdClauseTh}`,
                messageEn: `${raiseNameEn} booking strongly${raiseMoreEn}${occEn} — pause online discounts and raise with bookings${holdClauseEn}`,
              },
            ],
      )

    // increases is guaranteed empty in every ALL_CUT_* case.
    case 'ALL_CUT_COMPS_LOW':
      // We're cutting AND competitors are cheaper than us — the cut is
      // reinforced, not just a visibility problem. Push harder + urgency.
      return pick([
        {
          messageTh: `${cutNameTh} ยังว่าง${cutMoreTh}${occTh} — คู่แข่งราคาต่ำกว่า ${gapAbs}% พิจารณาลดราคาห้องที่ค้างและเปิดดีล last-minute${holdClauseTh}`,
          messageEn: `${cutNameEn} still soft${cutMoreEn}${occEn} — competitors ${gapAbs}% cheaper, consider a targeted cut on the lagging types and a last-minute deal${holdClauseEn}`,
        },
        {
          messageTh: `${cutNameTh} ยังไม่ขยับ${cutMoreTh}${occTh} — คู่แข่งถูกกว่า ${gapAbs}% ลดราคาเฉพาะจุดและเปิดดีลด่วน${holdClauseTh}`,
          messageEn: `${cutNameEn} still not moving${cutMoreEn}${occEn} — competitors ${gapAbs}% lower, cut price on the lagging types and push a last-minute deal${holdClauseEn}`,
        },
      ])

    case 'ALL_CUT_COMPS_HIGH':
      // We're cutting even though competitors are pricier than us — a
      // visibility/promo problem, not a price-too-high one.
      return pick([
        {
          messageTh: `${cutNameTh} ว่างมาก${cutMoreTh}${occTh} — คู่แข่งราคาสูงกว่า ${gap}% ดึงยอดด้วยดีลและโปรบน OTA แทนการลดลึก${holdClauseTh}`,
          messageEn: `${cutNameEn} sitting soft${cutMoreEn}${occEn} — competitors price ${gap}% higher, win bookings with an OTA deal, not a deep cut${holdClauseEn}`,
        },
        {
          messageTh: `${cutNameTh} ยังว่าง${cutMoreTh}${occTh} — คู่แข่งสูงกว่า ${gap}% เน้นโปรบน OTA ไม่ต้องลดราคาลึก${holdClauseTh}`,
          messageEn: `${cutNameEn} still open${cutMoreEn}${occEn} — competitors ${gap}% higher, lean on OTA visibility rather than a deep cut${holdClauseEn}`,
        },
      ])

    case 'ALL_CUT_NO_COMPS': {
      const variants: DailyAction[] = isWeekend
        ? trend === 'worsening'
          ? [
              {
                messageTh: `${cutNameTh} สุดสัปดาห์ยังว่าง${cutMoreTh}${occTh} — เปิดดีล last-minute บน OTA และดันโพสต์โซเชียลคืนนี้${holdClauseTh}`,
                messageEn: `${cutNameEn} still open this weekend${cutMoreEn}${occEn} — push a last-minute OTA deal and boost social tonight${holdClauseEn}`,
              },
              {
                messageTh: `${cutNameTh} ยังว่างช่วงวันหยุด${cutMoreTh}${occTh} — รีบเปิดดีล last-minute และโปรโมทโซเชียลคืนนี้${holdClauseTh}`,
                messageEn: `${cutNameEn} open heading into the weekend${cutMoreEn}${occEn} — get a last-minute OTA deal live and push social tonight${holdClauseEn}`,
              },
            ]
          : [
              {
                messageTh: `${cutNameTh} ว่างมาก${cutMoreTh}${occTh} — จัดโปรสุดสัปดาห์และเพิ่มการมองเห็นบน OTA${holdClauseTh}`,
                messageEn: `${cutNameEn} sitting soft${cutMoreEn}${occEn} — run a weekend promo and lift OTA visibility${holdClauseEn}`,
              },
              {
                messageTh: `${cutNameTh} ยังว่าง${cutMoreTh}${occTh} — เปิดโปรวันหยุดและดันการมองเห็นบน OTA${holdClauseTh}`,
                messageEn: `${cutNameEn} still soft${cutMoreEn}${occEn} — launch a weekend offer and boost OTA visibility${holdClauseEn}`,
              },
            ]
        : trend === 'worsening'
          ? [
              {
                messageTh: `${cutNameTh} ยอดอ่อนลง${cutMoreTh}${occTh} — เปิดดีลกลางสัปดาห์/ลูกค้าองค์กรและกระตุ้น OTA วันนี้${holdClauseTh}`,
                messageEn: `${cutNameEn} sitting soft, demand slipping${cutMoreEn}${occEn} — open a midweek/corporate deal and nudge OTA today${holdClauseEn}`,
              },
              {
                messageTh: `${cutNameTh} ว่างมากและยอดกำลังลด${cutMoreTh}${occTh} — เปิดดีลลูกค้าองค์กรและดัน OTA วันนี้${holdClauseTh}`,
                messageEn: `${cutNameEn} soft and slipping${cutMoreEn}${occEn} — open a corporate/midweek deal and push OTA today${holdClauseEn}`,
              },
            ]
          : [
              {
                messageTh: `${cutNameTh} ว่างมาก${cutMoreTh}${occTh} — เพิ่มช่องทาง OTA และโปรพักกลางสัปดาห์${holdClauseTh}`,
                messageEn: `${cutNameEn} sitting soft${cutMoreEn}${occEn} — add an OTA channel and a midweek stay offer${holdClauseEn}`,
              },
              {
                messageTh: `${cutNameTh} ยังว่าง${cutMoreTh}${occTh} — เปิดโปรกลางสัปดาห์และเพิ่มช่องทาง OTA${holdClauseTh}`,
                messageEn: `${cutNameEn} still soft${cutMoreEn}${occEn} — launch a midweek offer and add an OTA channel${holdClauseEn}`,
              },
            ]
      return pick(variants)
    }

    // Neither increases nor decreases — every type holds (both are
    // guaranteed empty here).
    case 'ALL_HOLD_COMPS_HIGH':
      return pick([
        {
          messageTh: `ราคาทุกห้องเหมาะสม แต่คู่แข่งสูงกว่า ${gap}% — ทดลองขยับราคาขึ้นเล็กน้อย`,
          messageEn: `All rates healthy, but competitors price ${gap}% higher — test a small increase`,
        },
        {
          messageTh: `ราคาทุกห้องพอดีอยู่แล้ว คู่แข่งสูงกว่า ${gap}% — ลองขึ้นราคาเล็กน้อยดูยอด`,
          messageEn: `Rates are healthy; competitors are ${gap}% higher — try a small increase and watch demand`,
        },
      ])

    case 'ALL_HOLD_NO_COMPS': {
      if (isWeekend) {
        return pick([
          {
            messageTh: `ราคาทุกห้องเหมาะสม${occTh} — ดันยอดสุดสัปดาห์ผ่าน OTA และรีวิว`,
            messageEn: `All rates appropriate${occEn} — drive weekend volume via OTA and reviews`,
          },
          {
            messageTh: `ราคาทุกห้องพอดี${occTh} — เพิ่มยอดวันหยุดผ่าน OTA และเก็บรีวิว`,
            messageEn: `All rates are in good shape${occEn} — grow weekend volume via OTA and reviews`,
          },
        ])
      }
      const trendVariants: Record<'improving' | 'worsening' | 'steady', DailyAction[]> = {
        improving: [
          {
            messageTh: `ราคาทุกห้องเหมาะสม${occTh} — โมเมนตัมดีขึ้น เก็บรีวิวเพิ่มเพื่อรักษาราคา`,
            messageEn: `All rates appropriate${occEn} — momentum improving, gather reviews to hold rates`,
          },
          {
            messageTh: `ราคาทุกห้องพอดี${occTh} — ยอดดีขึ้นต่อเนื่อง เก็บรีวิวไว้หนุนราคา`,
            messageEn: `All rates are in good shape${occEn} — demand is picking up, keep gathering reviews to support the rate`,
          },
        ],
        worsening: [
          {
            messageTh: `ราคาทุกห้องเหมาะสม${occTh} — ยอดเริ่มอ่อน เพิ่มช่องทางขายก่อนต้องลดราคา`,
            messageEn: `All rates appropriate${occEn} — demand softening, add channels before cutting price`,
          },
          {
            messageTh: `ราคาทุกห้องพอดี${occTh} — ยอดเริ่มชะลอ เพิ่มช่องทางขายไว้ก่อนตัดสินใจลดราคา`,
            messageEn: `All rates are in good shape${occEn} — demand is slowing, add sales channels before considering a cut`,
          },
        ],
        steady: [
          {
            messageTh: `ราคาทุกห้องเหมาะสม${occTh} — เน้นเพิ่มช่องทางขายและรีวิวเพื่อขับยอด`,
            messageEn: `All rates appropriate${occEn} — focus on expanding channels and reviews`,
          },
          {
            messageTh: `ราคาทุกห้องพอดี${occTh} — คงราคาไว้ เน้นช่องทางขายและรีวิวเพื่อดันยอด`,
            messageEn: `All rates are in good shape${occEn} — hold rates, focus on channels and reviews to drive volume`,
          },
        ],
      }
      return pick(trendVariants[trend])
    }

    default:
      return { messageTh: `บริหารราคาตามประเภทห้อง${occTh}`, messageEn: `Manage rates by room type${occEn}` }
  }
}

/** Renders a scenario + facts into bilingual copy (see renderBaseAction),
 *  then appends a demand_calendar note when an event overlaps tomorrow.
 *  The note is purely additive context — same wording appended after
 *  EVERY scenario's text, regardless of what the scenario already says,
 *  since we have no verified impact magnitude to fold into the
 *  classification itself (see DailyActionContext.demandCalendarEvent). */
export function renderAction(
  scenario: DailyActionScenario,
  facts: DailyActionFacts,
  dateSeed: string,
): DailyAction {
  const base = renderBaseAction(scenario, facts, dateSeed)
  const { demandCalendarEventNameTh, demandCalendarEventNameEn } = facts
  if (!demandCalendarEventNameTh || !demandCalendarEventNameEn) return base
  return {
    messageTh: `${base.messageTh} (พรุ่งนี้: ${demandCalendarEventNameTh})`,
    messageEn: `${base.messageEn} (tomorrow: ${demandCalendarEventNameEn})`,
  }
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
  // day even when the dominant signal is unchanged. When a same-weekday
  // baseline exists (≥3 samples), the fragment anchors today against
  // what this weekday NORMALLY does — "วันเสาร์ปกติ 88% วันนี้ 62%" —
  // which is the honest comparison for pattern-driven properties; with
  // thin history it falls back to the plain occ% wording unchanged.
  const targetTh = ctx?.belowTargetPct != null ? `, ต่ำกว่าเป้า ${ctx.belowTargetPct}%` : ''
  const targetEn = ctx?.belowTargetPct != null ? `, ${ctx.belowTargetPct}pts below target` : ''
  let occTh = ''
  let occEn = ''
  if (ctx) {
    if (ctx.weekdayOccupancyBaseline != null && ctx.todayVsWeekdayNorm != null) {
      const diff = ctx.todayVsWeekdayNorm
      const posTh =
        Math.abs(diff) < 5
          ? 'ใกล้เคียงปกติ'
          : diff > 0
            ? `สูงกว่าปกติ ${diff}pts`
            : `ต่ำกว่าปกติ ${Math.abs(diff)}pts`
      const posEn =
        Math.abs(diff) < 5
          ? 'near norm'
          : diff > 0
            ? `${diff}pts above norm`
            : `${Math.abs(diff)}pts below norm`
      occTh = ` (${ctx.weekdayNameTh}ปกติ ${ctx.weekdayOccupancyBaseline}% วันนี้ ${ctx.occPct}% ${posTh}${targetTh})`
      occEn = ` (${ctx.weekdayNameEn} norm ${ctx.weekdayOccupancyBaseline}%, today ${ctx.occPct}% — ${posEn}${targetEn})`
    } else {
      occTh = ` (occ ${ctx.occPct}%${targetTh})`
      occEn = ` (occ ${ctx.occPct}%${targetEn})`
    }
  }

  const { scenario, facts } = classifyDailyAction({
    increases,
    decreases,
    holds,
    competitorGapPct: ctx?.competitorGapPct ?? null,
    isWeekend: ctx?.isWeekend ?? false,
    trend: ctx?.trend ?? 'steady',
    occTh,
    occEn,
    demandCalendarEventNameTh: ctx?.demandCalendarEventNameTh ?? null,
    demandCalendarEventNameEn: ctx?.demandCalendarEventNameEn ?? null,
  })

  // Hard guarantee: the action can never contradict the rate table.
  // classifyDailyAction is built so this holds by construction, but this
  // is the enforced safety net — a caught throw means "log it and omit
  // the line" rather than let one branch's edge case crash the whole
  // cron batch or send a contradictory brief.
  try {
    assertScenarioAgreesWithRates(scenario, { increases: increases.length, decreases: decreases.length })
  } catch (err) {
    console.error('[summarizePerRoomRates] refusing to emit a contradictory action line:', err)
    return null
  }

  // Seed on the latest metrics day so the same day always renders the
  // same phrasing (reproducible/testable) while different days can pick
  // a different, equally-valid wording within the same scenario.
  const dateSeed = context.inputs && context.inputs.length > 0
    ? context.inputs[context.inputs.length - 1].date
    : 'no-context'

  return renderAction(scenario, facts, dateSeed)
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
  // Filter to true OTA rows only (see isOtaChannel) per day BEFORE the
  // 3-day quorum check. A day where the owner only logged walk-in
  // rates shouldn't satisfy the threshold for the OTA-aware signal.
  const daysWithCompetitor = days
    .map((d) => ({
      ...d,
      competitorRates: (d.competitorRates ?? []).filter(isOtaChannel),
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
  /** competitor_rates.channel — NOT NULL with a CHECK constraint at the
   *  DB layer (migration 033), so any real row the caller selects this
   *  column for will carry one of 'ota' | 'walk_in' | 'package' | 'promo'.
   *  Optional here only so callers that forget to select it fail closed:
   *  isOtaChannel() excludes (and warns on) a missing value rather than
   *  defaulting it into the OTA comparison. */
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
