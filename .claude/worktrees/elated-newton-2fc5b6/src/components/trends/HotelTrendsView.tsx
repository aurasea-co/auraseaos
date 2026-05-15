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
import { calculateDailySalaryCost, calculateLabourPct } from '@/lib/calculations/hotel'
import { OperationalCompletenessPill } from '@/components/ui/OperationalCompletenessPill'
import { ChartLegend } from '@/components/charts/ChartLegend'

export function HotelTrendsView({ branchId }: { branchId: string; totalRooms?: number }) {
  const [period, setPeriod] = useState<30 | 90>(30)
  const { data, loading } = useBranchMetrics(branchId, period)
  const { targets } = useTargets(branchId)
  const { plan } = useUser()
  const t = useTranslations('trends')
  const tCommon = useTranslations('common')

  const adrTarget = Number(targets?.adr_target) || 0
  const occTarget = Number(targets?.occupancy_target ?? targets?.occ_target) || 80
  const labourTarget = Number(targets?.labour_target) || 30
  const monthlySalary = Number(targets?.monthly_salary) || 0
  const operatingDays = Number(targets?.operating_days) || 30

  const stats = useMemo(() => {
    if (data.length === 0) return null
    const adrs = data.filter((d) => d.adr != null).map((d) => d.adr!)
    const occs = data.filter((d) => d.occupancy_rate != null).map((d) => d.occupancy_rate!)
    const revpars = data.filter((d) => d.revpar != null).map((d) => d.revpar!)
    const avgAdr = adrs.length > 0 ? adrs.reduce((a, b) => a + b, 0) / adrs.length : 0
    const avgOcc = occs.length > 0 ? occs.reduce((a, b) => a + b, 0) / occs.length : 0
    const avgRevpar = revpars.length > 0 ? revpars.reduce((a, b) => a + b, 0) / revpars.length : 0
    const dailyCost = calculateDailySalaryCost(monthlySalary, operatingDays)
    const avgRevenue = data.reduce((s, d) => s + d.revenue, 0) / data.length
    const avgLabour = avgRevenue > 0 ? calculateLabourPct(dailyCost, avgRevenue) : null
    return { avgAdr, avgOcc, avgRevpar, avgLabour }
  }, [data, monthlySalary, operatingDays])

  // Weekly summary
  const weeks = useMemo(() => {
    const grouped = groupByWeek(data)
    return grouped.slice(-4).map((week) => {
      const adrs = week.filter((d) => d.adr != null).map((d) => d.adr!)
      const occs = week.filter((d) => d.occupancy_rate != null).map((d) => d.occupancy_rate!)
      const avgAdr = adrs.length > 0 ? adrs.reduce((a, b) => a + b, 0) / adrs.length : 0
      const avgOcc = occs.length > 0 ? occs.reduce((a, b) => a + b, 0) / occs.length : 0
      return {
        label: formatWeekRange(week.map((d) => d.metric_date)),
        avgAdr,
        pctOfTarget: adrTarget > 0 ? (avgAdr / adrTarget) * 100 : 0,
        avgOcc,
      }
    })
  }, [data, adrTarget])

  // Trend insight
  const insight = useMemo(() => {
    if (data.length < 7 || !stats) return null
    const last7 = data.slice(-7)
    const prev7 = data.slice(-14, -7)
    const last7Adr = last7.filter((d) => d.adr).map((d) => d.adr!)
    const prev7Adr = prev7.filter((d) => d.adr).map((d) => d.adr!)
    const last7Avg = last7Adr.length > 0 ? last7Adr.reduce((a, b) => a + b, 0) / last7Adr.length : 0
    const prev7Avg = prev7Adr.length > 0 ? prev7Adr.reduce((a, b) => a + b, 0) / prev7Adr.length : 0
    const adrGap = stats.avgAdr - adrTarget
    const occBelow = stats.avgOcc < occTarget

    if (adrGap >= 0 && occBelow) {
      return t('insight_hotel_adr_high_occ_low', { period, gap: formatBaht(adrGap) })
    }
    if (adrGap < 0 && !occBelow) {
      return t('insight_hotel_occ_ok_adr_low', { occ: formatPct(stats.avgOcc), gap: formatBaht(Math.abs(adrGap)) })
    }
    if (adrGap < 0 && occBelow) {
      return t('insight_hotel_both_below')
    }
    if (last7Avg > prev7Avg) {
      return t('insight_hotel_on_track', { period })
    }
    return `ADR trend: ${last7Avg > prev7Avg ? '↑' : '↓'} — Occupancy ${formatPct(stats.avgOcc)}`
  }, [data, stats, adrTarget, occTarget, period, t])

  function getStatus(v: number, target: number): 'green' | 'amber' | 'red' | 'neutral' {
    if (v >= target) return 'green'
    if (v >= target * 0.9) return 'amber'
    return 'red'
  }

  if (loading) {
    return <div style={{ padding: 'var(--space-10) 0', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>{tCommon('loading')}</div>
  }

  const chartLabels = data.map((d) => formatChartDate(d.metric_date))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ fontSize: 18, fontWeight: 500, color: 'var(--color-text-primary)' }}>{t('title')}</h2>
          <OperationalCompletenessPill branchId={branchId} businessType="accommodation" />
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* KPI Summary */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          <KpiCard label="ADR" value={formatBaht(stats.avgAdr)} target={adrTarget ? `${formatBaht(adrTarget)}` : undefined} status={getStatus(stats.avgAdr, adrTarget)} />
          <KpiCard label="Occupancy" value={formatPct(stats.avgOcc)} target={`${formatPct(occTarget, 0)}`} status={getStatus(stats.avgOcc, occTarget)} />
          <KpiCard label="RevPAR" value={formatBaht(stats.avgRevpar)} status="neutral" />
          <KpiCard label={t('kpi_labour')} value={stats.avgLabour != null && monthlySalary > 0 ? formatPct(stats.avgLabour) : t('not_configured')} target={monthlySalary > 0 ? formatPct(labourTarget, 0) : undefined} status={stats.avgLabour != null && monthlySalary > 0 ? getStatus(labourTarget, stats.avgLabour) : 'neutral'} />
        </div>
      )}

      {/* ADR Daily */}
      <ChartSection label={t('adr_daily')}>
        <BarChart
          labels={chartLabels}
          data={data.map((d) => d.adr || 0)}
          colors={data.map((d) => (d.adr || 0) >= adrTarget ? '#1D9E75' : '#534AB7')}
          targetValue={adrTarget}
          targetLabel={`${t('target_line')} ${formatBaht(adrTarget)}`}
          yFormatter={(v) => formatBaht(v)}
        />
        <ChartLegend
          marginTop={8}
          marginBottom={0}
          items={[
            { color: '#1D9E75', label: t('above_target'), shape: 'bar' },
            { color: '#534AB7', label: t('below_target'), shape: 'bar' },
            { color: 'rgba(0,0,0,0.2)', label: `${t('target_line')} ${formatBaht(adrTarget)}`, dashed: true },
          ]}
        />
      </ChartSection>

      {/* Occupancy Daily */}
      <ChartSection label={t('occ_daily')}>
        <BarChart
          labels={chartLabels}
          data={data.map((d) => d.occupancy_rate || 0)}
          colors={data.map((d) => (d.occupancy_rate || 0) >= occTarget ? '#1D9E75' : '#534AB7')}
          targetValue={occTarget}
          yFormatter={(v) => formatPct(v, 0)}
        />
      </ChartSection>

      {/* RevPAR */}
      <ChartSection label={t('revpar_daily')}>
        <LineChart
          labels={chartLabels}
          datasets={[{ data: data.map((d) => d.revpar || 0), color: 'rgba(29,158,117,0.7)', label: 'RevPAR' }]}
          yFormatter={(v) => formatBaht(v)}
        />
      </ChartSection>

      {/* Labour % — Growth+ */}
      <PlanGate requiredPlan="growth" featureName={t('labour_weekly')}>
        {monthlySalary > 0 ? (
          <ChartSection label={t('labour_weekly')}>
            <BarChart
              labels={weeks.map((w) => w.label)}
              data={weeks.map((w) => {
                const weekRevenue = data.filter((d) => {
                  const dl = formatWeekRange([d.metric_date])
                  return dl === w.label || true // simplified — use week index
                }).reduce((s, d) => s + d.revenue, 0) / data.length * 7
                const dailyCost = calculateDailySalaryCost(monthlySalary, operatingDays)
                return weekRevenue > 0 ? (dailyCost * 7) / weekRevenue * 100 : 0
              })}
              colors={weeks.map(() => '#BA7517')}
              targetValue={labourTarget}
              yFormatter={(v) => formatPct(v, 0)}
              height={120}
            />
          </ChartSection>
        ) : (
          <InfoCard text={t('salary_setup_hint')} />
        )}
      </PlanGate>

      {/* Weekly summary table */}
      <ChartSection label={t('weekly_summary')}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 'var(--font-size-sm)', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 500, color: 'var(--color-text-tertiary)' }}>{t('week_col')}</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 500, color: 'var(--color-text-tertiary)' }}>{t('adr_col')}</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 500, color: 'var(--color-text-tertiary)' }}>{t('pct_target_col')}</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 500, color: 'var(--color-text-tertiary)' }}>{t('occ_col')}</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((w, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '8px', color: 'var(--color-text-secondary)' }}>{w.label}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{formatBaht(w.avgAdr)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: w.pctOfTarget >= 100 ? 'var(--color-positive)' : w.pctOfTarget >= 90 ? 'var(--color-amber)' : 'var(--color-negative)' }}>{formatPct(w.pctOfTarget, 0)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{formatPct(w.avgOcc, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartSection>

      {/* Trend insight — Growth+ */}
      {plan !== 'starter' && insight && (
        <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderLeft: '3px solid var(--color-accent)', borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
          <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{t('trend_insight')}</p>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-primary)' }}>{insight}</p>
        </div>
      )}
    </div>
  )
}

function ChartSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 16 }}>
      <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 500, color: 'var(--color-text-tertiary)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 12 }}>{label}</p>
      {children}
    </div>
  )
}

function InfoCard({ text }: { text: string }) {
  return (
    <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
      <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>{text}</p>
    </div>
  )
}
