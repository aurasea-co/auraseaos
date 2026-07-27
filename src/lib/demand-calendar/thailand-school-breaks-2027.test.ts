import { describe, it, expect } from 'vitest'
import { THAILAND_SCHOOL_BREAKS_2027 } from './thailand-school-breaks-2027'
import { toDemandCalendarSeedRows } from './thailand-school-breaks-2026'

describe('THAILAND_SCHOOL_BREAKS_2027', () => {
  it('has exactly 1 confirmed break period for calendar year 2027 (the mid-year break is not yet announced)', () => {
    expect(THAILAND_SCHOOL_BREAKS_2027).toHaveLength(1)
  })

  it('the summer break runs 2027-04-01 through 2027-05-15 (end of AY2569)', () => {
    expect(THAILAND_SCHOOL_BREAKS_2027[0]).toEqual({
      startDate: '2027-04-01',
      endDate: '2027-05-15',
      nameTh: 'ปิดภาคเรียนฤดูร้อน (สิ้นปีการศึกษา 2569)',
      nameEn: 'Summer break (end of 2569 academic year)',
    })
  })
})

describe('toDemandCalendarSeedRows (reused from thailand-school-breaks-2026.ts)', () => {
  it('projects the 2027 row the same way as 2026', () => {
    const rows = toDemandCalendarSeedRows(THAILAND_SCHOOL_BREAKS_2027)
    expect(rows).toHaveLength(1)
    expect(rows[0].start_date).toBe('2027-04-01')
    expect(rows[0].type).toBe('school_holiday')
    expect(rows[0].source).toBe('curated')
    expect(rows[0].confidence).toBe(0.75)
  })
})
