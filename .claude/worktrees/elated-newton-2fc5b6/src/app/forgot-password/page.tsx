'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { LocaleSwitcher } from '@/components/locale-switcher'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const supabase = createClient()
  const t = useTranslations('forgotPassword')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const redirectTo = `${window.location.origin}/reset-password`
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    })

    if (resetError) {
      setError(t('errorGeneric'))
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-end mb-6">
          <LocaleSwitcher />
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-medium text-slate-900 leading-heading">
            {t('title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1 leading-body">
            {t('subtitle')}
          </p>
        </div>

        {sent ? (
          <div className="text-center">
            <h2 className="text-lg font-medium text-slate-900">{t('successTitle')}</h2>
            <p className="text-sm text-slate-600 mt-2 leading-body">
              {t('successMessage', { email })}
            </p>
            <Link
              href="/login"
              className="inline-block mt-6 text-sm text-blue-600 hover:text-blue-700"
            >
              {t('backToLogin')}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-700 mb-1 leading-body"
              >
                {t('email')}
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent touch-target"
                placeholder={t('emailPlaceholder')}
                required
              />
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg leading-body">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors touch-target"
            >
              {loading ? t('submitting') : t('submit')}
            </button>

            <div className="text-center">
              <Link
                href="/login"
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                {t('backToLogin')}
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
