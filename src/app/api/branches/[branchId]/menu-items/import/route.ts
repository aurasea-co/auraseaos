// /api/branches/[branchId]/menu-items/import
//
// Bulk CSV import for the menu_items catalog. Each row upserts on
// (branch_id, name) — existing items with the same name have their
// price/category/cost updated, brand-new names insert a new row.
//
// Owner-only (mirrors the rest of menu_items mutation paths).
// Reuses the parser at lib/ingestion/csv-menu-items.ts so the same
// shape contract is honored across the import + manual-add flows.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseMenuItemsCsv } from '@/lib/ingestion/csv-menu-items'

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

const MAX_CSV_BYTES = 2 * 1024 * 1024  // 2 MB — menu catalogs are small

export async function POST(req: NextRequest, ctx: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await ctx.params
  const auth = await authorize(branchId)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

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
    console.error('[menu-items import] body parse failed', err)
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const parsed = parseMenuItemsCsv(csvText)
  if (parsed.rows.length === 0) {
    return NextResponse.json({
      imported: 0,
      updated: 0,
      skipped: parsed.totalDataLines,
      warnings: parsed.warnings,
    })
  }

  const svc = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = svc as any

  // Pull existing names for this branch up-front so we can split
  // "new vs updated" counts in the response. Case-insensitive match
  // — owners often re-cap or change spacing when re-importing.
  const { data: existingRows } = await db
    .from('menu_items')
    .select('id, name')
    .eq('branch_id', branchId)
  const existingNamesLower = new Set<string>(
    (existingRows || []).map((r: { name: string }) => r.name.toLowerCase()),
  )

  // Upsert in chunks. onConflict on (branch_id, name) — migration 034's
  // unique constraint. Each row carries is_active=true so a re-import
  // unarchives accidentally-archived items as a side effect (the owner
  // explicitly re-listing the item is consent to surface it again).
  const CHUNK = 200
  let newCount = 0
  let updatedCount = 0
  for (let i = 0; i < parsed.rows.length; i += CHUNK) {
    const slice = parsed.rows.slice(i, i + CHUNK)
    const upsertRows = slice.map((r) => ({
      branch_id: branchId,
      name: r.name,
      category: r.category,
      price_thb: r.priceThb,
      cost_thb: r.costThb,
      is_active: true,
    }))
    const { error: upsertErr } = await db
      .from('menu_items')
      .upsert(upsertRows, { onConflict: 'branch_id,name' })
    if (upsertErr) {
      console.error('[menu-items import] upsert failed', upsertErr)
      return NextResponse.json(
        {
          error: 'upsert_failed',
          detail: upsertErr.message,
          imported: newCount + updatedCount,
          warnings: parsed.warnings,
        },
        { status: 500 },
      )
    }
    for (const r of slice) {
      if (existingNamesLower.has(r.name.toLowerCase())) updatedCount += 1
      else newCount += 1
    }
  }

  await db.from('audit_log').insert({
    actor_user_id: auth.userId,
    organization_id: auth.organizationId,
    action: 'menu_items.import',
    target_entity: 'menu_items',
    target_id: null,
    payload: {
      branch_id: branchId,
      new_count: newCount,
      updated_count: updatedCount,
      skipped_warnings: parsed.warnings.length,
      total_data_lines: parsed.totalDataLines,
    },
  })

  return NextResponse.json({
    imported: newCount,
    updated: updatedCount,
    skipped: parsed.warnings.length,
    warnings: parsed.warnings,
  })
}
