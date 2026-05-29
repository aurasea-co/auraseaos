import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// DELETE /api/branches/[branchId]
//
// Owner self-service branch deletion. The caller must own the org
// the branch belongs to (organization_members.role='owner'). The
// last branch in an org is protected — an org must always have at
// least one branch.
//
// Cascade order:
//   1. fnb_daily_metrics       — committed migrations don't show FK
//   2. accommodation_daily_metrics — same
//   3. branch_daily_metrics    — same
//   4. branches (the row itself) — FKs on targets, branch_members
//      cascade automatically; invitations and notification_log set
//      branch_id to NULL via their FK definitions, so they survive.
//
// We always run the metrics deletes explicitly (rather than relying
// on FK ON DELETE CASCADE) because those three tables predate the
// committed migrations folder and we don't know their cascade
// behaviour with confidence.

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ branchId: string }> },
) {
  const { branchId } = await params

  const userClient = await createClient()
  const { data: userRes } = await userClient.auth.getUser()
  const user = userRes?.user
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data: branch } = await db
    .from('branches')
    .select('id, name, organization_id')
    .eq('id', branchId)
    .maybeSingle()
  if (!branch) return NextResponse.json({ error: 'Branch not found' }, { status: 404 })

  const { data: ownerMembership } = await db
    .from('organization_members')
    .select('user_id')
    .eq('user_id', user.id)
    .eq('role', 'owner')
    .eq('organization_id', branch.organization_id)
    .maybeSingle()
  if (!ownerMembership) {
    return NextResponse.json({ error: 'Forbidden', code: 'not_owner' }, { status: 403 })
  }

  // Refuse to delete the last branch — the rest of the app assumes
  // every org has at least one.
  const { count: siblingCount } = await db
    .from('branches')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', branch.organization_id)
  if ((siblingCount || 0) <= 1) {
    return NextResponse.json({ error: 'last_branch', code: 'last_branch' }, { status: 409 })
  }

  // Snapshot row counts so the audit_log entry stays informative
  // after the delete. Three separate selects beats a SUM with UNION
  // and is cheap because head:true returns no rows.
  const [bdmRes, accRes, fnbRes] = await Promise.all([
    db.from('branch_daily_metrics').select('id', { count: 'exact', head: true }).eq('branch_id', branchId),
    db.from('accommodation_daily_metrics').select('id', { count: 'exact', head: true }).eq('branch_id', branchId),
    db.from('fnb_daily_metrics').select('id', { count: 'exact', head: true }).eq('branch_id', branchId),
  ])
  const rowsDeleted = (bdmRes.count || 0) + (accRes.count || 0) + (fnbRes.count || 0)

  // Cascade deletes
  await db.from('branch_daily_metrics').delete().eq('branch_id', branchId)
  await db.from('accommodation_daily_metrics').delete().eq('branch_id', branchId)
  await db.from('fnb_daily_metrics').delete().eq('branch_id', branchId)
  const { error: branchErr } = await db.from('branches').delete().eq('id', branchId)
  if (branchErr) {
    return NextResponse.json({ error: branchErr.message, code: 'delete_failed' }, { status: 500 })
  }

  // Audit log — column names match the actual schema (migrations
  // 003 + 008), not the spec's renamed fields.
  await db.from('audit_log').insert({
    actor_user_id: user.id,
    organization_id: branch.organization_id,
    action: 'branch.deleted',
    target_entity: 'branch',
    target_id: branchId,
    payload: {
      branch_name: branch.name,
      rows_deleted: rowsDeleted,
    },
  })

  return NextResponse.json({ success: true, branchId, rowsDeleted })
}
