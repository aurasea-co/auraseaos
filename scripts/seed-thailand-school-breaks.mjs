#!/usr/bin/env node
// Seeds Thailand's public-school break calendar (2026 + 2027) into
// demand_calendar (migration 039) as GLOBAL rows (organization_id/
// branch_id both null — visible to every tenant, both verticals).
//
// The 3-row list here mirrors src/lib/demand-calendar/
// thailand-school-breaks-2026.ts + thailand-school-breaks-2027.ts (the
// tested, canonical definitions — see those files' headers for sourcing
// + the design rationale: this is the Thai OBEC/Ministry of Education
// PUBLIC-school academic calendar, not the international-school July-
// August calendar generic aggregators report). One script covering both
// years (unlike the two-script holiday precedent) since this is a
// single small source with only 3 rows total. Plain JS, matching this
// repo's scripts/ convention (raw fetch() against PostgREST, no TS
// runner).
//
// demand_calendar's global-row write policy is super_admin-only (see
// migration 039), so this necessarily runs with the service-role key.
//
// Idempotent: checks which of these dates already have a source=curated
// row before inserting, so re-running this script is always safe.
//
// Usage:
//   node scripts/seed-thailand-school-breaks.mjs
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

// Mirrors THAILAND_SCHOOL_BREAKS_2026 / _2027 in
// src/lib/demand-calendar/thailand-school-breaks-202{6,7}.ts — see
// those files for sources and cross-check notes.
const SCHOOL_BREAKS = [
  { start_date: '2026-04-01', end_date: '2026-05-15', name_th: 'ปิดภาคเรียนฤดูร้อน (สิ้นปีการศึกษา 2568)', name_en: 'Summer break (end of 2568 academic year)' },
  { start_date: '2026-10-01', end_date: '2026-10-31', name_th: 'ปิดภาคเรียนระหว่างภาค (ปีการศึกษา 2569)', name_en: 'Mid-year break between semesters (2569 academic year)' },
  { start_date: '2027-04-01', end_date: '2027-05-15', name_th: 'ปิดภาคเรียนฤดูร้อน (สิ้นปีการศึกษา 2569)', name_en: 'Summer break (end of 2569 academic year)' },
]

async function main() {
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  }

  // Idempotency check — which of these dates already have a
  // type=school_holiday, source=curated row (global scope) on file.
  const existingRes = await fetch(
    `${SUPABASE_URL}/rest/v1/demand_calendar?organization_id=is.null&type=eq.school_holiday&source=eq.curated&select=start_date,name_en`,
    { headers },
  )
  if (!existingRes.ok) {
    bail(1, `Failed to read existing demand_calendar rows: ${existingRes.status} ${await existingRes.text()}`)
  }
  const existing = await existingRes.json()
  const existingDates = new Set(existing.map((r) => r.start_date))

  const toInsert = SCHOOL_BREAKS.filter((b) => !existingDates.has(b.start_date))
  const skipped = SCHOOL_BREAKS.length - toInsert.length

  if (toInsert.length === 0) {
    console.log(`✓ All ${SCHOOL_BREAKS.length} school breaks already seeded — nothing to insert.`)
    process.exit(0)
  }

  const rows = toInsert.map((b) => ({
    organization_id: null,
    branch_id: null,
    start_date: b.start_date,
    end_date: b.end_date,
    type: 'school_holiday',
    name_th: b.name_th,
    name_en: b.name_en,
    province: null,
    source: 'curated',
    confidence: 0.75,
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

  console.log(`✓ Inserted ${inserted.length} school-break row(s); ${skipped} already present, skipped.`)
  for (const r of inserted) {
    console.log(`  ${r.start_date} → ${r.end_date}  ${r.name_en} / ${r.name_th}`)
  }
}

main().catch((err) => bail(1, err.stack || String(err)))
