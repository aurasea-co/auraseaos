'use client'

import { useUser } from '@/providers/user-context'
import { PlanGate } from '@/components/ui/PlanGate'
import { HotelTrendsView } from '@/components/trends/HotelTrendsView'
import { FnbTrendsView } from '@/components/trends/FnbTrendsView'
import { useTranslations } from 'next-intl'

export default function TrendsPage() {
  const { activeBranch, plan } = useUser()
  const t = useTranslations('trends')

  if (!activeBranch) {
    return <div style={{ padding: 'var(--space-10) 0', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>{t('noBranch')}</div>
  }

  // Starter plan — locked state
  if (plan === 'starter') {
    return (
      <div style={{ position: 'relative' }}>
        <PlanGate requiredPlan="growth" featureName={t('title')}>
          <div />
        </PlanGate>
      </div>
    )
  }

  // Manager and owner see the same view. The role-restricted
  // ManagerTrendsView used to surface a "last 7 days only" subset; we now
  // fix every role to the standard 30-day rolling chart so the numbers
  // are identical regardless of who's logged in.
  const isHotel = activeBranch.business_type === 'accommodation'

  return isHotel ? (
    <HotelTrendsView branchId={activeBranch.id} totalRooms={activeBranch.total_rooms || 0} />
  ) : (
    <FnbTrendsView branchId={activeBranch.id} />
  )
}
