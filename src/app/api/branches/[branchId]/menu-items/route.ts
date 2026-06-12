import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// /api/branches/[branchId]/menu-items
//
// CRUD endpoint for the menu_items catalog (migration 034). Backs the
// /settings/menu page. Catalogs the SKUs that future POS adapters and
// CSV imports match against when writing fnb_daily_sales facts.
//
// GET    — list all items for the branch (active + archived). Page
//          chooses what to render based on owner toggle.
// POST   — create a new item. Validates (branch_id, name) unique +
//          (branch_id, external_item_id) unique when external is set.
// PATCH  — update one item by id. Same validation. Used for both
//          edits and soft-archive (is_active=false).
// DELETE — hard delete one item by id. Owner-only. CASCADE drops
//          any fnb_daily_sales rows referencing it (history is lost
//          — use PATCH is_active=false to archive without losing it).
//
// Auth: owners + managers can read/write (per migration 034 RLS).
// Hot path is owner-only via the page guard, but managers occasionally
// add seasonal items so the route allows them too.

const ALLOWED_FIELDS_ON_PATCH = [
  'name',
  'category',
  'price_thb',
  'cost_thb',
  'external_item_id',
  'is_active',
] as const

interface AuthOk {
  ok: true
  userId: string
  organizationId: string
  role: 'owner' | 'manager'
}
interface AuthFail {
  ok: false
  status: number
  error: string
}

async function authorize(branchId: string, mode: 'read' | 'write' | 'delete'): Promise<AuthOk | AuthFail> {
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
  // Schema reality (see invite/accept/route.ts and get-user-context.ts):
  // organization_members holds OWNERS ONLY — the live CHECK constraint
  // rejects any other role — while invited managers live in
  // branch_members with role 'manager' (legacy rows: 'branch_manager').
  // So: org ownership grants access to every branch in the org; manager
  // access is per-branch via branch_members, which also keeps
  // multi-tenancy intact (a manager from another org has no row for
  // this branch_id).
  const [{ data: ownerRow }, { data: managerRow }] = await Promise.all([
    ub
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', branch.organization_id)
      .eq('role', 'owner')
      .maybeSingle(),
    ub
      .from('branch_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('branch_id', branchId)
      .in('role', ['manager', 'branch_manager'])
      .maybeSingle(),
  ])
  if (!ownerRow && !managerRow) return { ok: false, status: 403, error: 'not_member' }
  const role: 'owner' | 'manager' = ownerRow ? 'owner' : 'manager'
  // Read: owner + manager. Write: owner + manager. Delete: owner only.
  if (mode === 'delete' && role !== 'owner') {
    return { ok: false, status: 403, error: 'owner_only' }
  }
  return {
    ok: true,
    userId: user.id,
    organizationId: branch.organization_id,
    role,
  }
}

// ─── GET ──────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, ctx: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await ctx.params
  const auth = await authorize(branchId, 'read')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const svc = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = svc as any
  const { data, error } = await db
    .from('menu_items')
    .select('id, name, category, price_thb, cost_thb, external_item_id, is_active, created_at, updated_at')
    .eq('branch_id', branchId)
    .order('is_active', { ascending: false })
    .order('category', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: 'fetch_failed', detail: error.message }, { status: 500 })
  }
  return NextResponse.json({ items: data ?? [] })
}

// ─── POST (create) ────────────────────────────────────────────────────────

