import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { Resend } from 'resend'
import { EMAIL_SENDERS } from '@/lib/email/resend'
import { getTodayBangkok, toBangkokDateStr } from '@/lib/businessDate'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const resend = new Resend(process.env.RESEND_API_KEY)

  // Get all Pro organizations
  const { data: orgs } = await supabase.from('organizations').select('id, name, plan').eq('plan', 'pro')
  const results: string[] = []

  for (const org of orgs || []) {
    // Get owner
    const { data: owners } = await supabase.from('organization_members').select('user_id').eq('organization_id', org.id).eq('role', 'owner')
    if (!owners?.length) continue

    // Get owner email
    const { data: { users } } = await supabase.auth.admin.listUsers()
    const ownerUser = users?.find((u) => u.id === owners[0].user_id)
    if (!ownerUser?.email) continue

    // Get branches
    const { data: branches } = await supabase.from('branches').select('id, name, business_type').eq('organization_id', org.id)

    for (const branch of branches || []) {
      // Get last 7 days metrics
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - 7)
      const { data: metrics } = await supabase
        .from('branch_daily_metrics')
        .select('*')
        .eq('branch_id', branch.id)
        .gte('metric_date', toBangkokDateStr(startDate.toISOString()))
        .order('metric_date', { ascending: true })

      if (!metrics?.length) continue

      // Build simple text report (PDF generation requires @react-pdf at runtime)
      // For now, send as rich HTML email with metrics table
      const isHotel = branch.business_type === 'accommodation'
      const weekStart = startDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      const weekEnd = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

      const avgAdr = metrics.filter((m) => m.adr).reduce((s, m) => s + (m.adr || 0), 0) / (metrics.filter((m) => m.adr).length || 1)
      const avgOcc = metrics.filter((m) => m.occupancy_rate != null).reduce((s, m) => s + (m.occupancy_rate || 0), 0) / (metrics.filter((m) => m.occupancy_rate != null).length || 1)
      const totalRevenue = metrics.reduce((s, m) => s + m.revenue, 0)
      const avgMargin = metrics.filter((m) => m.margin != null).reduce((s, m) => s + (m.margin || 0), 0) / (metrics.filter((m) => m.margin != null).length || 1)

      const subject = `Aurasea Weekly Report — ${branch.name} — ${weekStart}–${weekEnd}`

      await resend.emails.send({
        from: EMAIL_SENDERS.reports,
        to: ownerUser.email,
        subject,
        html: `
          <div style="max-width:600px;margin:0 auto;font-family:-apple-system,Arial,sans-serif;background:#fff;padding:32px;border-radius:8px">
            <div style="background:#534AB7;margin:-32px -32px 24px;padding:24px 32px;border-radius:8px 8px 0 0">
              <div style="color:#fff;font-size:16px">aurasea</div>
              <div style="color:#fff;font-size:20px;font-weight:bold;margin-top:8px">${branch.name}</div>
              <div style="color:rgba(255,255,255,0.8);font-size:13px;margin-top:4px">Weekly Report · ${weekStart} – ${weekEnd}</div>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              ${isHotel ? `
                <tr><td style="padding:8px 0;color:#9b9b9b">ADR avg</td><td style="text-align:right;font-weight:bold">฿${Math.round(avgAdr).toLocaleString()}</td></tr>
                <tr><td style="padding:8px 0;color:#9b9b9b">Occupancy avg</td><td style="text-align:right;font-weight:bold">${avgOcc.toFixed(1)}%</td></tr>
              ` : `
                <tr><td style="padding:8px 0;color:#9b9b9b">Margin avg</td><td style="text-align:right;font-weight:bold">${avgMargin.toFixed(1)}%</td></tr>
              `}
              <tr><td style="padding:8px 0;color:#9b9b9b">Revenue total</td><td style="text-align:right;font-weight:bold">฿${totalRevenue.toLocaleString()}</td></tr>
              <tr><td style="padding:8px 0;color:#9b9b9b">Days with data</td><td style="text-align:right;font-weight:bold">${metrics.length}/7</td></tr>
            </table>
            <div style="margin-top:16px;font-size:11px;color:#9b9b9b;text-align:center">PDF report with charts coming soon</div>
          </div>
        `,
      })

      await supabase.from('notification_log').insert({
        organization_id: org.id,
        branch_id: branch.id,
        user_id: owners[0].user_id,
        notification_type: 'weekly_report',
        channel: 'email',
        metric_date: getTodayBangkok(),
        status: 'sent',
      })

      results.push(branch.name)
    }
  }

  return NextResponse.json({ sent: results.length, branches: results })
}
