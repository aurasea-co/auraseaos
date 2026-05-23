'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { LocaleSwitcher } from '@/components/locale-switcher'

interface Pending {
  token: string
  role: 'manager' | 'staff'
  organizationName: string
  branchName: string | null
}

// Landing page for authed users without any membership. Two paths:
//   1. They have a pending invitation waiting → show an "Accept
//      invitation" card with a button straight to /join?token=…
//   2. They don't → calm dead-end with their email + a contact hint
//      so the Owner knows which address to re-invite, and a sign-out
//      escape hatch.

export default function AccountSetupPage() {
  const router = useRouter()
  const supabase = createClient()
  const t = useTranslations('accountSetup')

  const [email, setEmail] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [{ data: userRes }, pendingRes] = await Promise.all([
        supabase.auth.getUser(),
        fetch('/api/invite/pending'),
      ])
      if (cancelled) return
      setEmail(userRes?.user?.email || null)
      if (pendingRes.ok) {
        const json = await pendingRes.json()
        if (json?.pending) setPending(json.pending as Pending)
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [supabase])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function handleAccept() {
    if (!pending) return
    router.push(`/join?token=${encodeURIComponent(pending.token)}`)
  }

  const roleLabel = pending?.role === 'manager' ? 'Manager' : 'Staff'

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-end mb-6">
          <LocaleSwitcher />
        </div>

        <div className="text-center">
          {loading ? (
            <p className="text-sm text-slate-500">…</p>
          ) : pending ? (
            <>
              <h1 className="text-2xl font-medium text-slate-900 leading-heading">
                {t('pendingTitle')}
              </h1>
              <p className="text-sm text-slate-600 mt-3 leading-body">
                {t('pendingBody', { org: pending.organizationName, role: roleLabel })}
              </p>
              {pending.branchName && (
                <p className="text-xs text-slate-500 mt-2 leading-body">
                  {pending.branchName}
                </p>
              )}
              <button
                type="button"
                onClick={handleAccept}
                className="mt-8 w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors touch-target"
              >
                {t('acceptCta')}
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="mt-3 w-full py-2.5 px-4 bg-transparent hover:bg-slate-100 text-slate-600 font-medium rounded-lg border border-slate-300 transition-colors touch-target"
              >
                {t('signOut')}
              </button>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-medium text-slate-900 leading-heading">
                {t('title')}
              </h1>
              <p className="text-sm text-slate-600 mt-3 leading-body">
                {t('message')}
              </p>
              <p className="text-sm text-slate-600 mt-2 leading-body">
                {t('contactOwner')}
              </p>

              {email && (
                <p className="text-xs text-slate-500 mt-4 leading-body" style={{ fontFamily: 'monospace' }}>
                  {t('yourEmail', { email })}
                </p>
              )}

              <p className="text-xs text-slate-400 mt-4 leading-body">
                {t('contact')}
              </p>

              <button
                type="button"
                onClick={handleSignOut}
                className="mt-8 w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg transition-colors touch-target"
              >
                {t('signOut')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
