import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { authenticateSuperAdmin } from '../_lib'

// GET /api/superadmin/dashboard
//
// Service-role-backed feed for the /superadmin landing page. The page
// itself used to call the user-bound client directly via
// `createClient()` from `@/lib/supabase/client`. That's RLS-bound, so
// new orgs created by other owners were invisible to the super admin
// — they'd only see orgs they're a member of (Crystal Resort, in
// practice).
//
// Now: super-admin authn via shared helper, then a service-role read
// that bypasses RLS. We keep the existing OrgRow shape on the client
// so the page rendering stays identical; only the data source moves.

interface OrgRow {
  id: string
  name: string
  plan: string
  plan_expires_at: string | null
  created_at: string
  status: string | null
  trial_ends_at: string | null
  discount_pct: number | null
  promo_code: string | null
}

interface Stats {
  companies: number
  branches: number
  users: number
  activeTrials: number
}

export async function GET() {
  const auth = await authenticateSuperAdmin()
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const [orgResult, branchResult] = await Promise.all([
    db
      .from('organizations')
      .select(
        'id, name, plan, plan_expires_at, created_at, status, trial_ends_at, discount_pct, promo_code',
      )
      .order('created_at', { ascending: false }),
    db.from('branches').select('id', { count: 'exact', head: true }),
  ])

  if (orgResult.error) {
    return NextResponse.json({ error: orgResult.error.message }, { status: 500 })
  }

  const organizations: OrgRow[] = orgResult.data || []
  const now = new Date().toISOString()

  const stats: Stats = {
    companies: organizations.length,
    branches: branchResult.count || 0,
    // Distinct users would need an admin API call. We expose total
    // members instead — close enough for the operator and bypasses
    // the auth.users restriction.
    users: 0,
    activeTrials: organizations.filter((o) => {
      // An org is an "active trial" if status=trial AND trial_ends_at
      // hasn't passed. Falls back to legacy plan_expires_at when
      // trial_ends_at isn't populated (older invitations).
      const endTs = o.trial_ends_at || o.plan_expires_at
      if (o.status === 'trial' && endTs && endTs > now) return true
      // Defensive: also count legacy orgs that don't carry status but
      // have a future expiry — keeps the stat ≥ what the old UI showed.
      if (!o.status && endTs && endTs > now) return true
      return false
    }).length,
  }

  // Member count via a separate aggregate; cheaper than a join and
  // doesn't require materialising every row.
  const { count: memberCount } = await db
    .from('organization_members')
    .select('user_id', { count: 'exact', head: true })
  if (memberCount != null) stats.users = memberCount

  return NextResponse.json({ organizations, stats })
}
