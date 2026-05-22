import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// invitee role ('manager' | 'staff') maps 1:1 onto branch_members.role.
// Despite what types.ts says ('branch_manager' | 'branch_user' | 'viewer'),
// the live CHECK constraint `branch_members_role_check` accepts the same
// values invitations.role does — 'manager' and 'staff'. get-user-context.ts
// already treats 'manager' and 'branch_manager' as interchangeable on the
// read side, so the rest of the app handles either value.
// (organization_members is owner-only; see comment below.)

export async function POST(req: NextRequest) {
  let body: { token?: string; displayName?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const token = body.token
  const submittedDisplayName = body.displayName?.trim() || ''
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

  // Schema reality check (verified from get-user-context.ts + the
  // organization_members.role CHECK constraint "org_role_check"):
  //   organization_members  → owners only. The CHECK constraint rejects
  //                           any role other than 'owner', so we must NOT
  //                           insert 'manager' here even though types.ts
  //                           claims it's allowed.
  //   branch_members        → 'branch_manager' | 'branch_user' | 'viewer'.
  //
  // So invited 'manager' and 'staff' both land in branch_members; the
  // app derives the AppRole from branch_members.role in get-user-context.

  if (!branch_id) {
    return NextResponse.json(
      { error: role === 'manager' ? 'Manager invitation missing branch' : 'Staff invitation missing branch' },
      { status: 400 },
    )
  }

  // Pass the invited role through verbatim — see header comment.
  const branchRole = role

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function fail(step: string, err: any) {
    const message = err?.message || 'unknown error'
    console.error(`[invite/accept] step=${step} failed:`, err)
    // "permission denied" almost always means a custom trigger or RLS
    // policy is reaching for a table the service_role can't access (in
    // this project's history, that's usually an unqualified `users`
    // reference inside a function — make sure any helper function /
    // trigger uses SECURITY DEFINER and qualifies as auth.users).
    const hint = /permission denied/i.test(message)
      ? ' (likely a trigger or RLS policy on this table is querying a "users" table the service_role lacks access to — check is_super_admin() or any custom trigger on this table is SECURITY DEFINER and references auth.users explicitly)'
      : ''
    return NextResponse.json(
      { error: `${step}: ${message}${hint}` },
      { status: 500 },
    )
  }

  // 1) Membership
  //
  // We also pass `email` here even though branch_members.user_id is the
  // canonical FK. There's a `fill_branch_member_email` trigger that
  // reads auth.users.email to populate a denormalized email column;
  // under service_role that SELECT can fail with "permission denied for
  // table users" because service_role lacks SELECT on auth.users. If
  // the trigger is guarded with WHEN (NEW.email IS NULL) — which we
  // can't tell from prosrc alone — pre-filling email skips the trigger
  // entirely. If the trigger fires unconditionally, see migration 021
  // which converts these helpers to SECURITY DEFINER.
  const { error: branchErr } = await db
    .from('branch_members')
    .upsert(
      {
        branch_id,
        user_id: user.id,
        role: branchRole,
        email: user.email,
      },
      { onConflict: 'branch_id,user_id' },
    )
  if (branchErr) return fail('branch_members.upsert', branchErr)

  // 2) Profile row so display_name lookups don't return null.
  // The user's own anon client could also handle this (RLS allows
  // auth.uid() = user_id) — but we stay on service_role for consistency.
  const emailPrefix = (user.email || '').split('@')[0] || 'member'
  const finalDisplayName = submittedDisplayName || emailPrefix
  const profileUpsertOpts = submittedDisplayName
    // Explicit name from the join form — write through even if a profile
    // already exists (handles users who joined a different org first).
    ? { onConflict: 'user_id' as const }
    : { onConflict: 'user_id' as const, ignoreDuplicates: true }
  // Mirror email on profiles (added in migration 023) so the team
  // list doesn't have to hit auth.users for every read.
  const { error: profileErr } = await db
    .from('profiles')
    .upsert(
      {
        user_id: user.id,
        display_name: finalDisplayName,
        email: user.email,
      },
      profileUpsertOpts,
    )
  if (profileErr) return fail('profiles.upsert', profileErr)

  // 3) Notification settings — starting point for /settings/notifications.
  //
  // entry_reminder_enabled is explicitly false for new invited members
  // so they don't get pinged at 10:00 PM the same day they join (annoying
  // first impression). They can opt in from /settings/notifications.
  //
  // Note: if entry_reminder_enabled still defaults to true at the DB
  // level, run:
  //   ALTER TABLE notification_settings
  //     ALTER COLUMN entry_reminder_enabled SET DEFAULT false;
  // …so any other code path that inserts without specifying this column
  // also opts new users out.
  // Staff don't receive email notifications by default — the
  // /settings/notifications page hides the email + LINE toggles for
  // staff entirely, so leaving email_notifications=true would be a
  // setting they can't see or change.
  const emailNotificationsDefault = role !== 'staff'
  const { error: notifErr } = await db.from('notification_settings').upsert(
    {
      user_id: user.id,
      organization_id,
      email_notifications: emailNotificationsDefault,
      line_notify_enabled: false,
      entry_reminder_enabled: false,
    },
    { onConflict: 'user_id,organization_id', ignoreDuplicates: true },
  )
  if (notifErr) return fail('notification_settings.upsert', notifErr)

  // 4) Mark invitation accepted
  const { error: inviteErr } = await db
    .from('invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invitation.id)
  if (inviteErr) return fail('invitations.update', inviteErr)

  return NextResponse.json({
    success: true,
    organizationId: organization_id,
    branchId: branch_id,
  })
}
