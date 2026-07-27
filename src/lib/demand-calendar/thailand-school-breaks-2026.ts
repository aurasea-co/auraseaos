// Thailand's 2026 public-school break calendar — the OBEC (Office of
// the Basic Education Commission) / Ministry of Education academic-year
// calendar's extended semester and summer breaks, seeded as
// demand_calendar type='school_holiday' rows. This is the family-travel
// demand signal Tier 1's isSchoolBreak flag reads (see classify.ts) —
// individual school-holiday DAYS (e.g. Teachers' Day) are not seeded
// here; those that are actual non-working days already exist as
// public_holiday rows elsewhere in demand_calendar.
//
// IMPORTANT DIFFERENCE FROM PUBLIC HOLIDAYS: the MOE academic calendar
// is a RECOMMENDED FRAMEWORK, not a single Cabinet-gazetted list —
// every source below explicitly notes individual schools may shift
// their own open/close dates by a few days with supervisory-body
// approval. confidence is 0.75, not 1.0 (compare: public holidays are
// 1.0 because the gazette fixes an exact non-working day for the whole
// country; see thailand-public-holidays-2026.ts).
//
// Two segments seeded for calendar year 2026 (Thai academic year 2569,
// พ.ศ. 2569): the tail of the 2568 academic year's summer break, and
// the mid-year break between semesters 1 and 2 of 2569. Semester 2/2569
// (2026-11-01 → 2027-04-01) is IN SESSION for the rest of 2026 — no
// break to seed there. The following academic year's mid-year break
// (around Oct 2027) isn't seeded — AY2570's calendar hasn't been
// announced by these sources yet; see thailand-school-breaks-2027.ts's
// header for what IS confirmed for 2027.
//
// Cross-checked against three independent Thai-language sources on
// 2026-07-27, all citing the Ministry of Education's 2569 academic-year
// announcement and mutually consistent on every date:
//   https://www.kruchiangrai.net/2026/05/18/ปฏิทินการเปิด-ปิด-ภาคเรียน-2/
//     ("อ้างอิงประกาศกระทรวงศึกษาธิการ" — cites the MOE announcement
//     directly: semester 1/2569 16 พ.ค.–30 ก.ย. 2569, semester 2/2569
//     1 พ.ย. 2569–1 เม.ย. 2570)
//   https://www.kruchiangrai.net/2026/04/26/ปฏิทินปีการศึกษา-2569/
//   Individual school announcements of the same MOE-set dates (e.g.
//   ทุ่งยิงพิทยาคม, คำเขื่อนแก้วชนูปถัมภ์) confirming the 2/2568 close /
//   1/2569 open transition at 1 เม.ย.–15 พ.ค. 2569.
//
// Deliberately excludes generic "Thailand school holidays" aggregator
// sites (Expatica, Edarabia, HoneyKids, Beevago) that quote a July-
// August "summer break" — that's the INTERNATIONAL/British-calendar
// school year (Aug-June), not Thailand's public OBEC calendar (mid-
// May-March with an April-May break). Same aggregator-conflation trap
// thailand-public-holidays-2026.ts's header warns about, for school
// terms instead of public holidays.

export interface ThailandSchoolBreak {
  startDate: string
  endDate: string
  nameTh: string
  nameEn: string
  /** 0..1. Every row here is 0.75 (MOE-recommended framework schools
   *  may adjust) unless overridden — see this file's header. */
  confidence?: number
}

export const THAILAND_SCHOOL_BREAKS_2026: ThailandSchoolBreak[] = [
  {
    startDate: '2026-04-01',
    endDate: '2026-05-15',
    nameTh: 'ปิดภาคเรียนฤดูร้อน (สิ้นปีการศึกษา 2568)',
    nameEn: 'Summer break (end of 2568 academic year)',
  },
  {
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    nameTh: 'ปิดภาคเรียนระหว่างภาค (ปีการศึกษา 2569)',
    nameEn: 'Mid-year break between semesters (2569 academic year)',
  },
]

/** Pure — projects the curated calendar into demand_calendar insert-
 *  ready rows. Global (organization_id/branch_id both null), province
 *  null (nationwide — the MOE calendar applies to public schools across
 *  the country), source='curated' (not 'public_holiday_lib' — this
 *  isn't the gazetted public-holiday list), confidence 0.75 unless a
 *  row overrides it. */
export function toDemandCalendarSeedRows(
  breaks: ReadonlyArray<ThailandSchoolBreak> = THAILAND_SCHOOL_BREAKS_2026,
): Array<{
  organization_id: null
  branch_id: null
  start_date: string
  end_date: string
  type: 'school_holiday'
  name_th: string
  name_en: string
  province: null
  source: 'curated'
  confidence: number
}> {
  return breaks.map((b) => ({
    organization_id: null,
    branch_id: null,
    start_date: b.startDate,
    end_date: b.endDate,
    type: 'school_holiday' as const,
    name_th: b.nameTh,
    name_en: b.nameEn,
    province: null,
    source: 'curated' as const,
    confidence: b.confidence ?? 0.75,
  }))
}
