'use client'

import { useUser } from '@/providers/user-context'
import { PlanGate } from '@/components/ui/PlanGate'
import { HotelTrendsView } from '@/components/trends/HotelTrendsView'
import { FnbTrendsView } from '@/components/trends/FnbTrendsView'
import { ManagerTrendsView } from '@/components/trends/ManagerTrendsView'
import { useTranslations } from 'next-intl'

export default function TrendsPage() {
  const { activeBranch, role, plan } = useUser()
  const t = useTranslations('trends')

  if (!activeBranch) {
    return <div style={{ padding: 'var(--space-10) 0', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>{t('noBranch')}</div>
  }

  // Manager gets limited view
  if (role === 'manager') {
    return <ManagerTrendsView branchId={activeBranch.id} isHotel={activeBranch.business_type === 'accommodation'} />
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

  const isHotel = activeBranch.business_type === 'accommodation'

  return isHotel ? (
    <HotelTrendsView branchId={activeBranch.id} totalRooms={activeBranch.total_rooms || 0} />
  ) : (
    <FnbTrendsView branchId={activeBranch.id} />
  )
}
