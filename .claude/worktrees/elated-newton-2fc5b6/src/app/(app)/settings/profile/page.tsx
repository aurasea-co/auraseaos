'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useUser } from '@/providers/user-context'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/supabase/types'
import { Button } from '@/components/ui/Button'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function ProfilePage() {
  const { user } = useUser()
  const t = useTranslations('settingsProfile')
  const tCommon = useTranslations('common')
  const supabase = createClient()

  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [lineId, setLineId] = useState('')
  const [language, setLanguage] = useState<'th' | 'en'>('th')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    db.from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }: { data: Profile | null }) => {
        if (data) {
          setDisplayName(data.display_name || '')
          setPhone(data.phone || '')
          setLineId(data.line_id || '')
          setLanguage(data.language || 'th')
        }
      })
  }, [user.id, supabase])

  async function handleSave() {
    setSaving(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    await db.from('profiles').upsert({
      user_id: user.id,
      display_name: displayName || null,
      phone: phone || null,
      line_id: lineId || null,
      language,
    }, { onConflict: 'user_id' })

    // Update locale cookie
    document.cookie = `NEXT_LOCALE=${language};path=/;max-age=31536000`
    localStorage.setItem('aurasea-locale', language)

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 lg:hidden mb-2">
        <Link href="/settings" className="p-1 text-slate-400 hover:text-slate-600 touch-target">
          <ArrowLeft size={20} />
        </Link>
        <h2 className="text-lg font-medium text-slate-900 leading-heading">{t('title')}</h2>
      </div>
      <h2 className="text-lg font-medium text-slate-900 leading-heading hidden lg:block">{t('title')}</h2>

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1 leading-body">{t('displayName')}</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target"
            placeholder={t('displayNamePlaceholder')}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1 leading-body">{t('email')}</label>
          <input
            value={user.email}
            disabled
            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-slate-400 bg-slate-50"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1 leading-body">{t('phone')}</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target"
            placeholder="08X-XXX-XXXX"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1 leading-body">{t('lineId')}</label>
          <input
            value={lineId}
            onChange={(e) => setLineId(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target"
            placeholder="@line-id"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2 leading-body">{t('language')}</label>
          <div className="flex gap-3">
            {(['th', 'en'] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => setLanguage(lang)}
                className="touch-target"
                style={{
                  padding: '7px 16px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  background: language === lang ? 'var(--color-accent)' : 'transparent',
                  color: language === lang ? 'white' : 'var(--color-text-secondary)',
                  border: language === lang ? 'none' : '1px solid var(--color-border-strong)',
                }}
              >
                {lang === 'th' ? 'ไทย' : 'English'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Button variant="primary" fullWidth disabled={saving} onClick={handleSave}>
        {saving ? tCommon('saving') : saved ? '✓' : tCommon('save')}
      </Button>
    </div>
  )
}
