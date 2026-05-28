import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { authenticateSuperAdmin } from '../_lib'

// GET /api/superadmin/users
//
// Flat list of every user that has any membership in the system —
// owners (organization_members.role='owner') + invited branch
// managers/staff (branch_members). Joins each user against their
// auth.users email + created_at and the profiles row for display
// name and LINE connection state.

export interface UserRow {
  userId: string
  email: string | null
  displayName: string | null
  role: 'owner' | 'manager' | 'staff'
  organization: { id: string; name: string } | null
  branches: Array<{ id: string; name: string; businessType: string }>
  lineConnected: boolean
  joinedAt: string | null
}

interface Body {
  rows: UserRow[]
  count: number
}

export async function GET() {
  const auth = await authenticateSuperAdmin()
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const [orgMembersRes, branchMembersRes, branchesRes, profilesRes] = await Promise.all([
    db
      .from('organization_members')
      .select('user_id, role, organization_id, organizations(id, name)'),
    db
      .from('branch_members')
      .select('user_id, role, branch_id, branches(id, name, business_type, organization_id)'),
    db.from('branches').select('id, name, business_type, organization_id'),
    db.from('profiles').select('user_id, display_name, line_id'),
  ])

  if (orgMembersRes.error) {
    return NextResponse.json({ error: orgMembersRes.error.message }, { status: 500 })
  }

  type OrgRef = { id: string; name: string }
  type BranchRef = { id: string; name: string; business_type: string; organization_id: string }

  const orgMembers: Array<{
    user_id: string
    role: string
    organization_id: string
    organizations: OrgRef | OrgRef[] | null
  }> = orgMembersRes.data || []
  const branchMembers: Array<{
    user_id: string
    role: string
    branch_id: string
    branches: BranchRef | BranchRef[] | null
  }> = branchMembersRes.data || []
  const allBranches: BranchRef[] = branchesRes.data || []
  const profiles: Array<{ user_id: string; display_name: string | null; line_id: string | null }> =
    profilesRes.data || []

  const profileByUser = new Map(profiles.map((p) => [p.user_id, p]))

  // Build the aggregate per user. A user can theoretically appear in
  // both tables (owner of org A, manager of a branch in org B); we
  // dedupe by user_id and prefer the org-level role.
  const userMap = new Map<string, {
    role: 'owner' | 'manager' | 'staff'
    organization: OrgRef | null
    branches: Array<{ id: string; name: string; businessType: string }>
  }>()

  // Owners first — they get all branches of their org auto-listed.
  for (const m of orgMembers) {
    const orgRef = Array.isArray(m.organizations) ? m.organizations[0] : m.organizations
    const ownerBranches = allBranches
      .filter((b) => b.organization_id === m.organization_id)
      .map((b) => ({ id: b.id, name: b.name, businessType: b.business_type }))
    userMap.set(m.user_id, {
      role: m.role === 'owner' ? 'owner' : 'manager',
      organization: orgRef ? { id: orgRef.id, name: orgRef.name } : null,
      branches: ownerBranches,
    })
  }

  // Branch members second. Skip user_ids already claimed by org-level
  // membership (owners). Manager / staff role distinction comes from
  // the live CHECK constraint on branch_members.role — accepted
  // values are 'manager' / 'staff' (see comments in api/invite/accept).
  for (const m of branchMembers) {
    if (userMap.has(m.user_id)) continue
    const branchRef = Array.isArray(m.branches) ? m.branches[0] : m.branches
    const orgRef =
      branchRef && allBranches.find((b) => b.id === branchRef.id)
        ? (() => {
            const orgId = branchRef.organization_id
            // Look up the org name via orgMembers (already joined).
            const org = orgMembers.find((om) => om.organization_id === orgId)
            const ref = Array.isArray(org?.organizations) ? org?.organizations[0] : org?.organizations
            return ref ? { id: ref.id, name: ref.name } : null
          })()
        : null
    const role: 'manager' | 'staff' = m.role === 'staff' ? 'staff' : 'manager'
    userMap.set(m.user_id, {
      role,
      organization: orgRef,
      branches: branchRef
        ? [{ id: branchRef.id, name: branchRef.name, businessType: branchRef.business_type }]
        : [],
    })
  }

  // Resolve auth metadata (email + created_at) for every unique user.
  // TODO: when user count exceeds 100, replace individual
  // getUserById() calls with auth.admin.listUsers({ perPage: 1000 })
  // and build the map from the returned list in one round-trip.
  const userIds = Array.from(userMap.keys())
  const authByUser: Record<string, { email: string | null; createdAt: string | null }> = {}
  await Promise.all(
    userIds.map(async (uid) => {
      try {
        const { data } = await supabase.auth.admin.getUserById(uid)
        authByUser[uid] = {
          email: data?.user?.email ?? null,
          createdAt: data?.user?.created_at ?? null,
        }
      } catch (err) {
        console.warn('[superadmin/users] getUserById failed for', uid, err)
        authByUser[uid] = { email: null, createdAt: null }
      }
    }),
  )

  const rows: UserRow[] = userIds.map((uid) => {
    const info = userMap.get(uid)!
    const profile = profileByUser.get(uid)
    const authMeta = authByUser[uid] || { email: null, createdAt: null }
    return {
      userId: uid,
      email: authMeta.email,
      displayName: profile?.display_name || null,
      role: info.role,
      organization: info.organization,
      branches: info.branches,
      lineConnected: !!profile?.line_id,
      joinedAt: authMeta.createdAt,
    }
  })

  // Order newest joiner first to match the companies page.
  rows.sort((a, b) => {
    if (!a.joinedAt) return 1
    if (!b.joinedAt) return -1
    return b.joinedAt.localeCompare(a.joinedAt)
  })

  const body: Body = { rows, count: rows.length }
  return NextResponse.json(body)
}
