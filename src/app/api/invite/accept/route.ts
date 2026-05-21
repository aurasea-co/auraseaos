import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// invitee role ('manager' | 'staff') is mapped onto the membership tables:
//   manager → organization_members.role = 'manager' (+ optional branch_members.branch_manager)
//   staff   → branch_members.role = 'branch_user'

export async function POST(req: NextRequest) {
  let body: { token?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const token = body.token
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  // Auth via the user's session cookie (RLS-safe for the auth.uid() check)
  const userClient = await createClient()
  const { data: userRes } = await userClient.auth.getUser()
  const user = userRes?.user
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Service role for cross-tenant invitation lookup + membership writes
  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data: invitation, error: fetchError } = await db
    .from('invitations')
    .select('id, organization_id, branch_id, invitee_email, role, expires_at, accepted_at')
    .eq('token', token)
    .single()

  if (fetchError || !invitation) {
    return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
  }
  if (invitation.accepted_at) {
    return NextResponse.json({ error: 'Already accepted' }, { status: 409 })
  }
  if (new Date(invitation.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Invitation expired' }, { status: 410 })
  }

  const { organization_id, branch_id, role } = invitation as {
    organization_id: string
    branch_id: string | null
    role: 'manager' | 'staff'
  }

  if (role === 'manager') {
    const { error: orgErr } = await db
      .from('organization_members')
      .upsert(
        {
          organization_id,
          user_id: user.id,
          role: 'manager',
          invited_by: null,
        },
        { onConflict: 'organization_id,user_id' },
      )
    if (orgErr) {
      return NextResponse.json({ error: orgErr.message }, { status: 500 })
    }
    if (branch_id) {
      await db
        .from('branch_members')
        .upsert(
          {
            branch_id,
            user_id: user.id,
            role: 'branch_manager',
          },
          { onConflict: 'branch_id,user_id' },
        )
    }
  } else {
    if (!branch_id) {
      return NextResponse.json({ error: 'Staff invitation missing branch' }, { status: 400 })
    }
    const { error: branchErr } = await db
      .from('branch_members')
      .upsert(
        {
          branch_id,
          user_id: user.id,
          role: 'branch_user',
        },
        { onConflict: 'branch_id,user_id' },
      )
    if (branchErr) {
      return NextResponse.json({ error: branchErr.message }, { status: 500 })
    }
  }

  await db
    .from('invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invitation.id)

  return NextResponse.json({
    success: true,
    organizationId: organization_id,
    branchId: branch_id,
  })
}
