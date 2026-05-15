'use client'

import { useState, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Info } from 'lucide-react'
import { useOperationalCompleteness } from '@/hooks/useOperationalCompleteness'
import type {
  CompletenessLevel,
  OperationalCompleteness,
} from '@/lib/calculations/operationalCompleteness'

const LEVEL_COLORS: Record<CompletenessLevel, string> = {
  green: 'var(--color-positive)',
  amber: 'var(--color-amber)',
  red: 'var(--color-negative)',
}

interface Props {
  branchId: string | undefined
  businessType: 'fnb' | 'accommodation' | undefined
}

/**
 * Page-title pill — Metric A (operational completeness). Tracks whether
 * sales + covers/rooms are being entered daily. Does NOT consider cost
 * (see costCoverage.ts for the lumpy-cost-aware metric on the Cost tab).
 *
 * Display states:
 *   - daysPresent < 30 → `● N/30 days` with threshold-colored dot
 *   - daysPresent === 30 → compact ⓘ info icon (no "Data complete" text)
 * Both click-open the same 30-square popover.
 */
export function OperationalCompletenessPill({ branchId, businessType }: Props) {
  const { completeness, loading } = useOperationalCompleteness(branchId, businessType)
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const t = useTranslations('operationalCompleteness')

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  if (loading || !completeness) return null

  const isPerfect = completeness.daysPresent === 30
  const color = LEVEL_COLORS[completeness.level]

  return (
    <div ref={wrapperRef} style={{ position: 'relative', display: 'inline-block' }}>
      {isPerfect ? (
        <button
          type="button"
          aria-label={t('label')}
          onClick={() => setOpen((v) => !v)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            padding: 0,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-text-tertiary)',
          }}
        >
          <Info size={16} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-pill)',
            padding: '3px 10px',
            fontSize: 12,
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            lineHeight: 1.3,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: color,
              display: 'inline-block',
            }}
          />
          {t('pill_n_of_window', { days: completeness.daysPresent })}
        </button>
      )}
      {open && <Popover completeness={completeness} onClose={() => setOpen(false)} />}
    </div>
  )
}

function Popover({
  completeness,
  onClose,
}: {
  completeness: OperationalCompleteness
  onClose: () => void
}) {
  const t = useTranslations('operationalCompleteness')
  const color = LEVEL_COLORS[completeness.level]
  return (
    <div
      role="dialog"
      aria-label={t('label')}
      style={{
        position: 'absolute',
        top: 'calc(100% + 6px)',
        right: 0,
        zIndex: 50,
        width: 300,
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 14,
        boxShadow: '0 6px 20px rgba(0,0,0,0.08)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span
          aria-hidden="true"
          style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }}
        />
        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>
          {t('headline', { pct: completeness.percentage })}
        </p>
      </div>
      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
        {t('subtext', { days: completeness.daysPresent })}
      </p>
      <div
        aria-hidden="true"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(30, 1fr)',
          gap: 2,
          marginBottom: 10,
        }}
      >
        {completeness.days.map((d) => (
          <span
            key={d.date}
            title={d.date}
            style={{
              height: 10,
              borderRadius: 2,
              background: d.complete ? color : 'var(--color-border)',
            }}
          />
        ))}
      </div>
      <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.5, marginBottom: 10 }}>
        {t('definition')}
      </p>
      <Link
        href="/entry"
        onClick={onClose}
        style={{
          fontSize: 12,
          color: 'var(--color-accent)',
          textDecoration: 'none',
          fontWeight: 500,
        }}
      >
        {t('cta')}
      </Link>
    </div>
  )
}
