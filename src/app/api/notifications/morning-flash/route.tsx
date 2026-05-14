import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendNotification } from '@/lib/notifications/send'
import MorningFlash from '@/lib/email/templates/morningFlash'
import { buildMorningFlashLine } from '@/lib/line/messaging'
import { getTodayBangkok } from '@/lib/businessDate'

export async function POST(req: NextRequest) {
  // Verify cron secret or entry form trigger
  const authHeader = req.headers.get('authorization')
  const isFromEntryForm = req.headers.get('x-from-entry-form') === 'true'

  if (!isFromEntryForm && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const today = getTodayBangkok()

  // If triggered from entry form, send for specific org
  let body: { branchId?: string; organizationId?: string } = {}
  try { body = await req.json() } catch { /* cron call — no body */ }

  // Get all owners with email notifications enabled
  const query = supabase
    .from('notification_settings')
    .select('user_id, organization_id, email_notifications, line_notify_enabled')
    .eq('email_notifications', true)

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
      // Get latest metrics
      const { data: metrics } = await supabase
        .from('branch_daily_metrics')
        .select('*')
        .eq('branch_id', branch.id)
        .order('metric_date', { ascending: false })
        .limit(1)

      const latest = metrics?.[0]
      if (!latest) continue

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
        recommendationText: recommendation,
        plan: org.plan as 'starter' | 'growth' | 'pro',
        entryUrl: `https://auraseaos.com/entry`,
      }

      const lineMsg = buildMorningFlashLine({
        branchName: branch.name,
        branchType: branch.business_type as 'accommodation' | 'fnb',
        date: dateStr,
        adr: latest.adr || undefined,
        adrTarget: Number(targets?.adr_target) || undefined,
        occupancy: latest.occupancy_rate || undefined,
        roomsAvailable: latest.rooms_available ? latest.rooms_available - (latest.rooms_sold || 0) : undefined,
        revenue: latest.revenue,
        margin: latest.margin || undefined,
        covers: latest.customers || undefined,
        sales: latest.revenue,
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
