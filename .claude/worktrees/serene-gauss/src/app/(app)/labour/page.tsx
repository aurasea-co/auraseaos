'use client'

import { useTranslations } from 'next-intl'
import { useUser } from '@/providers/user-context'
import { PlanGate } from '@/components/ui/PlanGate'
import { LabourView } from '@/components/labour/LabourView'

export default function LabourPage() {
  const { activeBranch, plan, role } = useUser()
  const t = useTranslations('labour')

  if (!activeBranch) {
    return <div style={{ padding: 'var(--space-10) 0', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>{t('title')}</div>
  }

  if (role !== 'owner' && role !== 'superadmin') {
    return (
      <div style={{ padding: 'var(--space-10) 0', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
        {t('owner_only')}
      </div>
    )
  }

  if (plan !== 'pro') {
    return <PlanGate requiredPlan="pro" featureName={t('title')}><div /></PlanGate>
  }

  return <LabourView branchId={activeBranch.id} isHotel={activeBranch.business_type === 'accommodation'} totalRooms={activeBranch.total_rooms || 0} />
}
