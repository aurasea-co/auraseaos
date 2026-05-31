import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// /api/branches/[branchId]/pms-config
//
// GET    — list branch_pms_config rows for the branch
// POST   — upsert one row (provider, external_property_id, is_active)
//          Conflict target is (branch_id, provider) so calling POST a
//          second time with the same provider updates rather than
//          inserts.
// DELETE — remove one config by provider (?provider=cloudbeds)
//
// Owner-only writes. Reads are scoped via RLS to any org member, but
// the page route is owner-gated in the settings layout, so non-owners
// can't reach the GET in practice either.

const ALLOWED_PROVIDERS = ['cloudbeds', 'mews', 'siteminder', 'opera'] as const
type AllowedProvider = (typeof ALLOWED_PROVIDERS)[number]

async function authorize(branchId: string, requireOwner = true) {
  const userClient = await createClient()
  const { data: userRes } = await userClient.auth.getUser()
  const user = userRes?.user
  if (!user) return { ok: false as const, status: 401, error: 'unauthenticated' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ub = userClient as any
  const { data: branch } = await ub
    .from('branches')
    .select('id, organization_id, business_type')
    .eq('id', branchId)
    .maybeSingle()
  if (!branch) return { ok: false as const, status: 404, error: 'branch_not_found' }
  if (branch.business_type !== 'accommodation') {
    return { ok: false as const, status: 400, error: 'wrong_business_type' }
  }
  if (requireOwner) {
    const { data: ownerRow } = await ub
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', branch.organization_id)
      .eq('role', 'owner')
      .maybeSingle()
    if (!ownerRow) return { ok: false as const, status: 403, error: 'owner_only' }
  } else {
    // Read access for any org member.
    const { data: memberRow } = await ub
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', branch.organization_id)
      .maybeSingle()
    if (!memberRow) return { ok: false as const, status: 403, error: 'not_member' }
  }
  return { ok: true as const, user, branch }
}

// ─── GET ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, ctx: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await ctx.params
  const auth = await authorize(branchId, false)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const svc = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = svc as any
  const { data, error } = await sb
    .from('branch_pms_config')
    .select('id, provider, external_property_id, is_active, created_at, updated_at')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: 'fetch_failed', detail: error.message }, { status: 500 })
  }
  return NextResponse.json({ configs: data ?? [] })
}

// ─── POST (upsert) ────────────────────────────────────────────────────────

export async function POST(req: NextRequest, ctx: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await ctx.params
  const auth = await authorize(branchId, true)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const payload = body as Partial<{
    provider: string
    external_property_id: string
    is_active: boolean
  }>

  const provider = String(payload.provider ?? '').trim().toLowerCase()
  if (!ALLOWED_PROVIDERS.includes(provider as AllowedProvider)) {
    return NextResponse.json(
      { error: 'invalid_provider', detail: `provider must be one of ${ALLOWED_PROVIDERS.join(', ')}` },
      { status: 400 },
    )
  }

  const externalPropertyId = String(payload.external_property_id ?? '').trim()
  if (!externalPropertyId) {
    return NextResponse.json(
      { error: 'invalid_property_id', detail: 'external_property_id is required' },
      { status: 400 },
    )
  }
  if (externalPropertyId.length > 200) {
    return NextResponse.json(
      { error: 'property_id_too_long' },
      { status: 400 },
    )
  }

  const isActive = payload.is_active !== false  // default true

  const svc = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = svc as any
  const { data, error } = await sb
    .from('branch_pms_config')
    .upsert(
      {
        branch_id: branchId,
        provider,
        external_property_id: externalPropertyId,
        is_active: isActive,
      },
      { onConflict: 'branch_id,provider' },
    )
    .select('id, provider, external_property_id, is_active, created_at, updated_at')
    .single()

  if (error) {
    return NextResponse.json({ error: 'upsert_failed', detail: error.message }, { status: 500 })
  }

  // Audit. organization_id is on the branch row from authorize.
  await sb.from('audit_log').insert({
    actor_user_id: auth.user.id,
    organization_id: auth.branch.organization_id,
    action: 'pms_config.upsert',
    target_entity: 'branch_pms_config',
    target_id: data.id,
    payload: {
      branch_id: branchId,
      provider,
      external_property_id: externalPropertyId,
      is_active: isActive,
    },
  })

  return NextResponse.json({ config: data })
}

// ─── DELETE ───────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await ctx.params
  const auth = await authorize(branchId, true)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const provider = req.nextUrl.searchParams.get('provider')?.trim().toLowerCase()
  if (!provider || !ALLOWED_PROVIDERS.includes(provider as AllowedProvider)) {
    return NextResponse.json({ error: 'invalid_provider' }, { status: 400 })
  }

  const svc = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = svc as any
  const { error } = await sb
    .from('branch_pms_config')
    .delete()
    .eq('branch_id', branchId)
    .eq('provider', provider)

  if (error) {
    return NextResponse.json({ error: 'delete_failed', detail: error.message }, { status: 500 })
  }

  await sb.from('audit_log').insert({
    actor_user_id: auth.user.id,
    organization_id: auth.branch.organization_id,
    action: 'pms_config.delete',
    target_entity: 'branch_pms_config',
    target_id: null,
    payload: { branch_id: branchId, provider },
  })

  return NextResponse.json({ ok: true })
}
