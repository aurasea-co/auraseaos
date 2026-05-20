'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useBranchMetrics } from '@/hooks/useBranchMetrics'
import { useTargets } from '@/hooks/useTargets'
import { useUser } from '@/providers/user-context'
import { KpiCard } from '@/components/kpi-card'
import { BarChart } from '@/components/charts/BarChart'
import { LineChart } from '@/components/charts/LineChart'
import { PlanGate } from '@/components/ui/PlanGate'
import { formatChartDate, formatBaht, formatPct, groupByWeek, formatWeekRange } from '@/lib/formatters'
import { rolling7DayAvg } from '@/lib/calculations/rolling'
import { periodAvgMargin, type MarginInputRow } from '@/lib/calculations/marginAggregates'
import { toBangkokDateStr, getTodayBangkok } from '@/lib/businessDate'
import { OperationalCompletenessPill } from '@/components/ui/OperationalCompletenessPill'
import { ChartLegend } from '@/components/charts/ChartLegend'
// Shared palette so the HTML legend swatches track the Chart.js line
// colours without drifting.
const COLORS = {
  margin: '#1D9E75',
  sales: '#1D9E75',
  avgSpend: '#BA7517',
  costActual: 'rgba(186,117,23,0.4)',
  costRolling: '#BA7517',
}

// Margin is gross-only (excl. salary) across the entire app — every
// view (KPI, chart, weekly table, target line) reads the same number
// regardless of who's logged in, matching Home + the morning-flash
// email.
// Trends are fixed at 30 days for every role (no period toggle). The
// margin chart is a 7-day rolling gross-margin average — same number a
// stakeholder would see regardless of who's logged in.
const FIXED_DAYS = 30
const ROLLING_WINDOW_DAYS = 7

