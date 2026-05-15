import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendNotification } from '@/lib/notifications/send'
import MorningFlash from '@/lib/email/templates/morningFlash'
import { buildMorningFlashLine, sendLineMessage } from '@/lib/line/messaging'
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

  // Recipients are built from two pools:
  //   1. LINE opt-ins  (notification_settings.line_notify_enabled = true)
  //   2. Email opt-ins (notification_settings.morning_flash_email_enabled = true)
  //
  // The two pools are queried independently so the route stays working even
  // before migration 019 has added the morning_flash_email_enabled column.
  // If that column doesn't exist yet, the email-opt-in query errors out and
  // we degrade to LINE-only delivery (which matches the new default anyway).
  const lineQuery = supabase
    .from('notification_settings')
    .select('user_id, organization_id, email_notifications, line_notify_enabled')
    .eq('line_notify_enabled', true)
  if (body.organizationId) lineQuery.eq('organization_id', body.organizationId)
  const { data: lineSettings, error: lineErr } = await lineQuery
  if (lineErr) console.error('[morning-flash] line opt-in query failed:', lineErr.message)

  const emailOptIn = new Set<string>() // keyed `${user_id}:${organization_id}`
  try {
    const emailQuery = supabase
      .from('notification_settings')
      .select('user_id, organization_id')
      .eq('morning_flash_email_enabled', true)
    if (body.organizationId) emailQuery.eq('organization_id', body.organizationId)
    const { data: emailRows, error: emailErr } = await emailQuery
    if (emailErr) {
      console.warn('[morning-flash] morning_flash_email_enabled not queryable — falling back to LINE-only delivery. Run migration 019 to enable email opt-in.')
    } else {
      for (const r of emailRows || []) {
        emailOptIn.add(`${r.user_id}:${r.organization_id}`)
      }
    }
  } catch (err) {
    console.warn('[morning-flash] morning_flash_email_enabled query threw:', err)
  }

  // Merge LINE pool + any email-only opt-ins (users who set email-opt-in
  // without enabling LINE — they'd otherwise be missed).
  const settingsByKey = new Map<string, { user_id: string; organization_id: string; email_notifications: boolean | null; line_notify_enabled: boolean | null }>()
  for (const s of lineSettings || []) {
    settingsByKey.set(`${s.user_id}:${s.organization_id}`, s)
  }
  emailOptIn.forEach((key) => {
    if (!settingsByKey.has(key)) {
      const [user_id, organization_id] = key.split(':')
      settingsByKey.set(key, { user_id, organization_id, email_notifications: true, line_notify_enabled: false })
    }
  })
  const settingsList = Array.from(settingsByKey.values())
  console.log(`[morning-flash] recipients: ${settingsList.length} (line=${lineSettings?.length ?? 0}, email-only=${settingsList.length - (lineSettings?.length ?? 0)})`)

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

    if (membership?.role !== 'owner' && membership?.role !== 'manager') {
      console.log(`[morning-flash] skip user=${setting.user_id} role=${membership?.role ?? 'none'}`)
      continue
    }

    // Check not already sent today. Count-based so existing logs with
    // multiple rows for the same user-date (e.g. from earlier multi-branch
    // runs) don't crash maybeSingle().
    const { count: alreadySentCount } = await supabase
      .from('notification_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', setting.user_id)
      .eq('notification_type', 'morning_flash')
      .eq('metric_date', today)

    if ((alreadySentCount ?? 0) > 0) {
      console.log(`[morning-flash] skip user=${setting.user_id} — already sent today (${alreadySentCount} log row(s) for ${today}). Delete those rows to re-send.`)
      continue
    }

    // Get org info
    const { data: org } = await supabase.from('organizations').select('*').eq('id', setting.organization_id).single()
    if (!org) continue

    // Get branches for this org
    const { data: branches } = await supabase.from('branches').select('*').eq('organization_id', setting.organization_id)

    // LINE message is delivered once per user with all branches concatenated
    // (one push call instead of one per branch). The per-branch email still
    // goes through sendNotification.
    const lineSnippets: string[] = []

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

      lineSnippets.push(lineMsg)

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
          // Email is opt-in: send only when the user appears in the
          // emailOptIn set (derived from a separate query against the
          // morning_flash_email_enabled column). If that column doesn't
          // exist yet, the set is empty → email is skipped for everyone.
          skipEmail: !emailOptIn.has(`${setting.user_id}:${setting.organization_id}`),
          // LINE is sent once per user after the branch loop with a
          // combined message; suppress the per-branch LINE dispatch here.
          skipLine: true,
        })
        results.push({ userId: setting.user_id, status: 'sent' })
      } catch (err) {
        console.error('sendNotification failed:', err)
        results.push({ userId: setting.user_id, status: 'error', error: (err as Error).message } as typeof results[0])
      }
    }

    // Combined LINE delivery — one message per user containing every branch,
    // followed by one notification_log row for the day.
    if (!setting.line_notify_enabled) {
      console.log(`[morning-flash] user=${setting.user_id} has line_notify_enabled=false — skipping LINE`)
    } else if (lineSnippets.length === 0) {
      console.log(`[morning-flash] user=${setting.user_id} produced 0 branch snippets (no metrics?) — skipping LINE`)
    } else {
      const { data: profile } = await supabase
        .from('profiles')
        .select('line_id')
        .eq('user_id', setting.user_id)
        .maybeSingle()

      if (!profile?.line_id) {
        console.log(`[morning-flash] user=${setting.user_id} has no profiles.line_id — cannot push LINE`)
      } else {
        const combined = lineSnippets.join('\n\n')
        const ok = await sendLineMessage(profile.line_id as string, combined)
        console.log(`[morning-flash] LINE push to user=${setting.user_id} branches=${lineSnippets.length} → ${ok ? 'sent' : 'failed'}`)
        await supabase.from('notification_log').insert({
          user_id: setting.user_id,
          organization_id: setting.organization_id,
          branch_id: null,
          notification_type: 'morning_flash',
          channel: 'line',
          metric_date: today,
          status: ok ? 'sent' : 'failed',
        })
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
