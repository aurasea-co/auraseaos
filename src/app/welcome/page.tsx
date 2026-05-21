'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { LocaleSwitcher } from '@/components/locale-switcher'

type Role = 'manager' | 'staff'

interface Orientation {
  branchName: string
  role: Role
}

const WELCOME_FLAG_KEY = 'aurasea:welcome_shown'

// branch_members.role values seen in this project:
//   'manager' (current, written by /api/invite/accept after 2f6fc4f)
//   'branch_manager' (legacy / types.ts value — still possible on
//                     older rows or seeded data)
// Treat either as the manager role.
const MANAGER_BRANCH_ROLES = new Set(['manager', 'branch_manager'])

export default function WelcomePage() {
  const router = useRouter()
  const supabase = createClient()
  const t = useTranslations('welcome')
  const [orientation, setOrientation] = useState<Orientation | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: userRes } = await supabase.auth.getUser()
      const user = userRes?.user
      if (!user) {
        router.replace('/login')
        return
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any

      // Resolve role + branch from org/branch membership.
      // Prefer org-level (owner) when present; otherwise look at branch_members.
      const { data: orgMem } = await db
        .from('organization_members')
        .select('role, organization_id')
        .eq('user_id', user.id)
        .maybeSingle()

      const { data: branchMem } = await db
        .from('branch_members')
        .select('role, branches:branch_id ( name )')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()

      let role: Role = 'staff'
      if (orgMem && (orgMem.role === 'owner' || orgMem.role === 'manager')) {
        role = 'manager'
      } else if (branchMem?.role && MANAGER_BRANCH_ROLES.has(branchMem.role)) {
        role = 'manager'
      }

      const branchName = branchMem?.branches?.name || ''

      setOrientation({ branchName, role })
      setLoading(false)
    }
    load()
  }, [router, supabase])

  function handleStart() {
    try {
      localStorage.setItem(WELCOME_FLAG_KEY, '1')
    } catch {
      // ignore quota / SSR issues
    }
    router.push('/home')
  }

  if (loading || !orientation) {
    return (
      <CenteredCard>
        <p style={muted}>{t('loading')}</p>
      </CenteredCard>
    )
  }

  const roleLabel = orientation.role === 'manager' ? t('roleManager') : t('roleStaff')
  const ns = orientation.role === 'manager' ? 'manager' : 'staff'

  return (
    <CenteredCard>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <LocaleSwitcher />
      </div>

      <h1 style={heading}>{t('title')}</h1>
      <p style={{ ...muted, marginTop: 4 }}>
        {orientation.branchName ? `${orientation.branchName} — ` : ''}{roleLabel}
      </p>

      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {orientation.role === 'manager' ? (
          <>
            <Step
              num="1️⃣"
              title={t(`${ns}.step1Title`)}
              body={t(`${ns}.step1Body`)}
              ctaLabel={t('connectLine')}
              ctaHref="/settings/notifications"
            />
            <Step
              num="2️⃣"
              title={t(`${ns}.step2Title`)}
              body={t(`${ns}.step2Body`)}
            />
            <Step
              num="3️⃣"
              title={t(`${ns}.step3Title`)}
              body={t(`${ns}.step3Body`)}
            />
          </>
        ) : (
          <>
            <Step
              num="1️⃣"
              title={t(`${ns}.step1Title`)}
              body={t(`${ns}.step1Body`)}
            />
            <Step
              num="2️⃣"
              title={t(`${ns}.step2Title`)}
              body={t(`${ns}.step2Body`)}
              ctaLabel={t('connectLineShort')}
              ctaHref="/settings/notifications"
            />
            <Step
              num="3️⃣"
              title={t(`${ns}.step3Title`)}
              body={t(`${ns}.step3Body`)}
            />
          </>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <Button variant="primary" fullWidth onClick={handleStart}>
          {t('ctaStart')}
        </Button>
        <p style={{ fontSize: 12, color: '#9b9b9b', textAlign: 'center', margin: '12px 0 0' }}>
          {t('footer')}
        </p>
      </div>
    </CenteredCard>
  )
}

function Step({
  num,
  title,
  body,
  ctaLabel,
  ctaHref,
}: {
  num: string
  title: string
  body: string
  ctaLabel?: string
  ctaHref?: string
}) {
  return (
    <div style={{ border: '1px solid #e5e5e5', borderRadius: 10, padding: '14px 16px', background: '#ffffff' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ fontSize: 18, lineHeight: '24px' }}>{num}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>{title}</div>
          <div style={{ fontSize: 13, color: '#6b6b6b', lineHeight: 1.55, whiteSpace: 'pre-line' }}>{body}</div>
          {ctaLabel && ctaHref && (
            <div style={{ marginTop: 10 }}>
              <Link href={ctaHref} style={{ display: 'inline-block', fontSize: 13, color: '#534AB7', textDecoration: 'none', fontWeight: 500 }}>
                {ctaLabel} →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#ffffff', borderRadius: 12, padding: 28, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        {children}
      </div>
    </div>
  )
}

const heading: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 600,
  color: '#1a1a1a',
  margin: 0,
  letterSpacing: '-0.01em',
}

const muted: React.CSSProperties = {
  fontSize: 14,
  color: '#6b6b6b',
  margin: 0,
  lineHeight: 1.5,
}
