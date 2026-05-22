import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendEmail, EMAIL_SENDERS } from '@/lib/email/resend'
import InvitationEmail from '@/lib/email/templates/invitationEmail'

// invitations table (from migration 007) has these columns:
//   id, organization_id, branch_id, invitee_email, role, token,
//   invited_by, expires_at, accepted_at, created_at
// 'token' and 'expires_at' already exist with sane defaults.
// There is no 'status' column — pending vs accepted is derived from accepted_at.
// If a 'status' column is later desired, add it via:
//   ALTER TABLE invitations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

// IMPORTANT — Supabase Auth configuration:
// The /join page calls supabase.auth.signUp() to create the user inline.
// For that to skip the default Supabase confirmation email, go to:
//   Supabase Dashboard → Authentication → Settings → Email Auth
//   → toggle OFF "Confirm email"
// Invited users are already verified via this Aurasea invitation email,
// so a second confirmation step would be redundant.
//
// If you prefer to keep "Confirm email" ON for the public signup flow,
// the alternative is to pre-create the invited user with
//   supabase.auth.admin.createUser({ email, email_confirm: true })
// inside this route. We don't do that today because the /join page
// owns password collection — pre-creating without a password leaves the
// account in a half-built state, and admin.createUser requires us to
// also wire a separate "set your password" step.
//
// Also: customize the default Supabase templates if confirmation is left
// enabled — Authentication → Email Templates → "Confirm signup".

interface InviteSendBody {
  inviteeEmail: string
  role: 'manager' | 'staff'
  branchId: string | null
  organizationId: string
  invitedBy: string
  organizationName: string
  branchName: string
  inviterName: string
}

export async function POST(req: NextRequest) {
  let body: InviteSendBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    inviteeEmail,
    role,
    branchId,
    organizationId,
    invitedBy,
    organizationName,
    branchName,
    inviterName,
  } = body

  if (!inviteeEmail || !role || !organizationId || !invitedBy) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (role !== 'manager' && role !== 'staff') {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const token = crypto.randomUUID()
  // 14 days — gives invitees two weekends to act before we make the
  // owner re-issue. resend-invite uses the same window.
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // If a pending invitation already exists for this email+org pair,
  // rotate it in place instead of inserting a duplicate row. This
  // keeps the team page's "Pending" section deduplicated and lets the
  // owner click "Invite" twice without polluting state.
  const { data: existingPending } = await db
    .from('invitations')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('invitee_email', inviteeEmail)
    .is('accepted_at', null)
    .maybeSingle()

  let invitationToken = token

  if (existingPending) {
    const { error: updateErr } = await db
      .from('invitations')
      .update({
        token,
        expires_at: expiresAt,
        // refresh the role/branch in case the owner changed them on the
        // second click
        role,
        branch_id: branchId || null,
        invited_by: invitedBy,
      })
      .eq('id', existingPending.id)
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }
  } else {
    const { data: invitation, error: insertError } = await db
      .from('invitations')
      .insert({
        organization_id: organizationId,
        branch_id: branchId || null,
        invitee_email: inviteeEmail,
        role,
        invited_by: invitedBy,
        token,
        expires_at: expiresAt,
      })
      .select('id, token')
      .single()

    if (insertError || !invitation) {
      return NextResponse.json(
        { error: insertError?.message || 'Failed to create invitation' },
        { status: 500 },
      )
    }
    invitationToken = invitation.token
  }

  const result = await sendEmail({
    to: inviteeEmail,
    from: EMAIL_SENDERS.notifications,
    subject: `คุณได้รับเชิญให้เข้าร่วม ${organizationName} บน Aurasea OS`,
    react: InvitationEmail({
      inviterName,
      organizationName,
      branchName,
      role,
      token: invitationToken,
    }),
    organizationId,
    branchId: branchId || undefined,
    userId: invitedBy,
    notificationType: 'invitation',
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error || 'Email send failed' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
