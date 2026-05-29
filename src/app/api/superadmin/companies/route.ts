import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { findDuplicateBranchIds } from '@/lib/branches/duplicates'
import { authenticateSuperAdmin } from '../_lib'

// GET /api/superadmin/companies
//
// Returns one row per branch with the parent org, owner email,
// plan, status and trial state denormalised — the super-admin
// "Companies & Branches" table renders directly off this shape so
// each fetch is one network round-trip and no joins live in the
// client. Authn through the shared super-admin gate; reads via
// service role so RLS doesn't hide orgs the super-admin isn't a
// member of.

interface BranchRow {
  // org-level fields
  organizationId: string
  organizationName: string
  ownerEmail: string | null
  plan: string
  status: string | null
  trialEndsAt: string | null
  organizationCreatedAt: string
  // branch-level fields
  branchId: string
  branchName: string
  branchType: string
  branchCreatedAt: string
  // true when another branch in the same org normalises to the same
  // name — UI shows an amber "Possible duplicate" pill so the admin
  // can spot leftover artefacts from the old double-submission bug.
  isPossibleDuplicate: boolean
}

interface Response {
  rows: BranchRow[]
  branchlessOrgs: Array<{
    organizationId: string
    organizationName: string
    ownerEmail: string | null
    plan: string
    status: string | null
    trialEndsAt: string | null
    organizationCreatedAt: string
  }>
  counts: { companies: number; branches: number }
}

export async function GET() {
  const auth = await authenticateSuperAdmin()
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const [orgsRes, branchesRes, ownerMembersRes] = await Promise.all([
    db
      .from('organizations')
      .select('id, name, plan, status, trial_ends_at, created_at')
      .order('created_at', { ascending: false }),
    db
      .from('branches')
      .select('id, name, business_type, organization_id, created_at'),
    db
      .from('organization_members')
      .select('organization_id, user_id')
      .eq('role', 'owner'),
  ])

  if (orgsRes.error) {
    return NextResponse.json({ error: orgsRes.error.message }, { status: 500 })
  }

  const orgs: Array<{
    id: string
    name: string
    plan: string
    status: string | null
    trial_ends_at: string | null
    created_at: string
  }> = orgsRes.data || []
  const branches: Array<{
    id: string
    name: string
    business_type: string
    organization_id: string
    created_at: string
  }> = branchesRes.data || []
  const ownerMembers: Array<{ organization_id: string; user_id: string }> =
    ownerMembersRes.data || []

  // Build org_id → owner email map by resolving each owner's auth row.
  // TODO: when user count exceeds 100, replace these individual
  // getUserById() calls with auth.admin.listUsers({ perPage: 1000 })
  // and look up by id from the returned list — one round-trip total.
  const ownerByOrg = new Map<string, string>()
  for (const m of ownerMembers) {
    ownerByOrg.set(m.organization_id, m.user_id)
  }
  const uniqueOwnerIds = Array.from(new Set(ownerMembers.map((m) => m.user_id)))
  const emailByUser: Record<string, string | null> = {}
  await Promise.all(
    uniqueOwnerIds.map(async (uid) => {
      try {
        const { data } = await supabase.auth.admin.getUserById(uid)
        emailByUser[uid] = data?.user?.email ?? null
      } catch (err) {
        console.warn('[superadmin/companies] getUserById failed for', uid, err)
        emailByUser[uid] = null
      }
    }),
  )

  // Flat list: one row per branch, repeating org-level fields. The
  // client filters / renders this directly. Orgs with no branches
  // are surfaced separately so they don't get silently dropped.
  const branchesByOrg = new Map<string, typeof branches>()
  for (const b of branches) {
    const arr = branchesByOrg.get(b.organization_id) || []
    arr.push(b)
    branchesByOrg.set(b.organization_id, arr)
  }

  const rows: BranchRow[] = []
  const branchlessOrgs: Response['branchlessOrgs'] = []

  for (const org of orgs) {
    const ownerId = ownerByOrg.get(org.id)
    const ownerEmail = ownerId ? emailByUser[ownerId] ?? null : null
    const orgBranches = branchesByOrg.get(org.id) || []

    if (orgBranches.length === 0) {
      branchlessOrgs.push({
        organizationId: org.id,
        organizationName: org.name,
        ownerEmail,
        plan: org.plan,
        status: org.status,
        trialEndsAt: org.trial_ends_at,
        organizationCreatedAt: org.created_at,
      })
      continue
    }

    for (const b of orgBranches) {
      rows.push({
        organizationId: org.id,
        organizationName: org.name,
        ownerEmail,
        plan: org.plan,
        status: org.status,
        trialEndsAt: org.trial_ends_at,
        organizationCreatedAt: org.created_at,
        branchId: b.id,
        branchName: b.name,
        branchType: b.business_type,
        branchCreatedAt: b.created_at,
        isPossibleDuplicate: false, // filled in below
      })
    }
  }

  // Second pass: flag duplicates once we have the full rows list.
  const duplicateIds = findDuplicateBranchIds(rows)
  for (const r of rows) {
    if (duplicateIds.has(r.branchId)) r.isPossibleDuplicate = true
  }

  const body: Response = {
    rows,
    branchlessOrgs,
    counts: { companies: orgs.length, branches: branches.length },
  }
  return NextResponse.json(body)
}
