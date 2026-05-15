'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { LocaleSwitcher } from '@/components/locale-switcher'

export default function AccountSetupPage() {
  const router = useRouter()
  const supabase = createClient()
  const t = useTranslations('accountSetup')

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-end mb-6">
          <LocaleSwitcher />
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-medium text-slate-900 leading-heading">
            {t('title')}
          </h1>
          <p className="text-sm text-slate-600 mt-3 leading-body">
            {t('message')}
          </p>
          <p className="text-sm text-slate-500 mt-4 leading-body">
            {t('contact')}
          </p>

          <button
            type="button"
            onClick={handleSignOut}
            className="mt-8 w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg transition-colors touch-target"
          >
            {t('signOut')}
          </button>
        </div>
      </div>
    </div>
  )
}
