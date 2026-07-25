'use client'

// RateDesk Dashboard — Role-based rendering
//
//   Owner     · Occupancy + ADR + RevPAR + Total Revenue
//   Manager   · Occupancy + ADR + RevPAR  (no Total Revenue — P&L-sensitive)
//   Staff     · Silently redirected to /home — no RateDesk surface
//   Superadmin· Mirrors owner (support / debugging)
//
// Rationale:
//   - Total Revenue is P&L-sensitive; the owner sees it, the manager
//     doesn't need it to make rate decisions.
//   - ADR / RevPAR / Occupancy are the operational metrics the manager
//     uses every day, so they stay visible.
//   - Auto Push approval ('rate_approval') is pre-declared in
//     ratedesk-permissions.ts so the wiring is ready the day that
//     feature ships; nothing renders against it yet.
//
// All access decisions go through canAccessRateDesk / canSeeElement
// in src/lib/auth/ratedesk-permissions.ts — single source of truth.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { useUser } from '@/providers/user-context'
import { hasFeature } from '@/lib/auth/plan-features'
import {
  canAccessRateDesk,
  canSeeElement,
  type RateDeskRole,
} from '@/lib/auth/ratedesk-permissions'
import { createClient } from '@/lib/supabase/client'
import { ArrowRight, Upload, TrendingUp, TrendingDown, Minus, Edit3 } from 'lucide-react'
import { getTodayBangkok } from '@/lib/businessDate'
import { SparklineChart } from '@/components/sparkline-chart'
import { DemandCalendar } from '@/components/pricing/DemandCalendar'
import {
  generateDailyRecommendations,
  toRecommendationInputs,
  attachCompetitorRates,
  type HotelRecommendation,
} from '@/lib/recommendations/hotel/engine'

// RateDesk — hotel-specific dashboard.
//
// Reads accommodation_daily_metrics + competitor_rates for the active
// branch over a selectable window (30 / 60 / 90 days). Renders KPI
// cards with vs-prior-period deltas, a 30-day occupancy sparkline,
// the room-type breakdown table (derived from the most recent day's
// room_type_breakdown jsonb), and a competitor-rate overlay panel.
//
// Empty state surfaces the CSV import CTA — the only way to bulk-seed
// historical data right now.

interface MetricRow {
  metric_date: string
  rooms_available: number | null
  rooms_sold: number | null
  revenue: number | null
  room_type_breakdown: Array<{
    roomType: string
    totalRooms: number
    occupiedRooms: number
    rateThb: number
  }> | null
}

interface CompetitorRow {
  competitor_name: string
  room_type: string
  rate: number
  captured_at: string
}

// One row from rate_approvals — what the dashboard's history table renders.
// Status is computed at render time from (approved_at, expires_at, push_status).
//
// During the satang phaseout (migration 038) every row carries BOTH
// suggested_rate_satang (canonical) and suggested_rate_thb (back-compat
// shadow). The renderer prefers satang and falls back to thb*100 for
// legacy rows that pre-date the migration.
interface ApprovalRow {
  date: string
  room_type: string
  suggested_rate_satang: number | null
  suggested_rate_thb: number | null
  approved_at: string | null
  approved_via: 'line' | 'dashboard' | 'auto' | null
  expires_at: string
  push_status: 'pending' | 'success' | 'failed' | 'skipped' | null
  pushed_to_pms_at: string | null
  created_at: string
}

const WINDOWS = [30, 60, 90] as const
type Window = (typeof WINDOWS)[number]

