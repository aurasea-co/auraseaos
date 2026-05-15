'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useBranchMetrics } from '@/hooks/useBranchMetrics'
import { useTargets } from '@/hooks/useTargets'
import { useUser } from '@/providers/user-context'
import { KpiCard } from '@/components/kpi-card'
import { BarChart } from '@/components/charts/BarChart'
import { LineChart } from '@/components/charts/LineChart'
import { PeriodSelector } from '@/components/ui/PeriodSelector'
import { PlanGate } from '@/components/ui/PlanGate'
import { formatChartDate, formatBaht, formatPct, groupByWeek, formatWeekRange } from '@/lib/formatters'
import {
  calculateDailySalaryCost,
  calculateNetMargin,
  calculateGrossMarginStrict,
} from '@/lib/calculations/fnb'
import { rolling7DayAvg, rollingAvg } from '@/lib/calculations/rolling'
import { periodAvgMargin, type MarginInputRow } from '@/lib/calculations/marginAggregates'
import { toBangkokDateStr } from '@/lib/businessDate'
import { OperationalCompletenessPill } from '@/components/ui/OperationalCompletenessPill'
import { ChartLegend } from '@/components/charts/ChartLegend'
import Link from 'next/link'

// Shared palette so the HTML legend swatches track the Chart.js line
// colours without drifting.
const COLORS = {
  margin: '#1D9E75',
  sales: '#1D9E75',
  avgSpend: '#BA7517',
  costActual: 'rgba(186,117,23,0.4)',
  costRolling: '#BA7517',
}

// Margin mode — determined once per render from whether the branch has
// salary + operating-days configured. `net` is the honest number owners
// care about; `gross` is shown only when salary isn't set, alongside a
// prompt to configure it. The two modes use different y-axis caps and
// different targets because gross margins sit much higher than net.
type MarginMode = 'net' | 'gross'

