// Thailand's 2027 public-school break calendar. Same scope discipline
// as thailand-school-breaks-2026.ts.
//
// ONLY ONE segment is confirmed for calendar year 2027: the summer
// break ending the 2569 academic year (2027-04-01 → 05-15), sourced
// from the same MOE announcement as 2026's file ("Semester 2/2569 ...
// End: Early April 2570 (approximately April 9, 2570)" / "Summer Break
// ... Duration: April 1 through mid-May 2570" — 2570 พ.ศ. = 2027 CE).
//
// The 2027 mid-year break (between semesters 1 and 2 of academic year
// 2570, expected around October 2027) is NOT seeded — the sources
// checked on 2026-07-27 only announce semester 2/2569's close and
// AY2570's summer break; AY2570's own semester calendar hasn't been
// published yet. Re-check closer to 2027 rather than estimating a date
// nobody has announced (matching thailand-public-holidays-2027.ts's
// discipline for the same kind of not-yet-gazetted date).
//
// confidence 0.75, same rationale as 2026 (MOE-recommended framework,
// schools may adjust ± days).

import type { ThailandSchoolBreak } from './thailand-school-breaks-2026'

export { toDemandCalendarSeedRows } from './thailand-school-breaks-2026'

export const THAILAND_SCHOOL_BREAKS_2027: ThailandSchoolBreak[] = [
  {
    startDate: '2027-04-01',
    endDate: '2027-05-15',
    nameTh: 'ปิดภาคเรียนฤดูร้อน (สิ้นปีการศึกษา 2569)',
    nameEn: 'Summer break (end of 2569 academic year)',
  },
]
