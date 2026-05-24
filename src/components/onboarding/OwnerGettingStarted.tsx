'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useUser } from '@/providers/user-context'
import { createClient } from '@/lib/supabase/client'
import { GettingStartedCard, type OnboardingStep } from './GettingStartedCard'

const DISMISSED_KEY = 'owner_onboarding_dismissed'
const ALL_DONE_DISPLAY_MS = 3000

// Shown on the Portfolio page for owners. All four bootstrap steps
// auto-detect from live data:
//   1. targets    — any branch has a non-null adr/cogs/covers target
//   2. team       — any active manager OR staff exists in this org
//   3. line       — profiles.line_id is set for the current user
//   4. 7 days     — total entries across both daily-metric tables in
//                   the last 7 days is >= 7
// When all four are done we flash a completion card and auto-dismiss
// after 3 seconds so the owner gets a clear "done" moment without
// having to find the X button.

export function OwnerGettingStarted() {
  const t = useTranslations('onboarding.owner')
  const tCommon = useTranslations('onboarding')
  const { user, organization, role } = useUser()
  const supabase = createClient()
  const [dismissed, setDismissed] = useState<boolean | null>(null) // null = unread, prevents flicker
  const [lineConnected, setLineConnected] = useState(false)
  const [hasTeamMember, setHasTeamMember] = useState(false)
  const [hasTargets, setHasTargets] = useState(false)
  const [hasSufficientData, setHasSufficientData] = useState(false)

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

      // 1) Profile (LINE) + branches
      const [profileRes, branchRes] = await Promise.all([
        db.from('profiles').select('line_id').eq('user_id', user.id).maybeSingle(),
        db.from('branches').select('id').eq('organization_id', organization!.id),
      ])

      if (cancelled) return
      setLineConnected(!!profileRes?.data?.line_id)

      const branchIds = (branchRes?.data || []).map((b: { id: string }) => b.id)
      if (!branchIds.length) return

      // 2-4) Targets + team + last-7-days entries — run in parallel.
      // Date window for step 4: count rows whose metric_date falls in
      // the last 7 days. We don't dedupe by date — if a branch has 7
      // entries in 7 days, that's enough signal that the team is
      // actively logging.
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0]

      const [targetsRes, teamRes, fnbRes, hotelRes] = await Promise.all([
        db
          .from('targets')
          .select('id', { count: 'exact', head: true })
          .in('branch_id', branchIds)
          .or('adr_target.not.is.null,cogs_target.not.is.null,covers_target.not.is.null'),
        db
          .from('branch_members')
          .select('id', { count: 'exact', head: true })
          .in('branch_id', branchIds)
          .in('role', ['manager', 'branch_manager', 'staff', 'branch_user'])
          .eq('is_active', true),
        db
          .from('fnb_daily_metrics')
          .select('id', { count: 'exact', head: true })
          .in('branch_id', branchIds)
          .gte('metric_date', sevenDaysAgoStr),
        db
          .from('accommodation_daily_metrics')
          .select('id', { count: 'exact', head: true })
          .in('branch_id', branchIds)
          .gte('metric_date', sevenDaysAgoStr),
      ])

      if (cancelled) return
      setHasTargets((targetsRes?.count || 0) > 0)
      setHasTeamMember((teamRes?.count || 0) > 0)
      const entryTotal = (fnbRes?.count || 0) + (hotelRes?.count || 0)
      setHasSufficientData(entryTotal >= 7)
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

  const allDone =
    hasTargets && hasTeamMember && lineConnected && hasSufficientData

  // When everything's done, show the success card briefly and then
  // dismiss permanently. The localStorage flag keeps it dismissed on
  // refresh — owner doesn't get a recurring victory lap.
  useEffect(() => {
    if (!allDone) return
    if (dismissed) return
    const timer = window.setTimeout(handleDismiss, ALL_DONE_DISPLAY_MS)
    return () => window.clearTimeout(timer)
  }, [allDone, dismissed, handleDismiss])

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

  if (allDone) {
    return (
      <section
        role="status"
        style={{
          background: '#E6F4EE',
          border: '1px solid #BFE3D2',
          borderTop: '3px solid #1D9E75',
          borderRadius: 10,
          padding: '20px 22px',
          marginBottom: 20,
          textAlign: 'center',
          // Subtle entrance — looks like the card just finished filling
          animation: 'aurasea-onboarding-flash 220ms ease-out',
        }}
      >
        <style>{`
          @keyframes aurasea-onboarding-flash {
            0%   { transform: scale(0.98); opacity: 0; }
            100% { transform: scale(1);    opacity: 1; }
          }
        `}</style>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0F5132', margin: 0, letterSpacing: '-0.01em' }}>
          {t('allDoneTitle')}
        </h2>
        <p style={{ fontSize: 13, color: '#0F5132', lineHeight: 1.55, margin: '6px 0 0', opacity: 0.85 }}>
          {t('allDoneBody')}
        </p>
      </section>
    )
  }

  const steps: OnboardingStep[] = [
    {
      title: t('step1Title'),
      body: t('step1Body'),
      ctaLabel: t('step1Cta'),
      ctaHref: '/settings/targets',
      done: hasTargets,
    },
    {
      title: t('step2Title'),
      body: t('step2Body'),
      ctaLabel: t('step2Cta'),
      ctaHref: '/settings/team',
      done: hasTeamMember,
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
      done: hasSufficientData,
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
