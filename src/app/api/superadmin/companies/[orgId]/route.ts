import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { computeSubscriptionPhase } from '@/lib/subscription/status'
import { authenticateSuperAdmin } from '../../_lib'

// GET  /api/superadmin/companies/[orgId] — detail bundle
// PATCH /api/superadmin/companies/[orgId] — admin action
//
// Both paths gate through authenticateSuperAdmin() and read/write via
// the service-role client so RLS doesn't shadow the data. The PATCH
// payload picks the action via a discriminated union — extend_trial /
// change_plan / cancel — and writes an audit_log entry per action
// using the schema's actual columns (actor_user_id / target_entity /
// payload, not the spec's actor_id / target_type / metadata).

interface BranchDetail {
  id: string
  name: string
  business_type: string
  total_rooms: number | null
  total_seats: number | null
  created_at: string
  entryCount: number
}

interface DetailResponse {
  org: {
    id: string
    name: string
    plan: string
    status: string | null
    trial_ends_at: string | null
    trial_days: number | null
    discount_pct: number | null
    promo_code: string | null
    grace_period_days: number | null
    created_at: string
  }
  owner: {
    userId: string | null
    email: string | null
    displayName: string | null
    lineConnected: boolean
  }
  branches: BranchDetail[]
  invitation: {
    notes: string | null
    promoCode: string | null
    invitedBy: string | null
  } | null
  subscription: ReturnType<typeof computeSubscriptionPhase>
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ orgId: string }> }) {
  const auth = await authenticateSuperAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { orgId } = await ctx.params
  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const [orgRes, branchesRes, membersRes] = await Promise.all([
    db
      .from('organizations')
      .select('id, name, plan, status, trial_ends_at, trial_days, discount_pct, promo_code, grace_period_days, created_at')
      .eq('id', orgId)
      .maybeSingle(),
    db
      .from('branches')
      .select('id, name, business_type, total_rooms, total_seats, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true }),
    db
      .from('organization_members')
      .select('user_id, role')
      .eq('organization_id', orgId)
      .eq('role', 'owner')
      .maybeSingle(),
  ])

  if (!orgRes.data) {
    return NextResponse.json({ error: 'org_not_found', code: 'org_not_found' }, { status: 404 })
  }

  const org = orgRes.data
  const branches: Array<Omit<BranchDetail, 'entryCount'>> = branchesRes.data || []
  const ownerMembership: { user_id: string; role: string } | null = membersRes.data || null

  // Resolve owner email + display name + LINE state.
  let ownerEmail: string | null = null
  let ownerDisplayName: string | null = null
  let lineConnected = false
  if (ownerMembership) {
    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(ownerMembership.user_id)
      ownerEmail = authUser?.user?.email ?? null
    } catch {
      // ignore — defaults stay null
    }
    const { data: profile } = await db
      .from('profiles')
      .select('display_name, line_id')
      .eq('user_id', ownerMembership.user_id)
      .maybeSingle()
    ownerDisplayName = profile?.display_name || null
    lineConnected = !!profile?.line_id
  }

  // Pull the most recent owner invitation tied to this org by name +
  // owner email. The owner_invitations row carries the internal
  // notes that don't live anywhere else.
  let invitationBlock: DetailResponse['invitation'] = null
  if (ownerEmail) {
    const { data: inv } = await db
      .from('owner_invitations')
      .select('notes, promo_code, invited_by')
      .eq('email', ownerEmail.toLowerCase())
      .eq('organization_name', org.name)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (inv) {
      invitationBlock = {
        notes: inv.notes,
        promoCode: inv.promo_code,
        invitedBy: inv.invited_by,
      }
    }
  }

  // Branch-level entry counts off branch_daily_metrics (the unified
  // daily table the morning-flash route reads). Counts are bounded
  // by branch count so a separate fetch per branch is fine.
  const branchesWithCounts: BranchDetail[] = await Promise.all(
    branches.map(async (b) => {
      const { count } = await db
        .from('branch_daily_metrics')
        .select('id', { count: 'exact', head: true })
        .eq('branch_id', b.id)
      return { ...b, entryCount: count ?? 0 }
    }),
  )

  const subscription = computeSubscriptionPhase({
    status: org.status,
    trial_ends_at: org.trial_ends_at,
    grace_period_days: org.grace_period_days,
  })

  const body: DetailResponse = {
    org,
    owner: {
      userId: ownerMembership?.user_id ?? null,
      email: ownerEmail,
      displayName: ownerDisplayName,
      lineConnected,
    },
    branches: branchesWithCounts,
    invitation: invitationBlock,
    subscription,
  }
  return NextResponse.json(body)
}

// ---- Admin actions ----------------------------------------------------------

type AdminAction =
  | { type: 'extend_trial'; newTrialEnd: string; reason: string }
  | { type: 'change_plan'; plan: 'starter' | 'growth' | 'pro'; reason?: string }
  | { type: 'cancel'; reason: string }

const VALID_PLANS = new Set(['starter', 'growth', 'pro'])

function isAdminAction(body: unknown): body is AdminAction {
  if (!body || typeof body !== 'object') return false
  const b = body as Record<string, unknown>
  if (b.type === 'extend_trial') {
    return typeof b.newTrialEnd === 'string' && typeof b.reason === 'string'
  }
  if (b.type === 'change_plan') {
    return typeof b.plan === 'string' && VALID_PLANS.has(b.plan)
  }
  if (b.type === 'cancel') {
    return typeof b.reason === 'string'
  }
  return false
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ orgId: string }> }) {
  const auth = await authenticateSuperAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { orgId } = await ctx.params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json', code: 'invalid_request' }, { status: 400 })
  }
  if (!isAdminAction(body)) {
    return NextResponse.json({ error: 'invalid_action', code: 'invalid_request' }, { status: 400 })
  }
  const action = body

  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  let update: Record<string, unknown>
  let auditAction: string
  let auditPayload: Record<string, unknown>

  if (action.type === 'extend_trial') {
    const ts = new Date(action.newTrialEnd)
    if (Number.isNaN(ts.getTime()) || ts.getTime() < Date.now()) {
      return NextResponse.json({ error: 'invalid_date', code: 'invalid_request' }, { status: 400 })
    }
    update = {
      status: 'trial',
      trial_ends_at: ts.toISOString(),
    }
    auditAction = 'admin.trial.extended'
    auditPayload = { new_trial_end: ts.toISOString(), reason: action.reason }
  } else if (action.type === 'change_plan') {
    update = { plan: action.plan }
    auditAction = 'admin.plan.changed'
    auditPayload = { new_plan: action.plan, reason: action.reason ?? null }
  } else {
    update = { status: 'cancelled' }
    auditAction = 'admin.subscription.cancelled'
    auditPayload = { reason: action.reason }
  }

  const { error: updErr } = await db
    .from('organizations')
    .update(update)
    .eq('id', orgId)
  if (updErr) {
    return NextResponse.json({ error: updErr.message, code: 'server_error' }, { status: 500 })
  }

  // audit_log columns (per migrations 003 + 008): actor_user_id,
  // organization_id, action, target_entity, target_id, payload.
  await db.from('audit_log').insert({
    actor_user_id: auth.userId,
    organization_id: orgId,
    action: auditAction,
    target_entity: 'organization',
    target_id: orgId,
    payload: auditPayload,
  })

  return NextResponse.json({ success: true })
}
