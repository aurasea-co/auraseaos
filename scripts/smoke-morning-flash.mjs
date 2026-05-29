#!/usr/bin/env node
// Smoke harness for the morning-flash route.
//
// Hits /api/notifications/morning-flash with the same envelope Vercel
// cron uses, pretty-prints the response, and (optionally) verifies the
// notification_log rows the route wrote.
//
// Usage:
//   ORG_ID=<uuid> CRON_SECRET=<from-vercel> \
//     node scripts/smoke-morning-flash.mjs
//
// Optional env:
//   APP_URL                       (default: https://app.auraseaos.com)
//   FORCE                         (default: true) — bypass per-day dedup
//   SUPABASE_URL                  enables post-run notification_log fetch
//   SUPABASE_SERVICE_ROLE_KEY     enables post-run notification_log fetch
//
// Exit codes:
//   0 — endpoint returned success and (if creds given) DB shows new rows
//   1 — endpoint returned a non-success response
//   2 — endpoint succeeded but DB doesn't have today's rows (delivery
//       was probably skipped for all recipients)
//   3 — usage error / missing env

const APP_URL = process.env.APP_URL || 'https://app.auraseaos.com'
const ORG_ID = process.env.ORG_ID
const CRON_SECRET = process.env.CRON_SECRET
const FORCE = (process.env.FORCE ?? 'true').toLowerCase() === 'true'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

function bail(code, msg) {
  console.error(`✗ ${msg}`)
  process.exit(code)
}

if (!ORG_ID) bail(3, 'ORG_ID env var is required (Resort A\'s id from pre-flight F.1)')
if (!CRON_SECRET) bail(3, 'CRON_SECRET env var is required (from Vercel project settings)')

const url = `${APP_URL}/api/notifications/morning-flash${FORCE ? '?force=true' : ''}`

console.log('───────────────────────────────────────────')
console.log(' Morning-flash smoke test')
console.log('───────────────────────────────────────────')
console.log(`  APP_URL: ${APP_URL}`)
console.log(`  ORG_ID:  ${ORG_ID}`)
console.log(`  FORCE:   ${FORCE}`)
console.log(`  POST →   ${url}`)
console.log('')

// --- 1) Fire the route ----------------------------------------------------
let response
try {
  response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CRON_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ organizationId: ORG_ID, force: FORCE }),
  })
} catch (err) {
  bail(1, `Request failed before reaching the server: ${err.message}`)
}

const text = await response.text()
let json
try {
  json = JSON.parse(text)
} catch {
  console.log('Non-JSON response body:')
  console.log(text.slice(0, 500))
  bail(1, `HTTP ${response.status} ${response.statusText}`)
}

console.log(`Response HTTP ${response.status}:`)
console.log(JSON.stringify(json, null, 2))
console.log('')

if (!response.ok) {
  if (response.status === 401) {
    console.error('  → CRON_SECRET is wrong, or the deployed route is on an older commit')
    console.error('    that hasn\'t picked up your current env var.')
  }
  bail(1, `Route returned ${response.status}`)
}

// --- 2) Interpret the response shape -------------------------------------
const count = json.count ?? 0
const results = json.results ?? []

console.log('───────────────────────────────────────────')
console.log(' Result interpretation')
console.log('───────────────────────────────────────────')
console.log(`  Recipients matched: ${count}`)

if (count === 0) {
  console.log('')
  console.log('  ⚠ Zero recipients matched. Two likely reasons:')
  console.log('    - No notification_settings row for this org has line_notify_enabled=true')
  console.log('      OR morning_flash_email_enabled=true. Pre-flight query F.2 verifies this.')
  console.log('    - The ORG_ID is wrong. Pre-flight F.1 verifies this.')
  console.log('')
  console.log('  Endpoint executed cleanly — no error — but nothing was sent.')
  process.exit(2)
}

const sentCount = results.filter((r) => r.line === 'sent' || r.email === 'sent').length
const skippedCount = results.filter((r) => r.line === 'skipped' && r.email === 'skipped').length

console.log(`  At least one channel delivered: ${sentCount}`)
console.log(`  Both channels skipped:          ${skippedCount}`)
console.log('')

for (const r of results) {
  console.log(`  user=${r.userId}  line=${r.line}  email=${r.email}`)
}
console.log('')

if (sentCount === 0) {
  console.log('  ⚠ Endpoint returned success but every recipient was skipped. Common reasons:')
  console.log('    - line=skipped + profiles.line_id is null → owner hasn\'t connected LINE yet.')
  console.log('    - email=skipped + morning_flash_email_enabled=false → owner hasn\'t opted into email.')
  console.log('    - line=skipped + email=skipped + force=false → already delivered today (dedup).')
}

// --- 3) Optional: verify DB-side rows ------------------------------------
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.log('───────────────────────────────────────────')
  console.log(' DB verification skipped')
  console.log('───────────────────────────────────────────')
  console.log('  Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to verify')
  console.log('  notification_log rows automatically. Or paste this in the')
  console.log('  Supabase SQL Editor:')
  console.log('')
  console.log(`  SELECT user_id, channel, status, metric_date, sent_at`)
  console.log(`  FROM notification_log`)
  console.log(`  WHERE notification_type = 'morning_flash'`)
  console.log(`    AND organization_id = '${ORG_ID}'`)
  console.log(`    AND metric_date = (now() AT TIME ZONE 'Asia/Bangkok')::date`)
  console.log(`  ORDER BY sent_at DESC;`)
  process.exit(0)
}

console.log('───────────────────────────────────────────')
console.log(' DB verification — notification_log')
console.log('───────────────────────────────────────────')

// Intl.DateTimeFormat with timeZone=Asia/Bangkok produces the calendar
// date in BKK regardless of the host's local timezone. The earlier
// implementation round-tripped via toLocaleString → new Date() →
// toISOString, which double-shifts on a host already running in BKK
// (toLocaleString stamps BKK wall time, new Date() reinterprets it as
// local — also BKK — and toISOString rolls it back to UTC, landing on
// yesterday). Same flavour of bug as commit f5acdca's fix in
// src/lib/notifications/recommendation.ts.
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date())

const restUrl = new URL(`${SUPABASE_URL}/rest/v1/notification_log`)
restUrl.searchParams.set('notification_type', 'eq.morning_flash')
restUrl.searchParams.set('organization_id', `eq.${ORG_ID}`)
restUrl.searchParams.set('metric_date', `eq.${today}`)
restUrl.searchParams.set('select', 'user_id,channel,status,metric_date,sent_at')
restUrl.searchParams.set('order', 'sent_at.desc')

const logRes = await fetch(restUrl, {
  headers: {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
  },
})

if (!logRes.ok) {
  console.error(`  ✗ Supabase REST call failed: ${logRes.status} ${logRes.statusText}`)
  process.exit(2)
}

const rows = await logRes.json()
if (!Array.isArray(rows) || rows.length === 0) {
  console.log(`  ⚠ No notification_log rows for today (${today}) on this org.`)
  console.log(`    The route returned ${sentCount} sent / ${skippedCount} skipped — if`)
  console.log(`    sentCount > 0 but DB has zero rows, the insert may have raced or RLS`)
  console.log(`    is blocking the read. Try the SQL in the Supabase Editor directly.`)
  process.exit(2)
}

for (const row of rows) {
  console.log(`  ${row.sent_at}  user=${row.user_id}  channel=${row.channel}  status=${row.status}`)
}
console.log('')
console.log(`✓ ${rows.length} notification_log row(s) found for today.`)
process.exit(0)
