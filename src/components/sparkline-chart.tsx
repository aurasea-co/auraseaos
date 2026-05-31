'use client'

import { useTranslations } from 'next-intl'
import { formatWeekday } from '@/lib/format'

interface SparklineChartProps {
  data: { date: string; value: number }[]
  target?: number
  label: string
  formatValue?: (v: number) => string
  // Optional fixed ceiling for the y-axis. Use this for values with a
  // natural upper bound (e.g. occupancy = 100). When set, bars scale
  // against this ceiling instead of the data range — giving a stable
  // 0..ceiling mental model that doesn't get distorted by outliers.
  ceiling?: number
  // Show a small numeric label above each bar so the absolute value
  // is readable even when bars are short. Only useful when the chart
  // has fewer than ~20 bars (otherwise labels collide).
  showValueLabels?: boolean
}

export function SparklineChart({
  data,
  target,
  label,
  formatValue = (v) => v.toLocaleString(),
  ceiling,
  showValueLabels = false,
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

  // Bar-height scale resolution, in priority order:
  //   1. Caller passed `ceiling` — use it verbatim (best for naturally
  //      bounded values like occupancy %, where a fixed 0..100 scale
  //      gives a stable visual reading regardless of outliers).
  //   2. Otherwise scale to the actual data range with 10% headroom so
  //      the tallest bar doesn't kiss the top edge of the chart. The
  //      target is intentionally NOT included in the data-range case —
  //      including it crushed every bar when the goal wasn't reached.
  const dataMax = Math.max(...data.map((d) => d.value), 0)
  const scaleMax = ceiling !== undefined
    ? ceiling
    : dataMax > 0 ? dataMax * 1.1 : 1
  const targetWithinScale = target !== undefined && target <= scaleMax
  const chartHeight = 140
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
          {/* Target dashed line — drawn within the chart when reachable,
              or as a small "↑ target" badge above the chart when the
              current data is well below it (so the chart doesn't waste
              vertical space displaying an empty top region). */}
          {target !== undefined && scaleMax > 0 && targetWithinScale && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: `${(target / scaleMax) * 100}%`,
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
          {target !== undefined && !targetWithinScale && (
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: 0,
                fontSize: 10,
                color: 'var(--color-text-tertiary)',
                background: 'var(--color-bg)',
                padding: '2px 4px',
                zIndex: 10,
                pointerEvents: 'none',
              }}
            >
              ↑ {formatValue(target)}
            </div>
          )}

          {data.map((d, i) => {
            const height = scaleMax > 0 ? (d.value / scaleMax) * 100 : 0
            const aboveTarget = target ? d.value >= target : true
            // Label rules:
            //   - showValueLabels=true → label every non-zero bar (used
            //     on narrow windows where labels fit comfortably)
            //   - showValueLabels=false → label only the above-target
            //     bars so the user can visually disambiguate 78% (no
            //     label, just a tall purple bar) from 82% (labelled,
            //     green). Solves the "are those bars really above 80%?"
            //     problem on the 30/60/90-day views without cluttering.
            const showLabel = d.value > 0 && (showValueLabels || aboveTarget)
            return (
              <div
                key={i}
                className="flex-1 flex flex-col items-center justify-end"
                style={{ height: '100%', gap: 4, ...(isScrollable ? { minWidth: 24 } : {}) }}
              >
                {showLabel && (
                  <span style={{
                    fontSize: 9,
                    // Above-target labels use the positive color so the
                    // eye can pair label → bar instantly. Other labels
                    // (only shown when showValueLabels=true) stay muted.
                    color: aboveTarget && target !== undefined
                      ? 'var(--color-positive)'
                      : 'var(--color-text-tertiary)',
                    fontWeight: aboveTarget && target !== undefined ? 600 : 400,
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1,
                  }}>
                    {formatValue(d.value)}
                  </span>
                )}
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