export function FnbTrendsView({ branchId }: { branchId: string }) {
  const [period, setPeriod] = useState<30 | 90>(30)
  const [rollingWindow, setRollingWindow] = useState<7 | 14>(7)
  const { data, loading } = useBranchMetrics(branchId, period)
  const { targets } = useTargets(branchId)
  const { plan } = useUser()
  const t = useTranslations('trends')
  const tCommon = useTranslations('common')

  const cogsTarget = Number(targets?.cogs_target) || 32
  const grossMarginTarget = 100 - cogsTarget
  const coversTarget = Number(targets?.covers_target) || 75
  const avgSpendTarget = Number(targets?.avg_spend_target) || 0
  const monthlySalary = Number(targets?.monthly_salary) || 0
  const operatingDays = Number(targets?.operating_days) || 26
  const dailySalaryCost = calculateDailySalaryCost(monthlySalary, operatingDays)

  // Choose mode once: if salary + operating days are both set, every
  // view (KPI, chart, weekly table, target line) switches to net.
  const mode: MarginMode = monthlySalary > 0 && operatingDays > 0 ? 'net' : 'gross'

  // Normalise metric_date to Bangkok YYYY-MM-DD once. The view returns
  // metric_date as a UTC timestamp for date-typed columns ("…T17:00:00+00:00"
  // = midnight Bangkok the next day), which broke `rollingAvg`'s pure-string
  // date arithmetic — every filter returned zero entries and the margin
  // rolling chart came back empty. Everything below works off `rows`.
  const rows = useMemo(
    () => data.map((d) => ({ ...d, metric_date: toBangkokDateStr(d.metric_date) })),
    [data],
  )

  // Per-day margin points (net or gross). null for days missing cost —
  // these feed the rolling average and are *excluded* from the window
  // sum (not zero-filled), so one blank day doesn't drag the line down.
  const dailyMarginPoints = useMemo(
    () => rows.map((d) => ({
      date: d.metric_date,
      value: mode === 'net'
        ? calculateNetMargin(d.revenue, d.additional_cost_today, monthlySalary, operatingDays)
        : calculateGrossMarginStrict(d.revenue, d.additional_cost_today),
    })),
    [rows, mode, monthlySalary, operatingDays],
  )

  // Rolling-average margin series (default 7 days, toggleable to 14).
  // Returns null until the window has enough real samples — `LineChart`
  // renders those as gaps, so the line starts honestly partway through
  // the chart instead of drawing a warm-up from a single point.
  const rollingMargin = useMemo(() => {
    return dailyMarginPoints.map((p) => {
      const avg = rollingAvg(dailyMarginPoints, p.date, rollingWindow)
      if (avg == null) return null
      return Math.round(avg * 10) / 10
    })
  }, [dailyMarginPoints, rollingWindow])

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
    const agg = periodAvgMargin(marginInputs, monthlySalary, operatingDays)
    const avgMargin: number | null = agg ? agg.value : null

    const avgRevenue = rows.reduce((s, d) => s + (d.revenue || 0), 0) / rows.length
    const avgLabour = avgRevenue > 0 && monthlySalary > 0 ? (dailySalaryCost / avgRevenue) * 100 : null
    // Net margin target = gross margin target minus the property's
    // payroll share of average revenue. When gross, target stays as the
    // pure cogs-based figure.
    const marginTarget = mode === 'net' && avgRevenue > 0
      ? Math.max(0, grossMarginTarget - (dailySalaryCost / avgRevenue) * 100)
      : grossMarginTarget
    return { avgMargin, avgCovers: avg(covers), avgSpend: avg(spends), avgLabour, marginTarget }
  }, [rows, mode, monthlySalary, operatingDays, dailySalaryCost, grossMarginTarget])

  const marginTarget = stats?.marginTarget ?? grossMarginTarget

  // Weekly aggregate margin (net or gross). Excludes days missing cost
  // from the sum so one blank day doesn't make a week look 100%.
  const weeks = useMemo(() => {
    return groupByWeek(rows).slice(-4).map((week) => {
      const withCost = week.filter((d) => (d.additional_cost_today || 0) > 0 && (d.revenue || 0) > 0)
      const weekRevenue = withCost.reduce((s, d) => s + d.revenue, 0)
      const weekCost = withCost.reduce((s, d) => s + (d.additional_cost_today || 0), 0)
      let weekMargin: number | null = null
      if (weekRevenue > 0) {
        if (mode === 'net' && monthlySalary > 0 && operatingDays > 0) {
          const weekSalary = dailySalaryCost * withCost.length
          weekMargin = Math.round(((weekRevenue - weekCost - weekSalary) / weekRevenue) * 100 * 10) / 10
        } else if (weekCost > 0) {
          weekMargin = Math.round((1 - weekCost / weekRevenue) * 100 * 10) / 10
        }
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
  }, [rows, mode, monthlySalary, operatingDays, dailySalaryCost])

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ fontSize: 18, fontWeight: 500, color: 'var(--color-text-primary)' }}>{t('title')}</h2>
          <OperationalCompletenessPill branchId={branchId} businessType="fnb" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <RollingWindowSelector value={rollingWindow} onChange={setRollingWindow} />
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
      </div>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          <KpiCard
            label={mode === 'net' ? t('kpi_net_margin') : t('kpi_gross_margin_excl')}
            value={stats.avgMargin != null ? formatPct(stats.avgMargin) : '—'}
            target={formatPct(marginTarget, 0)}
            status={stats.avgMargin != null ? getStatus(stats.avgMargin, marginTarget) : 'neutral'}
          />
          <KpiCard label={t('kpi_covers_day')} value={Math.round(stats.avgCovers).toString()} target={`${coversTarget}`} status={getStatus(stats.avgCovers, coversTarget)} />
          <KpiCard label={t('kpi_avg_spend')} value={formatBaht(stats.avgSpend)} target={avgSpendTarget > 0 ? formatBaht(avgSpendTarget) : undefined} status="neutral" />
          <KpiCard label={t('kpi_labour')} value={stats.avgLabour != null ? formatPct(stats.avgLabour) : t('not_configured')} status="neutral" />
        </div>
      )}

      {/* Margin chart — rolling average (7 or 14 days). Net when salary
          is configured, gross otherwise. The rolling helper skips days
          without entries (instead of treating them as 0%), so a single
          missing day no longer drags the line to the floor. */}
      <Section label={mode === 'net' ? t('margin_rolling_net') : t('margin_rolling_gross')}>
        <LineChart
          labels={chartLabels}
          datasets={[{
            data: rollingMargin,
            color: COLORS.margin,
            label: mode === 'net' ? t('kpi_net_margin') : t('kpi_gross_margin_excl'),
            fill: true,
            fillColor: 'rgba(29,158,117,0.08)',
          }]}
          targetValue={marginTarget}
          targetLabel={`${t('target_line')} ${formatPct(marginTarget, 0)}`}
          yFormatter={(v) => formatPct(v, 0)}
          yMax={mode === 'net' ? 60 : 80}
          yMin={mode === 'net' ? -20 : 0}
          spanGaps={false}
        />
        {mode === 'gross' ? (
          <div
            style={{
              background: 'var(--color-amber-light)',
              borderLeft: '3px solid var(--color-amber)',
              borderRadius: '0 6px 6px 0',
              padding: '10px 14px',
              marginTop: 10,
            }}
          >
            <p style={{ fontSize: 12, color: 'var(--color-amber-text)', lineHeight: 1.5, marginBottom: 4 }}>
              {t('gross_only_warning')}
            </p>
            <Link
              href="/settings/targets"
              style={{ fontSize: 12, color: 'var(--color-amber-text)', textDecoration: 'underline' }}
            >
              {t('set_salary_prompt')}
            </Link>
            <p style={{ fontSize: 11, color: 'var(--color-amber-text)', marginTop: 6, lineHeight: 1.5 }}>
              {t('gross_margin_rolling_note', { window: rollingWindow })}
            </p>
          </div>
        ) : (
          <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 6, lineHeight: 1.5 }}>
            {t('net_margin_rolling_note', { window: rollingWindow })}
          </p>
        )}
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
                <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 500, color: 'var(--color-text-tertiary)' }}>{mode === 'net' ? t('margin_col_net') : t('margin_col_gross')}</th>
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

function RollingWindowSelector({
  value,
  onChange,
}: {
  value: 7 | 14
  onChange: (v: 7 | 14) => void
}) {
  const t = useTranslations('trends')
  return (
    <div
      className="inline-flex items-center"
      aria-label={t('rolling_label')}
      style={{
        background: 'var(--color-bg-surface)',
        borderRadius: 'var(--radius-pill)',
        padding: 2,
        border: '1px solid var(--color-border)',
      }}
    >
      {([7, 14] as const).map((w) => (
        <button
          key={w}
          onClick={() => onChange(w)}
          style={{
            fontSize: 'var(--font-size-xs)',
            fontWeight: value === w ? 500 : 400,
            color: value === w ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
            background: value === w ? 'var(--color-bg-active)' : 'transparent',
            borderRadius: 'var(--radius-pill)',
            padding: '4px 12px',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {w === 7 ? t('rolling_7d') : t('rolling_14d')}
        </button>
      ))}
    </div>
  )
}

