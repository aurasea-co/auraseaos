'use client'

import { useTranslations } from 'next-intl'
import type { Branch } from '@/lib/supabase/types'
import { formatCurrency, formatPercent } from '@/lib/format'
import { Lightbulb } from 'lucide-react'

interface RecommendationCardProps {
  branch: Branch
  latest: {
    revenue: number
    adr: number | null
    rooms_sold: number | null
    customers: number | null
    cost: number | null
  } | null
  plan: 'starter' | 'growth' | 'pro'
  isHotel: boolean
  adrTarget: number
  occupancyTarget: number
  // When provided, the F&B recommendation compares against this
  // (typically the net margin + net target computed upstream where
  // salary is known). Falls back to the cost-only gross margin
  // comparison when omitted.
  marginPctOverride?: number | null
  marginTargetOverride?: number
}

export function RecommendationCard({
  branch,
  latest,
  plan,
  isHotel,
  adrTarget,
  occupancyTarget,
  marginPctOverride,
  marginTargetOverride,
}: RecommendationCardProps) {
  const t = useTranslations('recommendations')
  const tHome = useTranslations('home')

  if (!latest) {
    return (
      <div
        style={{
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderLeft: '3px solid var(--color-accent)',
          borderRadius: 'var(--radius-lg)',
          padding: '14px 16px',
        }}
      >
        <div className="flex items-start gap-2">
          <Lightbulb size={14} style={{ color: 'var(--color-accent)', marginTop: 2, flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{tHome('recStart')}</p>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginTop: 3 }}>{tHome('recStartSub')}</p>
          </div>
        </div>
      </div>
    )
  }

  const rec = generateRecommendation(
    branch,
    latest,
    isHotel,
    adrTarget,
    occupancyTarget,
    t,
    marginPctOverride,
    marginTargetOverride,
  )

  return (
    <div
      style={{
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        borderLeft: '3px solid var(--color-accent)',
        borderRadius: 'var(--radius-lg)',
        padding: '14px 16px',
      }}
    >
      <div className="flex items-start gap-2">
        <Lightbulb size={14} style={{ color: 'var(--color-accent)', marginTop: 2, flexShrink: 0 }} />
        <div>
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{rec.text}</p>
          {plan !== 'starter' && rec.reason && (
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginTop: 3 }}>{rec.reason}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function generateRecommendation(
  branch: Branch,
  latest: RecommendationCardProps['latest'],
  isHotel: boolean,
  adrTarget: number,
  occupancyTarget: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any,
  marginPctOverride?: number | null,
  marginTargetOverride?: number,
): { text: string; reason?: string } {
  if (!latest) return { text: t('onTrack') }

  if (isHotel) {
    const adrGap = (latest.adr || 0) - adrTarget
    const totalRooms = branch.total_rooms || 0
    const occPct = totalRooms > 0 && latest.rooms_sold ? (latest.rooms_sold / totalRooms) * 100 : 0

    if (adrGap >= 0 && occPct >= occupancyTarget) {
      return { text: t('greatPerformance'), reason: `ADR +${formatCurrency(adrGap)}, Occupancy ${formatPercent(occPct)}` }
    }
    if (adrGap < 0) {
      return { text: t('increaseDirectBooking'), reason: `ADR ${formatCurrency(Math.abs(adrGap))} below target` }
    }
    return { text: `${totalRooms - (latest.rooms_sold || 0)} rooms — ${t('adjustPricing')}`, reason: `Occupancy ${formatPercent(occPct)} (target ${formatPercent(occupancyTarget)})` }
  }

  // Prefer net margin (computed upstream where salary is known) over
  // the local cost-only gross margin. Falling back to gross keeps the
  // card working for branches that haven't configured salary yet.
  const marginPct = marginPctOverride != null
    ? marginPctOverride
    : latest.revenue > 0 && latest.cost != null
    ? ((latest.revenue - latest.cost) / latest.revenue) * 100
    : null
  const marginTarget = marginTargetOverride ?? 32
  if (marginPct != null && marginPct < marginTarget - 2) {
    return { text: t('marginLow'), reason: `Margin ${formatPercent(marginPct)} (target ${formatPercent(marginTarget)})` }
  }
  if (latest.customers != null && latest.customers < (branch.total_seats || 75)) {
    return { text: t('coversLow'), reason: `${latest.customers} covers (target ${branch.total_seats || 75})` }
  }
  return { text: t('onTrack') }
}
