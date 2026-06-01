// /api/branches/[branchId]/fnb-sales/import
//
// Bulk import of POS-grained F&B sales into fnb_daily_sales. Each
// CSV row becomes one (branch, date, menu_item) fact. The import
// matches each row to a menu_items.id by:
//   1. external_item_id (when present in the CSV row)
//   2. case-insensitive item_name (fallback)
//   3. unknown — row skipped with a per-line warning so the owner
//      can add the missing menu_items entry and re-upload
//
// Mirrors the competitor-rates Slice 4 contract: multipart upload or
// JSON paste-in, structured response with imported/skipped counts +
// warning detail. Idempotent — re-uploading the same CSV upserts on
// the migration 034 unique (branch_id, date, menu_item_id) constraint
// without creating duplicate sales rows.
//
// Auth: owner-only writes. Managers edit the menu catalog but not the
// historical sales facts — those are POS-truth or owner-truth and
// shouldn't be subject to staff-level edits.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseFnbSalesCsv } from '@/lib/ingestion/csv-fnb-sales'

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
  if (branch.business_type !== 'fnb') {
    return { ok: false, status: 400, error: 'wrong_business_type' }
  }
  const { data: ownerRow } = await ub
    .from('organization_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', branch.organization_id)
    .eq('role', 'owner')
    .maybeSingle()
  if (!ownerRow) return { ok: false, status: 403, error: 'owner_only' }
  return { ok: true, userId: user.id, organizationId: branch.organization_id }
}

const MAX_CSV_BYTES = 5 * 1024 * 1024

export async function POST(req: NextRequest, ctx: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await ctx.params
  const auth = await authorize(branchId)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  // Accept multipart upload OR raw JSON {csv}.
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
      const body = (await req.json().catch(() => null)) as { csv?: string } | null
      if (!body || typeof body.csv !== 'string') {
        return NextResponse.json({ error: 'missing_csv' }, { status: 400 })
      }
      if (body.csv.length > MAX_CSV_BYTES) {
        return NextResponse.json({ error: 'csv_too_large' }, { status: 413 })
      }
      csvText = body.csv
    }
  } catch (err) {
    console.error('[fnb-sales import] body parse failed', err)
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const parsed = parseFnbSalesCsv(csvText)

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

  // Pull the branch's menu_items catalog so we can resolve each row.
  // Only active items are matchable — sales for archived items would
  // pollute the rollup view (which assumes current pricing). If the
  // owner needs to import sales for an archived item, they restore
  // it first.
  const { data: catalogRows } = await db
    .from('menu_items')
    .select('id, name, external_item_id, is_active')
    .eq('branch_id', branchId)
    .eq('is_active', true)

  type CatalogRow = { id: string; name: string; external_item_id: string | null; is_active: boolean }
  const catalog: CatalogRow[] = (catalogRows || []) as CatalogRow[]

  // Build O(1) lookup tables. ext_id is case-sensitive (POS SKUs are
  // typically deterministic); names are case-insensitive (owners
  // re-type with inconsistent casing).
  const byExternalId = new Map<string, string>()
  const byNameLower = new Map<string, string>()
  for (const c of catalog) {
    if (c.external_item_id) byExternalId.set(c.external_item_id, c.id)
    byNameLower.set(c.name.toLowerCase(), c.id)
  }

  const unmatched: { lineHint: number; reason: string }[] = []
  const matched: Array<{
    menu_item_id: string
    date: string
    units_sold: number
  }> = []

  // Each parsed row resolves to either a menu_item_id (matched) or an
  // "unknown_item" warning. We DON'T add unknowns to parsed.warnings
  // because those are CSV-shape warnings (bad row format); catalog
  // misses are a separate category — surfaced via skippedUnknownItem
  // in the response.
  parsed.rows.forEach((r, idx) => {
    const lineHint = idx + 2  // +2: header is line 1, data starts at line 2
    let menuItemId: string | undefined
    if (r.externalItemId && byExternalId.has(r.externalItemId)) {
      menuItemId = byExternalId.get(r.externalItemId)
    } else if (r.itemName && byNameLower.has(r.itemName.toLowerCase())) {
      menuItemId = byNameLower.get(r.itemName.toLowerCase())
    }
    if (!menuItemId) {
      const identifier = r.externalItemId
        ? `external_item_id="${r.externalItemId}"`
        : `item_name="${r.itemName}"`
      unmatched.push({ lineHint, reason: identifier })
      return
    }
    matched.push({ menu_item_id: menuItemId, date: r.date, units_sold: r.unitsSold })
  })

  // Upsert in chunks of 500 to stay under any Supabase batch limits.
  // Idempotent on (branch_id, date, menu_item_id) — re-running the
  // same CSV won't duplicate rows.
  const CHUNK = 500
  let imported = 0
  for (let i = 0; i < matched.length; i += CHUNK) {
    const chunk = matched.slice(i, i + CHUNK).map((r) => ({
      branch_id: branchId,
      date: r.date,
      menu_item_id: r.menu_item_id,
      units_sold: r.units_sold,
      source: 'csv',
    }))
    const { error: upsertErr } = await db
      .from('fnb_daily_sales')
      .upsert(chunk, { onConflict: 'branch_id,date,menu_item_id' })
    if (upsertErr) {
      console.error('[fnb-sales import] upsert failed', upsertErr)
      return NextResponse.json(
        {
          error: 'upsert_failed',
          detail: upsertErr.message,
          imported,
          skipped: parsed.warnings.length + unmatched.length + (matched.length - imported),
          warnings: parsed.warnings,
        },
        { status: 500 },
      )
    }
    imported += chunk.length
  }

  await db.from('audit_log').insert({
    actor_user_id: auth.userId,
    organization_id: auth.organizationId,
    action: 'fnb_sales.import',
    target_entity: 'fnb_daily_sales',
    target_id: null,
    payload: {
      branch_id: branchId,
      imported,
      skipped_warnings: parsed.warnings.length,
      skipped_unknown_item: unmatched.length,
      total_data_lines: parsed.totalDataLines,
    },
  })

  return NextResponse.json({
    imported,
    skipped: parsed.warnings.length + unmatched.length,
    skippedUnknownItem: unmatched.length,
    unmatchedSamples: unmatched.slice(0, 10),
    warnings: parsed.warnings,
  })
}
