#!/usr/bin/env node
// Seeds Thailand's 2027 public holidays into demand_calendar
// (migration 039) as GLOBAL rows (organization_id/branch_id both
// null — visible to every tenant, both verticals).
//
// The 16-row list here mirrors src/lib/demand-calendar/
// thailand-public-holidays-2027.ts (the tested, canonical definition —
// see that file's header for sourcing + the design rationale, and
// IMPORTANTLY the confidence split: 13 fixed-date rows at 1.0, 3 lunar/
// Buddhist rows at 0.7 since the 2027 official gazette isn't published
// yet — re-verify those 3 closer to the year). Plain JS here, not a TS
// import, matching this repo's existing scripts/ convention
// (smoke-morning-flash.mjs, seed-thailand-holidays-2026.mjs) of zero-
// dependency Node scripts using raw fetch() against PostgREST rather
// than pulling in a TS runner. Keep both files in sync if either list
// ever changes.
//
// demand_calendar's global-row write policy is super_admin-only (see
// migration 039), so this necessarily runs with the service-role key —
// there's no other way to write a global row, by design.
//
// Idempotent: checks which of these dates already have a
// source=public_holiday_lib row before inserting, so re-running this
// script is always safe (no duplicate rows).
//
// Usage:
//   node scripts/seed-thailand-holidays-2027.mjs
//
// Optional env:
//   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Exit codes:
//   0 — done (rows inserted and/or already present)
//   1 — a request failed
//   3 — usage error / missing env

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

function bail(code, msg) {
  console.error(`✗ ${msg}`)
  process.exit(code)
}

if (!SUPABASE_URL) bail(3, 'SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL env var is required')
if (!SERVICE_KEY) bail(3, 'SUPABASE_SERVICE_ROLE_KEY env var is required')

// Mirrors THAILAND_PUBLIC_HOLIDAYS_2027 in
// src/lib/demand-calendar/thailand-public-holidays-2027.ts — see that
// file for sources, day-of-week verification, and the confidence
// rationale. confidence omitted below = 1.0 (fixed-date, certain);
// confidence: 0.7 = lunar/Buddhist, astronomically estimated pending
// the official 2027 gazette.
const HOLIDAYS_2027 = [
  { start_date: '2027-01-01', end_date: '2027-01-01', name_th: 'วันขึ้นปีใหม่', name_en: "New Year's Day" },
  { start_date: '2027-02-22', end_date: '2027-02-22', name_th: 'วันหยุดชดเชยวันมาฆบูชา', name_en: 'Substitution for Makha Bucha Day', confidence: 0.7 },
  { start_date: '2027-04-06', end_date: '2027-04-06', name_th: 'วันจักรี', name_en: 'Chakri Memorial Day' },
  { start_date: '2027-04-13', end_date: '2027-04-15', name_th: 'วันสงกรานต์', name_en: 'Songkran Festival' },
  { start_date: '2027-05-03', end_date: '2027-05-03', name_th: 'วันหยุดชดเชยวันแรงงานแห่งชาติ', name_en: 'Substitution for National Labour Day' },
  { start_date: '2027-05-04', end_date: '2027-05-04', name_th: 'วันฉัตรมงคล', name_en: 'Coronation Day' },
  { start_date: '2027-05-20', end_date: '2027-05-20', name_th: 'วันวิสาขบูชา', name_en: 'Visakha Bucha Day', confidence: 0.7 },
  { start_date: '2027-06-03', end_date: '2027-06-03', name_th: 'วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าสุทิดาฯ', name_en: "H.M. Queen Suthida's Birthday" },
  { start_date: '2027-07-19', end_date: '2027-07-19', name_th: 'วันหยุดชดเชยวันอาสาฬหบูชา', name_en: 'Substitution for Asarnha Bucha Day', confidence: 0.7 },
  { start_date: '2027-07-28', end_date: '2027-07-28', name_th: 'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว', name_en: "H.M. King Vajiralongkorn's Birthday" },
  { start_date: '2027-08-12', end_date: '2027-08-12', name_th: 'วันแม่แห่งชาติ', name_en: "Mother's Day (H.M. Queen Sirikit's Birthday)" },
  { start_date: '2027-10-13', end_date: '2027-10-13', name_th: 'วันคล้ายวันสวรรคตพระบาทสมเด็จพระบรมชนกาธิเบศร มหาภูมิพลอดุลยเดชมหาราช บรมนาถบพิตร', name_en: 'H.M. King Bhumibol Memorial Day' },
  { start_date: '2027-10-25', end_date: '2027-10-25', name_th: 'วันหยุดชดเชยวันปิยมหาราช', name_en: 'Substitution for Chulalongkorn Day' },
  { start_date: '2027-12-06', end_date: '2027-12-06', name_th: 'วันหยุดชดเชยวันพ่อแห่งชาติ', name_en: "Substitution for Father's Day / National Day" },
  { start_date: '2027-12-10', end_date: '2027-12-10', name_th: 'วันรัฐธรรมนูญ', name_en: 'Constitution Day' },
  { start_date: '2027-12-31', end_date: '2027-12-31', name_th: 'วันสิ้นปี', name_en: "New Year's Eve" },
]

async function main() {
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  }

  // Idempotency check — which of these dates already have a
  // public_holiday_lib row (global scope) on file.
  const existingRes = await fetch(
    `${SUPABASE_URL}/rest/v1/demand_calendar?organization_id=is.null&source=eq.public_holiday_lib&select=start_date,name_en`,
    { headers },
  )
  if (!existingRes.ok) {
    bail(1, `Failed to read existing demand_calendar rows: ${existingRes.status} ${await existingRes.text()}`)
  }
  const existing = await existingRes.json()
  const existingDates = new Set(existing.map((r) => r.start_date))

  const toInsert = HOLIDAYS_2027.filter((h) => !existingDates.has(h.start_date))
  const skipped = HOLIDAYS_2027.length - toInsert.length

  if (toInsert.length === 0) {
    console.log(`✓ All ${HOLIDAYS_2027.length} holidays already seeded — nothing to insert.`)
    process.exit(0)
  }

  const rows = toInsert.map((h) => ({
    organization_id: null,
    branch_id: null,
    start_date: h.start_date,
    end_date: h.end_date,
    type: 'public_holiday',
    name_th: h.name_th,
    name_en: h.name_en,
    province: null,
    source: 'public_holiday_lib',
    confidence: h.confidence ?? 1.0,
  }))

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/demand_calendar`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify(rows),
  })
  if (!insertRes.ok) {
    bail(1, `Insert failed: ${insertRes.status} ${await insertRes.text()}`)
  }
  const inserted = await insertRes.json()

  console.log(`✓ Inserted ${inserted.length} holiday row(s); ${skipped} already present, skipped.`)
  for (const r of inserted) {
    console.log(`  ${r.start_date}${r.end_date !== r.start_date ? ` → ${r.end_date}` : ''}  ${r.name_en} / ${r.name_th}  (confidence=${r.confidence})`)
  }
}

main().catch((err) => bail(1, err.stack || String(err)))
