import { describe, it, expect } from 'vitest'
import { THAILAND_SCHOOL_BREAKS_2026, toDemandCalendarSeedRows } from './thailand-school-breaks-2026'

describe('THAILAND_SCHOOL_BREAKS_2026', () => {
  it('has exactly 2 break periods for calendar year 2026', () => {
    expect(THAILAND_SCHOOL_BREAKS_2026).toHaveLength(2)
  })

  it('every row has both a Thai and an English name', () => {
    for (const b of THAILAND_SCHOOL_BREAKS_2026) {
      expect(b.nameTh.length).toBeGreaterThan(0)
      expect(b.nameEn.length).toBeGreaterThan(0)
    }
  })

  it('every date falls within 2026 and end_date >= start_date', () => {
    for (const b of THAILAND_SCHOOL_BREAKS_2026) {
      expect(b.startDate.startsWith('2026-')).toBe(true)
      expect(b.endDate.startsWith('2026-')).toBe(true)
      expect(b.endDate >= b.startDate).toBe(true)
    }
  })

  it('dates are in ascending order with no overlaps', () => {
    for (let i = 1; i < THAILAND_SCHOOL_BREAKS_2026.length; i++) {
      expect(THAILAND_SCHOOL_BREAKS_2026[i].startDate > THAILAND_SCHOOL_BREAKS_2026[i - 1].endDate).toBe(true)
    }
  })

  it('the summer break runs 2026-04-01 through 2026-05-15 (end of AY2568)', () => {
    const summer = THAILAND_SCHOOL_BREAKS_2026.find((b) => b.nameEn.startsWith('Summer break'))
    expect(summer).toEqual({
      startDate: '2026-04-01',
      endDate: '2026-05-15',
      nameTh: 'ปิดภาคเรียนฤดูร้อน (สิ้นปีการศึกษา 2568)',
      nameEn: 'Summer break (end of 2568 academic year)',
    })
  })

  it('the mid-year break runs 2026-10-01 through 2026-10-31 (AY2569 semester gap)', () => {
    const midYear = THAILAND_SCHOOL_BREAKS_2026.find((b) => b.nameEn.startsWith('Mid-year break'))
    expect(midYear).toEqual({
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      nameTh: 'ปิดภาคเรียนระหว่างภาค (ปีการศึกษา 2569)',
      nameEn: 'Mid-year break between semesters (2569 academic year)',
    })
  })
})

describe('toDemandCalendarSeedRows', () => {
  it('projects every row as global (organization_id/branch_id null), nationwide (province null), type=school_holiday', () => {
    const rows = toDemandCalendarSeedRows()
    expect(rows).toHaveLength(2)
    for (const r of rows) {
      expect(r.organization_id).toBeNull()
      expect(r.branch_id).toBeNull()
      expect(r.province).toBeNull()
      expect(r.type).toBe('school_holiday')
      expect(r.source).toBe('curated')
    }
  })

  it('defaults confidence to 0.75 — a recommended framework, not a gazetted list like public holidays', () => {
    const rows = toDemandCalendarSeedRows()
    for (const r of rows) {
      expect(r.confidence).toBe(0.75)
    }
  })

  it('does not set expected_impact_modifier — never fabricate an unassessed signal', () => {
    const rows = toDemandCalendarSeedRows()
    for (const r of rows) {
      expect('expected_impact_modifier' in r).toBe(false)
    }
  })
})
