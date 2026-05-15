import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { Resend } from 'resend'
import { render } from '@react-email/render'
import { EMAIL_SENDERS } from '@/lib/email/resend'
import WeeklyReport from '@/lib/email/templates/weeklyReport'
import { getTodayBangkok, toBangkokDateStr } from '@/lib/businessDate'

interface Aggregates {
  daysWithData: number
  totalRevenue: number
  avgAdr: number | undefined
  avgOccupancy: number | undefined
  avgMargin: number | undefined
  avgCovers: number | undefined
  avgSpend: number | undefined
}

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

  // Pro organizations only
  const { data: orgs } = await supabase.from('organizations').select('id, name, plan').eq('plan', 'pro')
  const results: string[] = []

  for (const org of orgs || []) {
    // Owner role only (spec: weekly report is owner-only).
    const { data: owners } = await supabase
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', org.id)
      .eq('role', 'owner')
    if (!owners?.length) continue

    const { data: { users } } = await supabase.auth.admin.listUsers()
    const ownerUser = users?.find((u) => u.id === owners[0].user_id)
    if (!ownerUser?.email) continue

    const { data: branches } = await supabase
      .from('branches')
      .select('id, name, business_type')
      .eq('organization_id', org.id)

    for (const branch of branches || []) {
      const now = new Date()
      const currentStart = new Date(now)
      currentStart.setDate(currentStart.getDate() - 7)
      const previousStart = new Date(now)
      previousStart.setDate(previousStart.getDate() - 14)

      const currentStartStr = toBangkokDateStr(currentStart.toISOString())
      const previousStartStr = toBangkokDateStr(previousStart.toISOString())

      // Pull 14 days in one round-trip and split client-side.
      const { data: rows } = await supabase
        .from('branch_daily_metrics')
        .select('*')
        .eq('branch_id', branch.id)
        .gte('metric_date', previousStartStr)
        .order('metric_date', { ascending: true })

      const currentRows = (rows || []).filter((r) => String(r.metric_date) >= currentStartStr)
      if (!currentRows.length) continue

      const previousRows = (rows || []).filter((r) => String(r.metric_date) < currentStartStr)

      const current = aggregate(currentRows)
      const previous = previousRows.length > 0 ? aggregate(previousRows) : undefined

      const weekStart = currentStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      const weekEnd = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      const weekRange = `${weekStart} – ${weekEnd}`
      const subject = `Aurasea Weekly Report — ${branch.name} — ${weekRange}`

      const html = await render(
        WeeklyReport({
          branchName: branch.name,
          weekRange,
          lang: 'th',
          branchType: branch.business_type as 'accommodation' | 'fnb',
          daysWithData: current.daysWithData,
          totalRevenue: current.totalRevenue,
          avgAdr: current.avgAdr,
          avgOccupancy: current.avgOccupancy,
          avgMargin: current.avgMargin,
          avgCovers: current.avgCovers,
          avgSpend: current.avgSpend,
          prev: previous
            ? {
                totalRevenue: previous.totalRevenue,
                avgAdr: previous.avgAdr,
                avgOccupancy: previous.avgOccupancy,
                avgMargin: previous.avgMargin,
                avgCovers: previous.avgCovers,
                avgSpend: previous.avgSpend,
              }
            : undefined,
          dashboardUrl: 'https://app.auraseaos.com/home',
        }),
      )

      await resend.emails.send({
        from: EMAIL_SENDERS.reports,
        to: ownerUser.email,
        subject,
        html,
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

function aggregate(rows: Array<Record<string, unknown>>): Aggregates {
  const num = (v: unknown): number | null => {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  const meanOfDefined = (vals: Array<number | null>): number | undefined => {
    const present = vals.filter((v): v is number => v != null)
    if (present.length === 0) return undefined
    return present.reduce((s, v) => s + v, 0) / present.length
  }

  const revenues = rows.map((r) => num(r.revenue)).filter((v): v is number => v != null && v > 0)
  const adrs = rows.map((r) => num(r.adr)).filter((v): v is number => v != null && v > 0)
  const occs = rows.map((r) => num(r.occupancy_rate))
  const margins = rows.map((r) => num(r.margin)).filter((v): v is number => v != null && v > 0)
  const covers = rows.map((r) => num(r.customers))
  const avgTickets = rows.map((r) => num(r.avg_ticket)).filter((v): v is number => v != null && v > 0)

  return {
    daysWithData: rows.length,
    totalRevenue: revenues.reduce((s, v) => s + v, 0),
    avgAdr: adrs.length ? adrs.reduce((s, v) => s + v, 0) / adrs.length : undefined,
    avgOccupancy: meanOfDefined(occs),
    avgMargin: margins.length ? margins.reduce((s, v) => s + v, 0) / margins.length : undefined,
    avgCovers: meanOfDefined(covers),
    avgSpend: avgTickets.length ? avgTickets.reduce((s, v) => s + v, 0) / avgTickets.length : undefined,
  }
}
