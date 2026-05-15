'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { KpiCard } from '@/components/kpi-card'
import { formatBaht, formatPct } from '@/lib/formatters'
import type { BranchDailyMetric } from '@/hooks/useBranchMetrics'

interface Props {
  data: BranchDailyMetric[]
  monthlySalary: number
}

export function MonthlySummary({ data, monthlySalary }: Props) {
  const t = useTranslations('cost')

  const summary = useMemo(() => {
    // Filter to current month
    const now = new Date()
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const thisMonth = data.filter((d) => d.metric_date.startsWith(monthStr))
    if (thisMonth.length === 0) return null

    const totalRevenue = thisMonth.reduce((s, d) => s + d.revenue, 0)
    // Use the raw daily variable-cost total, not the view's per-cover
    // average (which, summed, massively under-reports monthly cost).
    const totalVariableCost = thisMonth.reduce((s, d) => s + (d.additional_cost_today || 0), 0)
    const estimatedTotalCost = totalVariableCost + monthlySalary
    const estimatedProfit = totalRevenue - estimatedTotalCost
    const profitPct = totalRevenue > 0 ? (estimatedProfit / totalRevenue) * 100 : 0

    return { monthlySalary, totalVariableCost, estimatedProfit, profitPct }
  }, [data, monthlySalary])

  if (!summary) return null

  return (
    <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 16 }}>
      <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>{t('monthly_summary_title')}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
        <KpiCard label="เงินเดือน/เดือน" value={formatBaht(summary.monthlySalary)} status="neutral" />
        <KpiCard label="ต้นทุนวัตถุดิบ" value={formatBaht(summary.totalVariableCost)} status="neutral" />
        <KpiCard
          label="กำไรหลังเงินเดือน"
          value={`${formatBaht(summary.estimatedProfit)}`}
          subLabel={formatPct(summary.profitPct, 0)}
          status={summary.estimatedProfit >= 0 ? 'green' : 'red'}
        />
      </div>

      <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 10 }}>
        ตัวเลขนี้ประมาณจากข้อมูลที่กรอก ยิ่งกรอกสม่ำเสมอยิ่งแม่นยำ
      </p>
    </div>
  )
}
