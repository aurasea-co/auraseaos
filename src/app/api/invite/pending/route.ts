import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// GET /api/invite/pending
//
// Returns the most recent unaccepted, unexpired invitation for the
// currently-signed-in user's email, or { pending: null } if none.
//
// Used by two pages that need to nudge the user onto /join:
//   • /reset-password — after the password update, if the user has a
//     pending invite waiting, we route them to /join instead of /login
//     so they don't get bounced through /account-setup.
//   • /account-setup — if a user lands here with a pending invite
//     (e.g. opened the email-link flow without going through /join),
//     we surface an "Accept invitation" CTA instead of a dead end.
//
// The invitations table is RLS-protected (owner-only), so we use the
// service-role client and scope the query to the authenticated user's
// email. No email parameter is accepted — the caller can't ask about
// someone else's invitations.

export async function GET() {
  const userClient = await createClient()
  const { data: userRes } = await userClient.auth.getUser()
  const user = userRes?.user
  if (!user?.email) {
    return NextResponse.json({ pending: null })
  }

  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data } = await db
    .from('invitations')
    .select(`
      token,
      role,
      organizations:organization_id ( name ),
      branches:branch_id ( name )
    `)
    .eq('invitee_email', user.email)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) {
    return NextResponse.json({ pending: null })
  }

  return NextResponse.json({
    pending: {
      token: data.token,
      role: data.role,
      organizationName: data.organizations?.name || '',
      branchName: data.branches?.name || null,
    },
  })
}
