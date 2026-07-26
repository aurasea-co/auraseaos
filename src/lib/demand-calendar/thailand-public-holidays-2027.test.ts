import { describe, it, expect } from 'vitest'
import { THAILAND_PUBLIC_HOLIDAYS_2027 } from './thailand-public-holidays-2027'
import { toDemandCalendarSeedRows } from './thailand-public-holidays-2026'

describe('THAILAND_PUBLIC_HOLIDAYS_2027', () => {
  it('has exactly 16 rows covering 18 non-working calendar dates (Songkran collapses 3 into 1 range)', () => {
    expect(THAILAND_PUBLIC_HOLIDAYS_2027).toHaveLength(16)
    const totalDays = THAILAND_PUBLIC_HOLIDAYS_2027.reduce((sum, h) => {
      const start = new Date(`${h.startDate}T00:00:00Z`)
      const end = new Date(`${h.endDate}T00:00:00Z`)
      return sum + Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
    }, 0)
    expect(totalDays).toBe(18)
  })

  it('every row has both a Thai and an English name', () => {
    for (const h of THAILAND_PUBLIC_HOLIDAYS_2027) {
      expect(h.nameTh.length).toBeGreaterThan(0)
      expect(h.nameEn.length).toBeGreaterThan(0)
    }
  })

  it('every date falls within 2027 and end_date >= start_date', () => {
    for (const h of THAILAND_PUBLIC_HOLIDAYS_2027) {
      expect(h.startDate.startsWith('2027-')).toBe(true)
      expect(h.endDate.startsWith('2027-')).toBe(true)
      expect(h.endDate >= h.startDate).toBe(true)
    }
  })

  it('dates are in ascending order with no overlaps', () => {
    for (let i = 1; i < THAILAND_PUBLIC_HOLIDAYS_2027.length; i++) {
      expect(THAILAND_PUBLIC_HOLIDAYS_2027[i].startDate > THAILAND_PUBLIC_HOLIDAYS_2027[i - 1].endDate).toBe(true)
    }
  })

  it('Songkran is a single 3-day range row, not three separate rows', () => {
    const songkran = THAILAND_PUBLIC_HOLIDAYS_2027.find((h) => h.nameEn === 'Songkran Festival')
    expect(songkran).toEqual({
      startDate: '2027-04-13',
      endDate: '2027-04-15',
      nameTh: 'วันสงกรานต์',
      nameEn: 'Songkran Festival',
    })
  })

  it('every seeded weekend-shift is on the ACTUAL non-working substitution day, never the original weekend date', () => {
    // Independently verified day-of-week (not just copied from a
    // source) — see the commit message / research for the computation.
    // Substitution rows should each land on a Monday (the standard
    // next-business-day shift after a Sat/Sun holiday).
    const substitutions = THAILAND_PUBLIC_HOLIDAYS_2027.filter((h) => h.nameEn.startsWith('Substitution for'))
    expect(substitutions).toHaveLength(5)
    for (const s of substitutions) {
      const dow = new Date(`${s.startDate}T00:00:00Z`).getUTCDay()
      expect(dow).toBe(1) // Monday
    }
  })

  it('lunar/Buddhist rows are flagged with confidence 0.7 (astronomical estimate, not yet officially gazetted)', () => {
    const lunarNames = ['Substitution for Makha Bucha Day', 'Visakha Bucha Day', 'Substitution for Asarnha Bucha Day']
    for (const name of lunarNames) {
      const row = THAILAND_PUBLIC_HOLIDAYS_2027.find((h) => h.nameEn === name)
      expect(row?.confidence).toBe(0.7)
    }
  })

  it('fixed-date rows have no confidence override (default to 1.0 via toDemandCalendarSeedRows)', () => {
    const fixedDateNames = ["New Year's Day", 'Chakri Memorial Day', 'Songkran Festival', 'Coronation Day']
    for (const name of fixedDateNames) {
      const row = THAILAND_PUBLIC_HOLIDAYS_2027.find((h) => h.nameEn === name)
      expect(row?.confidence).toBeUndefined()
    }
  })
})

describe('toDemandCalendarSeedRows(THAILAND_PUBLIC_HOLIDAYS_2027)', () => {
  it('projects fixed-date rows at confidence 1.0 and lunar rows at 0.7', () => {
    const rows = toDemandCalendarSeedRows(THAILAND_PUBLIC_HOLIDAYS_2027)
    expect(rows).toHaveLength(16)
    const byName = new Map(rows.map((r) => [r.name_en, r]))
    expect(byName.get("New Year's Day")?.confidence).toBe(1.0)
    expect(byName.get('Visakha Bucha Day')?.confidence).toBe(0.7)
  })

  it('every row is still global (organization_id/branch_id/province null) and unset expected_impact_modifier', () => {
    const rows = toDemandCalendarSeedRows(THAILAND_PUBLIC_HOLIDAYS_2027)
    for (const r of rows) {
      expect(r.organization_id).toBeNull()
      expect(r.branch_id).toBeNull()
      expect(r.province).toBeNull()
      expect(r.source).toBe('public_holiday_lib')
      expect('expected_impact_modifier' in r).toBe(false)
    }
  })
})
