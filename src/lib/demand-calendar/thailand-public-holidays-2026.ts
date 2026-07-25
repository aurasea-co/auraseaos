// Thailand's official 2026 public holiday calendar (Bank of Thailand
// list — the actual non-working days businesses observe, not the
// broader set of cultural observances / equinoxes / Chinese New Year /
// Valentine's Day etc. that generic "holiday calendar" sites bundle
// in). Cross-checked against two independent sources on 2026-07-25;
// both agree on the same 19 non-working dates (17 rows here — Songkran
// collapses its 3 consecutive dates into one range row per
// demand_calendar's multi-day design).
//
// Where a holiday falls on a weekend, Thailand designates the following
// business day as a substitution ("ชดเชย") — that's the day actually
// off, so it's what's seeded, not the original weekend date (e.g.
// Visakha Bucha's lunar date is 2026-05-31, a Sunday; the actual
// non-working day is the 2026-06-01 substitution, so only 06-01 is
// seeded here).
//
// Sources:
//   https://www.humanresourcesonline.net/full-list-of-thailand-s-2026-public-holidays
//   https://www.holidaycalendar.org/holidays/thailand/2026
//
// expected_impact_modifier is intentionally left unset for every row —
// seeding a number here would be fabricating a demand-impact estimate
// nobody has actually analyzed yet (see migration 039's design decision
// (d): never fabricate a derived signal). A future pass can compute
// real modifiers from historical booking/sales data per holiday.

export interface ThailandPublicHoliday2026 {
  startDate: string
  endDate: string
  nameTh: string
  nameEn: string
}

export const THAILAND_PUBLIC_HOLIDAYS_2026: ThailandPublicHoliday2026[] = [
  { startDate: '2026-01-01', endDate: '2026-01-01', nameTh: 'วันขึ้นปีใหม่', nameEn: "New Year's Day" },
  { startDate: '2026-01-02', endDate: '2026-01-02', nameTh: 'วันหยุดพิเศษ (ปีใหม่)', nameEn: 'New Year Special Holiday' },
  { startDate: '2026-03-03', endDate: '2026-03-03', nameTh: 'วันมาฆบูชา', nameEn: 'Makha Bucha Day' },
  { startDate: '2026-04-06', endDate: '2026-04-06', nameTh: 'วันจักรี', nameEn: 'Chakri Memorial Day' },
  { startDate: '2026-04-13', endDate: '2026-04-15', nameTh: 'วันสงกรานต์', nameEn: 'Songkran Festival' },
  { startDate: '2026-05-01', endDate: '2026-05-01', nameTh: 'วันแรงงานแห่งชาติ', nameEn: 'National Labour Day' },
  { startDate: '2026-05-04', endDate: '2026-05-04', nameTh: 'วันฉัตรมงคล', nameEn: 'Coronation Day' },
  { startDate: '2026-06-01', endDate: '2026-06-01', nameTh: 'วันหยุดชดเชยวันวิสาขบูชา', nameEn: 'Substitution for Visakha Bucha Day' },
  { startDate: '2026-06-03', endDate: '2026-06-03', nameTh: 'วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าสุทิดาฯ', nameEn: "H.M. Queen Suthida's Birthday" },
  { startDate: '2026-07-28', endDate: '2026-07-28', nameTh: 'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว', nameEn: "H.M. King Vajiralongkorn's Birthday" },
  { startDate: '2026-07-29', endDate: '2026-07-29', nameTh: 'วันอาสาฬหบูชา', nameEn: 'Asarnha Bucha Day' },
  { startDate: '2026-08-12', endDate: '2026-08-12', nameTh: 'วันแม่แห่งชาติ', nameEn: "Mother's Day (H.M. Queen Sirikit's Birthday)" },
  { startDate: '2026-10-13', endDate: '2026-10-13', nameTh: 'วันคล้ายวันสวรรคตพระบาทสมเด็จพระบรมชนกาธิเบศร มหาภูมิพลอดุลยเดชมหาราช บรมนาถบพิตร', nameEn: 'H.M. King Bhumibol Memorial Day' },
  { startDate: '2026-10-23', endDate: '2026-10-23', nameTh: 'วันปิยมหาราช', nameEn: 'Chulalongkorn Memorial Day' },
  { startDate: '2026-12-07', endDate: '2026-12-07', nameTh: 'วันหยุดชดเชยวันพ่อแห่งชาติ', nameEn: "Substitution for Father's Day / National Day" },
  { startDate: '2026-12-10', endDate: '2026-12-10', nameTh: 'วันรัฐธรรมนูญ', nameEn: 'Constitution Day' },
  { startDate: '2026-12-31', endDate: '2026-12-31', nameTh: 'วันสิ้นปี', nameEn: "New Year's Eve" },
]

/** Pure — projects the curated calendar into demand_calendar insert-
 *  ready rows. Global (organization_id/branch_id both null), province
 *  null (nationwide), source='public_holiday_lib', confidence high
 *  (official government calendar, cross-checked against two
 *  independent sources), expected_impact_modifier left unset. */
export function toDemandCalendarSeedRows(
  holidays: ReadonlyArray<ThailandPublicHoliday2026> = THAILAND_PUBLIC_HOLIDAYS_2026,
): Array<{
  organization_id: null
  branch_id: null
  start_date: string
  end_date: string
  type: 'public_holiday'
  name_th: string
  name_en: string
  province: null
  source: 'public_holiday_lib'
  confidence: number
}> {
  return holidays.map((h) => ({
    organization_id: null,
    branch_id: null,
    start_date: h.startDate,
    end_date: h.endDate,
    type: 'public_holiday' as const,
    name_th: h.nameTh,
    name_en: h.nameEn,
    province: null,
    source: 'public_holiday_lib' as const,
    confidence: 1.0,
  }))
}
