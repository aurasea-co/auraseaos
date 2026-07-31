// Tier 1 "Calendar & Context" classifier — deterministic demand signals
// that need no PMS/pace data. Pure, no I/O: caller fetches demand_calendar
// rows (see queries.ts) and passes them in.
//
// Consumers:
//   - Historical baseline (computeWeekdayBaseline in engine.ts) excludes
//     dates this classifier flags, so a holiday Sunday doesn't pollute
//     "what a normal Sunday looks like".
//   - Forward modifier (recommendPerRoomTypeRates in engine.ts) reads
//     demandSignal for the night being priced (tomorrow) to bias the
//     recommendation away from cutting into a known high-demand date.

import type { DemandCalendarEvent } from './queries'

export interface BranchLocation {
  /** branches.province — free text, matches demand_calendar.province.
   *  Null/undefined = don't province-filter (only nationwide rows apply
   *  to this classification anyway, since every row seeded so far has
   *  province=null — see migration 039's design note (a)). */
  province?: string | null
}

export type CalendarDemandLevel = 'elevated' | 'normal' | 'soft'

export interface CalendarDemandSignal {
  level: CalendarDemandLevel
  /** Signed, clamped. Added to trailing occupancy for BAND DECISIONS
   *  only in recommendPerRoomTypeRates — never rewrites displayed
   *  historical occupancy. See CALENDAR_DEMAND_MODIFIER_CLAMP. */
  modifier: number
  /** Single most-significant driver, for the brief to cite later.
   *  Null when nothing fired (level 'normal', modifier 0). */
  reasonEn: string | null
  reasonTh: string | null
}

export interface CalendarContext {
  date: string
  isHoliday: boolean
  isWeekend: boolean
  isBridgeDay: boolean
  isLongWeekendMember: boolean
  isHolidayEve: boolean
  isReturnDay: boolean
  /** Always false until school-break rows exist in demand_calendar —
   *  see migration 039 discovery: no school_holiday rows are seeded
   *  yet. Structurally correct (checks type='school_holiday' like any
   *  other event type) so it activates on its own once seeded, rather
   *  than being hardcoded off. */
  isSchoolBreak: boolean
  isPayday: boolean
  demandSignal: CalendarDemandSignal
}

// Modest, named contributions — not aggressive multipliers. Tuned so
// the flagship case (a holiday-eve bridge day that's also part of a
// long weekend) lands at the clamp ceiling, while a lone flag stays
// well under it. Adjust here, not inline in the engine.
export const CALENDAR_DEMAND_MODIFIERS = {
  holiday: 0.08,
  holidayEve: 0.06,
  longWeekendMember: 0.05,
  bridgeDay: 0.04,
  schoolBreak: 0.03,
  payday: 0.02,
  /** Only negative contributor — day after a holiday/long-weekend
   *  break, when demand is typically softer than a plain Monday. */
  returnDay: -0.04,
} as const

export const CALENDAR_DEMAND_MODIFIER_CLAMP = { min: -0.05, max: 0.15 } as const

// Government mid-month payday heuristic + private-sector month-end
// window. Configurable, not asserted as precise — a future pass with
// real booking-pace data can replace this with a measured figure.
export const PAYDAY_CONFIG = {
  monthEndFromDay: 25,
  governmentMidMonthDay: 16,
} as const

