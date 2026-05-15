'use client'

import { useTranslations } from 'next-intl'
import { formatWeekday } from '@/lib/format'

interface SparklineChartProps {
  data: { date: string; value: number }[]
  target?: number
  label: string
  formatValue?: (v: number) => string
}

export function SparklineChart({
  data,
  target,
  label,
  formatValue = (v) => v.toLocaleString(),
}: SparklineChartProps) {
  const t = useTranslations('common')

  if (data.length === 0) {
    return (
      <div
        style={{
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 16,
        }}
      >
        <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 500, color: 'var(--color-text-tertiary)', letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>{label}</p>
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 8 }}>{t('noData')}</p>
      </div>
    )
  }

  const maxVal = Math.max(...data.map((d) => d.value), target || 0)
  const chartHeight = 120
  const isScrollable = data.length > 14

  return (
    <div
      style={{
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 16,
      }}
    >
      {/* Section label */}
      <p
        style={{
          fontSize: 'var(--font-size-xs)',
          fontWeight: 500,
          color: 'var(--color-text-tertiary)',
          letterSpacing: '0.05em',
          textTransform: 'uppercase' as const,
          marginBottom: 12,
        }}
      >
        {label}
      </p>

      <div
        className={isScrollable ? 'overflow-x-auto scrollbar-hide' : ''}
        style={{ position: 'relative', height: chartHeight, minHeight: chartHeight }}
      >
        <div
          className="flex items-end h-full"
          style={{
            gap: 3,
            ...(isScrollable ? { minWidth: data.length * 28 } : {}),
          }}
        >
          {/* Target dashed line */}
          {target !== undefined && maxVal > 0 && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: `${(target / maxVal) * 100}%`,
                borderTop: '1px dashed rgba(0,0,0,0.2)',
                zIndex: 10,
                pointerEvents: 'none',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  right: 0,
                  top: -14,
                  fontSize: 10,
                  color: 'var(--color-text-tertiary)',
                }}
              >
                {formatValue(target)}
              </span>
            </div>
          )}

          {data.map((d, i) => {
            const height = maxVal > 0 ? (d.value / maxVal) * 100 : 0
            const aboveTarget = target ? d.value >= target : true
            return (
              <div
                key={i}
                className="flex-1 flex flex-col items-center"
                style={{ gap: 4, ...(isScrollable ? { minWidth: 24 } : {}) }}
              >
                <div
                  style={{
                    width: '100%',
                    height: `${height}%`,
                    minHeight: d.value > 0 ? 4 : 0,
                    borderRadius: '3px 3px 0 0',
                    background: aboveTarget ? 'var(--color-positive)' : 'var(--color-accent)',
                    transition: 'height 0.2s',
                  }}
                />
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>
                  {formatWeekday(d.date)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4" style={{ marginTop: 10 }}>
        <div className="flex items-center gap-1">
          <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--color-positive)' }} />
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>Above</span>
        </div>
        <div className="flex items-center gap-1">
          <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--color-accent)' }} />
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>Below</span>
        </div>
      </div>
    </div>
  )
}
