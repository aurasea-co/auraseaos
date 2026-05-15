import { Resend } from 'resend'
import { render } from '@react-email/render'
import { createServiceClient } from '@/lib/supabase/service'

export const EMAIL_SENDERS = {
  notifications: 'Aurasea <noreply@auraseaos.com>',
  reports: 'Aurasea Reports <report@auraseaos.com>',
  team: 'Aurasea <hello@auraseaos.com>',
} as const

// Lazy init to avoid build-time error when env var is empty
let _resend: Resend | null = null
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY!)
  return _resend
}

export async function sendEmail({
  to,
  from,
  subject,
  react,
  organizationId,
  branchId,
  userId,
  notificationType,
  metricDate,
}: {
  to: string
  from?: string
  subject: string
  react: React.ReactElement
  organizationId: string
  branchId?: string
  userId: string
  notificationType: string
  metricDate?: string
}) {
  const supabase = createServiceClient()

  try {
    // Render React Email to HTML first to avoid internal render issues
    const html = await render(react)

    const { error } = await getResend().emails.send({
      from: from || EMAIL_SENDERS.notifications,
      to,
      subject,
      html,
    })

    if (error) throw new Error(error.message)

    await supabase.from('notification_log').insert({
      organization_id: organizationId,
      branch_id: branchId || null,
      user_id: userId,
      notification_type: notificationType,
      channel: 'email',
      metric_date: metricDate || null,
      status: 'sent',
    })

    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const stack = err instanceof Error ? err.stack : undefined

    await supabase.from('notification_log').insert({
      organization_id: organizationId,
      branch_id: branchId || null,
      user_id: userId,
      notification_type: notificationType,
      channel: 'email',
      metric_date: metricDate || null,
      status: 'failed',
      error_text: message,
    })

    console.error('Email send failed - full error:', { message, stack, name: (err as Error)?.name })
    return { success: false, error: message }
  }
}