function addDaysISO(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function dowOfISO(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

function daysInMonth(date: string): number {
  const d = new Date(`${date}T00:00:00Z`)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
}

function dayOfMonth(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDate()
}

/** Rows applicable to this branch's geography: nationwide (province
 *  null) rows always apply; a province-scoped row only applies when it
 *  matches. This is the geography match step that filterRowsForBranch
 *  (org/branch scoping) doesn't do — see migration 039 design note (a)
 *  and the demand-calendar discovery notes. */
function eventsForLocation(
  events: ReadonlyArray<DemandCalendarEvent>,
  branchLocation?: BranchLocation,
): DemandCalendarEvent[] {
  const province = branchLocation?.province ?? null
  return events.filter((e) => e.province == null || e.province === province)
}

function eventsOnDate(
  date: string,
  events: ReadonlyArray<DemandCalendarEvent>,
): DemandCalendarEvent[] {
  return events.filter((e) => e.startDate <= date && date <= e.endDate)
}

function isHolidayOn(date: string, events: ReadonlyArray<DemandCalendarEvent>): boolean {
  return eventsOnDate(date, events).some((e) => e.type === 'public_holiday')
}

function isSchoolBreakOn(date: string, events: ReadonlyArray<DemandCalendarEvent>): boolean {
  return eventsOnDate(date, events).some((e) => e.type === 'school_holiday')
}

function isWeekendDate(date: string): boolean {
  const dow = dowOfISO(date)
  return dow === 0 || dow === 6
}

function isDayOff(date: string, events: ReadonlyArray<DemandCalendarEvent>): boolean {
  return isWeekendDate(date) || isHolidayOn(date, events)
}

/** A single non-day-off weekday sandwiched between two days off (either
 *  side may be a weekend or a holiday). The classic "take one day, get
 *  four" pattern. */
function isBridgeDay(date: string, events: ReadonlyArray<DemandCalendarEvent>): boolean {
  if (isDayOff(date, events)) return false
  return isDayOff(addDaysISO(date, -1), events) && isDayOff(addDaysISO(date, 1), events)
}

function isEffectiveDayOff(date: string, events: ReadonlyArray<DemandCalendarEvent>): boolean {
  return isDayOff(date, events) || isBridgeDay(date, events)
}

// Real Thai holiday/weekend runs never approach this — safety bound so
// the backward/forward walk below can never loop unbounded.
const MAX_RUN_WALK_DAYS = 14

/** Length of the contiguous effective-day-off run containing `date`
 *  (0 when `date` itself isn't effectively off). Bridge days count as
 *  part of the run they create. */
function effectiveOffRunLength(date: string, events: ReadonlyArray<DemandCalendarEvent>): number {
  if (!isEffectiveDayOff(date, events)) return 0
  let length = 1
  for (let i = 1; i <= MAX_RUN_WALK_DAYS; i++) {
    if (!isEffectiveDayOff(addDaysISO(date, -i), events)) break
    length++
  }
  for (let i = 1; i <= MAX_RUN_WALK_DAYS; i++) {
    if (!isEffectiveDayOff(addDaysISO(date, i), events)) break
    length++
  }
  return length
}

/** Day immediately after an effective-off run ends, but only when that
 *  run actually contained a holiday — a plain Sunday→Monday transition
 *  isn't "returning from a break", so it must not fire every Monday. */
function isReturnDay(date: string, events: ReadonlyArray<DemandCalendarEvent>): boolean {
  if (isEffectiveDayOff(date, events)) return false
  const prevDate = addDaysISO(date, -1)
  if (!isEffectiveDayOff(prevDate, events)) return false
  let cursor = prevDate
  for (let i = 0; i < MAX_RUN_WALK_DAYS; i++) {
    if (isHolidayOn(cursor, events)) return true
    const before = addDaysISO(cursor, -1)
    if (!isEffectiveDayOff(before, events)) break
    cursor = before
  }
  return false
}

function isPaydayOn(date: string): boolean {
  const dom = dayOfMonth(date)
  if (dom === PAYDAY_CONFIG.governmentMidMonthDay) return true
  const monthEndStart = Math.min(PAYDAY_CONFIG.monthEndFromDay, daysInMonth(date))
  return dom >= monthEndStart
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** The modifier→level thresholds, extracted so any caller that only has
 *  a persisted modifier (e.g. persistence.ts's read-back path, which
 *  doesn't store `level` separately — see migration 040's design note)
 *  can re-derive the same level classifyCalendarContext would have
 *  produced, without duplicating the literal thresholds. */
export function deriveCalendarDemandLevel(modifier: number): CalendarDemandLevel {
  return modifier > 0.02 ? 'elevated' : modifier < -0.01 ? 'soft' : 'normal'
}

/** Pure — classifies one calendar date for one branch. `calendar` is
 *  whatever getDemandCalendarForBranch() returned for a window covering
 *  `date` (plus a few days either side so bridge/long-weekend/return-day
 *  lookups can see neighboring holidays). */
export function classifyCalendarContext(
  date: string,
  calendar: ReadonlyArray<DemandCalendarEvent>,
  branchLocation?: BranchLocation,
): CalendarContext {
  const events = eventsForLocation(calendar, branchLocation)

  const isHoliday = isHolidayOn(date, events)
  const isWeekend = isWeekendDate(date)
  const bridgeDay = isBridgeDay(date, events)
  const holidayEve = !isHoliday && isHolidayOn(addDaysISO(date, 1), events)
  const returnDay = isReturnDay(date, events)
  const runLength = effectiveOffRunLength(date, events)
  const longWeekendMember = runLength >= 3
  const schoolBreak = isSchoolBreakOn(date, events)
  const payday = isPaydayOn(date)

  // Priority order for the single narrative reason — mirrors the
  // EVENT_TYPE_PRIORITY convention in queries.ts (broadest/most
  // significant signal wins when several are true the same day).
  let modifier = 0
  let reasonEn: string | null = null
  let reasonTh: string | null = null
  const apply = (delta: number, en: string, th: string) => {
    modifier += delta
    if (reasonEn == null) {
      reasonEn = en
      reasonTh = th
    }
  }
  if (isHoliday) apply(CALENDAR_DEMAND_MODIFIERS.holiday, 'public holiday', 'วันหยุดนักขัตฤกษ์')
  if (holidayEve) apply(CALENDAR_DEMAND_MODIFIERS.holidayEve, 'eve of a public holiday', 'ก่อนวันหยุดนักขัตฤกษ์')
  if (longWeekendMember) apply(CALENDAR_DEMAND_MODIFIERS.longWeekendMember, 'long weekend', 'วันหยุดยาว')
  if (bridgeDay) apply(CALENDAR_DEMAND_MODIFIERS.bridgeDay, 'bridge day', 'วันหยุดเชื่อม')
  if (schoolBreak) apply(CALENDAR_DEMAND_MODIFIERS.schoolBreak, 'school break', 'ปิดเทอม')
  if (payday) apply(CALENDAR_DEMAND_MODIFIERS.payday, 'payday', 'วันเงินเดือนออก')
  if (returnDay) apply(CALENDAR_DEMAND_MODIFIERS.returnDay, 'day after a holiday break', 'วันหลังวันหยุดยาว')

  modifier = clamp(modifier, CALENDAR_DEMAND_MODIFIER_CLAMP.min, CALENDAR_DEMAND_MODIFIER_CLAMP.max)
  const level = deriveCalendarDemandLevel(modifier)

  return {
    date,
    isHoliday,
    isWeekend,
    isBridgeDay: bridgeDay,
    isLongWeekendMember: longWeekendMember,
    isHolidayEve: holidayEve,
    isReturnDay: returnDay,
    isSchoolBreak: schoolBreak,
    isPayday: payday,
    demandSignal: { level, modifier, reasonEn, reasonTh },
  }
}

/** True when `date`'s history should be EXCLUDED from a "what's normal
 *  for this weekday" baseline — a holiday, a bridge day, a day inside a
 *  long weekend, a school-break day, or any other demand_calendar event
 *  (festival/local/owner) overlapping it. Used by
 *  computeWeekdayBaseline's caller to build the exclusion set. */
export function shouldExcludeFromBaseline(ctx: CalendarContext, hasOtherCalendarEvent: boolean): boolean {
  return (
    ctx.isHoliday ||
    ctx.isBridgeDay ||
    ctx.isLongWeekendMember ||
    ctx.isSchoolBreak ||
    hasOtherCalendarEvent
  )
}

/** True when ANY demand_calendar row (any type — festival, local_event,
 *  owner_event, public_holiday, school_holiday) overlaps `date` for this
 *  branch's geography. Convenience for shouldExcludeFromBaseline's
 *  second argument. */
export function hasAnyCalendarEvent(
  date: string,
  calendar: ReadonlyArray<DemandCalendarEvent>,
  branchLocation?: BranchLocation,
): boolean {
  return eventsOnDate(date, eventsForLocation(calendar, branchLocation)).length > 0
}

/** Convenience for callers building computeWeekdayBaseline's exclusion
 *  set: classifies every date in `dates` and returns the ones that
 *  should be excluded from a weekday-normal baseline. `calendar` should
 *  cover the full window (plus a few days' margin either side for
 *  bridge/long-weekend lookups near the window edges). */
export function datesToExcludeFromBaseline(
  dates: ReadonlyArray<string>,
  calendar: ReadonlyArray<DemandCalendarEvent>,
  branchLocation?: BranchLocation,
): Set<string> {
  const excluded = new Set<string>()
  for (const date of dates) {
    const ctx = classifyCalendarContext(date, calendar, branchLocation)
    const otherEvent = hasAnyCalendarEvent(date, calendar, branchLocation)
    if (shouldExcludeFromBaseline(ctx, otherEvent)) excluded.add(date)
  }
  return excluded
}
