'use client'

// MenuDesk — F&B counterpart of RateDesk.
//
// Purpose: surface daily revenue + cover trends and menu-economics
// signals (food cost %, margin distribution) so the owner sees how
// their F&B branch is performing at a glance.
//
// Data sources (in priority order):
//   1. fnb_daily_metrics — manual daily entries from /entry. Currently
//      the primary data source until the POS adapter / CSV import ships.
//   2. fnb_daily_rollup view — POS-grained per-day aggregates from
//      fnb_daily_sales × menu_items. Empty until the F&B sales CSV
//      import (next slice) or a POS adapter populates fnb_daily_sales.
//      When present, gives a more accurate revenue + cost picture.
//   3. menu_items — catalog count for the "X items in your menu"
//      header pill. Linked off /settings/menu for inline catalog edits.
//
// Hot path: owner opens /menudesk each morning, sees revenue + covers
// trend, gets one or two operational recommendations from the engine,
// notices any data gaps via the today-missing CTA.
//
// Out of scope (deferred until future slices):
//   - Top movers panel (depends on fnb_daily_sales having data)
//   - Per-menu-item rate signals (depends on rollup data)
//   - Auto Push for menu prices (depends on POS adapter being live)

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useUser } from '@/providers/user-context'
import { createClient } from '@/lib/supabase/client'
import { ArrowRight, Edit3, TrendingUp, TrendingDown, Minus, UtensilsCrossed } from 'lucide-react'
import { SparklineChart } from '@/components/sparkline-chart'
import { canSeeRevenue } from '@/lib/auth/ratedesk-permissions'
import { getTodayBangkok } from '@/lib/businessDate'

interface MetricRow {
  metric_date: string
  revenue: number | null
  total_customers: number | null
  cost_food: number | null
  cost_nonfood: number | null
}

const WINDOWS = [30, 60, 90] as const
type WindowKey = (typeof WINDOWS)[number]

