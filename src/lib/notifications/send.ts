import { createServiceClient } from '@/lib/supabase/service'
import { sendEmail } from '@/lib/email/resend'
// TODO: Implement Line Messaging API in Phase 6
// import { sendLineNotify } from '@/lib/line/messaging'

interface NotificationPayload {
  userId: string
  organizationId: string
  branchId?: string
  type: string
  emailSubject: string
  emailReact: React.ReactElement
  lineMessage: string
  metricDate?: string
  /**
   * When true, suppress the email channel for this dispatch regardless of
   * the user's email_notifications setting. Used by morning-flash, where
   * email is opt-in per organization via notification_settings
   * .morning_flash_email_enabled. LINE delivery is unaffected.
   */
  skipEmail?: boolean
  /**
   * When true, suppress the LINE channel for this dispatch regardless of
   * line_notify_enabled. Used by morning-flash to dispatch the per-branch
   * email through sendNotification while delivering a single combined LINE
   * message for all branches once per user, outside this helper.
   */
  skipLine?: boolean
}

// Daily email caps per role
const EMAIL_CAPS: Record<string, number> = {
  owner: 20,    // TESTING — change back to 4 before launch
  manager: 1,   // reminder only
  staff: 0,     // never
  superadmin: 20,
}

export async function sendNotification(payload: NotificationPayload) {
  const supabase = createServiceClient()

  // Get user settings
  const { data: settings } = await supabase
    .from('notification_settings')
    .select('email_notifications, line_notify_enabled, line_notify_token')
    .eq('user_id', payload.userId)
    .eq('organization_id', payload.organizationId)
    .maybeSingle()

  // Get user role
  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('user_id', payload.userId)
    .eq('organization_id', payload.organizationId)
    .maybeSingle()

  const userRole = membership?.role || 'staff'
  const dailyCap = EMAIL_CAPS[userRole] ?? 0

  // Get email from auth.users via service role
  const { data: { user: authUser } } = await supabase.auth.admin.getUserById(payload.userId)
  const userEmail = authUser?.email

  const promises: Promise<unknown>[] = []

  // Email channel — check daily cap before sending. Callers can also veto
  // email entirely via payload.skipEmail (used by morning-flash, where the
  // email channel is opt-in per org).
  if (!payload.skipEmail && (settings?.email_notifications ?? true) && userEmail) {
    // Count emails already sent to this user today
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)

    const { count } = await supabase
      .from('notification_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', payload.userId)
      .eq('channel', 'email')
      .gte('sent_at', todayStart.toISOString())

    if ((count ?? 0) >= dailyCap) {
      // Cap reached — log as skipped, do not send
      await supabase.from('notification_log').insert({
        user_id: payload.userId,
        organization_id: payload.organizationId,
        branch_id: payload.branchId || null,
        notification_type: payload.type,
        channel: 'email',
        metric_date: payload.metricDate || null,
        status: 'skipped',
        error_text: `Daily email cap reached (${dailyCap} for ${userRole})`,
      })
    } else {
      promises.push(
        sendEmail({
          to: userEmail,
          subject: payload.emailSubject,
          react: payload.emailReact,
          userId: payload.userId,
          organizationId: payload.organizationId,
          branchId: payload.branchId,
          notificationType: payload.type,
          metricDate: payload.metricDate,
        })
      )
    }
  }

  // Line Messaging API channel. Callers can also veto LINE entirely via
  // payload.skipLine (used by morning-flash, which sends one combined LINE
  // message per user covering all branches outside of this helper).
  if (!payload.skipLine && settings?.line_notify_enabled) {
    // Get user's line_id from profiles
    const { data: profile } = await supabase
      .from('profiles')
      .select('line_id')
      .eq('user_id', payload.userId)
      .maybeSingle()

    if (profile?.line_id) {
      const { sendLineMessage } = await import('@/lib/line/messaging')
      promises.push(
        sendLineMessage(profile.line_id, payload.lineMessage).then((ok) => {
          supabase.from('notification_log').insert({
            user_id: payload.userId,
            organization_id: payload.organizationId,
            branch_id: payload.branchId || null,
            notification_type: payload.type,
            channel: 'line',
            metric_date: payload.metricDate || null,
            status: ok ? 'sent' : 'failed',
          })
        })
      )
    }
  }

  await Promise.allSettled(promises)
}
