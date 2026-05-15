import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendNotification } from '@/lib/notifications/send'
import MorningFlash from '@/lib/email/templates/morningFlash'
import { buildMorningFlashLine } from '@/lib/line/messaging'
import { getTodayBangkok } from '@/lib/businessDate'

async function handleMorningFlash(req: NextRequest) {
  // Allowed callers:
  //   - Vercel cron (sends GET with header `x-vercel-cron: 1`)
  //   - Manual cron / scripts (Authorization: Bearer $CRON_SECRET)
  //   - Entry-form trigger (POST with header `x-from-entry-form: true`)
  const authHeader = req.headers.get('authorization')
  const isFromEntryForm = req.headers.get('x-from-entry-form') === 'true'

  if (!isFromEntryForm && authHeader !== `Bearer ${process.env.CRON_SECRET}` && req.headers.get('x-vercel-cron') !== '1') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const today = getTodayBangkok()

  // If triggered from entry form, send for specific org
  let body: { branchId?: string; organizationId?: string } = {}
  try { body = await req.json() } catch { /* cron call — no body */ }

  // Recipients = anyone opted in to LINE for this org, OR explicitly opted
  // in to the morning-flash email. Email is opt-in only — defaulting to
  // false means existing users get LINE-only morning flashes after the
  // migration adds `morning_flash_email_enabled` with DEFAULT false.
  const query = supabase
    .from('notification_settings')
    .select('user_id, organization_id, email_notifications, line_notify_enabled, morning_flash_email_enabled')
    .or('line_notify_enabled.eq.true,morning_flash_email_enabled.eq.true')

  if (body.organizationId) {
    query.eq('organization_id', body.organizationId)
  }

  const { data: settingsList } = await query
  const results: { userId: string; status: string }[] = []

  for (const setting of settingsList || []) {
    // Role filter: morning flash is for owner + manager only.
    // Staff (branch_members) and any user without an organization_members row
    // are excluded.
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', setting.user_id)
      .eq('organization_id', setting.organization_id)
      .maybeSingle()

    if (membership?.role !== 'owner' && membership?.role !== 'manager') continue

    // Check not already sent today
    const { data: alreadySent } = await supabase
      .from('notification_log')
      .select('id')
      .eq('user_id', setting.user_id)
      .eq('notification_type', 'morning_flash')
      .eq('metric_date', today)
      .maybeSingle()

    if (alreadySent) continue

    // Get org info
    const { data: org } = await supabase.from('organizations').select('*').eq('id', setting.organization_id).single()
    if (!org) continue

    // Get branches for this org
    const { data: branches } = await supabase.from('branches').select('*').eq('organization_id', setting.organization_id)

    for (const branch of branches || []) {
      // Fetch the last 30 daily rows so we can compute a 30-day rolling avg
      // margin alongside the latest-day values.
      const { data: metrics } = await supabase
        .from('branch_daily_metrics')
        .select('*')
        .eq('branch_id', branch.id)
        .order('metric_date', { ascending: false })
        .limit(30)

      const latest = metrics?.[0]
      if (!latest) continue

      // 30-day average of the daily margin column, ignoring null/zero days.
      const marginValues = (metrics || [])
        .map((m: Record<string, unknown>) => Number(m.margin))
        .filter((v) => Number.isFinite(v) && v > 0)
      const marginAvg = marginValues.length > 0
        ? marginValues.reduce((s, v) => s + v, 0) / marginValues.length
        : undefined

      // Avg per-cover spend: prefer the view's `avg_ticket` column. If null
      // (legacy rows) fall back to revenue/customers when both are present.
      const avgTicket = Number(latest.avg_ticket) || 0
      const revenueNum = Number(latest.revenue) || 0
      const coversNum = Number(latest.customers) || 0
      const avgSpend = avgTicket > 0
        ? avgTicket
        : (coversNum > 0 ? revenueNum / coversNum : undefined)

      // Get targets
      const { data: targets } = await supabase.from('targets').select('*').eq('branch_id', branch.id).maybeSingle()

      const isHotel = branch.business_type === 'accommodation'
      const recommendation = isHotel
        ? (latest.adr || 0) >= (Number(targets?.adr_target) || 0) ? 'ADR ตามเป้า — รักษาระดับ' : 'ADR ต่ำกว่าเป้า — ลองเพิ่ม direct booking'
        : (latest.margin || 0) >= (100 - Number(targets?.cogs_target || 32)) ? 'Margin ตามเป้า' : 'Margin ต่ำกว่าเป้า — ตรวจสอบ COGS'

      const dateStr = new Date(latest.metric_date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })

      const emailProps = {
        branchName: branch.name,
        businessDate: dateStr,
        lang: 'th' as const,
        branchType: branch.business_type as 'accommodation' | 'fnb',
        adr: latest.adr || undefined,
        adrTarget: Number(targets?.adr_target) || undefined,
        occupancy: latest.occupancy_rate || undefined,
        occupancyTarget: Number(targets?.occupancy_target) || undefined,
        revenue: latest.revenue,
        roomsAvailable: latest.rooms_available ? latest.rooms_available - (latest.rooms_sold || 0) : undefined,
        margin: latest.margin || undefined,
        marginTarget: targets?.cogs_target ? 100 - Number(targets.cogs_target) : undefined,
        covers: latest.customers || undefined,
        coversTarget: Number(targets?.covers_target) || undefined,
        sales: latest.revenue,
        avgSpend,
        recommendationText: recommendation,
        plan: org.plan as 'starter' | 'growth' | 'pro',
        entryUrl: `https://auraseaos.com/entry`,
      }

      // Shorten Buddhist year (2569 → 69) only for the F&B LINE message,
      // keeping the accommodation LINE message and all email templates on
      // the original 4-digit form.
      const lineDateStr = isHotel ? dateStr : dateStr.replace(/25(\d{2})/, '$1')

      const lineMsg = buildMorningFlashLine({
        branchName: branch.name,
        branchType: branch.business_type as 'accommodation' | 'fnb',
        date: lineDateStr,
        adr: latest.adr || undefined,
        adrTarget: Number(targets?.adr_target) || undefined,
        occupancy: latest.occupancy_rate || undefined,
        roomsAvailable: latest.rooms_available ? latest.rooms_available - (latest.rooms_sold || 0) : undefined,
        revenue: latest.revenue,
        margin: latest.margin || undefined,
        marginAvg,
        covers: latest.customers || undefined,
        sales: latest.revenue,
        avgSpend,
        recommendation,
      })

      try {
        await sendNotification({
          userId: setting.user_id,
          organizationId: setting.organization_id,
          branchId: branch.id,
          type: 'morning_flash',
          emailSubject: `สรุปเช้า: ${branch.name} — ${dateStr}`,
          emailReact: <MorningFlash {...emailProps} />,
          lineMessage: lineMsg,
          metricDate: today,
          // Email is opt-in: only send when the user has explicitly
          // enabled the morning-flash email for this org. Treats null /
          // undefined / false / missing column as opt-out (LINE only).
          skipEmail: setting.morning_flash_email_enabled !== true,
        })
        results.push({ userId: setting.user_id, status: 'sent' })
      } catch (err) {
        console.error('sendNotification failed:', err)
        results.push({ userId: setting.user_id, status: 'error', error: (err as Error).message } as typeof results[0])
      }
    }
  }

  return NextResponse.json({ sent: results.length, results })
}

// Vercel cron calls GET; the entry-form trigger calls POST. Both run the
// same handler — the auth check distinguishes legitimate callers and the
// body parse inside is tolerant of empty/missing JSON bodies.
export async function GET(req: NextRequest) {
  return handleMorningFlash(req)
}

export async function POST(req: NextRequest) {
  return handleMorningFlash(req)
}
