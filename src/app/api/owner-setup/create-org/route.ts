import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// POST /api/owner-setup/create-org
//   { token, organizationName, businessType }
//
// Step 2 of the /owner-setup wizard. The user has just signed up
// (Step 1 handles supabase.auth.signUp client-side), so they're
// authed by the time they hit this route.
//
// Steps:
//   1. Validate the token + email match
//   2. Create the organization with trial fields from the invitation
//   3. Create the organization_members owner row
//   4. Stamp the invitation as accepted + record trial_ends_at
//   5. Write a profiles row with email mirrored

interface Body {
  token?: string
  organizationName?: string
  businessType?: 'accommodation' | 'fnb' | 'mixed'
}

export async function POST(req: NextRequest) {
  let body: Body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const token = body.token
  const organizationName = body.organizationName?.trim() || ''
  const businessType = body.businessType || 'mixed'
  if (!token || !organizationName) {
    return NextResponse.json({ error: 'token + organizationName required' }, { status: 400 })
  }

  // Caller must be signed in (signUp in step 1 establishes a session).
  const userClient = await createClient()
  const { data: userRes } = await userClient.auth.getUser()
  const user = userRes?.user
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data: invitation, error: fetchErr } = await db
    .from('owner_invitations')
    .select('id, email, trial_days, plan, discount_pct, promo_code, invited_by, expires_at, accepted_at')
    .eq('token', token)
    .maybeSingle()

  if (fetchErr || !invitation) {
    return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
  }
  if (invitation.accepted_at) {
    return NextResponse.json({ error: 'Invitation already accepted' }, { status: 409 })
  }
  if (new Date(invitation.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Invitation expired' }, { status: 410 })
  }
  if ((invitation.email as string).toLowerCase() !== (user.email || '').toLowerCase()) {
    return NextResponse.json({ error: 'Email mismatch' }, { status: 403 })
  }

  // Compute trial_ends_at from trial_days. Both legacy is_trial /
  // trial_started_at and the new trial_ends_at + status fields are
  // populated so existing code paths (eg get-user-context's
  // plan-during-trial override) keep working.
  const trialDays = invitation.trial_days || 30
  const now = new Date()
  const trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000)

  const { data: org, error: orgErr } = await db
    .from('organizations')
    .insert({
      name: organizationName,
      vertical_type: businessType,
      plan: invitation.plan || 'growth',
      is_trial: true,
      trial_started_at: now.toISOString(),
      trial_ends_at: trialEndsAt.toISOString(),
      trial_days: trialDays,
      discount_pct: invitation.discount_pct || 0,
      promo_code: invitation.promo_code,
      invited_by_admin: invitation.invited_by,
      status: 'trial',
    })
    .select('id')
    .single()

  if (orgErr || !org) {
    return NextResponse.json({ error: orgErr?.message || 'Failed to create organization' }, { status: 500 })
  }

  const { error: memberErr } = await db
    .from('organization_members')
    .upsert(
      { organization_id: org.id, user_id: user.id, role: 'owner' },
      { onConflict: 'organization_id,user_id' },
    )
  if (memberErr) {
    return NextResponse.json({ error: memberErr.message }, { status: 500 })
  }

  // Stamp profile with email so the team page (and any other
  // surface that reads profiles) has the address available without
  // hitting auth.users.
  const emailPrefix = (user.email || '').split('@')[0] || 'owner'
  await db
    .from('profiles')
    .upsert(
      { user_id: user.id, display_name: emailPrefix, email: user.email },
      { onConflict: 'user_id', ignoreDuplicates: true },
    )

  await db
    .from('owner_invitations')
    .update({
      accepted_at: now.toISOString(),
      trial_ends_at: trialEndsAt.toISOString(),
    })
    .eq('id', invitation.id)

  return NextResponse.json({
    success: true,
    organizationId: org.id,
    trialEndsAt: trialEndsAt.toISOString(),
  })
}
