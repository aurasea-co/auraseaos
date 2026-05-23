import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendLineMessage } from '@/lib/line/messaging'

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

  // Enable LINE notifications + stamp when the link happened. The
  // line_notify_connected_at column was added in migration 024.
  const { data: orgRow } = await serviceClient
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()
  if (orgRow?.organization_id) {
    await serviceClient
      .from('notification_settings')
      .upsert(
        {
          user_id: user.id,
          organization_id: orgRow.organization_id,
          line_notify_enabled: true,
          line_notify_connected_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,organization_id' }
      )
  }

  // Confirm connection back to the user's LINE chat. Best-effort: link is
  // already persisted at this point, so a delivery failure here must not
  // block the redirect.
  await sendLineMessage(
    lineUserId,
    'เชื่อมต่อสำเร็จ ✅\n\nบัญชี Aurasea OS ของคุณเชื่อมต่อกับ LINE แล้ว\nคุณจะได้รับสรุปธุรกิจทุกเช้า 7.00 น.\n\nหากต้องการยกเลิก ไปที่ Settings → Notifications'
  )

  return NextResponse.redirect(new URL('/settings/notifications?line=connected', req.url))
}
