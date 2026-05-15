import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { Resend } from 'resend'
import { EMAIL_SENDERS } from '@/lib/email/resend'
import MorningFlash, { type MorningFlashBranchData } from '@/lib/email/templates/morningFlash'
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

  // Recipients are built from two pools (queried independently so the route
  // stays working even before migration 019 adds morning_flash_email_enabled):
  //   1. LINE opt-ins  (notification_settings.line_notify_enabled = true)
  //   2. Email opt-ins (notification_settings.morning_flash_email_enabled = true)
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

  // Merge LINE pool + any email-only opt-ins.
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

  const resend = new Resend(process.env.RESEND_API_KEY)
  const results: { userId: string; line: string; email: string }[] = []

  for (const setting of settingsList) {
    // Role filter: morning flash is for owner + manager only.
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

    // Per-channel dedup. A successful row on a channel blocks that channel
    // only — LINE and email are tracked independently so a partial failure
    // (e.g. LINE succeeded, email Resend was down) can be retried for the
    // failed half on the next cron tick. `?force=true` (or x-force-resend
    // header) bypasses dedup entirely — useful for testing delivery from
    // the Vercel UI without having to wipe notification_log rows first.
    const forceParam = req.nextUrl.searchParams.get('force') === 'true' || req.headers.get('x-force-resend') === 'true'
    let lineAlreadySent = false
    let emailAlreadySent = false
    if (!forceParam) {
      const [lineDedup, emailDedup] = await Promise.all([
        supabase
          .from('notification_log')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', setting.user_id)
          .eq('notification_type', 'morning_flash')
          .eq('channel', 'line')
          .eq('status', 'sent')
          .eq('metric_date', today),
        supabase
          .from('notification_log')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', setting.user_id)
          .eq('notification_type', 'morning_flash')
          .eq('channel', 'email')
          .eq('status', 'sent')
          .eq('metric_date', today),
      ])
      lineAlreadySent = (lineDedup.count ?? 0) > 0
      emailAlreadySent = (emailDedup.count ?? 0) > 0
    } else {
      console.log(`[morning-flash] force=true — bypassing dedup for user=${setting.user_id}`)
    }

    if (lineAlreadySent && emailAlreadySent) {
      console.log(`[morning-flash] skip user=${setting.user_id} — both channels delivered today`)
      continue
    }

    // Get org info
    const { data: org } = await supabase.from('organizations').select('*').eq('id', setting.organization_id).single()
    if (!org) continue

    // Get branches for this org
    const { data: branches } = await supabase.from('branches').select('*').eq('organization_id', setting.organization_id)

    // Collect per-branch data once; the same data feeds both the combined
    // LINE message (one push) and the combined email (one render).
    const branchDataList: MorningFlashBranchData[] = []
    const lineSnippets: string[] = []
    let totalRevenue = 0
    let latestMetricDate = today

    for (const branch of branches || []) {
      // Fetch the last 30 daily rows so we can compute a 30-day rolling
      // avg margin alongside the latest-day values.
      const { data: metrics } = await supabase
        .from('branch_daily_metrics')
        .select('*')
        .eq('branch_id', branch.id)
        .order('metric_date', { ascending: false })
        .limit(30)

      const latest = metrics?.[0]
      if (!latest) continue

      const marginValues = (metrics || [])
        .map((m: Record<string, unknown>) => Number(m.margin))
        .filter((v) => Number.isFinite(v) && v > 0)
      const manualMarginAvg = marginValues.length > 0
        ? marginValues.reduce((s, v) => s + v, 0) / marginValues.length
        : undefined

      // Prefer the view's pre-aggregated 30-day avg column when present,
      // otherwise fall back to the value we just computed from the last
      // 30 daily rows.
      const margin30dAvg = latest.margin_30d_avg != null
        ? Number(latest.margin_30d_avg)
        : manualMarginAvg
      const marginAvg = Number.isFinite(margin30dAvg) ? margin30dAvg : undefined

      const avgTicket = Number(latest.avg_ticket) || 0
      const revenueNum = Number(latest.revenue) || 0
      const coversNum = Number(latest.customers) || 0
      const avgSpend = avgTicket > 0
        ? avgTicket
        : (coversNum > 0 ? revenueNum / coversNum : undefined)

      const { data: targets } = await supabase.from('targets').select('*').eq('branch_id', branch.id).maybeSingle()

      const isHotel = branch.business_type === 'accommodation'
      const recommendation = isHotel
        ? (latest.adr || 0) >= (Number(targets?.adr_target) || 0) ? 'ADR ตามเป้า — รักษาระดับ' : 'ADR ต่ำกว่าเป้า — ลองเพิ่ม direct booking'
        : (latest.margin || 0) >= (100 - Number(targets?.cogs_target || 32)) ? 'Margin ตามเป้า' : 'Margin ต่ำกว่าเป้า — ตรวจสอบ COGS'

      const dateStr = new Date(latest.metric_date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })

      branchDataList.push({
        branchName: branch.name,
        businessDate: dateStr,
        branchType: branch.business_type as 'accommodation' | 'fnb',
        adr: latest.adr || undefined,
        adrTarget: Number(targets?.adr_target) || undefined,
        occupancy: latest.occupancy_rate || undefined,
        occupancyTarget: Number(targets?.occupancy_target) || undefined,
        revenue: latest.revenue,
        roomsAvailable: latest.rooms_available ? latest.rooms_available - (latest.rooms_sold || 0) : undefined,
        margin: latest.margin || undefined,
        marginAvg,
        marginTarget: targets?.cogs_target ? 100 - Number(targets.cogs_target) : undefined,
        covers: latest.customers || undefined,
        coversTarget: Number(targets?.covers_target) || undefined,
        sales: latest.revenue,
        avgSpend,
        recommendationText: recommendation,
      })

      totalRevenue += revenueNum
      if (String(latest.metric_date) > latestMetricDate) {
        latestMetricDate = String(latest.metric_date)
      }

      // Shorten Buddhist year (2569 → 69) only for the F&B LINE message,
      // keeping the accommodation LINE message and email body on the
      // original 4-digit form.
      const lineDateStr = isHotel ? dateStr : dateStr.replace(/25(\d{2})/, '$1')

      lineSnippets.push(
        buildMorningFlashLine({
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
        }),
      )
    }

    let lineStatus = 'skipped'
    let emailStatus = 'skipped'

    // ---- LINE channel ----
    if (lineAlreadySent) {
      console.log(`[morning-flash] skip LINE for user=${setting.user_id} — already delivered today`)
    } else if (!setting.line_notify_enabled) {
      console.log(`[morning-flash] user=${setting.user_id} has line_notify_enabled=false — skipping LINE`)
    } else if (lineSnippets.length === 0) {
      console.log(`[morning-flash] user=${setting.user_id} produced 0 branch snippets — skipping LINE`)
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
        lineStatus = ok ? 'sent' : 'failed'
        console.log(`[morning-flash] LINE push to user=${setting.user_id} branches=${lineSnippets.length} → ${lineStatus}`)
        await supabase.from('notification_log').insert({
          user_id: setting.user_id,
          organization_id: setting.organization_id,
          branch_id: null,
          notification_type: 'morning_flash',
          channel: 'line',
          metric_date: today,
          status: lineStatus,
        })
      }
    }

    // ---- Email channel (one combined email per user) ----
    const isEmailOptIn = emailOptIn.has(`${setting.user_id}:${setting.organization_id}`)
    if (emailAlreadySent) {
      console.log(`[morning-flash] skip email for user=${setting.user_id} — already delivered today`)
    } else if (!isEmailOptIn) {
      console.log(`[morning-flash] user=${setting.user_id} not opted in to email — skipping email`)
    } else if (branchDataList.length === 0) {
      console.log(`[morning-flash] user=${setting.user_id} produced 0 branches — skipping email`)
    } else {
      const { data: { user: authUser } } = await supabase.auth.admin.getUserById(setting.user_id)
      if (!authUser?.email) {
        console.log(`[morning-flash] user=${setting.user_id} has no auth email — cannot send`)
      } else {
        const emailDateStr = new Date(latestMetricDate + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
        const subject = `สรุปเช้า: ภาพรวมทุกสาขา — ${emailDateStr}`
        try {
          const result = await resend.emails.send({
            from: EMAIL_SENDERS.notifications,
            to: authUser.email,
            subject,
            react: (
              <MorningFlash
                date={emailDateStr}
                lang="th"
                branches={branchDataList}
                totalRevenue={totalRevenue}
                entryUrl="https://auraseaos.com/entry"
                plan={org.plan as 'starter' | 'growth' | 'pro'}
              />
            ),
          })
          emailStatus = result.error ? 'failed' : 'sent'
          if (result.error) console.error('[morning-flash] email send error:', result.error)
          console.log(`[morning-flash] email to ${authUser.email} branches=${branchDataList.length} → ${emailStatus}`)
        } catch (err) {
          emailStatus = 'failed'
          console.error('[morning-flash] email send threw:', err)
        }
        await supabase.from('notification_log').insert({
          user_id: setting.user_id,
          organization_id: setting.organization_id,
          branch_id: null,
          notification_type: 'morning_flash',
          channel: 'email',
          metric_date: today,
          status: emailStatus,
        })
      }
    }

    results.push({ userId: setting.user_id, line: lineStatus, email: emailStatus })
  }

  return NextResponse.json({ count: results.length, results })
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
