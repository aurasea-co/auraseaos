import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendEmail, EMAIL_SENDERS } from '@/lib/email/resend'
import InvitationEmail from '@/lib/email/templates/invitationEmail'
import { authenticateOwner } from '../_lib'

// POST /api/team/resend-invite
//   { organizationId, invitationId }
//
// Regenerates the token + extends expires_at by 14 days, then re-sends
// the invitation email. We rotate the token so an old, possibly-leaked
// link from the previous send stops working. This route ALWAYS updates
// the existing row in place — never inserts a new invitation — to keep
// the team page's pending list clean.

export async function POST(req: NextRequest) {
  let body: { organizationId?: string; invitationId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { organizationId, invitationId } = body
  if (!organizationId || !invitationId) {
    return NextResponse.json(
      { error: 'organizationId and invitationId required' },
      { status: 400 },
    )
  }

  const auth = await authenticateOwner(organizationId)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // Read the invitation + org + branch context for the email
  const { data: existing, error: fetchErr } = await db
    .from('invitations')
    .select(`
      id,
      invitee_email,
      role,
      branch_id,
      accepted_at,
      organizations:organization_id ( name ),
      branches:branch_id ( name )
    `)
    .eq('id', invitationId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
  if (existing.accepted_at) {
    return NextResponse.json({ error: 'Invitation already accepted' }, { status: 409 })
  }

  // Rotate token + extend expiry (14 days, same window as send route).
  const newToken = crypto.randomUUID()
  const newExpires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
  const { error: updateErr } = await db
    .from('invitations')
    .update({ token: newToken, expires_at: newExpires })
    .eq('id', invitationId)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Look up the inviter's display name for the email body
  const { data: inviterProfile } = await db
    .from('profiles')
    .select('display_name')
    .eq('user_id', auth.userId)
    .maybeSingle()
  const inviterName =
    inviterProfile?.display_name || auth.userEmail || 'Owner'

  const organizationName = existing.organizations?.name || ''
  const branchName = existing.branches?.name || ''

  const result = await sendEmail({
    to: existing.invitee_email,
    from: EMAIL_SENDERS.notifications,
    subject: `คุณได้รับเชิญให้เข้าร่วม ${organizationName} บน Aurasea OS`,
    react: InvitationEmail({
      inviterName,
      organizationName,
      branchName,
      role: existing.role,
      token: newToken,
    }),
    organizationId,
    branchId: existing.branch_id || undefined,
    userId: auth.userId,
    notificationType: 'invitation',
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error || 'Email send failed' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
