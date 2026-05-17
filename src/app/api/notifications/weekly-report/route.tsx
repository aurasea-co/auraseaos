import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { Resend } from 'resend'
import { render } from '@react-email/render'
import { renderToBuffer } from '@react-pdf/renderer'
import { EMAIL_SENDERS } from '@/lib/email/resend'
import WeeklyReport from '@/lib/email/templates/weeklyReport'
import WeeklyReportPdf from '@/lib/email/templates/weeklyReportPdf'
import {
  buildBranchReport,
  buildPortfolio,
  formatBangkokDate,
  type BranchReport,
  type BranchTargets,
} from '@/lib/notifications/weeklyReportData'
import { getTodayBangkok, toBangkokDateStr } from '@/lib/businessDate'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && req.headers.get('x-vercel-cron') !== '1') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return handleWeeklyReport()
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && req.headers.get('x-vercel-cron') !== '1') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return handleWeeklyReport()
}

async function handleWeeklyReport() {
  const supabase = createServiceClient()
  const resend = new Resend(process.env.RESEND_API_KEY)

  // Pro organizations only.
  const { data: orgs } = await supabase.from('organizations').select('id, name, plan').eq('plan', 'pro')
  const results: Array<{ owner: string; branches: number; status: 'sent' | 'failed' }> = []

  // Single auth.users listing — we'll resolve emails by id below.
  const { data: { users } } = await supabase.auth.admin.listUsers()

  for (const org of orgs || []) {
    // Owner role only (weekly report is owner-only per spec).
    const { data: owners } = await supabase
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', org.id)
      .eq('role', 'owner')
    if (!owners?.length) continue

    const ownerUserId = owners[0].user_id
    const ownerUser = users?.find((u) => u.id === ownerUserId)
    if (!ownerUser?.email) continue

    const { data: branches } = await supabase
      .from('branches')
      .select('id, name, business_type')
      .eq('organization_id', org.id)

    if (!branches?.length) continue

    // Window: previous 30 days (current 7 + prior 7 for the WoW
    // comparison + ~16 days of trailing history used purely for the
    // per-day marginFallback rolling avg in the F&B breakdown table).
    const now = new Date()
    const currentStart = new Date(now)
    currentStart.setDate(currentStart.getDate() - 7)
    const previousStart = new Date(now)
    previousStart.setDate(previousStart.getDate() - 14)
    const historyStart = new Date(now)
    historyStart.setDate(historyStart.getDate() - 30)
    const currentStartStr = toBangkokDateStr(currentStart.toISOString())
    const previousStartStr = toBangkokDateStr(previousStart.toISOString())
    const historyStartStr = toBangkokDateStr(historyStart.toISOString())

    // Build BranchReport for every branch in this org. Skip branches with
    // zero rows in the current week.
    const reports: BranchReport[] = []
    for (const branch of branches) {
      const { data: rows } = await supabase
        .from('branch_daily_metrics')
        .select('*')
        .eq('branch_id', branch.id)
        .gte('metric_date', historyStartStr)
        .order('metric_date', { ascending: true })

      const { data: target } = await supabase
        .from('targets')
        .select('adr_target, cogs_target, occupancy_target, covers_target, avg_spend_target')
        .eq('branch_id', branch.id)
        .maybeSingle()

      const targets: BranchTargets = {
        adr: Number(target?.adr_target) || undefined,
        occupancy: Number(target?.occupancy_target) || undefined,
        margin: target?.cogs_target != null ? 100 - Number(target.cogs_target) : undefined,
        covers: Number(target?.covers_target) || undefined,
        avgSpend: Number(target?.avg_spend_target) || undefined,
      }

      const report = buildBranchReport({
        branchId: branch.id,
        branchName: branch.name,
        branchType: branch.business_type as 'accommodation' | 'fnb',
        weekStart: currentStart,
        weekEnd: now,
        rows: rows ?? [],
        currentStartStr,
        previousStartStr,
        targets,
        locale: 'th',
      })
      if (report) reports.push(report)
    }

    if (reports.length === 0) continue

    const portfolio = buildPortfolio(reports) ?? undefined

    // Range reads "10 พ.ค. – 17 พ.ค. 69" — year only on the end date so it
    // doesn't appear twice.
    const weekStart = formatBangkokDate(currentStart, 'th', { withYear: false })
    const weekEnd = formatBangkokDate(now, 'th', { withYear: true })
    const weekRange = `${weekStart} – ${weekEnd}`
    const orgPart = reports.length > 1 ? org.name || 'All branches' : reports[0].branchName
    const subject = `Aurasea Weekly Report — ${orgPart} — ${weekRange}`

    let pdfBuffer: Buffer | null = null
    try {
      pdfBuffer = await renderToBuffer(
        <WeeklyReportPdf weekRange={weekRange} reports={reports} portfolio={portfolio} />,
      )
    } catch (err) {
      console.error('[weekly-report] PDF render failed; sending email without attachment:', err)
    }

    const html = await render(
      <WeeklyReport
        weekRange={weekRange}
        lang="th"
        reports={reports}
        portfolio={portfolio}
        dashboardUrl="https://app.auraseaos.com/home"
      />,
    )

    const pdfFilename = `Aurasea-Weekly-${(orgPart || 'report').replace(/\s+/g, '_')}-${toBangkokDateStr(currentStart.toISOString())}.pdf`

    let status: 'sent' | 'failed' = 'sent'
    try {
      const sendResult = await resend.emails.send({
        from: EMAIL_SENDERS.reports,
        to: ownerUser.email,
        subject,
        html,
        attachments: pdfBuffer
          ? [{ filename: pdfFilename, content: pdfBuffer }]
          : undefined,
      })
      if (sendResult.error) {
        status = 'failed'
        console.error('[weekly-report] Resend error:', sendResult.error)
      } else {
        console.log(`[weekly-report] sent to ${ownerUser.email} branches=${reports.length} (pdf=${pdfBuffer != null})`)
      }
    } catch (err) {
      status = 'failed'
      console.error('[weekly-report] send threw:', err)
    }

    // Single log row per owner per cron tick — matches the new per-owner
    // dispatch shape. branch_id is null because the email covers every
    // branch the owner has.
    await supabase.from('notification_log').insert({
      organization_id: org.id,
      branch_id: null,
      user_id: ownerUserId,
      notification_type: 'weekly_report',
      channel: 'email',
      metric_date: getTodayBangkok(),
      status,
    })

    results.push({ owner: ownerUser.email, branches: reports.length, status })
  }

  return NextResponse.json({ count: results.length, results })
}
