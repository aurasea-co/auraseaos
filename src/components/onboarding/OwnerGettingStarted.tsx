'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useUser } from '@/providers/user-context'
import { createClient } from '@/lib/supabase/client'
import { GettingStartedCard, type OnboardingStep } from './GettingStartedCard'

const DISMISSED_KEY = 'owner_onboarding_dismissed'

// Shown on the Portfolio page for owners. Tracks four bootstrap steps
// and auto-marks two of them as complete by checking the user's
// profile.line_id (step 3) and whether any manager exists in this org
// (step 2). Steps 1 and 4 are owner-driven — we can't reliably
// auto-detect "you set a target" or "your team has 7 days of data"
// without more queries, so they stay clickable until dismissal.

export function OwnerGettingStarted() {
  const t = useTranslations('onboarding.owner')
  const tCommon = useTranslations('onboarding')
  const { user, organization, role } = useUser()
  const supabase = createClient()
  const [dismissed, setDismissed] = useState<boolean | null>(null) // null = unread, prevents flicker
  const [lineConnected, setLineConnected] = useState(false)
  const [hasManager, setHasManager] = useState(false)

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISSED_KEY) === 'true')
    } catch {
      setDismissed(false)
    }
  }, [])

  useEffect(() => {
    if (!organization) return
    let cancelled = false

    async function load() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any

      const [profileRes, branchRes] = await Promise.all([
        db.from('profiles').select('line_id').eq('user_id', user.id).maybeSingle(),
        db.from('branches').select('id').eq('organization_id', organization!.id),
      ])

      if (cancelled) return
      setLineConnected(!!profileRes?.data?.line_id)

      const branchIds = (branchRes?.data || []).map((b: { id: string }) => b.id)
      if (branchIds.length) {
        const { count } = await db
          .from('branch_members')
          .select('id', { count: 'exact', head: true })
          .in('branch_id', branchIds)
          .in('role', ['manager', 'branch_manager'])
          .eq('is_active', true)
        if (!cancelled) setHasManager((count || 0) > 0)
      }
    }
    load()
    return () => { cancelled = true }
  }, [organization, user.id, supabase])

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

  if (role !== 'owner') return null
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
      ctaHref: '/settings/targets',
      done: false,
    },
    {
      title: t('step2Title'),
      body: t('step2Body'),
      ctaLabel: t('step2Cta'),
      ctaHref: '/settings/team',
      done: hasManager,
    },
    {
      title: t('step3Title'),
      body: t('step3Body'),
      ctaLabel: t('step3Cta'),
      ctaHref: '/settings/notifications',
      done: lineConnected,
    },
    {
      title: t('step4Title'),
      body: t('step4Body'),
      done: false,
    },
  ]

  return (
    <GettingStartedCard
      title={t('title')}
      steps={steps}
      onDismiss={handleDismiss}
    />
  )
}
