'use client'

import { useTranslations } from 'next-intl'

interface PeriodSelectorProps {
  value: 30 | 90
  onChange: (v: 30 | 90) => void
}

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  const t = useTranslations('trends')

  return (
    <div
      className="inline-flex items-center"
      style={{
        background: 'var(--color-bg-surface)',
        borderRadius: 'var(--radius-pill)',
        padding: 2,
        border: '1px solid var(--color-border)',
      }}
    >
      {([30, 90] as const).map((period) => (
        <button
          key={period}
          onClick={() => onChange(period)}
          style={{
            fontSize: 'var(--font-size-xs)',
            fontWeight: value === period ? 500 : 400,
            color: value === period ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
            background: value === period ? 'var(--color-bg-active)' : 'transparent',
            borderRadius: 'var(--radius-pill)',
            padding: '4px 12px',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {period === 30 ? t('period_30') : t('period_90')}
        </button>
      ))}
    </div>
  )
}
