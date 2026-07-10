import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { Resend } from 'resend'
import { EMAIL_SENDERS } from '@/lib/email/resend'
import MorningFlash, { type MorningFlashBranchData } from '@/lib/email/templates/morningFlash'
import { buildMorningFlashLine, sendLineMessage, sendLineFlexMessage, sendLineMixed } from '@/lib/line/messaging'
import { buildHotelBriefFlexMessage } from '@/lib/line/hotel-brief'
import { buildFnbBriefFlexMessage } from '@/lib/line/menudesk-brief'
import {
  generateFnbDailyRecommendations,
  toFnbRecommendationInputs,
  attachItemSales,
  type FnbDailySaleRow,
} from '@/lib/recommendations/fnb/engine'
import { getTodayBangkok } from '@/lib/businessDate'
import { calculateGrossMarginStrict } from '@/lib/calculations/fnb'
import { periodAvgMargin, type MarginInputRow } from '@/lib/calculations/marginAggregates'
import { generateHotelRecommendation, generateFnbRecommendation } from '@/lib/notifications/recommendation'
import {
  generateDailyRecommendations,
  forecastTomorrow,
  type DailyAction,
} from '@/lib/recommendations/hotel/engine'
import { loadPerRoomRecsForBranch, type PerBranchHotelRecs } from '@/lib/recommendations/hotel/per-branch-loader'
import { canSeeRevenue } from '@/lib/auth/ratedesk-permissions'
import { randomUUID } from 'crypto'

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

    // Revenue gate: managers don't see THB totals (same rule as the
    // dashboard, LINE brief, and exports). canSeeRevenue() is the
    // shared source of truth — owner/superadmin true; manager/staff
    // false. Passed to the email template so revenue cards + the
    // portfolio total are hidden for manager recipients.
    const recipientRole = isOwner ? 'owner' : 'manager'
    const recipientCanSeeRevenue = canSeeRevenue(recipientRole)

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
    // Hotel branch stash. Each entry now also carries the result of
    // loadPerRoomRecsForBranch (engine output + DB-sourced rate sheet
    // + gating). Both the LINE single-hotel path AND the email build
    // step read from here so neither recomputes — single source of
    // truth for "what rates does this branch suggest today?".
    const hotelFlexInputs: Array<{
      branchId: string
      branchName: string
      latest: Record<string, unknown>
      metrics: Record<string, unknown>[]
      hotelRecs: PerBranchHotelRecs
    }> = []
    // F&B Flex inputs — populated alongside fnbSnippets so a
    // recipient with exactly one F&B branch (no hotels) can receive
    // the new MenuDesk Flex bubble instead of the legacy text. Mixed
    // hotel+F&B recipients keep getting hotel Flex + F&B text via
    // the existing path until we generalise.
    const fnbFlexInputs: Array<{
      branchId: string
      branchName: string
      latest: Record<string, unknown>
    }> = []
    let totalRevenue = 0
    let latestMetricDate = today

    for (const branch of branches || []) {
      // Hotel branches fetch 63 rows (9 weeks) so the per-room engine
      // can compute a trailing-8-week weekday baseline; F&B stays at 30
      // because these same rows feed periodAvgMargin below, which is
      // documented as a 30-day rolling average — widening it would
      // silently change the margin the brief reports.
      const metricsLimit = branch.business_type === 'accommodation' ? 63 : 30
      const { data: metrics } = await supabase
        .from('branch_daily_metrics')
        .select('*')
        .eq('branch_id', branch.id)
        .order('metric_date', { ascending: false })
        .limit(metricsLimit)

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

      // Per-branch per-room rate sheet (single source of truth for both
      // LINE and email). Runs the engine, persists to
      // branch_rate_recommendations, reads back, and computes the daily
      // action + auto-push gating. For F&B branches we skip — there's
      // no rate sheet concept.
      // 63-day (9-week) window so computeWeekdayBaseline sees a full
      // trailing-8-week same-weekday history (8 samples per weekday)
      // plus headroom for gaps. Inherited by both the accommodation_
      // daily_metrics and competitor_rates queries in the loader.
      const fromIso = (() => {
        const d = new Date()
        d.setUTCDate(d.getUTCDate() - 63)
        return d.toISOString().slice(0, 10)
      })()
      let hotelRecs: PerBranchHotelRecs | null = null
      if (isHotel) {
        hotelRecs = await loadPerRoomRecsForBranch(supabase, {
          branchId: branch.id,
          today,
          fromIso,
          metrics: (metrics || []) as Record<string, unknown>[],
          plan: org.plan as string | null,
          targetOccupancy: targets?.occupancy_target != null ? Number(targets.occupancy_target) : null,
        })
        console.log(
          `[morning-flash] loaded ${hotelRecs.perRoomRates.length} per-room rec(s) for branch=${branch.id}` +
          ` canApprove=${hotelRecs.canShowApprove} awaitingPms=${hotelRecs.showAwaitingPmsNote}`,
        )
      }

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.auraseaos.com'
      const branchDashboardUrl = isHotel ? `${baseUrl}/ratedesk` : undefined

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
        // New per-room rate sheet + action + auto-push fields for the
        // email template. Only populated for accommodation branches.
        // Project the engine output to the email-friendly shape (THB
        // only — the satang fields are an implementation detail of the
        // persistence layer).
        perRoomRates: hotelRecs?.perRoomRates.map((r) => ({
          roomType: r.roomType,
          currentRateThb: r.currentRateThb,
          suggestedRateThb: r.suggestedRateThb,
          direction: r.direction,
        })),
        dailyAction: hotelRecs?.dailyAction ?? undefined,
        showAwaitingPmsNote: hotelRecs?.showAwaitingPmsNote ?? false,
        dashboardUrl: branchDashboardUrl,
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
          canSeeRevenue: recipientCanSeeRevenue,
          recommendation,
        }),
      )

      // Stash hotel inputs (consumed by the Flex Message path below)
      // and F&B snippets (sent as a follow-up text in the same LINE
      // push when the recipient has a single hotel + N F&B branches).
      // We never get to the text-bundle path for mixed-vertical owners
      // any more — they receive Flex(hotel) + text(F&B) together.
      if (isHotel) {
        // hotelRecs is guaranteed non-null here (isHotel branch ran
        // the loader above) but TS doesn't narrow across the long
        // intermediate block — assert defensively.
        if (!hotelRecs) {
          throw new Error('[morning-flash] hotelRecs missing for hotel branch — internal invariant violated')
        }
        hotelFlexInputs.push({
          branchId: branch.id,
          branchName: branch.name,
          latest: latest as Record<string, unknown>,
          metrics: (metrics || []) as Record<string, unknown>[],
          hotelRecs,
        })
      } else {
        // Last entry pushed to lineSnippets is this F&B branch's text.
        fnbSnippets.push(lineSnippets[lineSnippets.length - 1])
        // ALSO stash for the F&B Flex path — used below when this
        // recipient has exactly one F&B branch and zero hotels.
        fnbFlexInputs.push({
          branchId: branch.id,
          branchName: branch.name,
          latest: latest as Record<string, unknown>,
        })
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

          // Per-room rate sheet + action + gating already computed in
          // the per-branch loop above and stashed on f.hotelRecs. Read
          // back from there — never recompute (single source of truth
          // shared with the email path).
          const { perRoomRates, canShowApprove, showAwaitingPmsNote, recInputs } = f.hotelRecs
          // dailyAction is `DailyAction | null` from the loader; the
          // brief interface uses `?: DailyAction` so coerce null →
          // undefined at the boundary.
          const dailyAction: DailyAction | undefined = f.hotelRecs.dailyAction ?? undefined

          // Property-level signals (weekend, undercut, low-occupancy,
          // etc.) + forecast. These remain LINE-only — the email
          // template doesn't render the property-level rec strip.
          // Engine functions are pure so calling them twice is cheap;
          // we use the engine inputs already built by the loader.
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

          // Multi-room detection — derived from the perRoomRates the
          // loader returned (each entry has roomType set, never 'all').
          // Used here only to label the approve button (set-size > 1 →
          // "อนุมัติทั้งหมด (N)"); the brief's body rendering doesn't
          // depend on it.
          const distinctRoomTypes = new Set(perRoomRates.map((r) => r.roomType))
          const hasMultipleRoomTypes = distinctRoomTypes.size > 1

          // Per-room rate approval rows. The new model is:
          //   - ONE rate_approvals row per recommended room type
          //   - room_type = the actual type (never 'all' or 'multi')
          //   - All rows in the set share ONE token so the LINE tap
          //     looks up and approves the whole set atomically
          //   - suggested_rate_satang is the canonical field;
          //     suggested_rate_thb is filled as a back-compat shadow
          //     for the cron worker (which we update separately)
          //
          // The token is generated client-side via crypto.randomUUID()
          // so we can stamp the SAME value across every insert in the
          // set (Postgres' default would generate a fresh uuid per
          // row, defeating the shared-token design).
          let approveButton: { url: string; label: string } | undefined
          if (canShowApprove && perRoomRates.length > 0) {
            const adminSb = createServiceClient()

            // Clear any prior unapproved set for this branch+date so
            // re-running the cron same-day doesn't accumulate tokens.
            // Approved rows stay (audit trail).
            await adminSb
              .from('rate_approvals')
              .delete()
              .eq('branch_id', f.branchId)
              .eq('date', today)
              .is('approved_at', null)

            const sharedToken = randomUUID()
            const expiresAtIso = new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString()
            const approvalRows = perRoomRates.map((r) => ({
              branch_id: f.branchId,
              token: sharedToken,
              room_type: r.roomType,
              date: today,
              // Both columns populated during the satang phaseout:
              // satang is the canonical field; thb stays for legacy
              // readers (push-approved-rates cron) until they migrate.
              suggested_rate_satang: r.suggestedRateSatang,
              suggested_rate_thb: r.suggestedRateThb,
              push_status: 'pending',
              expires_at: expiresAtIso,
            }))

            const { error: createErr } = await adminSb
              .from('rate_approvals')
              .insert(approvalRows)

            if (createErr) {
              console.error(
                `[morning-flash] failed to create approval set for branch=${f.branchId}:`,
                createErr,
              )
            } else {
              // Label rules:
              //   - Set size 1 (genuine single-room property): show
              //     the rate inline if it fits in LINE's 20-char cap.
              //   - Set size > 1: "✓ อนุมัติทั้งหมด (N)" — a single
              //     ฿X label across N rates would be misleading.
              let label: string
              if (perRoomRates.length === 1) {
                const onlyThb = perRoomRates[0].suggestedRateThb
                const rateStr = onlyThb.toLocaleString('th-TH')
                const fullLabel = `✓ อนุมัติราคา ฿${rateStr}`
                label = fullLabel.length <= 20 ? fullLabel : '✓ อนุมัติราคาคืนนี้'
              } else {
                label = `✓ อนุมัติทั้งหมด (${perRoomRates.length})`
              }
              approveButton = {
                url: `${baseUrl}/api/line/approve-rate?token=${sharedToken}`,
                label,
              }
            }
          }

          const dashboardUrl = `${baseUrl}/ratedesk`

          // Awaiting-PMS hint string — boolean gate already on
          // f.hotelRecs.showAwaitingPmsNote; flatten to the localized
          // Thai string the brief renderer expects.
          const awaitingPmsNote = showAwaitingPmsNote
            ? 'Auto Push จะเริ่มทำงานเมื่อเชื่อมต่อ PMS ที่รองรับ'
            : undefined

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
            perRoomRates,
            dailyAction,
            forecast,
            approveButton,
            dashboardUrl,
            awaitingPmsNote,
            hasMultipleRoomTypes,
          })

          // Mixed-vertical recipients: Flex(hotel) + text(F&B) in one
          // push. Single-hotel recipients: just the Flex bubble.
          //
          // The Flex render itself is pure — it cannot throw — so the
          // only failure mode is the LINE API rejecting the payload.
          // When that happens we fall back to the plain-text path
          // (buildMorningFlashLine output) so the owner still receives
          // a brief. Plain-text is the ERROR fallback, never a tier
          // signal.
          let flexFailed = false
          try {
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
            if (!ok) flexFailed = true
          } catch (err) {
            console.error(`[morning-flash] Flex send threw for user=${setting.user_id}:`, err)
            flexFailed = true
          }
          if (flexFailed) {
            console.warn(`[morning-flash] Flex send failed for user=${setting.user_id} — falling back to plain text`)
            const combined = lineSnippets.join('\n===================\n')
            ok = await sendLineMessage(profile.line_id as string, combined)
            channelLabel = 'text-fallback'
          }
        } else if (fnbFlexInputs.length === 1 && hotelFlexInputs.length === 0) {
          // Single F&B branch, no hotels → MenuDesk Flex bubble.
          // Mirrors the hasSingleHotel path's structure: build engine
          // inputs from fnb_daily_metrics + fnb_daily_sales (last 30
          // days), run the engine, build the Flex.
          const f = fnbFlexInputs[0]
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.auraseaos.com'

          // Fetch the engine-ready data inline. Two queries — the
          // hot path is single-branch so the cost is bounded.
          const fromIso = (() => {
            const d = new Date()
            d.setUTCDate(d.getUTCDate() - 31)
            return d.toISOString().slice(0, 10)
          })()
          const [metricsRes, salesRes] = await Promise.all([
            supabase
              .from('fnb_daily_metrics')
              .select('metric_date, revenue, total_customers, cost_food, cost_nonfood')
              .eq('branch_id', f.branchId)
              .gte('metric_date', fromIso)
              .order('metric_date', { ascending: true }),
            supabase
              .from('fnb_daily_sales')
              .select('date, menu_item_id, units_sold, menu_items!inner(id, name, category, price_thb, cost_thb)')
              .eq('branch_id', f.branchId)
              .gte('date', fromIso),
          ])

          const baseInputs = toFnbRecommendationInputs(
            (metricsRes.data || []) as Array<{
              metric_date: string
              revenue: number | null
              total_customers: number | null
              cost_food: number | null
              cost_nonfood: number | null
            }>,
          )

          // Reshape sales+join into the engine's FnbDailySaleRow shape.
          interface JoinedSalesRow {
            date: string
            menu_item_id: string
            units_sold: number
            menu_items: {
              id: string
              name: string
              category: string | null
              price_thb: number
              cost_thb: number | null
            } | Array<{
              id: string
              name: string
              category: string | null
              price_thb: number
              cost_thb: number | null
            }>
          }
          const salesRows: FnbDailySaleRow[] = ((salesRes.data || []) as JoinedSalesRow[])
            .map((s) => {
              // Supabase types the joined relation as either single
              // object or array; narrow defensively.
              const item = Array.isArray(s.menu_items) ? s.menu_items[0] : s.menu_items
              if (!item) return null
              return {
                date: s.date,
                menuItemId: s.menu_item_id,
                name: item.name,
                category: item.category,
                unitsSold: s.units_sold,
                priceThb: item.price_thb,
                costThb: item.cost_thb,
              }
            })
            .filter((r): r is FnbDailySaleRow => r !== null)

          const withSales = attachItemSales(baseInputs, salesRows)
          const recs = generateFnbDailyRecommendations(withSales)
            .filter((r) => r.urgency !== 'low')
            .slice(0, 2)

          // Yesterday's KPIs — from f.latest (the most recent row).
          const yLatest = f.latest as {
            revenue?: number | null
            total_customers?: number | null
            cost_food?: number | null
            metric_date?: string
          }
          const yRevenue = Number(yLatest.revenue) || 0
          const yCovers = yLatest.total_customers != null ? Number(yLatest.total_customers) : null
          const yAvgPerCover = yCovers && yCovers > 0 ? yRevenue / yCovers : 0
          const yFoodCost = yLatest.cost_food != null && yRevenue > 0
            ? (Number(yLatest.cost_food) / yRevenue) * 100
            : null

          const flex = buildFnbBriefFlexMessage({
            branchName: f.branchName,
            yesterday: {
              date: String(yLatest.metric_date || today),
              revenueThb: yRevenue,
              totalCovers: yCovers,
              avgPerCoverThb: yAvgPerCover,
              foodCostPct: yFoodCost,
            },
            topRecs: recs,
            dashboardUrl: `${baseUrl}/menudesk`,
            canSeeRevenue: recipientCanSeeRevenue,
          })

          ok = await sendLineFlexMessage(profile.line_id as string, flex.altText, flex.contents)
          channelLabel = 'fnb-flex'
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
                canSeeRevenue={recipientCanSeeRevenue}
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

// numOrNull was inlined here; now lives in the per-branch-loader
// module since it's the only caller (the LINE branch reads from the
// loader's stash instead of doing its own projection).
