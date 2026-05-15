'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useUser } from '@/providers/user-context'
import { useBranchMetrics } from '@/hooks/useBranchMetrics'
import { useTargets } from '@/hooks/useTargets'
import { PlanGate } from '@/components/ui/PlanGate'
import { ScenarioTable } from '@/components/pricing/ScenarioTable'
import { DemandCalendar } from '@/components/pricing/DemandCalendar'
import { BarChart } from '@/components/charts/BarChart'
import { generateScenarios, calculateHistoricalElasticity } from '@/lib/calculations/pricing'
import { formatChartDate, formatBaht } from '@/lib/formatters'

export default function PricingPage() {
  const { activeBranch, plan } = useUser()
  const t = useTranslations('pricing')

  if (!activeBranch || activeBranch.business_type !== 'accommodation') {
    return (
      <div style={{ padding: 'var(--space-10) 0', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
        แท็บนี้สำหรับสาขาที่พัก — เปลี่ยนสาขาที่ branch selector
      </div>
    )
  }

  if (plan === 'starter') {
    return <PlanGate requiredPlan="growth" featureName={t('title')}><div /></PlanGate>
  }

  return <PricingContent branchId={activeBranch.id} totalRooms={activeBranch.total_rooms || 0} />
}

function PricingContent({ branchId, totalRooms }: { branchId: string; totalRooms: number }) {
  const { data, loading } = useBranchMetrics(branchId, 30)
  const { targets } = useTargets(branchId)
  const { plan } = useUser()
  const t = useTranslations('pricing')

  const adrTarget = Number(targets?.adr_target) || 0

  const latest = data[data.length - 1]
  const currentADR = latest?.adr || 0
  const currentRoomsSold = latest?.rooms_sold || 0
  const roomsAvailable = totalRooms - currentRoomsSold

  const elasticity = useMemo(() => calculateHistoricalElasticity(data), [data])
  const scenarios = useMemo(
    () => generateScenarios(currentADR, currentRoomsSold, totalRooms, adrTarget, elasticity),
    [currentADR, currentRoomsSold, totalRooms, adrTarget, elasticity]
  )
  const recommended = scenarios.find((s) => s.isRecommended)

  // Last 7 days for ADR chart
  const last7 = data.slice(-7)

  if (loading) return <div style={{ padding: 'var(--space-10) 0', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>Loading...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h2 style={{ fontSize: 18, fontWeight: 500, color: 'var(--color-text-primary)' }}>{t('title')}</h2>

      {/* Context card */}
      <div style={{
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderLeft: `3px solid ${currentADR >= adrTarget ? 'var(--color-positive)' : 'var(--color-amber)'}`,
        borderRadius: 'var(--radius-lg)',
        padding: '14px 16px',
      }}>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
          {t('rooms_available')}: <strong>{roomsAvailable}</strong> จาก {totalRooms} ห้อง
        </p>
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: 2 }}>
          ADR ปัจจุบัน {formatBaht(currentADR)} · เป้า {formatBaht(adrTarget)}
        </p>
      </div>

      {/* Scenario table */}
      <ScenarioTable scenarios={scenarios} />

      {/* Recommendation */}
      {recommended && (
        <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderLeft: '3px solid var(--color-accent)', borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
          <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{t('recommended')}</p>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-primary)' }}>
            {recommended.label !== 'ราคาปัจจุบัน'
              ? `แนะนำ${recommended.label} เป็น ${formatBaht(recommended.adr)} คืนนี้ — คาดว่าจะขายได้ ${recommended.estimatedRooms} ห้อง รายได้ ${formatBaht(recommended.estimatedRevenue)}`
              : `คงราคาปัจจุบัน ${formatBaht(recommended.adr)} — ดีที่สุดสำหรับ demand ปัจจุบัน`}
          </p>
        </div>
      )}

      {/* ADR 7-day chart */}
      <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 16 }}>
        <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>ADR 7 วัน</p>
        <BarChart
          labels={last7.map((d) => formatChartDate(d.metric_date))}
          data={last7.map((d) => d.adr || 0)}
          colors={last7.map((d) => (d.adr || 0) >= adrTarget ? '#1D9E75' : '#534AB7')}
          targetValue={adrTarget}
          yFormatter={(v) => formatBaht(v)}
          height={140}
        />
      </div>

      {/* Demand calendar — Pro only */}
      {plan === 'pro' && <DemandCalendar data={data} />}
    </div>
  )
}
