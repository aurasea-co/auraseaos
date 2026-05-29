import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { authenticateSuperAdmin } from '../../_lib'

// GET  /api/superadmin/branches/[branchId]  → usage probe for the
//                                            admin delete modal.
// DELETE /api/superadmin/branches/[branchId] → force-delete a branch.
//
// Same cascade as the owner-facing /api/branches/[branchId] route
// but without the last-branch guard — super admins are expected to
// be able to clean up duplicates left behind by historical bugs
// even if it leaves the org temporarily empty.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ branchId: string }> },
) {
  const auth = await authenticateSuperAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { branchId } = await params
  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data: branch } = await db
    .from('branches')
    .select('id, name, organization_id, business_type, created_at, organizations(name)')
    .eq('id', branchId)
    .maybeSingle()
  if (!branch) return NextResponse.json({ error: 'Branch not found' }, { status: 404 })

  const [bdmRes, accRes, fnbRes] = await Promise.all([
    db.from('branch_daily_metrics').select('id', { count: 'exact', head: true }).eq('branch_id', branchId),
    db.from('accommodation_daily_metrics').select('id', { count: 'exact', head: true }).eq('branch_id', branchId),
    db.from('fnb_daily_metrics').select('id', { count: 'exact', head: true }).eq('branch_id', branchId),
  ])
  const dataRows = (bdmRes.count || 0) + (accRes.count || 0) + (fnbRes.count || 0)

  const orgName = Array.isArray(branch.organizations)
    ? branch.organizations[0]?.name
    : branch.organizations?.name

  return NextResponse.json({
    branchId: branch.id,
    branchName: branch.name,
    businessType: branch.business_type,
    organizationId: branch.organization_id,
    organizationName: orgName ?? null,
    createdAt: branch.created_at,
    dataRows,
  })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ branchId: string }> },
) {
  const auth = await authenticateSuperAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { branchId } = await params
  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data: branch } = await db
    .from('branches')
    .select('id, name, organization_id, business_type')
    .eq('id', branchId)
    .maybeSingle()
  if (!branch) return NextResponse.json({ error: 'Branch not found' }, { status: 404 })

  const [bdmRes, accRes, fnbRes] = await Promise.all([
    db.from('branch_daily_metrics').select('id', { count: 'exact', head: true }).eq('branch_id', branchId),
    db.from('accommodation_daily_metrics').select('id', { count: 'exact', head: true }).eq('branch_id', branchId),
    db.from('fnb_daily_metrics').select('id', { count: 'exact', head: true }).eq('branch_id', branchId),
  ])
  const rowsDeleted = (bdmRes.count || 0) + (accRes.count || 0) + (fnbRes.count || 0)

  await db.from('branch_daily_metrics').delete().eq('branch_id', branchId)
  await db.from('accommodation_daily_metrics').delete().eq('branch_id', branchId)
  await db.from('fnb_daily_metrics').delete().eq('branch_id', branchId)
  const { error: branchErr } = await db.from('branches').delete().eq('id', branchId)
  if (branchErr) {
    return NextResponse.json({ error: branchErr.message }, { status: 500 })
  }

  await db.from('audit_log').insert({
    actor_user_id: auth.userId,
    organization_id: branch.organization_id,
    action: 'admin.branch.deleted',
    target_entity: 'branch',
    target_id: branchId,
    payload: {
      branch_name: branch.name,
      business_type: branch.business_type,
      rows_deleted: rowsDeleted,
    },
  })

  return NextResponse.json({ success: true, branchId, rowsDeleted })
}
