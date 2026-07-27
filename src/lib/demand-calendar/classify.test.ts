import { describe, it, expect } from 'vitest'
import {
  classifyCalendarContext,
  datesToExcludeFromBaseline,
  shouldExcludeFromBaseline,
  hasAnyCalendarEvent,
} from './classify'
import { THAILAND_PUBLIC_HOLIDAYS_2026, toDemandCalendarSeedRows } from './thailand-public-holidays-2026'
import { THAILAND_SCHOOL_BREAKS_2026, toDemandCalendarSeedRows as toSchoolBreakSeedRows } from './thailand-school-breaks-2026'
import type { DemandCalendarEvent } from './queries'

// Real seeded 2026 Thai public holidays, projected into the
// DemandCalendarEvent shape classifyCalendarContext consumes — same
// data actually seeded into the live database (commit 685c65d).
const HOLIDAYS_2026: DemandCalendarEvent[] = toDemandCalendarSeedRows(THAILAND_PUBLIC_HOLIDAYS_2026).map(
  (row, i) => ({
    id: `holiday-${i}`,
    startDate: row.start_date,
    endDate: row.end_date,
    type: row.type,
    nameTh: row.name_th,
    nameEn: row.name_en,
    province: row.province,
    expectedImpactModifier: null,
    source: row.source,
    confidence: row.confidence,
    organizationId: row.organization_id,
    branchId: row.branch_id,
  }),
)

describe('classifyCalendarContext — 2026-07-27 (Monday, eve of 2026-07-28 King\'s Birthday)', () => {
  const ctx = classifyCalendarContext('2026-07-27', HOLIDAYS_2026)

  it('is a bridge day (Sun 07-26 weekend -> Mon 07-27 -> Tue 07-28 holiday)', () => {
    expect(ctx.isBridgeDay).toBe(true)
  })

  it('is the eve of the 07-28 public holiday', () => {
    expect(ctx.isHolidayEve).toBe(true)
  })

  it('is a long-weekend member (Sat 25 .. Wed 29 = 5-day effective run)', () => {
    expect(ctx.isLongWeekendMember).toBe(true)
  })

  it('is not itself a holiday', () => {
    expect(ctx.isHoliday).toBe(false)
  })

  it('produces an elevated demand signal with an explainable reason', () => {
    expect(ctx.demandSignal.level).toBe('elevated')
    expect(ctx.demandSignal.modifier).toBeGreaterThan(0)
    expect(ctx.demandSignal.reasonEn).not.toBeNull()
    expect(ctx.demandSignal.reasonTh).not.toBeNull()
  })

  it('clamps the combined modifier at the configured ceiling', () => {
    // holidayEve (0.06) + longWeekendMember (0.05) + bridgeDay (0.04) = 0.15
    expect(ctx.demandSignal.modifier).toBeCloseTo(0.15, 5)
  })
})

describe('classifyCalendarContext — 2026-07-28 (Tuesday, the holiday itself)', () => {
  const ctx = classifyCalendarContext('2026-07-28', HOLIDAYS_2026)

  it('is a public holiday and a long-weekend member', () => {
    expect(ctx.isHoliday).toBe(true)
    expect(ctx.isLongWeekendMember).toBe(true)
  })

  it('is not a bridge day (it IS the holiday, not a connector)', () => {
    expect(ctx.isBridgeDay).toBe(false)
  })
})

describe('classifyCalendarContext — 2026-07-30 (Thursday, day after the long weekend)', () => {
  const ctx = classifyCalendarContext('2026-07-30', HOLIDAYS_2026)

  it('is a return day (the 07-26..07-29 run included a real holiday)', () => {
    expect(ctx.isReturnDay).toBe(true)
  })

  it('produces a soft demand signal', () => {
    expect(ctx.demandSignal.level).toBe('soft')
    expect(ctx.demandSignal.modifier).toBeLessThan(0)
  })
})

describe('classifyCalendarContext — school break (structural, works with any seeded rows)', () => {
  it('activates for an arbitrary hand-built school_holiday row', () => {
    const withSchoolBreak: DemandCalendarEvent[] = [
      ...HOLIDAYS_2026,
      {
        id: 'school-1',
        startDate: '2026-10-01',
        endDate: '2026-10-15',
        type: 'school_holiday',
        nameTh: 'ปิดเทอม',
        nameEn: 'School break',
        province: null,
        expectedImpactModifier: null,
        source: 'curated',
        confidence: 1,
        organizationId: null,
        branchId: null,
      },
    ]
    const ctx = classifyCalendarContext('2026-10-05', withSchoolBreak)
    expect(ctx.isSchoolBreak).toBe(true)
    expect(ctx.demandSignal.modifier).toBeGreaterThan(0)
  })
})

// Real seeded 2026 Thai public-school breaks (Ministry of Education /
// OBEC academic-year calendar — see thailand-school-breaks-2026.ts for
// sourcing) — same data actually seeded into the live database
// (scripts/seed-thailand-school-breaks.mjs). Combined with the real
// public holidays so overlapping/adjacent dates classify correctly.
const SCHOOL_BREAKS_2026: DemandCalendarEvent[] = toSchoolBreakSeedRows(THAILAND_SCHOOL_BREAKS_2026).map(
  (row, i) => ({
    id: `school-break-${i}`,
    startDate: row.start_date,
    endDate: row.end_date,
    type: row.type,
    nameTh: row.name_th,
    nameEn: row.name_en,
    province: row.province,
    expectedImpactModifier: null,
    source: row.source,
    confidence: row.confidence,
    organizationId: row.organization_id,
    branchId: row.branch_id,
  }),
)
const CALENDAR_2026 = [...HOLIDAYS_2026, ...SCHOOL_BREAKS_2026]

