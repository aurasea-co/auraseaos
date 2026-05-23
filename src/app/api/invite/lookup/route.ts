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

  // Look up whether the invitee already has a Supabase auth account
  // (mirrored on profiles.email by /api/invite/accept since migration
  // 023). When true, the /join page skips the signup form and shows
  // the login form directly — covers the "owner removed and re-invited
  // me" case and any general re-invite scenario.
  let hasExistingAccount = false
  if (data.invitee_email) {
    const { data: existingProfile } = await db
      .from('profiles')
      .select('user_id')
      .eq('email', data.invitee_email)
      .maybeSingle()
    hasExistingAccount = !!existingProfile
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
    hasExistingAccount,
  })
}
