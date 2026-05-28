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
// IDEMPOTENT — safe to retry. The route used to do an unconditional
// INSERT on `organizations`, which exploded with "duplicate key value
// violates unique constraint organizations_name_unique" whenever:
//   - the owner clicked Confirm twice
//   - a previous attempt got partway through (org row inserted,
//     organization_members row failed) and the user retried
//   - the network swallowed the response and the user retried
// Now the flow is:
//   1. Validate invitation (expiry, email match) — accepted_at is no
//      longer a hard fail; idempotent retries depend on detecting
//      "this user already accepted" rather than rejecting them.
//   2. Look up an existing org with this name owned by this user.
//      Hit → return that org (idempotent retry).
//   3. Look up an existing org with this name owned by ANYONE.
//      Hit with another owner → 409 name_taken.
//      Hit with no owner (orphan from a half-completed earlier
//      attempt) → claim it via organization_members.
//   4. Otherwise, first-time path: insert org + membership +
//      profile, stamp invitation.
// All error responses carry a stable `code` so the client can map
// them to friendly TH/EN copy without parsing strings.

interface Body {
  token?: string
  organizationName?: string
  businessType?: 'accommodation' | 'fnb' | 'mixed'
}

type ErrorCode =
  | 'invalid_request'
  | 'unauthenticated'
  | 'invitation_not_found'
  | 'invitation_expired'
  | 'email_mismatch'
  | 'name_taken'
  | 'server_error'

function errorResponse(code: ErrorCode, status: number, message: string) {
  return NextResponse.json({ error: message, code }, { status })
}

