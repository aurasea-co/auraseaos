'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { LocaleSwitcher } from '@/components/locale-switcher'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  const t = useTranslations('login')

  function mapAuthError(raw: string): string {
    const m = raw.toLowerCase()
    if (m.includes('invalid login credentials') || m.includes('invalid credentials')) return t('errorInvalidCredentials')
    if (m.includes('email not confirmed')) return t('errorEmailNotConfirmed')
    if (m.includes('too many requests') || m.includes('rate limit')) return t('errorTooManyRequests')
    if (m.includes('user not found')) return t('errorUserNotFound')
    return t('errorGeneric')
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(mapAuthError(error.message))
      setLoading(false)
      return
    }

    router.push('/home')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Locale switcher */}
        <div className="flex justify-end mb-6">
          <LocaleSwitcher />
        </div>

        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-medium text-slate-900 leading-heading">
            {t('title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1 leading-body">
            {t('subtitle')}
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
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

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-700 mb-1 leading-body"
            >
              {t('password')}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent touch-target"
              placeholder={t('passwordPlaceholder')}
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
            {loading ? t('signingIn') : t('signIn')}
          </button>

          <div className="text-center">
            <Link
              href="/forgot-password"
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              {t('forgotPassword')}
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
