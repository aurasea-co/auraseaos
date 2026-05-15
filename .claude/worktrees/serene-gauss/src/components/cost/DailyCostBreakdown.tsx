'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { formatBaht, formatPct } from '@/lib/formatters'
import { calculateDailySalaryCost } from '@/lib/calculations/fnb'
import { rolling7DayAvg } from '@/lib/calculations/rolling'
import type { BranchDailyMetric } from '@/hooks/useBranchMetrics'

interface Props {
  data: BranchDailyMetric[]
  monthlySalary: number
  operatingDays: number
}

export function DailyCostBreakdown({ data, monthlySalary, operatingDays }: Props) {
  const t = useTranslations('cost')

  const breakdown = useMemo(() => {
    if (data.length === 0) return null

    const latest = data[data.length - 1]
    const dailySalaryCost = calculateDailySalaryCost(monthlySalary, operatingDays)
    const variableCost = rolling7DayAvg(
      data.map((d) => ({ date: d.metric_date, value: d.avg_cost })),
      latest.metric_date
    )
    const totalCost = dailySalaryCost + variableCost
    const revenue = latest.revenue
    const profit = revenue - totalCost
    const profitPct = revenue > 0 ? (profit / revenue) * 100 : 0

    return { dailySalaryCost, variableCost, totalCost, revenue, profit, profitPct }
  }, [data, monthlySalary, operatingDays])

  if (monthlySalary <= 0) {
    return (
      <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
          {t('setup_salary_prompt')}
        </p>
      </div>
    )
  }

  if (!breakdown) return null

  return (
    <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 16 }}>
      <Row label={`${t('daily_salary')} (${formatBaht(monthlySalary)} ÷ ${operatingDays} วัน)`} value={formatBaht(breakdown.dailySalaryCost)} />
      <Row label={t('variable_cost')} value={formatBaht(breakdown.variableCost)} />
      <Divider />
      <Row label={t('total_cost')} value={formatBaht(breakdown.totalCost)} bold />
      <Row label="ยอดขายวันนี้" value={formatBaht(breakdown.revenue)} />
      <Divider />
      <Row
        label={t('profit_after_salary')}
        value={`${formatBaht(breakdown.profit)} (${formatPct(breakdown.profitPct, 0)})`}
        color={breakdown.profit >= 0 ? 'var(--color-positive)' : 'var(--color-negative)'}
        bold
      />

      <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 10 }}>
        กำไรนี้หักเงินเดือนแล้ว ต่างจาก Gross margin ในหน้าหลักซึ่งหักแค่ COGS วัตถุดิบ
      </p>
    </div>
  )
}

function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div className="flex justify-between" style={{ padding: '6px 0', fontSize: 'var(--font-size-sm)' }}>
      <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      <span style={{ fontWeight: bold ? 500 : 400, color: color || 'var(--color-text-primary)' }}>{value}</span>
    </div>
  )
}

function Divider() {
  return <div style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />
}
