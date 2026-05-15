'use client'

import { useState, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useCostCoverage } from '@/hooks/useCostCoverage'
import type { CoverageLevel, CostCoverage } from '@/lib/calculations/costCoverage'

interface Props {
  branchId: string | undefined
  businessType: 'fnb' | 'accommodation' | undefined
}

const LEVEL_COLORS: Record<CoverageLevel, string> = {
  green: 'var(--color-positive)',
  amber: 'var(--color-amber)',
  red: 'var(--color-negative)',
  neutral: 'var(--color-text-tertiary)',
}

const COST_ENTRY_DOT = '#3B82F6'

/**
 * Always-visible Cost tab section showing Metric B — cost coverage over
 * the last 60 days. Click opens a detail popover with the 60-cell strip
 * (covered / uncovered / closed) and blue-dot markers on actual cost-
 * entry days.
 */
export function CostCoverageSection({ branchId, businessType }: Props) {
  const { coverage, loading } = useCostCoverage(branchId, businessType)
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const t = useTranslations('costCoverage')

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

  if (loading || !coverage) return null

  const isNeutral = coverage.coverageRatio == null
  const pct = isNeutral ? 0 : Math.round(coverage.coverageRatio! * 100)
  const color = LEVEL_COLORS[coverage.level]

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'block',
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: '14px 16px',
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        <div style={{ width: '100%', height: 8, borderRadius: 4, background: 'var(--color-bg-surface)', overflow: 'hidden' }}>
          <div
            style={{
              width: isNeutral ? '0%' : `${pct}%`,
              height: '100%',
              borderRadius: 4,
              background: color,
              transition: 'width 0.3s',
            }}
          />
        </div>
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: 6 }}>
          {isNeutral
            ? t('not_enough_data')
            : t('headline', { pct })}
        </p>
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 2 }}>
          {isNeutral
            ? t('not_enough_data_sub')
            : t('subtext', { covered: coverage.daysCovered, operational: coverage.operationalDays })}
        </p>
        <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 6, lineHeight: 1.5 }}>
          {t('helper')}
        </p>
      </button>
      {open && <Popover coverage={coverage} onClose={() => setOpen(false)} />}
    </div>
  )
}

function Popover({ coverage, onClose }: { coverage: CostCoverage; onClose: () => void }) {
  const t = useTranslations('costCoverage')
  const color = LEVEL_COLORS[coverage.level]
  const isNeutral = coverage.coverageRatio == null
  const pct = isNeutral ? 0 : Math.round(coverage.coverageRatio! * 100)
  return (
    <div
      role="dialog"
      aria-label={t('label')}
      style={{
        position: 'absolute',
        top: 'calc(100% + 6px)',
        left: 0,
        right: 0,
        zIndex: 50,
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 14,
        boxShadow: '0 6px 20px rgba(0,0,0,0.08)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span
          aria-hidden="true"
          style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }}
        />
        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>
          {isNeutral ? t('not_enough_data') : t('popover_headline', { pct })}
        </p>
      </div>

      {/* 60-cell strip */}
      <div
        aria-hidden="true"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(60, 1fr)',
          gap: 2,
          marginBottom: 10,
        }}
      >
        {coverage.dayStates.map((d) => (
          <div
            key={d.date}
            title={`${d.date} · ${d.state}${d.hasCostEntry ? ' (cost entry)' : ''}`}
            style={{ position: 'relative', height: 14 }}
          >
            <span
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 2,
                background:
                  d.state === 'covered'
                    ? color
                    : d.state === 'closed'
                    ? 'var(--color-border)'
                    : 'transparent',
                border:
                  d.state === 'uncovered' ? `1px solid ${LEVEL_COLORS.amber}` : 'none',
                boxSizing: 'border-box',
              }}
            />
            {d.hasCostEntry && (
              <span
                style={{
                  position: 'absolute',
                  top: -3,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 4,
                  height: 4,
                  borderRadius: '50%',
                  background: COST_ENTRY_DOT,
                }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10, fontSize: 11, color: 'var(--color-text-secondary)' }}>
        <LegendSwatch color={color} label={t('legend_covered')} />
        <LegendSwatch borderColor={LEVEL_COLORS.amber} label={t('legend_uncovered')} />
        <LegendSwatch color="var(--color-border)" label={t('legend_closed')} />
        <LegendSwatch dot={COST_ENTRY_DOT} label={t('legend_entry')} />
      </div>

      <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.5, marginBottom: 6 }}>
        {t('explanation')}
      </p>
      <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.5, marginBottom: 10 }}>
        {t('closed_note')}
      </p>
      <Link
        href="/entry"
        onClick={onClose}
        style={{ fontSize: 12, color: 'var(--color-accent)', textDecoration: 'none', fontWeight: 500 }}
      >
        {t('cta')}
      </Link>
    </div>
  )
}

function LegendSwatch({
  color,
  borderColor,
  dot,
  label,
}: {
  color?: string
  borderColor?: string
  dot?: string
  label: string
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      {dot ? (
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, display: 'inline-block' }} />
      ) : (
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 2,
            background: color ?? 'transparent',
            border: borderColor ? `1px solid ${borderColor}` : 'none',
            display: 'inline-block',
            boxSizing: 'border-box',
          }}
        />
      )}
      {label}
    </span>
  )
}