export async function POST(req: NextRequest) {
  let body: Body
  try {
    body = await req.json()
  } catch {
    return errorResponse('invalid_request', 400, 'Invalid JSON')
  }

  const token = body.token
  const organizationName = body.organizationName?.trim() || ''
  if (!token || !organizationName) {
    return errorResponse('invalid_request', 400, 'token + organizationName required')
  }
  // businessType is collected from the form for the branch-creation step
  // below, but no longer written onto organizations directly here. The
  // org-level vertical_type column was missing from the schema until
  // migration 026, which broke org creation entirely. Branches store
  // their own business_type, which is the source of truth.

  // Caller must be signed in (signUp in step 1 establishes a session).
  const userClient = await createClient()
  const { data: userRes } = await userClient.auth.getUser()
  const user = userRes?.user
  if (!user) return errorResponse('unauthenticated', 401, 'Not authenticated')

  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data: invitation, error: fetchErr } = await db
    .from('owner_invitations')
    .select('id, email, trial_days, plan, discount_pct, promo_code, invited_by, expires_at, accepted_at')
    .eq('token', token)
    .maybeSingle()

  if (fetchErr || !invitation) {
    return errorResponse('invitation_not_found', 404, 'Invitation not found')
  }
  if (new Date(invitation.expires_at).getTime() < Date.now()) {
    return errorResponse('invitation_expired', 410, 'Invitation expired')
  }
  if ((invitation.email as string).toLowerCase() !== (user.email || '').toLowerCase()) {
    return errorResponse('email_mismatch', 403, 'Email mismatch')
  }
  // Note: NOT bailing on `accepted_at` here. The idempotency lookups
  // below detect whether THIS user already accepted (→ retry succeeds)
  // vs. whether someone else used the token (→ 409 via name_taken).

  // Compute trial_ends_at from trial_days. Both legacy is_trial /
  // trial_started_at and the new trial_ends_at + status fields are
  // populated so existing code paths (eg get-user-context's
  // plan-during-trial override) keep working.
  const trialDays = invitation.trial_days || 30
  const now = new Date()
  const trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000)

  // ---- (2) Idempotent retry: this user already owns the org? ---------
  // Join organization_members → organizations and filter by both the
  // user id and the org name. A row here means the prior attempt
  // succeeded end-to-end (or at least past step 3) and the user is
  // retrying — just return success.
  const { data: ownedMembership } = await db
    .from('organization_members')
    .select('organization_id, organizations!inner(id, name, trial_ends_at)')
    .eq('user_id', user.id)
    .eq('role', 'owner')
    .eq('organizations.name', organizationName)
    .maybeSingle()

  if (ownedMembership) {
    // Defensive: also stamp invitation.accepted_at if a prior retry
    // managed to create the org+membership but never made it to the
    // stamp step.
    if (!invitation.accepted_at) {
      await db
        .from('owner_invitations')
        .update({ accepted_at: now.toISOString(), trial_ends_at: trialEndsAt.toISOString() })
        .eq('id', invitation.id)
    }
    return NextResponse.json({
      success: true,
      organizationId: ownedMembership.organization_id,
      trialEndsAt: ownedMembership.organizations?.trial_ends_at || trialEndsAt.toISOString(),
      alreadyExisted: true,
    })
  }

  // ---- (3) Org with this name exists but owned by someone else? -----
  const { data: existingByName } = await db
    .from('organizations')
    .select('id')
    .eq('name', organizationName)
    .maybeSingle()

  if (existingByName) {
    const { data: existingOwner } = await db
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', existingByName.id)
      .eq('role', 'owner')
      .maybeSingle()

    if (existingOwner && existingOwner.user_id !== user.id) {
      return errorResponse('name_taken', 409, 'organization name taken')
    }

    // Orphan or partial-state recovery: org exists, this user can
    // legitimately claim it. Upsert the membership row.
    const { error: claimErr } = await db
      .from('organization_members')
      .upsert(
        { organization_id: existingByName.id, user_id: user.id, role: 'owner' },
        { onConflict: 'organization_id,user_id' },
      )
    if (claimErr) {
      return errorResponse('server_error', 500, claimErr.message)
    }
    if (!invitation.accepted_at) {
      await db
        .from('owner_invitations')
        .update({ accepted_at: now.toISOString(), trial_ends_at: trialEndsAt.toISOString() })
        .eq('id', invitation.id)
    }
    return NextResponse.json({
      success: true,
      organizationId: existingByName.id,
      trialEndsAt: trialEndsAt.toISOString(),
      alreadyExisted: true,
    })
  }

  // ---- (4) First-time create path ------------------------------------
  const { data: org, error: orgErr } = await db
    .from('organizations')
    .insert({
      name: organizationName,
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
    // Race: between our SELECT above and this INSERT another request
    // (the same user double-clicking, or a parallel tab) won the
    // insert. Re-run the idempotency lookup and return the winner if
    // it's us. The unique-constraint code from Postgres is '23505'.
    const isUniqueViolation =
      orgErr && typeof orgErr === 'object' && 'code' in orgErr && orgErr.code === '23505'
    if (isUniqueViolation) {
      const { data: racedOrg } = await db
        .from('organizations')
        .select('id, trial_ends_at')
        .eq('name', organizationName)
        .maybeSingle()
      if (racedOrg) {
        await db
          .from('organization_members')
          .upsert(
            { organization_id: racedOrg.id, user_id: user.id, role: 'owner' },
            { onConflict: 'organization_id,user_id' },
          )
        if (!invitation.accepted_at) {
          await db
            .from('owner_invitations')
            .update({ accepted_at: now.toISOString(), trial_ends_at: trialEndsAt.toISOString() })
            .eq('id', invitation.id)
        }
        return NextResponse.json({
          success: true,
          organizationId: racedOrg.id,
          trialEndsAt: racedOrg.trial_ends_at || trialEndsAt.toISOString(),
          alreadyExisted: true,
        })
      }
    }
    return errorResponse('server_error', 500, orgErr?.message || 'Failed to create organization')
  }

  const { error: memberErr } = await db
    .from('organization_members')
    .upsert(
      { organization_id: org.id, user_id: user.id, role: 'owner' },
      { onConflict: 'organization_id,user_id' },
    )
  if (memberErr) {
    return errorResponse('server_error', 500, memberErr.message)
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
