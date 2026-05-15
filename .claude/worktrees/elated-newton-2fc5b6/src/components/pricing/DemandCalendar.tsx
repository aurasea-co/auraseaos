'use client'

import { useMemo } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import type { BranchDailyMetric } from '@/hooks/useBranchMetrics'
import { toBangkokDateStr } from '@/lib/businessDate'

// Thai public holidays 2026 (Bangkok-local YYYY-MM-DD). Holidays bump
// the demand level by one step; they don't force "high".
const THAI_HOLIDAYS_2026 = [
  '2026-04-13', '2026-04-14', '2026-04-15', // Songkran
  '2026-05-01', // Labour Day (Fri)
  '2026-05-04', // Coronation Day (Mon)
  '2026-05-22', // Visakha Bucha (Fri)
  '2026-06-03', // Queen's Birthday
  '2026-07-28', // King's Birthday
  '2026-08-12', // Mother's Day
  '2026-10-13', // Memorial Day
  '2026-10-23', // Chulalongkorn Day
  '2026-12-05', // Father's Day
  '2026-12-10', // Constitution Day
  '2026-12-31', // New Year's Eve
]

// Minimum sample sizes before we trust an average enough to classify a
// cell as anything other than "low" (i.e. not-enough-signal fallback).
const MIN_SAMPLES_PER_DOW = 2
const MIN_TOTAL_SAMPLES = 7

type DemandLevel = 'low' | 'medium' | 'high'

function bumpLevel(level: DemandLevel): DemandLevel {
  if (level === 'low') return 'medium'
  if (level === 'medium') return 'high'
  return 'high'
}

// Parse a YYYY-MM-DD string into a JS Date anchored at noon Bangkok.
// Noon keeps us well clear of midnight TZ edges when the browser is in
// a non-Bangkok zone, so getDay() reliably returns the Bangkok weekday.
function bangkokDateFromStr(dateStr: string): Date {
  return new Date(dateStr + 'T12:00:00+07:00')
}

