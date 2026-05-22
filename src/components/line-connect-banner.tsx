'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'

// Persistent reminder shown across the app when an invited user clicks
// "Get started" on /welcome without connecting LINE. The /welcome page
// sets `line_reminder_pending=true` in localStorage; this banner then
// shows on every (app) page until either:
//   - profile.line_id becomes non-null (LINE is connected) → clear flag
//   - the user dismisses 3 times → stop showing permanently
//   - the user dismisses fewer than 3 times → snooze for 3 days each time

const PENDING_KEY = 'line_reminder_pending'
const DISMISSED_COUNT_KEY = 'line_reminder_dismissed_count'
const DISMISSED_AT_KEY = 'line_reminder_dismissed_at'
const MAX_DISMISSALS = 3
const SNOOZE_DAYS = 3
const SNOOZE_MS = SNOOZE_DAYS * 24 * 60 * 60 * 1000

function read(key: string): string | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // ignore quota / SSR issues
  }
}

function clear(key: string) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

export function LineConnectBanner() {
  const t = useTranslations('lineBanner')
  const supabase = createClient()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function decide() {
      // Bail out early if the flag isn't set
      if (read(PENDING_KEY) !== 'true') return

      // Permanently silenced after MAX_DISMISSALS
      const count = Number(read(DISMISSED_COUNT_KEY) || '0')
      if (count >= MAX_DISMISSALS) {
        clear(PENDING_KEY)
        return
      }

      // Snooze for SNOOZE_DAYS after each dismissal
      const dismissedAt = Number(read(DISMISSED_AT_KEY) || '0')
      if (dismissedAt && Date.now() - dismissedAt < SNOOZE_MS) return

      // Check the canonical "LINE connected" signal — profiles.line_id.
      // If it's set, clear the flag and stop showing the banner forever.
      const { data: userRes } = await supabase.auth.getUser()
      const user = userRes?.user
      if (!user) return

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any
      const { data: profile } = await db
        .from('profiles')
        .select('line_id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (cancelled) return

      if (profile?.line_id) {
        clear(PENDING_KEY)
        clear(DISMISSED_AT_KEY)
        clear(DISMISSED_COUNT_KEY)
        return
      }

      setVisible(true)
    }

    decide()
    return () => {
      cancelled = true
    }
  }, [supabase])

  function handleDismiss() {
    const count = Number(read(DISMISSED_COUNT_KEY) || '0') + 1
    write(DISMISSED_COUNT_KEY, String(count))
    write(DISMISSED_AT_KEY, String(Date.now()))
    if (count >= MAX_DISMISSALS) clear(PENDING_KEY)
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      role="status"
      style={{
        background: '#E6F4EE',
        borderBottom: '1px solid #BFE3D2',
        color: '#0F5132',
        padding: '8px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontSize: 13,
        lineHeight: 1.4,
      }}
    >
      <span style={{ flex: 1 }}>
        {t('message')}{' '}
        <Link
          href="/settings/notifications"
          style={{ color: '#0F5132', fontWeight: 600, textDecoration: 'underline' }}
        >
          {t('cta')} →
        </Link>
      </span>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={t('dismiss')}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 4,
          cursor: 'pointer',
          color: '#0F5132',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <X size={16} />
      </button>
    </div>
  )
}
