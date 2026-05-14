import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(req: NextRequest) {
  const lineUserIdB64 = req.nextUrl.searchParams.get('lineUserId')
  if (!lineUserIdB64) {
    return NextResponse.redirect(new URL('/settings/notifications?line=error', req.url))
  }

  const lineUserId = Buffer.from(lineUserIdB64, 'base64').toString()

  // Check if user is logged in
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    // Redirect to login, then back here
    const returnUrl = `/api/line/link?lineUserId=${lineUserIdB64}`
    return NextResponse.redirect(new URL(`/login?returnTo=${encodeURIComponent(returnUrl)}`, req.url))
  }

  // Save line_id to profiles
  const serviceClient = createServiceClient()
  await serviceClient
    .from('profiles')
    .upsert({ user_id: user.id, line_id: lineUserId }, { onConflict: 'user_id' })

  // Also enable Line notifications
  await serviceClient
    .from('notification_settings')
    .upsert(
      { user_id: user.id, organization_id: (await serviceClient.from('organization_members').select('organization_id').eq('user_id', user.id).limit(1).single()).data?.organization_id, line_notify_enabled: true },
      { onConflict: 'user_id,organization_id' }
    )

  return NextResponse.redirect(new URL('/settings/notifications?line=connected', req.url))
}