export function FnbTrendsView({ branchId }: { branchId: string }) {
  const { data, loading } = useBranchMetrics(branchId, FIXED_DAYS)
  const { targets } = useTargets(branchId)
  const { plan } = useUser()
  const t = useTranslations('trends')
  const tCommon = useTranslations('common')

  const cogsTarget = Number(targets?.cogs_target) || 32
  const grossMarginTarget = 100 - cogsTarget
  const coversTarget = Number(targets?.covers_target) || 75
  const avgSpendTarget = Number(targets?.avg_spend_target) || 0

  // Normalise metric_date to Bangkok YYYY-MM-DD once. The view returns
  // metric_date as a UTC timestamp for date-typed columns ("…T17:00:00+00:00"
  // = midnight Bangkok the next day), which broke `rollingAvg`'s pure-string
  // date arithmetic — every filter returned zero entries and the margin
  // rolling chart came back empty. Everything below works off `rows`.
  const rows = useMemo(
    () => data.map((d) => ({ ...d, metric_date: toBangkokDateStr(d.metric_date) })),
    [data],
  )

  // 7-day rolling gross-margin series. For each date, take the 7 days
  // ending on that date, pass them to periodAvgMargin (gross mode via
  // monthlySalary=0, operatingDays=0 — same selector Home + the weekly
  // report use), and surface the totals-of-totals result. Days where the
  // window contains fewer than 3 entries with cost data return null,
  // which LineChart renders as a gap rather than a misleading spike.
  const rollingMargin = useMemo(() => {
    return rows.map((p) => {
      const cutoff = p.metric_date
      const startD = new Date(cutoff + 'T00:00:00Z')
      startD.setUTCDate(startD.getUTCDate() - (ROLLING_WINDOW_DAYS - 1))
      const startStr = startD.toISOString().slice(0, 10)
      const windowRows = rows.filter((r) => r.metric_date >= startStr && r.metric_date <= cutoff)
      const daysWithCost = windowRows.filter(
        (r) => (r.additional_cost_today ?? 0) > 0 && (r.revenue ?? 0) > 0,
      ).length
      // Even a single qualifying day in the window is enough — keeps the
      // line extending all the way to the most recent day with cost data
      // instead of dropping out for the trailing ~6 days of the chart.
      if (daysWithCost < 1) return null
      const marginInputs: MarginInputRow[] = windowRows.map((r) => ({
        metric_date: r.metric_date,
        revenue: r.revenue,
        variableCost: r.additional_cost_today,
      }))
      return periodAvgMargin(marginInputs, 0, 0)?.value ?? null
    })
  }, [rows])

  const stats = useMemo(() => {
    if (rows.length === 0) return null
    const covers = rows.filter((d) => d.customers != null).map((d) => d.customers!)
    const spends = rows.filter((d) => d.avg_ticket != null).map((d) => d.avg_ticket!)
    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0

    // Aggregate through the shared selector so this tile exactly matches
    // the Home "30-day avg" secondary line for the same period.
    const marginInputs: MarginInputRow[] = rows.map((d) => ({
      metric_date: d.metric_date,
      revenue: d.revenue,
      variableCost: d.additional_cost_today,
    }))
    const agg = periodAvgMargin(marginInputs, 0, 0)
    const avgMargin: number | null = agg ? agg.value : null

    // Labour cost share is no longer surfaced in the gross-only view
    // (it would imply the margin number includes salary, which it does
    // not). The KPI tile is suppressed downstream so we don't compute
    // it here either.
    const avgLabour: number | null = null
    return { avgMargin, avgCovers: avg(covers), avgSpend: avg(spends), avgLabour, marginTarget: grossMarginTarget }
  }, [rows, grossMarginTarget])

  const marginTarget = stats?.marginTarget ?? grossMarginTarget

  // Weekly aggregate margin (net or gross). Excludes days missing cost
  // from the sum so one blank day doesn't make a week look 100%.
  const weeks = useMemo(() => {
    return groupByWeek(rows).slice(-4).map((week) => {
      const withCost = week.filter((d) => (d.additional_cost_today || 0) > 0 && (d.revenue || 0) > 0)
      const weekRevenue = withCost.reduce((s, d) => s + d.revenue, 0)
      const weekCost = withCost.reduce((s, d) => s + (d.additional_cost_today || 0), 0)
      let weekMargin: number | null = null
      if (weekRevenue > 0 && weekCost > 0) {
        weekMargin = Math.round((1 - weekCost / weekRevenue) * 100 * 10) / 10
      }
      const daysMissingCost = week.filter(
        (d) => (d.revenue || 0) > 0 && (d.additional_cost_today == null || d.additional_cost_today <= 0),
      ).length
      const covers = week.filter((d) => d.customers != null).map((d) => d.customers!)
      const spends = week.filter((d) => d.avg_ticket != null).map((d) => d.avg_ticket!)
      const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
      return {
        label: formatWeekRange(week.map((d) => d.metric_date)),
        weekMargin,
        daysMissingCost,
        avgCovers: avg(covers),
        avgSpend: avg(spends),
      }
    })
  }, [rows])

  const hasMissingWeek = weeks.some((w) => w.daysMissingCost > 0)

  // Raw daily variable-cost total (additional_cost_today). We were
  // mistakenly plotting `avg_cost`, the per-cover average computed by
  // the view — that's why the dashed "actual cost" line sat at ~฿100-200
  // instead of the ฿1,000+ daily totals users actually enter.
  const rollingCosts = useMemo(() => {
    const costEntries = rows.map((m) => ({
      date: m.metric_date,
      value: m.additional_cost_today,
    }))
    return rows.map((d) => ({
      raw: d.additional_cost_today || 0,
      rolling: rolling7DayAvg(costEntries, d.metric_date),
    }))
  }, [rows])

  const insight = useMemo(() => {
    if (!stats || rows.length < 7 || stats.avgMargin == null) return null
    const marginBelow = stats.avgMargin < marginTarget
    const coversBelow = stats.avgCovers < coversTarget
    if (marginBelow && coversBelow) return t('insight_fnb_both_below')
    if (marginBelow) return t('insight_fnb_margin_below', { gap: formatPct(marginTarget - stats.avgMargin) })
    if (coversBelow) return t('insight_fnb_covers_below', { margin: formatPct(stats.avgMargin) })
    return t('insight_fnb_on_track', {
      current: formatBaht(stats.avgSpend),
      target: formatBaht(avgSpendTarget),
    })
  }, [stats, marginTarget, coversTarget, avgSpendTarget, rows.length, t])

  function getStatus(v: number, target: number): 'green' | 'amber' | 'red' | 'neutral' {
    if (v >= target) return 'green'
    if (v >= target * 0.9) return 'amber'
    return 'red'
  }

  if (loading) return <div style={{ padding: 'var(--space-10) 0', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>{tCommon('loading')}</div>

  const chartLabels = rows.map((d) => formatChartDate(d.metric_date))

  // Pad the margin-chart x-axis up to today (Bangkok) when the most recent
  // data row is older. Without this the chart appears to "end early" on
  // days where the owner hasn't yet entered today's data — the line just
  // stops at the last row instead of continuing to today's tick. Padding
  // adds null margin entries so the axis extends without drawing through.
  const todayStr = getTodayBangkok()
  const marginPadLabels: string[] = []
  const marginPadData: (number | null)[] = []
  if (rows.length > 0) {
    let cursor = rows[rows.length - 1].metric_date
    while (cursor < todayStr) {
      const d = new Date(cursor + 'T00:00:00Z')
      d.setUTCDate(d.getUTCDate() + 1)
      cursor = d.toISOString().slice(0, 10)
      marginPadLabels.push(formatChartDate(cursor))
      marginPadData.push(null)
    }
  }
  const marginChartLabels = [...chartLabels, ...marginPadLabels]
  const marginChartData = [...rollingMargin, ...marginPadData]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="flex items-center" style={{ gap: 10 }}>
        <h2 style={{ fontSize: 18, fontWeight: 500, color: 'var(--color-text-primary)' }}>{t('title')}</h2>
        <OperationalCompletenessPill branchId={branchId} businessType="fnb" />
      </div>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          <KpiCard
            label={t('kpi_gross_margin_excl')}
            value={stats.avgMargin != null ? formatPct(stats.avgMargin) : '—'}
            target={formatPct(marginTarget, 0)}
            status={stats.avgMargin != null ? getStatus(stats.avgMargin, marginTarget) : 'neutral'}
          />
          <KpiCard label={t('kpi_covers_day')} value={Math.round(stats.avgCovers).toString()} target={`${coversTarget}`} status={getStatus(stats.avgCovers, coversTarget)} />
          <KpiCard label={t('kpi_avg_spend')} value={formatBaht(stats.avgSpend)} target={avgSpendTarget > 0 ? formatBaht(avgSpendTarget) : undefined} status="neutral" />
        </div>
      )}

      {/* 7-day rolling gross-margin chart over the last 30 days. Same
          calculation (periodAvgMargin in gross mode) the morning flash and
          weekly report use, so the line matches the numbers shown there. */}
      <Section label="GROSS MARGIN % (ไม่รวมเงินเดือน) — 30 วันล่าสุด">
        <LineChart
          labels={marginChartLabels}
          datasets={[{
            data: marginChartData,
            color: COLORS.margin,
            label: t('kpi_gross_margin_excl'),
            fill: true,
            fillColor: 'rgba(29,158,117,0.08)',
          }]}
          targetValue={marginTarget}
          targetLabel={`${t('target_line')} ${formatPct(marginTarget, 0)}`}
          yFormatter={(v) => formatPct(v, 0)}
          yMax={80}
          yMin={0}
          spanGaps={false}
        />
        <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 6, lineHeight: 1.5 }}>
          ค่าเฉลี่ย Gross Margin 7 วันย้อนหลัง (ไม่รวมเงินเดือน) วันที่ไม่มีข้อมูลต้นทุนถูกข้าม
        </p>
      </Section>

      {/* Covers chart */}
      <Section label={t('covers_daily')}>
        <BarChart
          labels={chartLabels}
          data={rows.map((d) => d.customers || 0)}
          colors={rows.map((d) => (d.customers || 0) >= coversTarget ? '#1D9E75' : '#534AB7')}
          targetValue={coversTarget}
          yFormatter={(v) => `${Math.round(v)} ${t('covers_unit')}`}
        />
      </Section>

      {/* Sales + Avg spend dual axis */}
      <Section label={t('chart_sales_avg')}>
        <ChartLegend
          items={[
            { color: COLORS.sales, label: t('line_sales'), axisHint: t('left_axis') },
            { color: COLORS.avgSpend, label: t('line_avg_spend'), axisHint: t('right_axis') },
          ]}
        />
        <LineChart
          labels={chartLabels}
          datasets={[
            { data: rows.map((d) => d.revenue), color: COLORS.sales, label: t('line_sales') },
            { data: rows.map((d) => d.avg_ticket || 0), color: COLORS.avgSpend, label: t('line_avg_spend'), yAxisID: 'y2' },
          ]}
          yFormatter={(v) => formatBaht(v)}
          y2Formatter={(v) => formatBaht(v)}
        />
      </Section>

      {/* Rolling cost — Growth+ */}
      <PlanGate requiredPlan="growth" featureName={t('cost_rolling')}>
        <Section label={t('cost_rolling')}>
          <ChartLegend
            items={[
              { color: COLORS.costActual, label: t('line_cost_actual'), dashed: true },
              { color: COLORS.costRolling, label: t('line_cost_rolling') },
            ]}
          />
          <LineChart
            labels={chartLabels}
            datasets={[
              { data: rollingCosts.map((c) => c.raw), color: COLORS.costActual, label: t('line_cost_actual'), dashed: true },
              { data: rollingCosts.map((c) => c.rolling), color: COLORS.costRolling, label: t('line_cost_rolling') },
            ]}
            yFormatter={(v) => formatBaht(v)}
          />
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 6 }}>
            {t('rolling_note')}
          </p>
        </Section>
      </PlanGate>

      {/* Weekly summary */}
      <Section label={t('weekly_summary')}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 'var(--font-size-sm)', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 500, color: 'var(--color-text-tertiary)' }}>{t('week_col')}</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 500, color: 'var(--color-text-tertiary)' }}>{t('margin_col_gross')}</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 500, color: 'var(--color-text-tertiary)' }}>{t('covers_col')}</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 500, color: 'var(--color-text-tertiary)' }}>{t('avg_spend_col')}</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((w, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '8px', color: 'var(--color-text-secondary)' }}>{w.label}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: w.weekMargin == null ? 'var(--color-text-tertiary)' : w.weekMargin >= marginTarget ? 'var(--color-positive)' : 'var(--color-negative)' }}>
                    {w.weekMargin == null ? '—' : formatPct(w.weekMargin, 0)}
                    {w.daysMissingCost > 0 && w.weekMargin != null && <span style={{ color: 'var(--color-text-tertiary)' }}> *</span>}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{Math.round(w.avgCovers)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{formatBaht(w.avgSpend)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {hasMissingWeek && (
          <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 8 }}>
            {t('no_cost_note')}
          </p>
        )}
      </Section>

      {/* Insight */}
      {plan !== 'starter' && insight && (
        <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderLeft: '3px solid var(--color-accent)', borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
          <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{t('trend_insight')}</p>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-primary)' }}>{insight}</p>
        </div>
      )}
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 16 }}>
      <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 500, color: 'var(--color-text-tertiary)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 12 }}>{label}</p>
      {children}
    </div>
  )
}


