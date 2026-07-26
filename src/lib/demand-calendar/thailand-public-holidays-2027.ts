// Thailand's 2027 public holiday calendar. Same scope discipline as
// thailand-public-holidays-2026.ts: only actual non-working days (Bank
// of Thailand-style calendar), not the broader observances (Chinese
// New Year, Valentine's Day, equinoxes, Halloween, Christmas, Teachers'
// Day, Mahidol Day) that generic "holiday calendar" aggregators bundle
// in alongside real public holidays — one 2027 aggregator listed "31
// holidays," most of which aren't actual days off.
//
// IMPORTANT DIFFERENCE FROM 2026: unlike 2026 (already Cabinet-
// finalized when seeded), 2027's lunar/Buddhist holidays (Makha Bucha,
// Visakha Bucha, Asarnha Bucha) are still ASTRONOMICAL ESTIMATES as of
// this seeding — the Royal Thai Government Gazette hasn't published the
// official 2027 calendar yet. Every source found says so explicitly.
// The 13 fixed-date rows (royal birthdays, Songkran, national days —
// none of which depend on the lunar calendar) are effectively certain
// and get confidence=1.0, matching 2026. The 3 lunar-dependent rows get
// confidence=0.7 and are flagged inline — re-verify against the
// official gazette closer to 2027 and correct if the Cabinet's
// published dates differ from the astronomical estimate.
//
// Cross-checked against two independent sources on 2026-07-26 (dates
// confirmed via independent day-of-week arithmetic, not just copied):
//   https://globalholidayscalendar.com/countries/thailand/2027
//   https://calendarific.com/holidays/2027/th
//
// Substitution logic (same rule as 2026): only the actual non-working
// observed day is seeded, never the original weekend date (e.g.
// Labour Day 2027-05-01 is a Saturday; only the 2027-05-03 substitution
// is seeded).
//
// expected_impact_modifier is left unset on every row for the same
// reason as 2026 — see that file's header and migration 039's design
// decision (d).

import type { ThailandPublicHoliday } from './thailand-public-holidays-2026'

export { toDemandCalendarSeedRows } from './thailand-public-holidays-2026'

// Chronological order (lunar/provisional rows — confidence 0.7 —
// interleaved in their real calendar position, not appended at the
// end) so the array itself is a readable year-at-a-glance list.
export const THAILAND_PUBLIC_HOLIDAYS_2027: ThailandPublicHoliday[] = [
  { startDate: '2027-01-01', endDate: '2027-01-01', nameTh: 'วันขึ้นปีใหม่', nameEn: "New Year's Day" },
  { startDate: '2027-02-22', endDate: '2027-02-22', nameTh: 'วันหยุดชดเชยวันมาฆบูชา', nameEn: 'Substitution for Makha Bucha Day', confidence: 0.7 },
  { startDate: '2027-04-06', endDate: '2027-04-06', nameTh: 'วันจักรี', nameEn: 'Chakri Memorial Day' },
  { startDate: '2027-04-13', endDate: '2027-04-15', nameTh: 'วันสงกรานต์', nameEn: 'Songkran Festival' },
  { startDate: '2027-05-03', endDate: '2027-05-03', nameTh: 'วันหยุดชดเชยวันแรงงานแห่งชาติ', nameEn: 'Substitution for National Labour Day' },
  { startDate: '2027-05-04', endDate: '2027-05-04', nameTh: 'วันฉัตรมงคล', nameEn: 'Coronation Day' },
  { startDate: '2027-05-20', endDate: '2027-05-20', nameTh: 'วันวิสาขบูชา', nameEn: 'Visakha Bucha Day', confidence: 0.7 },
  { startDate: '2027-06-03', endDate: '2027-06-03', nameTh: 'วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าสุทิดาฯ', nameEn: "H.M. Queen Suthida's Birthday" },
  { startDate: '2027-07-19', endDate: '2027-07-19', nameTh: 'วันหยุดชดเชยวันอาสาฬหบูชา', nameEn: 'Substitution for Asarnha Bucha Day', confidence: 0.7 },
  { startDate: '2027-07-28', endDate: '2027-07-28', nameTh: 'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว', nameEn: "H.M. King Vajiralongkorn's Birthday" },
  { startDate: '2027-08-12', endDate: '2027-08-12', nameTh: 'วันแม่แห่งชาติ', nameEn: "Mother's Day (H.M. Queen Sirikit's Birthday)" },
  { startDate: '2027-10-13', endDate: '2027-10-13', nameTh: 'วันคล้ายวันสวรรคตพระบาทสมเด็จพระบรมชนกาธิเบศร มหาภูมิพลอดุลยเดชมหาราช บรมนาถบพิตร', nameEn: 'H.M. King Bhumibol Memorial Day' },
  { startDate: '2027-10-25', endDate: '2027-10-25', nameTh: 'วันหยุดชดเชยวันปิยมหาราช', nameEn: 'Substitution for Chulalongkorn Day' },
  { startDate: '2027-12-06', endDate: '2027-12-06', nameTh: 'วันหยุดชดเชยวันพ่อแห่งชาติ', nameEn: "Substitution for Father's Day / National Day" },
  { startDate: '2027-12-10', endDate: '2027-12-10', nameTh: 'วันรัฐธรรมนูญ', nameEn: 'Constitution Day' },
  { startDate: '2027-12-31', endDate: '2027-12-31', nameTh: 'วันสิ้นปี', nameEn: "New Year's Eve" },
]
