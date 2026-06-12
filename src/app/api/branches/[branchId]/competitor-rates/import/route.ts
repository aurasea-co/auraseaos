// /api/branches/[branchId]/competitor-rates/import
//
// Bulk competitor-rate import via CSV. Owner uploads a spreadsheet
// covering N days × M competitors × K room types instead of typing
// each rate through the daily grid. Same channel-aware data model
// as the manual flow (migration 033) — the channel column is
// optional in the CSV (defaults to 'ota') so legacy templates work.
//
// Mirrors the hotel CSV import route's contract:
//   POST   multipart/form-data with `file` field, OR
//   POST   application/json with `{ csv: string }` for the test
//          harness / paste-in flow
//   200    { imported, skipped, warnings: [{ lineNumber, code, raw }] }
//   4xx    structured error envelope

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseCompetitorCsv } from '@/lib/ingestion/csv-competitor'

interface AuthOk { ok: true; userId: string; organizationId: string }
interface AuthFail { ok: false; status: number; error: string }

async function authorize(branchId: string): Promise<AuthOk | AuthFail> {
  const userClient = await createClient()
  const { data: userRes } = await userClient.auth.getUser()
  const user = userRes?.user
  if (!user) return { ok: false, status: 401, error: 'unauthenticated' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ub = userClient as any
  const { data: branch } = await ub
    .from('branches')
    .select('id, organization_id, business_type')
    .eq('id', branchId)
    .maybeSingle()
  if (!branch) return { ok: false, status: 404, error: 'branch_not_found' }
  if (branch.business_type !== 'accommodation') {
    return { ok: false, status: 400, error: 'wrong_business_type' }
  }
  // Owner + manager — mirrors the manual competitor-rates route and the
  // RateDesk access matrix (ratedesk_competitors).
  const { data: memberRow } = await ub
    .from('organization_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', branch.organization_id)
    .in('role', ['owner', 'manager'])
    .maybeSingle()
  if (!memberRow) return { ok: false, status: 403, error: 'forbidden_role' }
  return { ok: true, userId: user.id, organizationId: branch.organization_id }
}

// Cap the CSV size to ~5 MB. Compresses competitive risk (a malicious
// or accidental 100 MB upload) without limiting realistic usage —
// 30 days × 5 competitors × 6 room types × 4 channels ≈ 3,600 rows,
// ~200 KB at typical sizes.
const MAX_CSV_BYTES = 5 * 1024 * 1024

export async function POST(req: NextRequest, ctx: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await ctx.params
  const auth = await authorize(branchId)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  // Accept either multipart upload (browser file picker) or raw JSON
  // body with a `csv` field (test harness / paste-in / API consumers).
  let csvText: string
  const contentType = req.headers.get('content-type') || ''
  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('file')
      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'missing_file' }, { status: 400 })
      }
      if (file.size > MAX_CSV_BYTES) {
        return NextResponse.json({ error: 'csv_too_large' }, { status: 413 })
      }
      csvText = await file.text()
    } else {
      const body = await req.json().catch(() => null) as { csv?: string } | null
      if (!body || typeof body.csv !== 'string') {
        return NextResponse.json({ error: 'missing_csv' }, { status: 400 })
      }
      if (body.csv.length > MAX_CSV_BYTES) {
        return NextResponse.json({ error: 'csv_too_large' }, { status: 413 })
      }
      csvText = body.csv
    }
  } catch (err) {
    console.error('[competitor-rates import] body parse failed', err)
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const parsed = parseCompetitorCsv(csvText)

  if (parsed.rows.length === 0) {
    return NextResponse.json({
      imported: 0,
      skipped: parsed.totalDataLines,
      warnings: parsed.warnings,
    })
  }

  const svc = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = svc as any

  // Validate competitor names against the branch's known competitors
  // — typo in the CSV shouldn't silently create a brand-new competitor
  // entry; the page caps at 5 names and the owner should be deliberate
  // about adding a new one.
  const { data: knownNames } = await db
    .from('competitor_rates')
    .select('competitor_name')
    .eq('branch_id', branchId)
  const knownSet = new Set<string>(
    (knownNames || []).map((r: { competitor_name: string }) => r.competitor_name.toLowerCase()),
  )

  const rowsToUpsert = parsed.rows.filter((r) => knownSet.has(r.competitor.toLowerCase()))
  const skippedUnknown = parsed.rows.length - rowsToUpsert.length

  // Map each CSV competitor back to its canonical spelling from the
  // DB (so case differences don't fragment the row set).
  const canonicalSpelling = new Map<string, string>()
  for (const r of knownNames || []) {
    canonicalSpelling.set(r.competitor_name.toLowerCase(), r.competitor_name)
  }

  // Upsert in chunks of 500 rows to stay well under any Supabase
  // batch limits. Each upsert hits the migration 033 unique constraint
  // (branch_id, competitor_name, room_type, channel, captured_at), so
  // re-running with the same CSV is idempotent.
  const CHUNK = 500
  let imported = 0
  for (let i = 0; i < rowsToUpsert.length; i += CHUNK) {
    const chunk = rowsToUpsert.slice(i, i + CHUNK).map((r) => ({
      branch_id: branchId,
      competitor_name: canonicalSpelling.get(r.competitor.toLowerCase()) ?? r.competitor,
      room_type: r.roomType,
      rate: r.rateThb,
      captured_at: r.date,
      channel: r.channel,
      source: r.source,
    }))
    const { error: upsertErr } = await db
      .from('competitor_rates')
      .upsert(chunk, { onConflict: 'branch_id,competitor_name,room_type,channel,captured_at' })
    if (upsertErr) {
      console.error('[competitor-rates import] upsert failed', upsertErr)
      return NextResponse.json(
        {
          error: 'upsert_failed',
          detail: upsertErr.message,
          imported,
          skipped: parsed.warnings.length + skippedUnknown + (rowsToUpsert.length - imported),
          warnings: parsed.warnings,
        },
        { status: 500 },
      )
    }
    imported += chunk.length
  }

  // Audit. Single row per import — preserves the CSV size in the
  // payload but not the rate cells (which would balloon the table).
  await db.from('audit_log').insert({
    actor_user_id: auth.userId,
    organization_id: auth.organizationId,
    action: 'competitor_rates.import',
    target_entity: 'competitor_rates',
    target_id: null,
    payload: {
      branch_id: branchId,
      imported,
      skipped_warnings: parsed.warnings.length,
      skipped_unknown_competitor: skippedUnknown,
      total_data_lines: parsed.totalDataLines,
    },
  })

  return NextResponse.json({
    imported,
    skipped: parsed.warnings.length + skippedUnknown,
    skippedUnknownCompetitor: skippedUnknown,
    warnings: parsed.warnings,
  })
}
