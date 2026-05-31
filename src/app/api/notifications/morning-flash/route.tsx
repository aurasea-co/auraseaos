import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { Resend } from 'resend'
import { EMAIL_SENDERS } from '@/lib/email/resend'
import MorningFlash, { type MorningFlashBranchData } from '@/lib/email/templates/morningFlash'
import { buildMorningFlashLine, sendLineMessage, sendLineFlexMessage, sendLineMixed } from '@/lib/line/messaging'
import { buildHotelBriefFlexMessage } from '@/lib/line/hotel-brief'
import { getTodayBangkok } from '@/lib/businessDate'
import { calculateGrossMarginStrict } from '@/lib/calculations/fnb'
import { periodAvgMargin, type MarginInputRow } from '@/lib/calculations/marginAggregates'
import { generateHotelRecommendation, generateFnbRecommendation } from '@/lib/notifications/recommendation'
import {
  generateDailyRecommendations,
  forecastTomorrow,
  toRecommendationInputs,
  attachCompetitorRates,
} from '@/lib/recommendations/hotel/engine'
import { hasFeature } from '@/lib/auth/plan-features'

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
    // Invited managers live in branch_members (organization_members is
    // owner-only), so check both tables before skipping.
    const { data: orgMembership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', setting.user_id)
      .eq('organization_id', setting.organization_id)
      .maybeSingle()

    const isOwner = orgMembership?.role === 'owner'

    let isManager = orgMembership?.role === 'manager'
    if (!isOwner && !isManager) {
      const { data: branchMembership } = await supabase
        .from('branch_members')
        .select('role')
        .eq('user_id', setting.user_id)
        .maybeSingle()
      isManager = branchMembership?.role === 'manager' ||
        branchMembership?.role === 'branch_manager'
    }

    if (!isOwner && !isManager) {
      console.log(`[morning-flash] skip user=${setting.user_id} role=${orgMembership?.role ?? 'none'}`)
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

    // Get branches for this user. Owners see every branch in the org;
    // managers see only the branches they're assigned to in branch_members,
    // so a manager attached to Crystal Resort doesn't get Crystal Cafe
    // data lumped into their summary.
    let branches: { id: string; name: string; business_type: string; monthly_fixed_cost: number; total_rooms: number | null }[] = []

    if (isOwner) {
      const { data: allBranches } = await supabase
        .from('branches')
        .select('*')
        .eq('organization_id', setting.organization_id)
      branches = allBranches || []
    } else {
      const { data: memberBranches } = await supabase
        .from('branch_members')
        .select('branch_id')
        .eq('user_id', setting.user_id)
        .in('role', ['manager', 'branch_manager'])

      const assignedBranchIds = (memberBranches || []).map((m: { branch_id: string }) => m.branch_id)

      if (assignedBranchIds.length === 0) {
        console.log(`[morning-flash] user=${setting.user_id} has no assigned branches — skipping`)
        continue
      }

      const { data: assignedBranches } = await supabase
        .from('branches')
        .select('*')
        .in('id', assignedBranchIds)
      branches = assignedBranches || []
    }

    // Collect per-branch data once; the same data feeds both the combined
    // LINE message (one push) and the combined email (one render).
    const branchDataList: MorningFlashBranchData[] = []
    const lineSnippets: string[] = []
    // For single-hotel-branch recipients we send the richer RateDesk
    // Flex Message instead of the legacy text snippet. Collected
    // per-iteration; consumed at LINE-send time below. Stays empty
    // when the recipient has any F&B branches in scope or more than
    // one hotel branch (we'd need a carousel to show both, and Flex
    // bubbles are constrained — text path handles multi-branch).
    // F&B snippets are tracked separately so a recipient with exactly
    // one hotel branch + N F&B branches can receive a Flex bubble for
    // the hotel AND a follow-up text for the F&B in the same LINE push
    // (LINE allows up to 5 messages per push). Previously the route
    // gated Flex on lineSnippets.length === 1 which downgraded any
    // mixed-vertical owner to text — hiding the Auto Push ✓ button.
    const fnbSnippets: string[] = []
    const hotelFlexInputs: Array<{
      branchId: string
      branchName: string
      latest: Record<string, unknown>
      metrics: Record<string, unknown>[]
    }> = []
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

      const avgTicket = Number(latest.avg_ticket) || 0
      const revenueNum = Number(latest.revenue) || 0
      const coversNum = Number(latest.customers) || 0
      const avgSpend = avgTicket > 0
        ? avgTicket
        : (coversNum > 0 ? revenueNum / coversNum : undefined)

      const { data: targets } = await supabase.from('targets').select('*').eq('branch_id', branch.id).maybeSingle()

      const isHotel = branch.business_type === 'accommodation'

      // F&B margin: gross-only (excl. salary), identical math to the
      // dashboard (Home + Trends).
      //   - latestMargin = calculateGrossMarginStrict(revenue, variableCost)
      //   - marginAvg30d = periodAvgMargin(last 30 rows, 0, 0).value
      // periodAvgMargin runs in gross mode when monthlySalary or
      // operatingDays is 0, so passing 0/0 forces gross consistently.
      let latestMargin: number | undefined
      let marginAvg: number | undefined
      if (!isHotel) {
        const fnbRows: MarginInputRow[] = (metrics || []).map((m: Record<string, unknown>) => ({
          metric_date: String(m.metric_date),
          revenue: Number(m.revenue) || null,
          variableCost: Number(m.additional_cost_today) || null,
        }))

        latestMargin = calculateGrossMarginStrict(
          Number(latest.revenue) || 0,
          latest.additional_cost_today != null ? Number(latest.additional_cost_today) : null,
        ) ?? undefined

        marginAvg = periodAvgMargin(fnbRows, 0, 0)?.value
      }

      // Recent 7 days, ascending by date, for trend analysis in the
      // recommendation engine. `metrics` is the 30-day fetch ordered
      // descending — slice the first 7 (newest) and reverse so the helper
      // sees them oldest → newest.
      const recent7Asc = (metrics ?? []).slice(0, 7).slice().reverse()

      const recommendation = isHotel
        ? generateHotelRecommendation({
            adr: Number(latest.adr) || 0,
            adrTarget: Number(targets?.adr_target) || 0,
            occupancy: Number(latest.occupancy_rate) || 0,
            occupancyTarget: Number(targets?.occupancy_target) || 80,
            revenue: Number(latest.revenue) || 0,
            roomsAvailable: latest.rooms_available
              ? Number(latest.rooms_available) - (Number(latest.rooms_sold) || 0)
              : 0,
            recentMetrics: recent7Asc.map((m: Record<string, unknown>) => ({
              adr: m.adr != null ? Number(m.adr) : null,
              occupancy_rate: m.occupancy_rate != null ? Number(m.occupancy_rate) : null,
              revenue: m.revenue != null ? Number(m.revenue) : null,
              metric_date: String(m.metric_date),
            })),
          })
        : generateFnbRecommendation({
            marginAvg: marginAvg ?? 0,
            latestMargin: latestMargin ?? null,
            marginTarget: targets?.cogs_target != null ? 100 - Number(targets.cogs_target) : 68,
            covers: Number(latest.customers) || 0,
            coversTarget: Number(targets?.covers_target) || 40,
            avgSpend: avgSpend ?? 0,
            revenue: Number(latest.revenue) || 0,
            // branch_daily_metrics exposes the cover count as `customers`;
            // remap to `total_customers` to match the recommendation
            // helper's input shape.
            recentMetrics: recent7Asc.map((m: Record<string, unknown>) => ({
              revenue: m.revenue != null ? Number(m.revenue) : null,
              additional_cost_today: m.additional_cost_today != null ? Number(m.additional_cost_today) : null,
              total_customers: m.customers != null ? Number(m.customers) : null,
              metric_date: String(m.metric_date),
            })),
          })

      const dateStr = new Date(latest.metric_date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })

      // For F&B, prefer the freshly-computed latestMargin (calculateNetMargin
      // — same math as the dashboard). For accommodation, keep the existing
      // latest.margin value untouched per spec ("do not touch hotel logic").
      const branchMargin = isHotel ? (latest.margin || undefined) : latestMargin

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
        margin: branchMargin,
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
          margin: branchMargin,
          marginAvg,
          covers: latest.customers || undefined,
          sales: latest.revenue,
          avgSpend,
          recommendation,
        }),
      )

      // Stash hotel inputs (consumed by the Flex Message path below)
      // and F&B snippets (sent as a follow-up text in the same LINE
      // push when the recipient has a single hotel + N F&B branches).
      // We never get to the text-bundle path for mixed-vertical owners
      // any more — they receive Flex(hotel) + text(F&B) together.
      if (isHotel) {
        hotelFlexInputs.push({
          branchId: branch.id,
          branchName: branch.name,
          latest: latest as Record<string, unknown>,
          metrics: (metrics || []) as Record<string, unknown>[],
        })
      } else {
        // Last entry pushed to lineSnippets is this F&B branch's text.
        fnbSnippets.push(lineSnippets[lineSnippets.length - 1])
      }
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
        // Any recipient with exactly one hotel branch gets the RateDesk
        // Flex bubble (yesterday's KPIs + tonight forecast + top recs +
        // Auto Push ✓ button on Pro). When the same recipient also has
        // F&B branches in scope, the F&B summaries are appended to the
        // same LINE push as a follow-up text message — LINE allows up
        // to 5 messages per push call. Multi-hotel owners (rare — a
        // chain operator) still fall through to the text-bundle path;
        // adding carousel support is a separate ticket.
        const hasSingleHotel = hotelFlexInputs.length === 1

        let ok = false
        let channelLabel = 'text'

        if (hasSingleHotel) {
          const f = hotelFlexInputs[0]
          // Project the 30-day metric window into the engine's input
          // shape and run the recommendation + forecast layers.
          // Both are pure functions — no extra round-trips.
          const baseInputs = toRecommendationInputs(
            f.metrics.map((m) => {
              // Defensive cast of the jsonb breakdown column — runtime
              // shape may be null, an array of valid objects, or (legacy)
              // a malformed import. toRecommendationInputs filters
              // malformed entries; we just shovel whatever's there.
              const breakdownRaw = (m as { room_type_breakdown?: unknown }).room_type_breakdown
              const breakdown = Array.isArray(breakdownRaw)
                ? (breakdownRaw as Array<{
                    roomType: string
                    totalRooms: number
                    occupiedRooms: number
                    rateThb: number
                  }>)
                : null
              return {
                metric_date: String((m as { metric_date: string }).metric_date),
                rooms_available: numOrNull(m.rooms_available),
                rooms_sold: numOrNull(m.rooms_sold),
                revenue: numOrNull(m.revenue),
                room_type_breakdown: breakdown,
              }
            }),
          )

          // Fetch the competitor rates the owner logged at
          // /settings/competitors over the same 30-day window. The
          // undercut + overpricing signals require ≥3 days carrying
          // competitor data before firing; without this fetch they'd
          // never light up in the morning brief even when the owner
          // has been logging diligently.
          //
          // 1.05× the metric window so a fresh entry made at 06:55
          // BKK (just before the cron) still gets included if its
          // captured_at is today's BKK calendar date.
          const fromIso = (() => {
            const d = new Date()
            d.setUTCDate(d.getUTCDate() - 31)
            return d.toISOString().slice(0, 10)
          })()
          const { data: compRows } = await supabase
            .from('competitor_rates')
            .select('competitor_name, rate, captured_at')
            .eq('branch_id', f.branchId)
            .gte('captured_at', fromIso)

          const recInputs = attachCompetitorRates(
            baseInputs,
            (compRows || []) as Array<{ competitor_name: string; rate: number | string | null; captured_at: string }>,
          )

          const recs = generateDailyRecommendations(recInputs)
            .filter((r) => r.urgency !== 'low')
            .slice(0, 2)
          const forecast = forecastTomorrow(recInputs)

          const yRevenue = Number((f.latest as { revenue: unknown }).revenue) || 0
          const yRoomsSold = Number((f.latest as { rooms_sold: unknown }).rooms_sold) || 0
          const yRoomsAvailable = Number((f.latest as { rooms_available: unknown }).rooms_available) || 0
          const yAdrThb = yRoomsSold > 0 ? yRevenue / yRoomsSold : 0
          const yOccupancy = yRoomsAvailable > 0 ? yRoomsSold / yRoomsAvailable : 0

          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.auraseaos.com'

          // Multi-room detection — computed up here so the approval-
          // token block below can skip insert/delete when the button
          // won't render (saves a wasted DB round-trip every morning).
          const latestBreakdown = (() => {
            const raw = (f.latest as { room_type_breakdown?: unknown }).room_type_breakdown
            return Array.isArray(raw) ? raw : []
          })()
          const distinctRoomTypes = new Set(
            latestBreakdown
              .map((b) => (b as { roomType?: string }).roomType)
              .filter((rt): rt is string => typeof rt === 'string' && rt.length > 0),
          )
          const hasMultipleRoomTypes = distinctRoomTypes.size > 1

          // Auto Push approval (Pro plan only, single-room only). We
          // create a single-use token bound to this branch + today +
          // the suggested rate, and pass the click-through URL to the
          // Flex builder. Re-running the job for the same branch/date
          // first deletes any unexpired, unapproved token so we don't
          // multiply rows.
          //
          // Multi-room properties skip token creation entirely — a
          // single ฿X rate doesn't represent 4 different room types,
          // so the button is hidden in the Flex render. Owner goes to
          // /ratedesk (dashboard deep-link button) to act per-room.
          //
          // Re-checks the plan at delivery time (rather than caching at
          // org fetch) so a Pro→Growth downgrade between fetch and send
          // doesn't leak the button. The /api/line/approve-rate endpoint
          // re-checks again at click time for the same reason.
          let approveButton: { url: string; label: string } | undefined
          if (forecast && hasFeature(org.plan, 'auto_push') && !hasMultipleRoomTypes) {
            const rateThb = Math.round(forecast.suggestedRateThb)
            const adminSb = createServiceClient()

            // Drop any previous unapproved token for this branch+date so
            // re-running the cron doesn't leave orphaned rows. Approved
            // rows are preserved (audit trail).
            await adminSb
              .from('rate_approvals')
              .delete()
              .eq('branch_id', f.branchId)
              .eq('date', today)
              .is('approved_at', null)

            const { data: created, error: createErr } = await adminSb
              .from('rate_approvals')
              .insert({
                branch_id: f.branchId,
                room_type: 'all',
                date: today,
                suggested_rate_thb: rateThb,
                push_status: 'pending',
                expires_at: new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString(),
              })
              .select('token')
              .single()

            if (createErr) {
              console.error(`[morning-flash] failed to create approval token for branch=${f.branchId}:`, createErr)
            } else if (created?.token) {
              // LINE caps button labels at 20 chars. "✓ อนุมัติราคา ฿" is
              // already 14 visual chars; "฿9,999" pushes us to 20 exactly,
              // anything bigger overflows. Fall back to a generic label
              // when the rate would push us over.
              const rateStr = rateThb.toLocaleString('th-TH')
              const fullLabel = `✓ อนุมัติราคา ฿${rateStr}`
              const label = fullLabel.length <= 20 ? fullLabel : '✓ อนุมัติราคาคืนนี้'
              approveButton = {
                url: `${baseUrl}/api/line/approve-rate?token=${created.token}`,
                label,
              }
            }
          }

          const dashboardUrl = `${baseUrl}/ratedesk`

          const flex = buildHotelBriefFlexMessage({
            branchName: f.branchName,
            yesterday: {
              date: String((f.latest as { metric_date: string }).metric_date),
              occupancyRate: yOccupancy,
              adrThb: yAdrThb,
              revparThb: yAdrThb * yOccupancy,
              revenueThb: yRevenue,
            },
            topRecs: recs,
            forecast,
            approveButton,
            dashboardUrl,
            hasMultipleRoomTypes,
          })

          // Mixed-vertical recipients: Flex(hotel) + text(F&B) in one
          // push. Single-hotel recipients: just the Flex bubble.
          if (fnbSnippets.length > 0) {
            const combinedFnb = fnbSnippets.join('\n===================\n')
            ok = await sendLineMixed(profile.line_id as string, [
              { type: 'flex', altText: flex.altText, contents: flex.contents },
              { type: 'text', text: combinedFnb },
            ])
            channelLabel = 'flex+text'
          } else {
            ok = await sendLineFlexMessage(profile.line_id as string, flex.altText, flex.contents)
            channelLabel = 'flex'
          }
        } else {
          const combined = lineSnippets.join('\n===================\n')
          ok = await sendLineMessage(profile.line_id as string, combined)
        }
        lineStatus = ok ? 'sent' : 'failed'
        console.log(`[morning-flash] LINE push to user=${setting.user_id} branches=${lineSnippets.length} mode=${channelLabel} → ${lineStatus}`)
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

// Narrow unknown jsonb-ish values to a number-or-null for the engine
// adapter. Empty strings, NaN, and false-y non-zero values all coerce
// to null so toRecommendationInputs skips the day instead of treating
// it as a real zero (which would distort occupancy averages).
function numOrNull(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
