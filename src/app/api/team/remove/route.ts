import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { authenticateOwner } from '../_lib'

// POST /api/team/remove
//   { organizationId, userId }
//
// Hard-deletes a user's membership from this org. Removes both their
// branch_members rows (for branches in this org) and any
// organization_members row scoped to this org. Refuses to remove
// owners or the caller themselves.
//
// This is destructive — the team page wraps it in an inline
// confirmation. To temporarily disable access without deleting, use
// PATCH /api/team/member-active instead.
//
// Note: We intentionally do NOT delete the Supabase auth account when
// removing a team member. The user may be a member of multiple
// organizations, and deleting their auth account would lock them out
// everywhere. When re-invited later, the /join page detects the
// existing auth account (via profiles.email + the lookup route's
// hasExistingAccount flag) and shows the login form instead of the
// signup form — so re-invites are friction-free for the user.

interface Body {
  organizationId?: string
  userId?: string
}

export async function POST(req: NextRequest) {
  let body: Body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { organizationId, userId } = body
  if (!organizationId || !userId) {
    return NextResponse.json(
      { error: 'organizationId and userId required' },
      { status: 400 },
    )
  }

  const auth = await authenticateOwner(organizationId)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (auth.userId === userId) {
    return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 })
  }

  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // Refuse to delete an owner row (only owners reach this endpoint at
  // all; preventing them from deleting another owner avoids accidental
  // org-orphaning).
  const { data: orgRow } = await db
    .from('organization_members')
    .select('role')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (orgRow?.role === 'owner') {
    return NextResponse.json({ error: 'Cannot remove an owner' }, { status: 403 })
  }

  // Fetch this org's branch IDs so we only delete branch_members rows
  // that belong here (the target user might be a member of other orgs).
  const { data: branchRows } = await db
    .from('branches')
    .select('id')
    .eq('organization_id', organizationId)
  const branchIds = (branchRows || []).map((b: { id: string }) => b.id)

  if (branchIds.length) {
    const { error: branchErr } = await db
      .from('branch_members')
      .delete()
      .eq('user_id', userId)
      .in('branch_id', branchIds)
    if (branchErr) {
      return NextResponse.json({ error: branchErr.message }, { status: 500 })
    }
  }

  // org-level row removal — no-op for branch-only members.
  const { error: orgErr } = await db
    .from('organization_members')
    .delete()
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
  if (orgErr) {
    return NextResponse.json({ error: orgErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