export async function POST(req: NextRequest, ctx: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await ctx.params
  const auth = await authorize(branchId, 'write')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const payload = body as Partial<{
    name: string
    category: string | null
    price_thb: number | string
    cost_thb: number | string | null
    external_item_id: string | null
  }>

  const name = String(payload.name ?? '').trim()
  if (!name) {
    return NextResponse.json({ error: 'missing_name' }, { status: 400 })
  }
  if (name.length > 120) {
    return NextResponse.json({ error: 'name_too_long' }, { status: 400 })
  }

  const priceNum = Number(payload.price_thb)
  if (!Number.isFinite(priceNum) || priceNum < 0) {
    return NextResponse.json({ error: 'invalid_price' }, { status: 400 })
  }
  const priceThb = Math.round(priceNum)

  let costThb: number | null = null
  if (payload.cost_thb !== null && payload.cost_thb !== undefined && payload.cost_thb !== '') {
    const costNum = Number(payload.cost_thb)
    if (!Number.isFinite(costNum) || costNum < 0) {
      return NextResponse.json({ error: 'invalid_cost' }, { status: 400 })
    }
    costThb = Math.round(costNum)
  }

  const category = payload.category ? String(payload.category).trim().slice(0, 60) : null
  const externalItemId = payload.external_item_id
    ? String(payload.external_item_id).trim().slice(0, 100)
    : null

  const svc = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = svc as any
  const { data, error } = await db
    .from('menu_items')
    .insert({
      branch_id: branchId,
      name,
      category,
      price_thb: priceThb,
      cost_thb: costThb,
      external_item_id: externalItemId,
      is_active: true,
    })
    .select('id, name, category, price_thb, cost_thb, external_item_id, is_active, created_at, updated_at')
    .single()

  if (error) {
    // 23505 = unique_violation. The (branch_id, name) and
    // (branch_id, external_item_id) unique constraints are the most
    // likely triggers — surface a clear hint either way.
    if (error.code === '23505') {
      return NextResponse.json({ error: 'duplicate_item' }, { status: 409 })
    }
    return NextResponse.json({ error: 'insert_failed', detail: error.message }, { status: 500 })
  }

  await db.from('audit_log').insert({
    actor_user_id: auth.userId,
    organization_id: auth.organizationId,
    action: 'menu_item.create',
    target_entity: 'menu_items',
    target_id: data.id,
    payload: { branch_id: branchId, name, price_thb: priceThb },
  })

  return NextResponse.json({ item: data })
}

// ─── PATCH (update) ───────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await ctx.params
  const auth = await authorize(branchId, 'write')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const payload = body as Partial<Record<string, unknown>> & { id?: string }
  const id = String(payload.id ?? '').trim()
  if (!id) {
    return NextResponse.json({ error: 'missing_id' }, { status: 400 })
  }

  // Build the SET object from only the allowed-field keys present in
  // the payload. Anything else (e.g. branch_id, created_at) is silently
  // dropped so a hostile caller can't pivot a price update into a
  // branch-move.
  const update: Record<string, unknown> = {}
  for (const field of ALLOWED_FIELDS_ON_PATCH) {
    if (!(field in payload)) continue
    const raw = payload[field]
    if (field === 'name') {
      const v = String(raw ?? '').trim()
      if (!v || v.length > 120) {
        return NextResponse.json({ error: 'invalid_name' }, { status: 400 })
      }
      update.name = v
    } else if (field === 'category') {
      update.category = raw ? String(raw).trim().slice(0, 60) : null
    } else if (field === 'external_item_id') {
      update.external_item_id = raw ? String(raw).trim().slice(0, 100) : null
    } else if (field === 'price_thb') {
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: 'invalid_price' }, { status: 400 })
      }
      update.price_thb = Math.round(n)
    } else if (field === 'cost_thb') {
      if (raw === null || raw === '' || raw === undefined) {
        update.cost_thb = null
      } else {
        const n = Number(raw)
        if (!Number.isFinite(n) || n < 0) {
          return NextResponse.json({ error: 'invalid_cost' }, { status: 400 })
        }
        update.cost_thb = Math.round(n)
      }
    } else if (field === 'is_active') {
      update.is_active = Boolean(raw)
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no_fields_to_update' }, { status: 400 })
  }

  const svc = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = svc as any
  const { data, error } = await db
    .from('menu_items')
    .update(update)
    .eq('id', id)
    .eq('branch_id', branchId)  // belt-and-braces: id alone is enough but enforcing branch_id stops cross-branch tampering
    .select('id, name, category, price_thb, cost_thb, external_item_id, is_active, created_at, updated_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'duplicate_item' }, { status: 409 })
    }
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 })
  }

  await db.from('audit_log').insert({
    actor_user_id: auth.userId,
    organization_id: auth.organizationId,
    action: 'menu_item.update',
    target_entity: 'menu_items',
    target_id: data.id,
    payload: { branch_id: branchId, fields: Object.keys(update) },
  })

  return NextResponse.json({ item: data })
}

// ─── DELETE ───────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await ctx.params
  const auth = await authorize(branchId, 'delete')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const id = req.nextUrl.searchParams.get('id')?.trim() || ''
  if (!id) {
    return NextResponse.json({ error: 'missing_id' }, { status: 400 })
  }

  const svc = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = svc as any
  const { error, count } = await db
    .from('menu_items')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('branch_id', branchId)

  if (error) {
    return NextResponse.json({ error: 'delete_failed', detail: error.message }, { status: 500 })
  }
  if ((count ?? 0) === 0) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  await db.from('audit_log').insert({
    actor_user_id: auth.userId,
    organization_id: auth.organizationId,
    action: 'menu_item.delete',
    target_entity: 'menu_items',
    target_id: id,
    payload: { branch_id: branchId },
  })

  return NextResponse.json({ deleted: count })
}