describe('classifyCalendarContext — real seeded 2026 school breaks (Thai public/OBEC calendar)', () => {
  it('flags isSchoolBreak inside the summer break (2026-04-01..05-15)', () => {
    const ctx = classifyCalendarContext('2026-04-20', CALENDAR_2026)
    expect(ctx.isSchoolBreak).toBe(true)
    expect(ctx.demandSignal.level).toBe('elevated')
  })

  it('flags isSchoolBreak inside the mid-year break (2026-10-01..10-31)', () => {
    const ctx = classifyCalendarContext('2026-10-15', CALENDAR_2026)
    expect(ctx.isSchoolBreak).toBe(true)
  })

  it('does not flag isSchoolBreak on an ordinary in-session weekday', () => {
    const ctx = classifyCalendarContext('2026-08-05', CALENDAR_2026)
    expect(ctx.isSchoolBreak).toBe(false)
  })
})

describe('classifyCalendarContext — payday (2026-07-16, government mid-month)', () => {
  const ctx = classifyCalendarContext('2026-07-16', HOLIDAYS_2026)

  it('flags payday with no other signals active', () => {
    expect(ctx.isPayday).toBe(true)
    expect(ctx.isHoliday).toBe(false)
    expect(ctx.isBridgeDay).toBe(false)
    expect(ctx.isLongWeekendMember).toBe(false)
  })
})

describe('classifyCalendarContext — plain weekday (2026-07-24, Friday, no signals)', () => {
  const ctx = classifyCalendarContext('2026-07-24', HOLIDAYS_2026)

  it('flags nothing and produces a normal, zero-modifier signal', () => {
    expect(ctx.isHoliday).toBe(false)
    expect(ctx.isWeekend).toBe(false)
    expect(ctx.isBridgeDay).toBe(false)
    expect(ctx.isLongWeekendMember).toBe(false)
    expect(ctx.isHolidayEve).toBe(false)
    expect(ctx.isReturnDay).toBe(false)
    expect(ctx.isSchoolBreak).toBe(false)
    expect(ctx.isPayday).toBe(false)
    expect(ctx.demandSignal).toEqual({ level: 'normal', modifier: 0, reasonEn: null, reasonTh: null })
  })
})

describe('classifyCalendarContext — province geography match', () => {
  const provincialFestival: DemandCalendarEvent = {
    id: 'fest-1',
    startDate: '2026-11-10',
    endDate: '2026-11-10',
    type: 'festival',
    nameTh: 'เทศกาลท้องถิ่น',
    nameEn: 'Local festival',
    province: 'Chiang Mai',
    expectedImpactModifier: null,
    source: 'curated',
    confidence: 1,
    organizationId: null,
    branchId: null,
  }

  it('a provincial row does not count as a calendar event for a different province', () => {
    expect(hasAnyCalendarEvent('2026-11-10', [provincialFestival], { province: 'Nakhon Ratchasima' })).toBe(false)
  })

  it('a provincial row DOES count for its own province', () => {
    expect(hasAnyCalendarEvent('2026-11-10', [provincialFestival], { province: 'Chiang Mai' })).toBe(true)
  })

  it('a nationwide (province null) row counts regardless of branch province', () => {
    expect(hasAnyCalendarEvent('2026-07-28', HOLIDAYS_2026, { province: 'Chiang Mai' })).toBe(true)
  })
})

describe('datesToExcludeFromBaseline', () => {
  it('excludes the holiday, bridge day, and long-weekend dates; keeps the plain weekday', () => {
    const dates = ['2026-07-24', '2026-07-27', '2026-07-28', '2026-07-30']
    const excluded = datesToExcludeFromBaseline(dates, HOLIDAYS_2026)
    expect(excluded.has('2026-07-24')).toBe(false)
    expect(excluded.has('2026-07-27')).toBe(true)
    expect(excluded.has('2026-07-28')).toBe(true)
    // 07-30 is a return day, not itself holiday/bridge/long-weekend/
    // school-break/event — correctly NOT excluded from the baseline
    // (it's a real, if soft, data point for what a Thursday looks like).
    expect(excluded.has('2026-07-30')).toBe(false)
  })
})

describe('shouldExcludeFromBaseline', () => {
  it('excludes when any qualifying flag or another calendar event is present', () => {
    const holidayCtx = classifyCalendarContext('2026-07-28', HOLIDAYS_2026)
    expect(shouldExcludeFromBaseline(holidayCtx, false)).toBe(true)

    const plainCtx = classifyCalendarContext('2026-07-24', HOLIDAYS_2026)
    expect(shouldExcludeFromBaseline(plainCtx, false)).toBe(false)
    expect(shouldExcludeFromBaseline(plainCtx, true)).toBe(true)
  })
})
