'use client'

import { useTranslations } from 'next-intl'
import { useUser } from '@/providers/user-context'
import { PlanGate } from '@/components/ui/PlanGate'
import { PortfolioView } from '@/components/portfolio/PortfolioView'

export default function PortfolioPage() {
  const { branches, plan, role } = useUser()
  const t = useTranslations('portfolio')

  if (role !== 'owner' && role !== 'superadmin') {
    return <div style={{ padding: 'var(--space-10) 0', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>แท็บนี้เห็นได้เฉพาะ Owner</div>
  }

  if (plan !== 'pro') {
    return <PlanGate requiredPlan="pro" featureName={t('title')}><div /></PlanGate>
  }

  if (branches.length < 2) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 500, color: 'var(--color-text-primary)' }}>{t('title')}</h2>
        <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '20px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>{t('no_second_branch')}</p>
        </div>
      </div>
    )
  }

  return <PortfolioView />
}
