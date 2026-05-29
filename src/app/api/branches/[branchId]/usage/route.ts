import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// GET /api/branches/[branchId]/usage
//
// Pre-flight for the owner-facing "Delete branch" modal. Returns:
//   - dataRows: total entries across the three daily-metric tables
//   - isLastBranch: true when removing this branch would leave the
//                   org with zero branches (UI disables delete in
//                   that case; the server enforces it again on DELETE)
//   - branchName: echoed back for the typed-confirmation modal
//
// Caller must be the owner of the org the branch belongs to. We
// check ownership via organization_members.role='owner' against the
// branch's organization_id — same pattern the rest of the app uses.

export async function GET(
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
    .select('id, name, organization_id, business_type')
    .eq('id', branchId)
    .maybeSingle()
  if (!branch) return NextResponse.json({ error: 'Branch not found' }, { status: 404 })

  // Ownership check
  const { data: ownerMembership } = await db
    .from('organization_members')
    .select('user_id')
    .eq('user_id', user.id)
    .eq('role', 'owner')
    .eq('organization_id', branch.organization_id)
    .maybeSingle()
  if (!ownerMembership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Sibling count → drives the "can't delete last branch" guard.
  const { count: siblingCount } = await db
    .from('branches')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', branch.organization_id)

  // Sum data rows across the three metrics tables. Each query uses
  // head:true so no rows are materialised — count only.
  const [bdmRes, accRes, fnbRes] = await Promise.all([
    db.from('branch_daily_metrics').select('id', { count: 'exact', head: true }).eq('branch_id', branchId),
    db.from('accommodation_daily_metrics').select('id', { count: 'exact', head: true }).eq('branch_id', branchId),
    db.from('fnb_daily_metrics').select('id', { count: 'exact', head: true }).eq('branch_id', branchId),
  ])
  const dataRows = (bdmRes.count || 0) + (accRes.count || 0) + (fnbRes.count || 0)

  return NextResponse.json({
    branchId: branch.id,
    branchName: branch.name,
    businessType: branch.business_type,
    organizationId: branch.organization_id,
    dataRows,
    isLastBranch: (siblingCount || 0) <= 1,
  })
}
