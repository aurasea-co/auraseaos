'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useUser } from '@/providers/user-context'
import { useBranchMetrics } from '@/hooks/useBranchMetrics'
import { useTargets } from '@/hooks/useTargets'
import { PlanGate } from '@/components/ui/PlanGate'
import { PeriodSelector } from '@/components/ui/PeriodSelector'
import { DailyCostBreakdown } from '@/components/cost/DailyCostBreakdown'
import { CostCoverageSection } from '@/components/cost/CostCoverageSection'
import { MonthlySummary } from '@/components/cost/MonthlySummary'
import { LineChart } from '@/components/charts/LineChart'
import { formatChartDate, formatBaht } from '@/lib/formatters'
import { rolling7DayAvg } from '@/lib/calculations/rolling'

export default function CostPage() {
  const { activeBranch, plan } = useUser()
  const t = useTranslations('cost')

  if (!activeBranch || activeBranch.business_type !== 'fnb') {
    return (
      <div style={{ padding: 'var(--space-10) 0', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
        แท็บนี้สำหรับสาขา F&B — เปลี่ยนสาขาที่ Crystal Café
      </div>
    )
  }

  if (plan === 'starter') {
    return <PlanGate requiredPlan="growth" featureName={t('title')}><div /></PlanGate>
  }

  return <CostContent branchId={activeBranch.id} />
}

function CostContent({ branchId }: { branchId: string }) {
  const [period, setPeriod] = useState<30 | 90>(30)
  const { data, loading } = useBranchMetrics(branchId, period)
  const { targets } = useTargets(branchId)
  const { plan } = useUser()
  const t = useTranslations('cost')

  const monthlySalary = Number(targets?.monthly_salary) || 0
  const operatingDays = Number(targets?.operating_days) || 26
  const cogsTarget = Number(targets?.cogs_target) || 32

  if (loading) return <div style={{ padding: 'var(--space-10) 0', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>Loading...</div>

  // Rolling cost data — uses the raw daily variable cost total
  // (additional_cost_today), NOT the view's avg_cost column which is a
  // per-cover average. Plotting per-cover on a daily-total chart
  // showed ฿100-200 instead of the ฿1,000+ totals users enter.
  const costEntries = data.map((d) => ({ date: d.metric_date, value: d.additional_cost_today }))
  const rollingData = data.map((d) => ({
    raw: d.additional_cost_today || 0,
    rolling: rolling7DayAvg(costEntries, d.metric_date),
  }))

  // Average revenue for cost target line
  const avgRevenue = data.length > 0 ? data.reduce((s, d) => s + d.revenue, 0) / data.length : 0
  const costTargetBaht = (cogsTarget / 100) * avgRevenue

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: 18, fontWeight: 500, color: 'var(--color-text-primary)' }}>{t('title')}</h2>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* Today's cost breakdown */}
      <DailyCostBreakdown
        data={data}
        monthlySalary={monthlySalary}
        operatingDays={operatingDays}
      />

      {/* Cost coverage — 60-day coverage ratio honours lumpy purchases
          (weekly Makro runs etc.). Replaces the old daily-completeness
          indicator which penalised normal F&B behaviour. */}
      <CostCoverageSection branchId={branchId} businessType="fnb" />

      {/* Cost chart with rolling average */}
      <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 16 }}>
        <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
          {t('variable_cost')}
        </p>
        <LineChart
          labels={data.map((d) => formatChartDate(d.metric_date))}
          datasets={[
            { data: rollingData.map((c) => c.raw), color: 'rgba(186,117,23,0.4)', label: 'ต้นทุนจริง', dashed: true },
            { data: rollingData.map((c) => c.rolling), color: '#BA7517', label: 'ค่าเฉลี่ย 7 วัน' },
          ]}
          targetValue={costTargetBaht > 0 ? costTargetBaht : undefined}
          targetLabel={`COGS ${cogsTarget}%`}
          yFormatter={(v) => formatBaht(v)}
        />
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 8 }}>
          {t('rolling_note')}
        </p>
      </div>

      {/* Monthly P&L — Pro only */}
      {plan === 'pro' && (
        <MonthlySummary
          data={data}
          monthlySalary={monthlySalary}
        />
      )}
    </div>
  )
}
