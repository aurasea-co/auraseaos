import { describe, it, expect } from 'vitest'
import { THAILAND_PUBLIC_HOLIDAYS_2026, toDemandCalendarSeedRows } from './thailand-public-holidays-2026'

describe('THAILAND_PUBLIC_HOLIDAYS_2026', () => {
  it('has exactly 17 rows covering 19 non-working calendar dates (Songkran collapses 3 into 1 range)', () => {
    expect(THAILAND_PUBLIC_HOLIDAYS_2026).toHaveLength(17)
    const totalDays = THAILAND_PUBLIC_HOLIDAYS_2026.reduce((sum, h) => {
      const start = new Date(`${h.startDate}T00:00:00Z`)
      const end = new Date(`${h.endDate}T00:00:00Z`)
      return sum + Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
    }, 0)
    expect(totalDays).toBe(19)
  })

  it('every row has both a Thai and an English name', () => {
    for (const h of THAILAND_PUBLIC_HOLIDAYS_2026) {
      expect(h.nameTh.length).toBeGreaterThan(0)
      expect(h.nameEn.length).toBeGreaterThan(0)
    }
  })

  it('every date falls within 2026 and end_date >= start_date', () => {
    for (const h of THAILAND_PUBLIC_HOLIDAYS_2026) {
      expect(h.startDate.startsWith('2026-')).toBe(true)
      expect(h.endDate.startsWith('2026-')).toBe(true)
      expect(h.endDate >= h.startDate).toBe(true)
    }
  })

  it('dates are in ascending order with no overlaps', () => {
    for (let i = 1; i < THAILAND_PUBLIC_HOLIDAYS_2026.length; i++) {
      expect(THAILAND_PUBLIC_HOLIDAYS_2026[i].startDate > THAILAND_PUBLIC_HOLIDAYS_2026[i - 1].endDate).toBe(true)
    }
  })

  it('Songkran is a single 3-day range row, not three separate rows', () => {
    const songkran = THAILAND_PUBLIC_HOLIDAYS_2026.find((h) => h.nameEn === 'Songkran Festival')
    expect(songkran).toEqual({
      startDate: '2026-04-13',
      endDate: '2026-04-15',
      nameTh: 'วันสงกรานต์',
      nameEn: 'Songkran Festival',
    })
  })
})

describe('toDemandCalendarSeedRows', () => {
  it('projects every row as global (organization_id/branch_id null), nationwide (province null)', () => {
    const rows = toDemandCalendarSeedRows()
    expect(rows).toHaveLength(17)
    for (const r of rows) {
      expect(r.organization_id).toBeNull()
      expect(r.branch_id).toBeNull()
      expect(r.province).toBeNull()
      expect(r.type).toBe('public_holiday')
      expect(r.source).toBe('public_holiday_lib')
      expect(r.confidence).toBe(1.0)
    }
  })

  it('does not set expected_impact_modifier — never fabricate an unassessed signal', () => {
    const rows = toDemandCalendarSeedRows()
    for (const r of rows) {
      expect('expected_impact_modifier' in r).toBe(false)
    }
  })

  it('carries start_date/end_date/name_th/name_en through unchanged', () => {
    const [first] = toDemandCalendarSeedRows()
    expect(first.start_date).toBe('2026-01-01')
    expect(first.end_date).toBe('2026-01-01')
    expect(first.name_th).toBe('วันขึ้นปีใหม่')
    expect(first.name_en).toBe("New Year's Day")
  })
})
