'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function LocaleSwitcher() {
  const [locale, setLocaleState] = useState('th')
  const [, startTransition] = useTransition()
  const router = useRouter()

  useEffect(() => {
    const saved = localStorage.getItem('aurasea-locale')
    if (saved === 'en' || saved === 'th') setLocaleState(saved)
  }, [])

  function switchLocale(newLocale: string) {
    setLocaleState(newLocale)
    localStorage.setItem('aurasea-locale', newLocale)
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000`
    startTransition(() => { router.refresh() })
  }

  return (
    <div
      className="flex items-center"
      style={{
        background: 'var(--color-bg-surface)',
        borderRadius: 'var(--radius-md)',
        padding: 2,
      }}
    >
      {(['th', 'en'] as const).map((lang) => (
        <button
          key={lang}
          onClick={() => switchLocale(lang)}
          style={{
            fontSize: 'var(--font-size-xs)',
            fontWeight: 'var(--font-weight-medium)',
            color: locale === lang ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
            background: locale === lang ? 'var(--color-bg-surface)' : 'transparent',
            border: locale === lang ? '1px solid var(--color-border-strong)' : '1px solid transparent',
            borderRadius: 'var(--radius-md)',
            padding: '3px 8px',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {lang.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