export default function MenuDeskPage() {
  const router = useRouter()
  const { activeBranch, role } = useUser()
  const t = useTranslations('menudesk')
  const supabase = createClient()

  // F&B-only — staff has no access; owner + manager only. Mirrors the
  // ratedesk page-level guard pattern.
  const isFnb = activeBranch?.business_type === 'fnb'
  const isAllowed = (role === 'owner' || role === 'manager' || role === 'superadmin') && isFnb
  useEffect(() => {
    if (activeBranch && !isAllowed) router.replace('/home')
  }, [activeBranch, isAllowed, router])

  // Revenue card visibility comes from the cross-cutting canSeeRevenue
  // gate — same source of truth used on /ratedesk and /home for F&B.
  // Managers see operational KPIs (covers, food cost %) but not the
  // P&L-sensitive revenue figure.
  const showRevenue = canSeeRevenue(role)

  const [window, setWindow] = useState<WindowKey>(30)
  const [rows, setRows] = useState<MetricRow[]>([])
  const [priorRows, setPriorRows] = useState<MetricRow[]>([])
  const [menuItemCount, setMenuItemCount] = useState<number>(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!activeBranch || !isFnb) {
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

    const [currentRes, priorRes, menuRes] = await Promise.all([
      db
        .from('fnb_daily_metrics')
        .select('metric_date, revenue, total_customers, cost_food, cost_nonfood')
        .eq('branch_id', activeBranch.id)
        .gte('metric_date', iso(windowStart))
        .lte('metric_date', iso(endDate))
        .order('metric_date', { ascending: true }),
      db
        .from('fnb_daily_metrics')
        .select('metric_date, revenue, total_customers, cost_food, cost_nonfood')
        .eq('branch_id', activeBranch.id)
        .gte('metric_date', iso(priorStart))
        .lt('metric_date', iso(windowStart)),
      // Active menu items count — small fact for the header pill.
      // Counts only is_active=true.
      db
        .from('menu_items')
        .select('id', { count: 'exact', head: true })
        .eq('branch_id', activeBranch.id)
        .eq('is_active', true),
    ])
    setRows(currentRes.data || [])
    setPriorRows(priorRes.data || [])
    setMenuItemCount(menuRes.count ?? 0)
    setLoading(false)
  }, [activeBranch, window, supabase, isFnb])

  useEffect(() => { load() }, [load])

  // Collapse duplicates by date + drop empty days so the chart
  // doesn't render blank bars. Same dedup pattern as /ratedesk's
  // activeMetrics() — single source of truth across the dashboard.
  const activeRows = useMemo(() => activeMetrics(rows), [rows])
  const activePriorRows = useMemo(() => activeMetrics(priorRows), [priorRows])

  const stats = useMemo(() => ({
    current: aggregate(activeRows),
    prior: aggregate(activePriorRows),
  }), [activeRows, activePriorRows])

  const sparkData = useMemo(
    () => activeRows.map((r) => ({ date: r.metric_date, value: Number(r.revenue) || 0 })),
    [activeRows],
  )

  // Today-missing CTA — mirrors /ratedesk's logic. If today's BKK
  // calendar date isn't in activeRows (either no row or row with no
  // revenue), surface a prominent link to /entry.
  const todayBkk = getTodayBangkok()
  const hasTodayRow = activeRows.some((r) => r.metric_date === todayBkk)

  if (!isAllowed) return null
  if (!activeBranch) return null
  if (!isFnb) {
    return (
      <div style={{ padding: 24, color: 'var(--color-text-tertiary)', fontSize: 13 }}>
        {t('fnbOnly')}
      </div>
    )
  }

  const card: React.CSSProperties = {
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    padding: 16,
  }

  const cardTitle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 500,
    margin: 0,
    marginBottom: 12,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: 'var(--color-text-primary)', margin: 0 }}>
            {t('title')}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
            {activeBranch.name} · {t('windowLabel', { days: window })}
            {activeRows.length > 0 && <> · {t('daysWithData', { count: activeRows.length })}</>}
            {menuItemCount > 0 && (
              <> · <Link href="/settings/menu" style={{ color: 'var(--color-accent, #534AB7)', textDecoration: 'none' }}>{t('menuItemsCount', { count: menuItemCount })}</Link></>
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

      {/* Today-missing CTA — mirrors /ratedesk */}
      {!loading && !hasTodayRow && (
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

      {/* Empty state — no menu items yet */}
      {!loading && menuItemCount === 0 && (
        <section style={{
          background: 'var(--color-bg-surface)',
          border: '1px dashed var(--color-border)',
          borderRadius: 8,
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
        }}>
          <UtensilsCrossed size={20} color="#534AB7" />
          <div style={{ flex: 1, minWidth: 200, fontSize: 13, color: 'var(--color-text-secondary)' }}>
            {t('noMenuYet')}
          </div>
          <Link
            href="/settings/menu"
            style={{
              background: 'var(--color-accent, #534AB7)',
              color: 'white',
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
            {t('addMenuItems')} <ArrowRight size={14} />
          </Link>
        </section>
      )}

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <KpiCard
          label={t('covers', { days: window })}
          value={stats.current.totalCovers > 0 ? stats.current.totalCovers.toLocaleString('th-TH') : '—'}
          delta={pct(stats.current.totalCovers, stats.prior.totalCovers)}
        />
        <KpiCard
          label={t('avgPerCover', { days: window })}
          value={stats.current.avgPerCover > 0 ? `฿${Math.round(stats.current.avgPerCover).toLocaleString('th-TH')}` : '—'}
          delta={pct(stats.current.avgPerCover, stats.prior.avgPerCover)}
        />
        <KpiCard
          label={t('foodCostPct', { days: window })}
          value={stats.current.foodCostPct != null ? `${stats.current.foodCostPct.toFixed(1)}%` : '—'}
          delta={
            stats.current.foodCostPct != null && stats.prior.foodCostPct != null
              ? pct(stats.current.foodCostPct, stats.prior.foodCostPct, /* lowerIsBetter */ true)
              : { value: 0, direction: 'flat' as const }
          }
          subLabel={stats.current.foodCostPct == null ? t('foodCostHint') : undefined}
        />
        {showRevenue && (
          <KpiCard
            label={t('totalRevenue', { days: window })}
            value={`฿${Math.round(stats.current.totalRevenue).toLocaleString('th-TH')}`}
            delta={pct(stats.current.totalRevenue, stats.prior.totalRevenue)}
          />
        )}
      </div>

      {/* Revenue chart */}
      <section style={card}>
        <h3 style={cardTitle}>{t('revenueTrend', { days: window })}</h3>
        <SparklineChart
          label=""
          data={sparkData}
          showValueLabels={sparkData.length <= 14}
          formatValue={(v) => `฿${Math.round(v).toLocaleString('th-TH')}`}
        />
      </section>

      {/* Future: top movers panel — currently empty placeholder.
          Will populate when fnb_daily_sales has data (CSV import or
          POS adapter). Hidden until then to avoid a hollow "no data
          yet" card every owner sees on day 1. */}
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────

// Collapse duplicates by metric_date and drop empty days. Same
// pattern as /ratedesk's activeMetrics(). For F&B "empty" = revenue
// is null or 0 AND total_customers is null or 0.
function activeMetrics(rows: MetricRow[]): MetricRow[] {
  const byDate = new Map<string, MetricRow>()
  for (const r of rows) byDate.set(r.metric_date, r)
  return Array.from(byDate.values())
    .filter((r) => (Number(r.revenue) || 0) > 0 || (Number(r.total_customers) || 0) > 0)
    .sort((a, b) => a.metric_date.localeCompare(b.metric_date))
}

interface Aggregate {
  totalRevenue: number
  totalCovers: number
  avgPerCover: number
  foodCostPct: number | null
}

function aggregate(rows: MetricRow[]): Aggregate {
  if (rows.length === 0) {
    return { totalRevenue: 0, totalCovers: 0, avgPerCover: 0, foodCostPct: null }
  }
  let totalRevenue = 0
  let totalCovers = 0
  let totalCostFood = 0
  let hasAnyCost = false
  let allRowsHaveCost = true
  for (const r of rows) {
    totalRevenue += Number(r.revenue) || 0
    totalCovers += Number(r.total_customers) || 0
    if (r.cost_food != null) {
      totalCostFood += Number(r.cost_food)
      hasAnyCost = true
    } else {
      allRowsHaveCost = false
    }
  }
  // Food cost % is the truthful aggregate only when every row in the
  // window carries a cost_food value. Partial data would mislead — same
  // rule the fnb_daily_rollup view applies for the POS-grained data.
  const foodCostPct = hasAnyCost && allRowsHaveCost && totalRevenue > 0
    ? (totalCostFood / totalRevenue) * 100
    : null
  const avgPerCover = totalCovers > 0 ? totalRevenue / totalCovers : 0
  return { totalRevenue, totalCovers, avgPerCover, foodCostPct }
}

// Percentage delta vs prior window. lowerIsBetter flips the direction
// arrow so e.g. food cost % going DOWN reads as positive.
function pct(curr: number, prior: number, lowerIsBetter = false): { value: number; direction: 'up' | 'down' | 'flat' } {
  if (prior === 0) return { value: 0, direction: 'flat' }
  const delta = ((curr - prior) / prior) * 100
  if (Math.abs(delta) < 0.5) return { value: 0, direction: 'flat' }
  const dir = delta > 0 ? 'up' : 'down'
  // For "lower is better" metrics, swap up/down so an improvement
  // (food cost dropped) still shows the green up arrow.
  if (lowerIsBetter) {
    return { value: Math.abs(delta), direction: dir === 'up' ? 'down' : 'up' }
  }
  return { value: Math.abs(delta), direction: dir }
}

// ─── KPI Card ───────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string
  value: string
  delta: { value: number; direction: 'up' | 'down' | 'flat' }
  subLabel?: string
}

function KpiCard({ label, value, delta, subLabel }: KpiCardProps) {
  const deltaColor = delta.direction === 'up' ? '#0F5132' : delta.direction === 'down' ? '#A32D2D' : 'var(--color-text-tertiary)'
  const Arrow = delta.direction === 'up' ? TrendingUp : delta.direction === 'down' ? TrendingDown : Minus
  return (
    <div style={{
      background: 'var(--color-bg)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      padding: '12px 14px',
    }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 500, marginTop: 4 }}>{value}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 12, color: deltaColor }}>
        <Arrow size={12} />
        {delta.value > 0 ? `${delta.value.toFixed(1)}%` : '—'}
      </div>
      {subLabel && (
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 6 }}>{subLabel}</div>
      )}
    </div>
  )
}
