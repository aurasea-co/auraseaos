'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useUser } from '@/providers/user-context'

const DISMISSED_KEY = 'staff_entry_tip_dismissed'

// Info banner shown above the Entry form for staff. Teal left
// accent + 💡 icon match the visual language of the Owner / Manager
// Getting Started cards (teal accents = "first-run hint"). One-time
// dismissal — no re-show flow since the page is the only place staff
// land regularly.

export function StaffEntryTip() {
  const t = useTranslations('onboarding')
  const tCommon = useTranslations('onboarding')
  const { role } = useUser()
  const [dismissed, setDismissed] = useState<boolean | null>(null)

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISSED_KEY) === 'true')
    } catch {
      setDismissed(false)
    }
  }, [])

  if (role !== 'staff') return null
  if (dismissed !== false) return null

  function handleDismiss() {
    try {
      window.localStorage.setItem(DISMISSED_KEY, 'true')
    } catch {
      // ignore
    }
    setDismissed(true)
  }

  return (
    <div
      role="status"
      style={{
        background: '#E6F4EE',
        border: '1px solid #BFE3D2',
        borderLeft: '4px solid #1D9E75',
        color: '#0F5132',
        borderRadius: 10,
        padding: '12px 14px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        fontSize: 13,
        lineHeight: 1.55,
      }}
    >
      <span aria-hidden style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>💡</span>
      <span style={{ flex: 1 }}>{t('staffEntryTip')}</span>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={tCommon('dismiss')}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 4,
          cursor: 'pointer',
          color: '#0F5132',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <X size={16} />
      </button>
    </div>
  )
}
