'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useUser } from '@/providers/user-context'
import { createClient } from '@/lib/supabase/client'
import { GettingStartedCard, type OnboardingStep } from './GettingStartedCard'

const DISMISSED_KEY = 'manager_onboarding_dismissed'

// Manager equivalent of OwnerGettingStarted — three steps, shown on
// the Home page, only for users with role='manager'. Auto-marks step 1
// complete when profile.line_id is non-null.

export function ManagerGettingStarted() {
  const t = useTranslations('onboarding.manager')
  const tCommon = useTranslations('onboarding')
  const { user, role } = useUser()
  const supabase = createClient()
  const [dismissed, setDismissed] = useState<boolean | null>(null)
  const [lineConnected, setLineConnected] = useState(false)

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISSED_KEY) === 'true')
    } catch {
      setDismissed(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any
      const { data } = await db
        .from('profiles')
        .select('line_id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (!cancelled) setLineConnected(!!data?.line_id)
    }
    load()
    return () => { cancelled = true }
  }, [user.id, supabase])

  const handleDismiss = useCallback(() => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, 'true')
    } catch {
      // ignore
    }
    setDismissed(true)
  }, [])

  const handleShow = useCallback(() => {
    try {
      window.localStorage.removeItem(DISMISSED_KEY)
    } catch {
      // ignore
    }
    setDismissed(false)
  }, [])

  if (role !== 'manager') return null
  if (dismissed === null) return null

  if (dismissed) {
    return (
      <div style={{ textAlign: 'right', marginBottom: 12 }}>
        <button
          type="button"
          onClick={handleShow}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 12,
            color: '#9b9b9b',
            textDecoration: 'underline',
            padding: 4,
          }}
        >
          {tCommon('showGuide')}
        </button>
      </div>
    )
  }

  const steps: OnboardingStep[] = [
    {
      title: t('step1Title'),
      body: t('step1Body'),
      ctaLabel: t('step1Cta'),
      ctaHref: '/settings/notifications',
      done: lineConnected,
    },
    {
      title: t('step2Title'),
      body: t('step2Body'),
      done: false,
    },
    {
      title: t('step3Title'),
      body: t('step3Body'),
      ctaLabel: t('step3Cta'),
      ctaHref: '/trends',
      done: false,
    },
  ]

  return (
    <GettingStartedCard
      title={t('title')}
      subtitle={t('subtitle')}
      steps={steps}
      onDismiss={handleDismiss}
    />
  )
}