export function DemandCalendar({ data }: { data: BranchDailyMetric[] }) {
  const t = useTranslations('pricing')
  const locale = useLocale()
  const isThai = locale === 'th'
  const monthLocale = isThai ? 'th-TH-u-ca-buddhist' : 'en-GB'

  const calendar = useMemo(() => {
    // Historical averages by day-of-week (0=Sun ... 6=Sat), plus an
    // overall property baseline so we can classify relative to it.
    const byDow: number[][] = [[], [], [], [], [], [], []]
    const allSamples: number[] = []
    data.forEach((d) => {
      if (d.occupancy_rate != null && !isNaN(d.occupancy_rate)) {
        // metric_date can come through as a plain date or a timestamptz;
        // normalize to Bangkok YYYY-MM-DD first so the weekday bucket is
        // correct regardless of how Supabase serializes it.
        const normalizedDate = toBangkokDateStr(d.metric_date)
        if (!normalizedDate) return
        const dow = bangkokDateFromStr(normalizedDate).getDay()
        byDow[dow].push(d.occupancy_rate)
        allSamples.push(d.occupancy_rate)
      }
    })

    const overallAvg = allSamples.length > 0
      ? allSamples.reduce((a, b) => a + b, 0) / allSamples.length
      : null

    const avgByDow: (number | null)[] = byDow.map((arr) =>
      arr.length >= MIN_SAMPLES_PER_DOW
        ? arr.reduce((a, b) => a + b, 0) / arr.length
        : null
    )

    // Classify a dow average relative to the property's own baseline.
    // Fixed 60/80 thresholds don't work: a 30%-occupancy budget hotel
    // would read everything as "low" and a 90%-occupancy resort as
    // "high". Relative keeps the calendar meaningful at any baseline.
    const classify = (avg: number | null): DemandLevel => {
      if (avg == null || overallAvg == null) return 'low'
      if (avg >= overallAvg * 1.2) return 'high'
      if (avg >= overallAvg * 0.8) return 'medium'
      return 'low'
    }

    // Generate next 30 days
    const days: {
      date: string
      label: string
      level: DemandLevel
      monthLabel: string | null
      isHoliday: boolean
    }[] = []
    const today = new Date()
    let prevMonth = -1
    for (let i = 0; i < 30; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() + i)
      const dateStr = toBangkokDateStr(d.toISOString())
      // Compute DOW from the Bangkok-normalized date, not from `d`
      // directly — `d` is the host-tz interpretation of setDate+N which
      // can slip a column under some browser TZs near day boundaries.
      const dAnchored = bangkokDateFromStr(dateStr)
      const dow = dAnchored.getDay()
      const isHoliday = THAI_HOLIDAYS_2026.includes(dateStr)

      // Not enough overall history → classify everything as "low" so
      // the user isn't misled by a small sample defaulting to medium.
      let level: DemandLevel = allSamples.length >= MIN_TOTAL_SAMPLES
        ? classify(avgByDow[dow])
        : 'low'

      if (isHoliday) level = bumpLevel(level)

      const month = dAnchored.getMonth()
      const monthLabel = month !== prevMonth
        ? dAnchored.toLocaleDateString(monthLocale, { month: 'short', timeZone: 'Asia/Bangkok' })
        : null
      prevMonth = month

      days.push({
        date: dateStr,
        label: `${dAnchored.getDate()}`,
        level,
        monthLabel,
        isHoliday,
      })
    }
    return days
  }, [data, monthLocale])

  // Header: "19 Apr – 18 May 2026" / "19 เม.ย. – 18 พ.ค. 2569"
  const rangeLabel = useMemo(() => {
    if (calendar.length === 0) return ''
    const first = bangkokDateFromStr(calendar[0].date)
    const last = bangkokDateFromStr(calendar[calendar.length - 1].date)
    const sameYear = first.getFullYear() === last.getFullYear()
    const opts = { timeZone: 'Asia/Bangkok' as const }
    const firstStr = first.toLocaleDateString(monthLocale, sameYear
      ? { day: 'numeric', month: 'short', ...opts }
      : { day: 'numeric', month: 'short', year: 'numeric', ...opts })
    const lastStr = last.toLocaleDateString(monthLocale, { day: 'numeric', month: 'short', year: 'numeric', ...opts })
    return `${firstStr} – ${lastStr}`
  }, [calendar, monthLocale])

  // Pad to start on Monday (ISO week). Mon=0, Sun=6.
  const startPad = calendar[0]
    ? (bangkokDateFromStr(calendar[0].date).getDay() + 6) % 7
    : 0

  const colors = {
    low: { bg: 'var(--color-bg-surface)', text: 'var(--color-text-secondary)' },
    medium: { bg: 'var(--color-accent-light)', text: 'var(--color-accent-text)' },
    high: { bg: 'var(--color-accent)', text: 'white' },
  }

  return (
    <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 16 }}>
      <div className="flex items-baseline justify-between" style={{ marginBottom: 12, gap: 8 }}>
        <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('demand_calendar')}</p>
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>{rangeLabel}</p>
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 4 }}>
        {['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'].map((d) => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, color: 'var(--color-text-tertiary)', padding: 2 }}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {Array(startPad).fill(null).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {calendar.map((day) => (
          <div
            key={day.date}
            style={{
              aspectRatio: '1',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-sm)',
              fontSize: 11,
              fontWeight: 500,
              background: colors[day.level].bg,
              color: colors[day.level].text,
              lineHeight: 1.1,
            }}
          >
            {day.monthLabel && (
              <span style={{ fontSize: 9, fontWeight: 500, opacity: 0.75, marginBottom: 1 }}>
                {day.monthLabel}
              </span>
            )}
            <span>{day.label}</span>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4" style={{ marginTop: 10 }}>
        {[
          { level: 'low' as const, label: t('demand_low') },
          { level: 'medium' as const, label: t('demand_medium') },
          { level: 'high' as const, label: t('demand_high') },
        ].map((item) => (
          <div key={item.level} className="flex items-center gap-1">
            <span style={{ width: 12, height: 12, borderRadius: 2, background: colors[item.level].bg, border: item.level === 'low' ? '1px solid var(--color-border)' : 'none' }} />
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
