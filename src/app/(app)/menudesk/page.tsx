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
import { ArrowRight, Edit3, TrendingUp, TrendingDown, Minus, UtensilsCrossed, Upload, Download } from 'lucide-react'
import { SparklineChart } from '@/components/sparkline-chart'
import { canSeeRevenue } from '@/lib/auth/ratedesk-permissions'
import { getTodayBangkok } from '@/lib/businessDate'
import { buildFnbSalesCsvTemplate } from '@/lib/ingestion/csv-fnb-sales'

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
  // Catalog (active items only) — used for the count display, the
  // empty-state CTA, and the CSV template generator.
  const [menuItems, setMenuItems] = useState<Array<{ id: string; name: string; external_item_id: string | null }>>([])
  // Top movers — top items by units sold across the window. Populated
  // by aggregating fnb_daily_sales × menu_items client-side. Empty
  // when there's no sales data yet for this branch (panel hides).
  const [topMovers, setTopMovers] = useState<Array<{
    id: string
    name: string
    category: string | null
    unitsSold: number
    revenueThb: number
  }>>([])
  const [loading, setLoading] = useState(true)

  // CSV import state — single-shot: pick file → upload → show result.
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<
    | null
    | {
        imported: number
        skipped: number
        skippedUnknownItem?: number
        unmatchedSamples?: Array<{ lineHint: number; reason: string }>
        warnings: Array<{ lineNumber: number; code: string; raw: string }>
      }
  >(null)
  const [importError, setImportError] = useState<string | null>(null)

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

    const [currentRes, priorRes, menuRes, salesRes] = await Promise.all([
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
      // Active menu items — used for the count pill, the empty-state
      // CTA, and the CSV template generator (name + optional
      // external_item_id is enough; full catalog edit lives at
      // /settings/menu).
      db
        .from('menu_items')
        .select('id, name, category, external_item_id, price_thb')
        .eq('branch_id', activeBranch.id)
        .eq('is_active', true)
        .order('name', { ascending: true }),
      // Sales facts for the window — used to compute top movers.
      // Embed the menu_items row via the FK so we get name + price
      // without a second round-trip. Capped at 5000 sales rows
      // (30 days × ~150 items = 4500 — comfortable headroom).
      db
        .from('fnb_daily_sales')
        .select('menu_item_id, units_sold, date')
        .eq('branch_id', activeBranch.id)
        .gte('date', iso(windowStart))
        .lte('date', iso(endDate))
        .limit(5000),
    ])
    setRows(currentRes.data || [])
    setPriorRows(priorRes.data || [])

    // Strip price_thb back out before storing — the rest of the page
    // expects the narrower shape. Top-movers compute below uses the
    // full row.
    type MenuRow = {
      id: string
      name: string
      category: string | null
      external_item_id: string | null
      price_thb: number
    }
    const menuRows: MenuRow[] = (menuRes.data || []) as MenuRow[]
    setMenuItems(menuRows.map(({ id, name, external_item_id }) => ({ id, name, external_item_id })))

    // Aggregate sales by menu_item_id, then top-5 by units. Doing it
    // client-side because Supabase's REST API doesn't natively
    // support GROUP BY + ORDER BY aggregation; the dataset is small
    // (4500 rows max) so the cost is trivial and we avoid an RPC.
    const salesData = (salesRes.data || []) as Array<{ menu_item_id: string; units_sold: number }>
    const byMenuItem = new Map<string, { units: number }>()
    for (const s of salesData) {
      const entry = byMenuItem.get(s.menu_item_id) || { units: 0 }
      entry.units += s.units_sold
      byMenuItem.set(s.menu_item_id, entry)
    }
    const menuById = new Map(menuRows.map((m) => [m.id, m]))
    const movers = Array.from(byMenuItem.entries())
      .map(([id, agg]) => {
        const item = menuById.get(id)
        if (!item) return null  // sale references an archived/deleted item; skip
        return {
          id,
          name: item.name,
          category: item.category,
          unitsSold: agg.units,
          revenueThb: agg.units * item.price_thb,
        }
      })
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, 5)
    setTopMovers(movers)

    setLoading(false)
  }, [activeBranch, window, supabase, isFnb])

  // Convenience accessor matching the previous count-only shape.
  const menuItemCount = menuItems.length

  // CSV template download. Uses the branch's active menu items as
  // the row scaffold; owner fills units_sold per (date × item) and
  // re-uploads via the picker below.
  function downloadTemplate() {
    if (!activeBranch || menuItems.length === 0) return
    const tmrw = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
    const csv = buildFnbSalesCsvTemplate({
      items: menuItems.map((m) => ({ name: m.name, external_item_id: m.external_item_id })),
      startDate: tmrw,
      days: 7,
    })
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fnb-sales-template-${tmrw}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function handleImportFile(file: File) {
    if (!activeBranch) return
    setImporting(true)
    setImportResult(null)
    setImportError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/branches/${activeBranch.id}/fnb-sales/import`, {
        method: 'POST',
        body: form,
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setImportError((json?.error as string) || res.statusText)
        return
      }
      setImportResult(json)
      // Refresh the dashboard data — the new sales rows will start
      // flowing into the rollup view (and the chart will react when
      // future slices wire fnb_daily_rollup as a data source).
      await load()
    } finally {
      setImporting(false)
    }
  }

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

      {/* CSV sales import — only renders when the branch has menu
          items. Without a catalog, sales rows have nothing to match
          against, so the empty-state CTA below takes precedence. */}
      {!loading && menuItemCount > 0 && (
        <section
          style={{
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            padding: '10px 14px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 10,
            fontSize: 12,
          }}
        >
          <span style={{ color: 'var(--color-text-secondary)', flex: 1, minWidth: 200 }}>
            {t('importBlurb')}
          </span>
          <button
            type="button"
            onClick={downloadTemplate}
            style={{
              padding: '6px 10px',
              fontSize: 12,
              background: 'transparent',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Download size={12} /> {t('downloadTemplate')}
          </button>
          <label
            style={{
              padding: '6px 10px',
              fontSize: 12,
              background: 'var(--color-accent, #534AB7)',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: importing ? 'not-allowed' : 'pointer',
              opacity: importing ? 0.5 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Upload size={12} /> {importing ? t('importing') : t('importSales')}
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={importing}
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) {
                  handleImportFile(file)
                  // Allow re-upload of same file by resetting the input.
                  e.target.value = ''
                }
              }}
            />
          </label>
        </section>
      )}

      {importError && (
        <section style={{
          background: '#FBEAEA',
          border: '1px solid #F5C6C6',
          color: '#A32D2D',
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: 13,
        }}>
          {importError}
        </section>
      )}

      {importResult && (
        <section
          style={{
            background: importResult.imported > 0 ? '#F0FDF4' : '#FFFBEB',
            border: `1px solid ${importResult.imported > 0 ? '#BBF7D0' : '#FCD34D'}`,
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 12,
            color: importResult.imported > 0 ? '#166534' : '#92400E',
          }}
        >
          <div style={{ fontWeight: 500, marginBottom: 4 }}>
            {t('importSummary', { imported: importResult.imported, skipped: importResult.skipped })}
          </div>
          {/* Guard against JSX rendering literal 0 — `0 && ...` short-circuits
              to the number 0 which React renders as text. Compare against
              > 0 explicitly. */}
          {(importResult.skippedUnknownItem ?? 0) > 0 && (
            <div style={{ marginTop: 4 }}>
              {t('importSkippedUnknown', { count: importResult.skippedUnknownItem ?? 0 })}
            </div>
          )}
          {importResult.unmatchedSamples && importResult.unmatchedSamples.length > 0 && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: 'pointer' }}>{t('importUnmatchedToggle')}</summary>
              <ul style={{ marginTop: 6, paddingLeft: 18, fontSize: 11, lineHeight: 1.5 }}>
                {importResult.unmatchedSamples.map((u, i) => (
                  <li key={i}>
                    {t('importWarningLine', { line: u.lineHint })} — {u.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {importResult.warnings.length > 0 && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: 'pointer' }}>
                {t('importWarningsToggle', { count: importResult.warnings.length })}
              </summary>
              <ul style={{ marginTop: 6, paddingLeft: 18, fontSize: 11, lineHeight: 1.5 }}>
                {importResult.warnings.slice(0, 20).map((w, i) => (
                  <li key={i}>
                    {t('importWarningLine', { line: w.lineNumber })} — {t(`importError.${w.code}`)}
                    {/* Surface the raw diagnostic detail. For
                        missing_columns this carries "expected vs found
                        + separator + size + line count" — enough to
                        diagnose without a back-and-forth. For other
                        codes it's the offending CSV line truncated. */}
                    {w.raw && (
                      <div style={{ marginTop: 2, fontFamily: 'ui-monospace, monospace', fontSize: 10, color: 'var(--color-text-tertiary)', wordBreak: 'break-word' }}>
                        {w.raw}
                      </div>
                    )}
                  </li>
                ))}
                {importResult.warnings.length > 20 && (
                  <li style={{ color: 'var(--color-text-tertiary)' }}>
                    {t('importWarningsMore', { count: importResult.warnings.length - 20 })}
                  </li>
                )}
              </ul>
            </details>
          )}

          {/* Targeted help when missing_columns fires — operators hit
              this most often with files that LOOK like CSVs but are
              actually XLSX/Numbers exports, or stubs that got renamed.
              The blurb lists the three common root causes + a fresh
              template-download button so they can restart cleanly. */}
          {importResult.warnings.some((w) => w.code === 'missing_columns') && (
            <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--color-bg-surface)', borderRadius: 6, fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              <strong style={{ display: 'block', marginBottom: 4, color: 'var(--color-text-primary)' }}>
                {t('missingColumnsHelpTitle')}
              </strong>
              <ul style={{ marginLeft: 16, listStyle: 'disc' }}>
                <li>{t('missingColumnsHelpExcel')}</li>
                <li>{t('missingColumnsHelpNumbers')}</li>
                <li>{t('missingColumnsHelpStub')}</li>
              </ul>
              <div style={{ marginTop: 6 }}>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  style={{
                    padding: '4px 10px',
                    fontSize: 11,
                    background: 'transparent',
                    border: '1px solid var(--color-border)',
                    borderRadius: 4,
                    color: 'var(--color-accent, #534AB7)',
                    cursor: 'pointer',
                  }}
                >
                  {t('redownloadTemplate')}
                </button>
              </div>
            </div>
          )}
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

      {/* Top movers — populated from fnb_daily_sales × menu_items
          aggregated over the active window. Hidden when there's no
          sales data yet (CSV import / POS sync hasn't populated
          fnb_daily_sales) to avoid a hollow "no data" card on day 1. */}
      {topMovers.length > 0 && (
        <section style={card}>
          <h3 style={cardTitle}>{t('topMovers', { days: window })}</h3>
          <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: -8, marginBottom: 12 }}>
            {t('topMoversHint')}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topMovers.map((m, i) => {
              // Visual rank bar — width proportional to this item's
              // units relative to #1. Gives a glance-level "how big
              // is the gap between top sellers" cue.
              const topUnits = topMovers[0].unitsSold
              const barPct = topUnits > 0 ? Math.round((m.unitsSold / topUnits) * 100) : 0
              return (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', width: 18 }}>
                    #{i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.name}
                        {m.category && (
                          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 6, fontWeight: 400 }}>
                            · {m.category}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {t('topMoversUnits', { units: m.unitsSold })}
                        {showRevenue && (
                          <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 6 }}>
                            · ฿{Math.round(m.revenueThb).toLocaleString('th-TH')}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Proportional bar */}
                    <div style={{ height: 4, background: 'var(--color-bg-surface, #f4f4f2)', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${barPct}%`, background: 'var(--color-accent, #534AB7)', borderRadius: 2 }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
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
