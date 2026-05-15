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
import { rolling7DayAvg } from '@/lib/calculations/rolling'
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

  // Daily margin series — net when we can, gross otherwise. Returns
  // null for days missing cost so spanGaps:false shows an honest gap.
  const dailyMargin = useMemo(
    () => data.map((d) =>
      mode === 'net'
        ? calculateNetMargin(d.revenue, d.additional_cost_today, monthlySalary, operatingDays)
        : calculateGrossMarginStrict(d.revenue, d.additional_cost_today),
    ),
    [data, mode, monthlySalary, operatingDays],
  )

  const stats = useMemo(() => {
    if (data.length === 0) return null
    const covers = data.filter((d) => d.customers != null).map((d) => d.customers!)
    const spends = data.filter((d) => d.avg_ticket != null).map((d) => d.avg_ticket!)
    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0

    // Aggregate totals rather than averaging daily margins — days with
    // missing cost are excluded so their null-value doesn't warp the avg.
    const withCost = data.filter((d) => (d.additional_cost_today || 0) > 0 && (d.revenue || 0) > 0)
    const totalRevenue = withCost.reduce((s, d) => s + d.revenue, 0)
    const totalCost = withCost.reduce((s, d) => s + (d.additional_cost_today || 0), 0)
    let avgMargin: number | null = null
    if (totalRevenue > 0) {
      if (mode === 'net' && monthlySalary > 0 && operatingDays > 0) {
        const totalSalary = dailySalaryCost * withCost.length
        avgMargin = Math.round(((totalRevenue - totalCost - totalSalary) / totalRevenue) * 100 * 10) / 10
      } else if (totalCost > 0) {
        avgMargin = Math.round((1 - totalCost / totalRevenue) * 100 * 10) / 10
      }
    }

    const avgRevenue = data.reduce((s, d) => s + (d.revenue || 0), 0) / data.length
    const avgLabour = avgRevenue > 0 && monthlySalary > 0 ? (dailySalaryCost / avgRevenue) * 100 : null
    // Net margin target = gross margin target minus the property's
    // payroll share of average revenue. When gross, target stays as the
    // pure cogs-based figure.
    const marginTarget = mode === 'net' && avgRevenue > 0
      ? Math.max(0, grossMarginTarget - (dailySalaryCost / avgRevenue) * 100)
      : grossMarginTarget
    return { avgMargin, avgCovers: avg(covers), avgSpend: avg(spends), avgLabour, marginTarget }
  }, [data, mode, monthlySalary, operatingDays, dailySalaryCost, grossMarginTarget])

  const marginTarget = stats?.marginTarget ?? grossMarginTarget

  // Weekly aggregate margin (net or gross). Excludes days missing cost
  // from the sum so one blank day doesn't make a week look 100%.
  const weeks = useMemo(() => {
    return groupByWeek(data).slice(-4).map((week) => {
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
  }, [data, mode, monthlySalary, operatingDays, dailySalaryCost])

  const hasMissingWeek = weeks.some((w) => w.daysMissingCost > 0)

  const rollingCosts = useMemo(() => {
    return data.map((d) => ({
      raw: d.avg_cost || 0,
      rolling: rolling7DayAvg(
        data.map((m) => ({ date: m.metric_date, value: m.avg_cost })),
        d.metric_date,
      ),
    }))
  }, [data])

  const insight = useMemo(() => {
    if (!stats || data.length < 7 || stats.avgMargin == null) return null
    const marginBelow = stats.avgMargin < marginTarget
    const coversBelow = stats.avgCovers < coversTarget
    if (marginBelow && coversBelow) return t('insight_fnb_both_below')
    if (marginBelow) return t('insight_fnb_margin_below', { gap: formatPct(marginTarget - stats.avgMargin) })
    if (coversBelow) return t('insight_fnb_covers_below', { margin: formatPct(stats.avgMargin) })
    return t('insight_fnb_on_track', {
      current: formatBaht(stats.avgSpend),
      target: formatBaht(avgSpendTarget),
    })
  }, [stats, marginTarget, coversTarget, avgSpendTarget, data.length, t])

  function getStatus(v: number, target: number): 'green' | 'amber' | 'red' | 'neutral' {
    if (v >= target) return 'green'
    if (v >= target * 0.9) return 'amber'
    return 'red'
  }

  if (loading) return <div style={{ padding: 'var(--space-10) 0', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>{tCommon('loading')}</div>

  const chartLabels = data.map((d) => formatChartDate(d.metric_date))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="flex items-center justify-between">
        <h2 style={{ fontSize: 18, fontWeight: 500, color: 'var(--color-text-primary)' }}>{t('title')}</h2>
        <PeriodSelector value={period} onChange={setPeriod} />
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

      {/* Margin chart — net (after salary) when salary is configured,
          gross otherwise. Honest gaps for days missing cost. */}
      <Section label={mode === 'net' ? t('margin_daily_net') : t('margin_daily_gross')}>
        <LineChart
          labels={chartLabels}
          datasets={[{
            data: dailyMargin,
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
          </div>
        ) : (
          <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 6, lineHeight: 1.5 }}>
            {t('net_margin_note')}
          </p>
        )}
      </Section>

      {/* Covers chart */}
      <Section label={t('covers_daily')}>
        <BarChart
          labels={chartLabels}
          data={data.map((d) => d.customers || 0)}
          colors={data.map((d) => (d.customers || 0) >= coversTarget ? '#1D9E75' : '#534AB7')}
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
            { data: data.map((d) => d.revenue), color: COLORS.sales, label: t('line_sales') },
            { data: data.map((d) => d.avg_ticket || 0), color: COLORS.avgSpend, label: t('line_avg_spend'), yAxisID: 'y2' },
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

interface LegendItem {
  color: string
  label: string
  axisHint?: string
  dashed?: boolean
}

function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 10, fontSize: 12 }}>
      {items.map((item) => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 24,
              height: 0,
              flexShrink: 0,
              borderTop: `2px ${item.dashed ? 'dashed' : 'solid'} ${item.color}`,
              borderRadius: 1,
            }}
          />
          <span style={{ color: 'var(--color-text-secondary)' }}>{item.label}</span>
          {item.axisHint && (
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>({item.axisHint})</span>
          )}
        </div>
      ))}
    </div>
  )
}
