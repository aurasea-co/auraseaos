'use client'

import { useTranslations } from 'next-intl'
import { useBranchMetrics } from '@/hooks/useBranchMetrics'
import { useTargets } from '@/hooks/useTargets'
import { BarChart } from '@/components/charts/BarChart'
import { LineChart } from '@/components/charts/LineChart'
import { formatChartDate, formatPct } from '@/lib/formatters'
import { OperationalCompletenessPill } from '@/components/ui/OperationalCompletenessPill'

export function ManagerTrendsView({ branchId, isHotel }: { branchId: string; isHotel: boolean }) {
  const { data, loading } = useBranchMetrics(branchId, 30)
  const { targets } = useTargets(branchId)
  const t = useTranslations('trends')
  const tCommon = useTranslations('common')

  const last7 = data.slice(-7)

  if (loading) return <div style={{ padding: 'var(--space-10) 0', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>{tCommon('loading')}</div>

  const chartLabels = last7.map((d) => formatChartDate(d.metric_date))
  const occTarget = Number(targets?.occupancy_target ?? targets?.occ_target) || 80
  const marginTarget = 100 - (Number(targets?.cogs_target) || 32)
  const coversTarget = Number(targets?.covers_target) || 75

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h2 style={{ fontSize: 18, fontWeight: 500, color: 'var(--color-text-primary)' }}>{t('title')}</h2>
        <OperationalCompletenessPill branchId={branchId} businessType={isHotel ? 'accommodation' : 'fnb'} />
      </div>

      {isHotel ? (
        <>
          <Section label={t('manager_occ_7')}>
            <BarChart
              labels={chartLabels}
              data={last7.map((d) => d.occupancy_rate || 0)}
              colors={last7.map((d) => (d.occupancy_rate || 0) >= occTarget ? '#1D9E75' : '#534AB7')}
              targetValue={occTarget}
              yFormatter={(v) => formatPct(v, 0)}
              height={140}
            />
          </Section>
        </>
      ) : (
        <>
          <Section label={t('manager_margin_7')}>
            <LineChart
              labels={chartLabels}
              datasets={[{ data: last7.map((d) => d.margin || 0), color: '#1D9E75', label: 'Margin %' }]}
              targetValue={marginTarget}
              yFormatter={(v) => formatPct(v, 0)}
              height={140}
            />
          </Section>
          <Section label={t('manager_covers_7')}>
            <BarChart
              labels={chartLabels}
              data={last7.map((d) => d.customers || 0)}
              colors={last7.map((d) => (d.customers || 0) >= coversTarget ? '#1D9E75' : '#534AB7')}
              targetValue={coversTarget}
              yFormatter={(v) => `${Math.round(v)}`}
              height={140}
            />
          </Section>
        </>
      )}

      {/* Note */}
      <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '12px 14px' }}>
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
          {t('manager_hint')}
        </p>
      </div>
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
