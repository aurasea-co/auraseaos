'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/providers/user-context'

// Lightweight client-side banner that reads the trial fields from
// organizations (trial_ends_at, status, discount_pct) — added in
// migration 025 — and renders one of:
//   • nothing            (status is not 'trial' or 'expired')
//   • subtle grey banner (>5 days remaining)
//   • amber warning      (1–5 days remaining)
//   • red banner         (last day — days remaining is 0)
//   • blocking overlay   (status = 'expired')
//
// UserContext doesn't carry these fields today, so we do a small extra
// fetch on mount keyed on organization.id. No reload on route change.

interface TrialInfo {
  status: string
  trialEndsAt: string | null
  discountPct: number
}

export function TrialBanner() {
  const supabase = createClient()
  const { organization, role } = useUser()
  const [info, setInfo] = useState<TrialInfo | null>(null)

  useEffect(() => {
    if (!organization) return
    let cancelled = false
    async function load() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any
      const { data } = await db
        .from('organizations')
        .select('status, trial_ends_at, discount_pct')
        .eq('id', organization!.id)
        .maybeSingle()
      if (cancelled || !data) return
      setInfo({
        status: data.status || 'active',
        trialEndsAt: data.trial_ends_at,
        discountPct: data.discount_pct || 0,
      })
    }
    load()
    return () => { cancelled = true }
  }, [organization, supabase])

  if (!info) return null

  // Expired — full-page blocking overlay, owner-only escape via
  // /settings/billing. Non-owners shouldn't see a billing CTA they
  // can't use, so we render a softer message + sign-out hint.
  if (info.status === 'expired') {
    return (
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 15, 15, 0.55)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}
      >
        <div style={{
          background: '#ffffff',
          borderRadius: 14,
          padding: 28,
          maxWidth: 420,
          width: '100%',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🔒</div>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#1a1a1a', margin: '0 0 8px' }}>
            การทดลองใช้งานสิ้นสุดแล้ว
          </h2>
          <p style={{ fontSize: 14, color: '#6b6b6b', lineHeight: 1.55, margin: '0 0 20px' }}>
            ข้อมูลของคุณยังคงปลอดภัย อัปเกรดเพื่อใช้งานต่อ
          </p>
          {role === 'owner' ? (
            <Link
              href="/settings/billing"
              style={{
                display: 'inline-block',
                padding: '12px 22px',
                background: '#534AB7',
                color: '#fff',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              อัปเกรดแผน →
            </Link>
          ) : (
            <p style={{ fontSize: 13, color: '#9b9b9b', margin: 0 }}>
              กรุณาติดต่อ Owner ของบัญชี
            </p>
          )}
        </div>
      </div>
    )
  }

  if (info.status !== 'trial' || !info.trialEndsAt) return null

  const msRemaining = new Date(info.trialEndsAt).getTime() - Date.now()
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)))

  // Theming by urgency. Border colour + background tint communicate
  // urgency without needing to read the text. Last-day gets red so it
  // jumps even at a glance.
  let bg = '#F4F4F2'
  let fg = '#1a1a1a'
  let border = '#e5e5e5'
  let urgent = false

  if (daysRemaining === 0) {
    bg = '#FBEAEA'
    fg = '#A32D2D'
    border = '#F5C6C6'
    urgent = true
  } else if (daysRemaining <= 5) {
    bg = '#FFF4E0'
    fg = '#8A5A00'
    border = '#FCD9A0'
    urgent = true
  }

  const showUpgradeLink = role === 'owner'
  const discountSuffix =
    urgent && info.discountPct > 0
      ? ` · รับส่วนลด ${info.discountPct}% ถ้าอัปเกรดก่อนหมดทดลอง`
      : ''

  const message =
    daysRemaining === 0
      ? `การทดลองใช้งานสิ้นสุดวันนี้${discountSuffix}`
      : urgent
        ? `⚠️ การทดลองใช้งานสิ้นสุดในอีก ${daysRemaining} วัน${discountSuffix}`
        : `ทดลองใช้งานฟรี · เหลืออีก ${daysRemaining} วัน`

  return (
    <div
      role="status"
      style={{
        background: bg,
        color: fg,
        borderBottom: `1px solid ${border}`,
        padding: '8px 14px',
        fontSize: 13,
        lineHeight: 1.45,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <span style={{ flex: 1 }}>{message}</span>
      {showUpgradeLink && (
        <Link
          href="/settings/billing"
          style={{
            color: fg,
            fontWeight: 600,
            textDecoration: 'underline',
            whiteSpace: 'nowrap',
          }}
        >
          {daysRemaining === 0 ? 'อัปเกรดเพื่อใช้งานต่อ' : 'อัปเกรดตอนนี้'}
        </Link>
      )}
    </div>
  )
}
