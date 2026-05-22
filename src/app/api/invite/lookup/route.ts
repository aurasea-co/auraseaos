import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// Public lookup for the /join page. Returns only the safe fields needed
// to render the invitation card — token holders can see their own details
// but no other invitation data leaks.

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data, error } = await db
    .from('invitations')
    .select(`
      organization_id,
      branch_id,
      invitee_email,
      role,
      accepted_at,
      expires_at,
      organizations:organization_id ( name ),
      branches:branch_id ( name )
    `)
    .eq('token', token)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // organization_id + branch_id are needed by /join so the client can
  // check whether the currently logged-in user already has a membership
  // in this branch (the "alreadyMember" case). The token holder gets
  // these via the accept response anyway — leaking them here is fine.
  return NextResponse.json({
    organizationId: data.organization_id,
    branchId: data.branch_id,
    inviteeEmail: data.invitee_email,
    role: data.role,
    acceptedAt: data.accepted_at,
    expiresAt: data.expires_at,
    organizationName: data.organizations?.name || '',
    branchName: data.branches?.name || null,
  })
}
