'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Clock } from 'lucide-react'

interface StaleBadgeProps {
  lastFetchedAt: Date | null
}

export function StaleBadge({ lastFetchedAt }: StaleBadgeProps) {
  const [minutesAgo, setMinutesAgo] = useState(0)
  const t = useTranslations('common')

  useEffect(() => {
    if (!lastFetchedAt) return
    function update() {
      setMinutesAgo(Math.floor((Date.now() - lastFetchedAt!.getTime()) / 60000))
    }
    update()
    const interval = setInterval(update, 60000)
    return () => clearInterval(interval)
  }, [lastFetchedAt])

  if (!lastFetchedAt || minutesAgo < 2) return null

  return (
    <div
      className="flex items-center gap-1.5"
      style={{
        padding: '3px 10px',
        background: 'var(--color-amber-light)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-pill)',
        fontSize: 'var(--font-size-xs)',
        color: 'var(--color-amber-text)',
      }}
    >
      <Clock size={11} />
      <span>{t('staleData', { minutes: minutesAgo })}</span>
    </div>
  )
}