export default function RateDeskPage() {
  const { activeBranch, role, plan } = useUser()
  const hasAutoPush = hasFeature(plan, 'auto_push')
  const rdRole = role as RateDeskRole
  const router = useRouter()

  // Silent staff redirect — if the user lands here via direct URL and
  // their role doesn't carry dashboard access, route them back to
  // /home before any of the data fetching kicks off. router.replace
  // (not push) so the back button doesn't trap them in a loop.
  const isAllowed = canAccessRateDesk(rdRole, 'ratedesk_dashboard')
  useEffect(() => {
    if (!isAllowed) router.replace('/home')
  }, [isAllowed, router])

  const showRevenue = canSeeElement(rdRole, 'total_revenue')
  const t = useTranslations('ratedesk')
  const [window, setWindow] = useState<Window>(30)
  const [rows, setRows] = useState<MetricRow[]>([])
  const [priorRows, setPriorRows] = useState<MetricRow[]>([])
  const [competitors, setCompetitors] = useState<CompetitorRow[]>([])
  const [approvals, setApprovals] = useState<ApprovalRow[]>([])
  // Occupancy target lives on the `targets` row joined to this branch.
  // Stored as numeric(5,2) in the 0..100 range — same units as
  // sparkData values, so we pass it straight through to SparklineChart.
  // Fallback 80 matches the previous hardcoded value, so dashboards
  // for branches without a target row don't visually regress.
  const [occupancyTarget, setOccupancyTarget] = useState<number>(80)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const load = useCallback(async () => {
    if (!activeBranch || activeBranch.business_type !== 'accommodation') {
      setLoading(false)
      return
    }
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const endDate = new Date()
    const windowStart = new Date(endDate.getTime() - window * 86_400_000)
    const priorStart = new Date(endDate.getTime() - 2 * window * 86_400_000)
    const iso = (d: Date) => d.toISOString().slice(0, 10)

    // Approval history is Pro-only — guard the query so non-Pro users
    // don't hit the table at all (RLS would block writes anyway, and
    // the select-policy is permissive across org members, but skipping
    // the round-trip when the UI won't render anything is cheaper).
    const approvalsQuery = hasAutoPush
      ? db
          .from('rate_approvals')
          .select('date, room_type, suggested_rate_satang, suggested_rate_thb, approved_at, approved_via, expires_at, push_status, pushed_to_pms_at, created_at')
          .eq('branch_id', activeBranch.id)
          .order('created_at', { ascending: false })
          .limit(7)
      : Promise.resolve({ data: [], error: null })

    const [currentRes, priorRes, compRes, approvalsRes, targetsRes] = await Promise.all([
      db
        .from('accommodation_daily_metrics')
        .select('metric_date, rooms_available, rooms_sold, revenue, room_type_breakdown')
        .eq('branch_id', activeBranch.id)
        .gte('metric_date', iso(windowStart))
        .lte('metric_date', iso(endDate))
        .order('metric_date', { ascending: true }),
      db
        .from('accommodation_daily_metrics')
        .select('metric_date, rooms_available, rooms_sold, revenue, room_type_breakdown')
        .eq('branch_id', activeBranch.id)
        .gte('metric_date', iso(priorStart))
        .lt('metric_date', iso(windowStart)),
      db
        .from('competitor_rates')
        .select('competitor_name, room_type, rate, captured_at')
        .eq('branch_id', activeBranch.id)
        .gte('captured_at', iso(windowStart))
        .order('captured_at', { ascending: false }),
      approvalsQuery,
      // Targets row holds occupancy_target (numeric(5,2), 0..100).
      // Older rows that pre-date migration 006 might only have
      // occ_target set; fall back to that, then to 80.
      db
        .from('targets')
        .select('occupancy_target, occ_target')
        .eq('branch_id', activeBranch.id)
        .maybeSingle(),
    ])
    setRows(currentRes.data || [])
    setPriorRows(priorRes.data || [])
    setCompetitors(compRes.data || [])
    setApprovals(approvalsRes.data || [])
    const target = Number(
      targetsRes.data?.occupancy_target
      ?? targetsRes.data?.occ_target
      ?? 80,
    )
    // Clamp to plausible range — guards against junk values in the DB
    // that would render the reference line off-screen.
    setOccupancyTarget(Number.isFinite(target) && target > 0 && target <= 100 ? target : 80)
    setLoading(false)
  }, [activeBranch, window, supabase, hasAutoPush])

  useEffect(() => { load() }, [load])

  // Collapse duplicate rows per date (caused by re-imports that
  // happened before migration 018's unique constraint was applied,
  // visible in production as ~10× inflated totals on the dashboard)
  // and filter to days that actually have data so empty padding rows
  // don't shrink the sparkline bars to 1px each. activeRows is the
  // single source of truth — chart, aggregator, breakdown picker,
  // and the subtitle day count all read from it.
  const activeRows = useMemo(() => activeMetrics(rows), [rows])
  const activePriorRows = useMemo(() => activeMetrics(priorRows), [priorRows])

  const stats = useMemo(() => {
    return {
      current: aggregate(activeRows),
      prior: aggregate(activePriorRows),
    }
  }, [activeRows, activePriorRows])

  // Run the rate-recommendation engine client-side against the same
  // dedupe-and-filter output the KPIs use. Pure / synchronous / cheap;
  // no need for a nightly cron + persisted table for the in-app view.
  // (If we add a LINE delivery channel later, that flow can persist
  //  via /api/notifications/morning-flash — separate ticket.)
  //
  // Competitor rates collected from /ratedesk/competitors are layered
  // onto the engine inputs via attachCompetitorRates(). The two
  // competitor-aware signals (undercut + overpricing) require ≥3 days
  // with competitor data before firing, so the owner needs to log
  // rates for a few days before those recs surface.
  const recommendations = useMemo(() => {
    const baseInputs = toRecommendationInputs(activeRows)
    const inputsWithCompetitors = attachCompetitorRates(baseInputs, competitors)
    return generateDailyRecommendations(inputsWithCompetitors)
  }, [activeRows, competitors])

  // Active branch isn't a hotel → friendly redirect-ish notice.
  if (activeBranch && activeBranch.business_type !== 'accommodation') {
    return (
      <div style={{ padding: 40, color: 'var(--color-text-tertiary)', fontSize: 14 }}>
        {t('hotelOnly')}
      </div>
    )
  }

  // Staff lands in the useEffect redirect above; return null so we
  // don't briefly paint a forbidden surface on the way out.
  if (!isAllowed) return null

  if (loading) {
    return <div style={{ padding: 40, color: 'var(--color-text-tertiary)' }}>{t('loading')}</div>
  }

  if (rows.length === 0) {
    return <EmptyState t={t} />
  }

  const sparkData = activeRows.map((r) => {
    const occ = r.rooms_available && r.rooms_available > 0 && r.rooms_sold != null
      ? (r.rooms_sold / r.rooms_available) * 100
      : 0
    return { date: r.metric_date, value: occ }
  })

  // Same rows, reshaped to DemandCalendar's minimal prop type (fraction
  // 0..1, not the ×100 sparkData uses) — avoids a second fetch for data
  // this page already has.
  const demandCalendarRows = activeRows.map((r) => ({
    metric_date: r.metric_date,
    activityLevel: r.rooms_available && r.rooms_available > 0 && r.rooms_sold != null
      ? r.rooms_sold / r.rooms_available
      : null,
  }))

  // Room-type breakdown aggregated across every day in the window
  // that has CSV-imported data (form entries don't carry a
  // room_type_breakdown JSON, so they're naturally excluded). The
  // table previously rendered only the latest single day, which
  // disagreed with the 30-day KPIs above and confused owners
  // looking at /ratedesk. Now both the headline KPIs and this
  // table summarise the same window; the caption underneath tells
  // the operator how many of the windowed days had breakdown data
  // feeding it.
  const breakdownRows = aggregateBreakdown(activeRows)
  const breakdownDayCount = activeRows.filter(
    (r) => Array.isArray(r.room_type_breakdown) && r.room_type_breakdown.length > 0,
  ).length

  // "No data for today" detection. activeMetrics() filters out empty
  // days, so if today's BKK date isn't present in activeRows then
  // either the owner hasn't entered today's row yet or they entered
  // zeros (which read as "no data" for our purposes). Surfaces a
  // call-to-action card at the top of the dashboard so the owner
  // doesn't have to hunt for /entry in the nav.
  const todayBkk = getTodayBangkok()
  const hasTodayRow = activeRows.some((r) => r.metric_date === todayBkk)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: 'var(--color-text-primary)', margin: 0 }}>
            {t('title')}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
            {activeBranch?.name} · {t('windowLabel', { days: window })}
            {activeRows.length > 0 && (
              <> · {t('daysWithData', { count: activeRows.length })}</>
            )}
          </p>
        </div>
        <div style={{ display: 'inline-flex', gap: 4, background: 'var(--color-bg-surface, #f4f4f2)', padding: 3, borderRadius: 999 }}>
          {WINDOWS.map((w) => {
            const active = w === window
            return (
              <button
                key={w}
                type="button"
                onClick={() => setWindow(w)}
                style={{
                  padding: '6px 14px',
                  border: 'none',
                  borderRadius: 999,
                  background: active ? '#ffffff' : 'transparent',
                  color: active ? '#1a1a1a' : '#6b6b6b',
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  cursor: 'pointer',
                  boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                {w}d
              </button>
            )
          })}
        </div>
      </div>

      {/* Empty state for today — if there's no row for today's BKK
          calendar date, surface a prominent "Log today's data" CTA
          that deep-links to /entry. Closes the loop for hotel owners
          who otherwise have to remember to navigate to the nav tab
          every morning. Suppressed when today already has data, so
          the dashboard stays clean during the rest of the day. */}
      {!loading && activeBranch && !hasTodayRow && (
        <section style={{
          background: '#FFFBEB',
          border: '1px solid #FCD34D',
          borderRadius: 8,
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
        }}>
          <Edit3 size={18} color="#92400E" />
          <div style={{ flex: 1, minWidth: 200 }}>
            <strong style={{ color: '#92400E', fontSize: 14, display: 'block', marginBottom: 2 }}>
              {t('todayMissingTitle')}
            </strong>
            <span style={{ color: '#78350F', fontSize: 12 }}>
              {t('todayMissingBody')}
            </span>
          </div>
          <Link
            href="/entry"
            style={{
              background: '#92400E',
              color: '#FFFBEB',
              padding: '8px 14px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {t('logTodayCta')} <ArrowRight size={14} />
          </Link>
        </section>
      )}

      {/* Auto Push upgrade nudge — non-Pro plans only. Sits above the
          recommendations so the owner sees the upsell before the value
          (recommendations) they'd be acting on with one tap. Suppressed
          for Pro/Enterprise where the feature is already active. */}
      {!hasAutoPush && (
        <section style={{ background: 'var(--color-bg-surface, #F8F7FF)', borderRadius: 8, padding: '12px 16px', fontSize: 13, lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--color-accent, #534AB7)' }}>{t('autoPushTitle')}</strong>
          <span style={{ color: 'var(--color-text-secondary, #6B7280)' }}>
            {' — '}{t('autoPushPitch')}
          </span>{' '}
          <Link href="/settings/billing" style={{ color: 'var(--color-accent, #534AB7)', fontWeight: 500 }}>
            {t('upgradeToPro')} →
          </Link>
        </section>
      )}

      {/* Recommendations — runs the rate-optimisation engine on the
          fetched window. Empty state nudges the owner to import more
          history. Shown above the KPIs so it's the first thing the
          owner sees on the page. */}
      <RecommendationsSection
        recs={recommendations}
        dayCount={activeRows.length}
        t={t}
      />

      {/* KPI cards — every label carries the window suffix (30d/60d/90d)
          so the owner can never misread a 30-day total as "today" or
          "this week". Total Revenue is a SUM across the window so the
          suffix is load-bearing; Occupancy/ADR/RevPAR are averages where
          the suffix is still useful context but less critical. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <KpiCard
          label={`${t('occupancy')} (${window}d)`}
          value={`${Math.round(stats.current.occupancy * 100)}%`}
          delta={pct(stats.current.occupancy, stats.prior.occupancy)}
        />
        <KpiCard
          label={`${t('adr')} (${window}d)`}
          value={`฿${Math.round(stats.current.adr).toLocaleString('th-TH')}`}
          delta={pct(stats.current.adr, stats.prior.adr)}
        />
        <KpiCard
          label={`${t('revpar')} (${window}d)`}
          value={`฿${Math.round(stats.current.revpar).toLocaleString('th-TH')}`}
          delta={pct(stats.current.revpar, stats.prior.revpar)}
        />
        {/* Total Revenue — owner only. Managers see the 3 operational
            cards above; the 4th slot is fully omitted rather than
            placeholdered to avoid the "what am I missing?" curiosity
            that a blurred card would create. */}
        {showRevenue && (
          <KpiCard
            label={`${t('totalRevenue')} (${window}d)`}
            value={`฿${Math.round(stats.current.totalRevenue).toLocaleString('th-TH')}`}
            delta={pct(stats.current.totalRevenue, stats.prior.totalRevenue)}
          />
        )}
      </div>

      {/* Sparkline */}
      <section style={card}>
        <h3 style={cardTitle}>{t('occupancyTrend')} ({window}d)</h3>
        {/* Occupancy is naturally bounded 0..100% — fix the scale at 100
            so a single outlier day above target doesn't crush the visible
            spread of the rest of the window. The target comes from
            /settings/targets per branch; default 80 only when no row. */}
        <SparklineChart
          label=""
          data={sparkData}
          target={occupancyTarget}
          ceiling={100}
          showValueLabels={sparkData.length <= 14}
          formatValue={(v) => `${Math.round(v)}%`}
        />
      </section>

      {/* Demand calendar — Pro only, same gate as the legacy /pricing
          page's copy of this widget. No revenue data involved, so no
          role gating beyond the existing page-level access check. */}
      {plan === 'pro' && <DemandCalendar data={demandCalendarRows} />}

      {/* Room-type breakdown */}
      <section style={card}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h3 style={cardTitle}>{t('roomTypeBreakdown')}</h3>
          {breakdownRows.length > 0 && (
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              {t('breakdownSource', { days: breakdownDayCount })}
            </span>
          )}
        </div>
        {breakdownRows.length === 0 ? (
          <div style={{ padding: '12px 0', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            {t('noBreakdownHint')}{' '}
            <Link href="/settings/import" style={{ color: 'var(--color-accent, #534AB7)' }}>
              {t('importCsv')} →
            </Link>
          </div>
        ) : (
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginTop: 6 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th style={th}>{t('colRoomType')}</th>
                <th style={th}>{t('colRooms')}</th>
                <th style={th}>{t('colOccupancy')}</th>
                <th style={th}>{t('colAdr')}</th>
                <th style={th}>{t('colRevpar')}</th>
              </tr>
            </thead>
            <tbody>
              {breakdownRows.map((r) => (
                <tr key={r.roomType} style={{ borderTop: '1px solid #f0f0ee' }}>
                  <td style={td}>{r.roomType}</td>
                  <td style={td}>{r.totalRooms}</td>
                  <td style={td}>{Math.round(r.occupancyRate * 100)}%</td>
                  <td style={td}>฿{Math.round(r.adr).toLocaleString('th-TH')}</td>
                  <td style={td}>฿{Math.round(r.revpar).toLocaleString('th-TH')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Competitor overlay — ฿0 rows are placeholder competitors the
          owner added at /ratedesk/competitors but hasn't yet entered
          a rate for. Hide them from the table so the dashboard doesn't
          flash "Pullman Korat ฿0" as if it were a real data point.
          The engine adapter already filters zeros, so the rec layer
          isn't affected. */}
      <section style={card}>
        <h3 style={cardTitle}>{t('competitorRates')}</h3>
        {(() => {
          const realRates = competitors.filter((c) => Number(c.rate) > 0)
          if (realRates.length === 0) {
            return (
              <div style={{ padding: '12px 0', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                {t('noCompetitors')}{' '}
                <Link href="/ratedesk/competitors" style={{ color: 'var(--color-accent, #534AB7)' }}>
                  {t('manageCompetitors')} →
                </Link>
              </div>
            )
          }
          return (
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginTop: 6 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th style={th}>{t('colCompetitor')}</th>
                  <th style={th}>{t('colRoomType')}</th>
                  <th style={th}>{t('colRate')}</th>
                  <th style={th}>{t('colCaptured')}</th>
                </tr>
              </thead>
              <tbody>
                {realRates.slice(0, 10).map((c, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f0f0ee' }}>
                    <td style={td}>{c.competitor_name}</td>
                    <td style={td}>{c.room_type}</td>
                    <td style={td}>฿{Math.round(c.rate).toLocaleString('th-TH')}</td>
                    <td style={{ ...td, color: 'var(--color-text-tertiary)' }}>{c.captured_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        })()}
      </section>

      {/* Auto Push approval history — Pro plans only. Reads the last 7
          rate_approvals rows for this branch and renders one line per
          row with a status badge. Cloudbeds write-back (push_status →
          success) lands in Phase R3; until then approved rows show
          "pending push" in amber so the owner has visibility but isn't
          surprised when the PMS doesn't change. */}
      {hasAutoPush && (
        <section style={card}>
          <h3 style={cardTitle}>{t('approvalHistoryTitle')}</h3>
          {approvals.length === 0 ? (
            <div style={{ padding: '12px 0', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              {t('approvalHistoryEmpty')}
            </div>
          ) : (
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginTop: 6 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th style={th}>{t('colDate')}</th>
                  <th style={th}>{t('colSuggestedRate')}</th>
                  <th style={th}>{t('colApproved')}</th>
                  <th style={th}>{t('colStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {approvals.map((a, i) => {
                  const status = approvalStatus(a)
                  return (
                    <tr key={i} style={{ borderTop: '1px solid #f0f0ee' }}>
                      <td style={td}>{a.date}</td>
                      <td style={td}>
                        {a.room_type && a.room_type !== 'all'
                          ? `${a.room_type} · ฿${approvalThb(a).toLocaleString('th-TH')}`
                          : `฿${approvalThb(a).toLocaleString('th-TH')}`}
                      </td>
                      <td style={{ ...td, color: 'var(--color-text-tertiary)' }}>
                        {a.approved_at
                          ? `${t(`approvedVia.${a.approved_via || 'line'}`)} · ${fmtTime(a.approved_at)}`
                          : '—'}
                      </td>
                      <td style={td}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 500,
                          background: status.bg,
                          color: status.fg,
                        }}>
                          {t(status.labelKey)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  )
}

// Project a rate_approvals row's rate to a baht number for display.
// Prefers suggested_rate_satang (canonical post-migration-038); falls
// back to suggested_rate_thb for legacy rows. The satang→baht
// conversion lives in lib/money/satang and rounds half-up so display
// always reflects the closest whole baht.
function approvalThb(a: ApprovalRow): number {
  if (a.suggested_rate_satang != null) {
    return Math.round(a.suggested_rate_satang / 100)
  }
  return a.suggested_rate_thb ?? 0
}

// Compute the row's display status. Order matters: expiry beats
// "pending tap" so a row that was never approved and is now past
// expires_at shows "expired", not "awaiting approval".
function approvalStatus(a: ApprovalRow): { labelKey: string; bg: string; fg: string } {
  if (a.approved_at) {
    if (a.push_status === 'success') return { labelKey: 'statusPushed',     bg: '#F0FDF4', fg: '#166534' }
    if (a.push_status === 'failed')  return { labelKey: 'statusPushFailed', bg: '#FEF2F2', fg: '#991B1B' }
    if (a.push_status === 'skipped') return { labelKey: 'statusSkipped',    bg: '#F3F4F6', fg: '#6B7280' }
    // Approved + pending push → R3 will pick this up. Amber.
    return { labelKey: 'statusPendingPush', bg: '#FFFBEB', fg: '#92400E' }
  }
  if (new Date(a.expires_at).getTime() < Date.now()) {
    return { labelKey: 'statusExpired', bg: '#F3F4F6', fg: '#6B7280' }
  }
  // Brief sent, owner hasn't tapped yet.
  return { labelKey: 'statusAwaiting', bg: '#F8F7FF', fg: '#534AB7' }
}

// Format a timestamptz like "7:03 AM" in Bangkok time. Used in the
// "approved" column so the owner can correlate against when they
// tapped the brief.
function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Bangkok',
  }).format(new Date(iso))
}

// Collapse duplicates by metric_date (re-imports created multiple
// rows before migration 018's unique constraint went live) and drop
// days with no real data so the chart and KPIs only reflect what
// the owner actually entered or imported. Two consequences for the
// caller:
//   - the sparkline draws one bar per real day instead of 30 bars
//     where 27 are zero-height — fixes the "flat line at the bottom"
//     symptom even though every input bar was technically rendered;
//   - aggregate() sums each date once, so a 10× duplicated payload
//     stops surfacing as 10× revenue on the Total Revenue KPI.
// Note: this is a display-side fix only. The duplicate rows are still
// in the DB. Run the dedupe SQL in supabase/sql once the migration 018
// unique constraint is confirmed applied — see commit message for the
// snippet.
function activeMetrics(rows: MetricRow[]): MetricRow[] {
  const byDate = new Map<string, MetricRow>()
  for (const r of rows) byDate.set(r.metric_date, r)
  return Array.from(byDate.values())
    .filter((r) => (r.revenue ?? 0) > 0 || (r.rooms_sold ?? 0) > 0)
    .sort((a, b) => a.metric_date.localeCompare(b.metric_date))
}

// Same window as the headline KPIs — sum inventory and occupied
// room-nights per room_type across every day in the window that
// has a CSV-imported breakdown, then surface the window-wide
// occupancy / ADR / RevPAR per type. ADR is weighted by occupied
// room-nights so a low-occupancy day at a high rate doesn't drown
// out a high-occupancy day at a lower rate. Inventory uses
// max(totalRooms) per type — the assumption is the hotel's room
// count doesn't change inside the window; if it did, max is the
// most useful headline number to display ("you have N Deluxe
// rooms today").
function aggregateBreakdown(rows: MetricRow[]) {
  type Agg = { inventory: number; occupiedRoomNights: number; revenueThb: number; totalRoomNights: number }
  const byRoomType = new Map<string, Agg>()
  for (const r of rows) {
    if (!Array.isArray(r.room_type_breakdown)) continue
    for (const b of r.room_type_breakdown) {
      const acc = byRoomType.get(b.roomType) || {
        inventory: 0,
        occupiedRoomNights: 0,
        revenueThb: 0,
        totalRoomNights: 0,
      }
      acc.inventory = Math.max(acc.inventory, b.totalRooms || 0)
      acc.totalRoomNights += b.totalRooms || 0
      acc.occupiedRoomNights += b.occupiedRooms || 0
      acc.revenueThb += (b.rateThb || 0) * (b.occupiedRooms || 0)
      byRoomType.set(b.roomType, acc)
    }
  }
  return Array.from(byRoomType.entries())
    .map(([roomType, agg]) => {
      const occ = agg.totalRoomNights > 0 ? agg.occupiedRoomNights / agg.totalRoomNights : 0
      const adr = agg.occupiedRoomNights > 0 ? agg.revenueThb / agg.occupiedRoomNights : 0
      return {
        roomType,
        totalRooms: agg.inventory,
        occupancyRate: occ,
        adr,
        revpar: adr * occ,
      }
    })
    .sort((a, b) => b.revpar - a.revpar)
}

function aggregate(rows: MetricRow[]) {
  if (rows.length === 0) return { occupancy: 0, adr: 0, revpar: 0, totalRevenue: 0 }
  let totalRooms = 0
  let roomsSold = 0
  let totalRevenue = 0
  for (const r of rows) {
    totalRooms += r.rooms_available || 0
    roomsSold += r.rooms_sold || 0
    totalRevenue += r.revenue || 0
  }
  const occupancy = totalRooms > 0 ? roomsSold / totalRooms : 0
  const adr = roomsSold > 0 ? totalRevenue / roomsSold : 0
  const revpar = adr * occupancy
  return { occupancy, adr, revpar, totalRevenue }
}

function pct(curr: number, prior: number): { value: number; direction: 'up' | 'down' | 'flat' } {
  if (prior === 0) return { value: 0, direction: 'flat' }
  const delta = ((curr - prior) / prior) * 100
  const direction = delta > 0.5 ? 'up' : delta < -0.5 ? 'down' : 'flat'
  return { value: Math.abs(delta), direction }
}

function RecommendationsSection({
  recs,
  dayCount,
  t,
}: {
  recs: HotelRecommendation[]
  dayCount: number
  t: ReturnType<typeof useTranslations>
}) {
  const locale = useLocale()
  const isThai = locale === 'th'
  // Empty state when we don't have enough data yet — explicit about
  // the threshold (3 days) so the owner knows how many imports they
  // need before signals start firing.
  if (recs.length === 0) {
    return (
      <section style={{
        background: 'var(--color-bg-surface, #f7f7f5)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '12px 16px',
        fontSize: 13,
        color: 'var(--color-text-secondary)',
      }}>
        {t('recsEmpty', { days: dayCount })}
      </section>
    )
  }
  return (
    <section style={card}>
      <h3 style={cardTitle}>{t('recsTitle')}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
        {recs.map((r, i) => (
          <div
            key={`${r.type}-${i}`}
            style={{
              display: 'flex',
              gap: 12,
              padding: '10px 0',
              borderBottom: i < recs.length - 1 ? '1px solid var(--color-border)' : 'none',
            }}
          >
            <UrgencyPill urgency={r.urgency} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 1.55 }}>
                {isThai ? r.messageTh : r.messageEn}
              </div>
              {r.suggestedRateThb !== undefined && (
                <div style={{ fontSize: 12, color: 'var(--color-accent, #534AB7)', fontWeight: 500, marginTop: 2 }}>
                  {t('recsSuggestedRate')}: ฿{r.suggestedRateThb.toLocaleString('th-TH')}
                  {r.currentRateThb !== undefined && (
                    <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}>
                      {' '}({t('recsCurrentRate')}: ฿{r.currentRateThb.toLocaleString('th-TH')})
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

const URGENCY_STYLE: Record<HotelRecommendation['urgency'], { bg: string; fg: string; symbol: string }> = {
  high: { bg: '#FBEAEA', fg: '#A32D2D', symbol: '●' },
  medium: { bg: '#FFF4E0', fg: '#8A5A00', symbol: '◐' },
  low: { bg: '#F4F4F2', fg: '#6b6b6b', symbol: '○' },
}

function UrgencyPill({ urgency }: { urgency: HotelRecommendation['urgency'] }) {
  const s = URGENCY_STYLE[urgency]
  return (
    <span
      aria-label={urgency}
      style={{
        flexShrink: 0,
        width: 22,
        height: 22,
        borderRadius: 999,
        background: s.bg,
        color: s.fg,
        fontSize: 12,
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 1,
      }}
    >
      {s.symbol}
    </span>
  )
}

function KpiCard({ label, value, delta }: { label: string; value: string; delta: { value: number; direction: 'up' | 'down' | 'flat' } }) {
  const Icon = delta.direction === 'up' ? TrendingUp : delta.direction === 'down' ? TrendingDown : Minus
  const color = delta.direction === 'up' ? '#0F5132' : delta.direction === 'down' ? '#A32D2D' : '#9b9b9b'
  return (
    <div style={{
      background: 'var(--color-bg)',
      border: '1px solid var(--color-border)',
      borderRadius: 12,
      padding: '14px 16px',
    }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--color-text-primary)', margin: '6px 0 4px' }}>
        {value}
      </div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color }}>
        <Icon size={12} />
        {delta.direction === 'flat' ? '—' : `${delta.value.toFixed(1)}%`}
      </div>
    </div>
  )
}

function EmptyState({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div style={{
      background: 'var(--color-bg-surface, #f7f7f5)',
      border: '1px dashed var(--color-border)',
      borderRadius: 12,
      padding: '40px 20px',
      textAlign: 'center',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12,
    }}>
      <Upload size={28} style={{ color: '#9b9b9b' }} />
      <h2 style={{ fontSize: 16, fontWeight: 500, color: 'var(--color-text-primary)', margin: 0 }}>
        {t('emptyHeading')}
      </h2>
      <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', maxWidth: 360, margin: 0, lineHeight: 1.55 }}>
        {t('emptyBody')}
      </p>
      <Link
        href="/settings/import"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '10px 18px',
          background: 'var(--color-accent, #534AB7)',
          color: '#ffffff',
          fontSize: 13,
          fontWeight: 500,
          borderRadius: 8,
          textDecoration: 'none',
        }}
      >
        {t('emptyCta')} <ArrowRight size={14} />
      </Link>
    </div>
  )
}

const card: React.CSSProperties = {
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 12,
  padding: '14px 16px',
}
const cardTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--color-text-primary)',
  margin: '0 0 8px',
}
const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  fontSize: 11,
  fontWeight: 500,
  color: 'var(--color-text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}
const td: React.CSSProperties = {
  padding: '8px 12px',
  color: 'var(--color-text-primary)',
}
