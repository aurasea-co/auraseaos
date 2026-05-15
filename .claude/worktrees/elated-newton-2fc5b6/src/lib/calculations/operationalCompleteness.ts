/**
 * Metric A — Operational completeness.
 *
 * "How many of the last 30 days did the venue record the operational data
 * they actually produce every day (sales + covers/rooms)?"
 *
 * Drives the page-title pill on Home, Trends, Labour, Portfolio, Pricing.
 * DOES NOT consider variable cost — cost entries are lumpy in F&B (weekly
 * Makro runs, occasional top-ups) so requiring them daily punished venues
 * that were operating perfectly well. The Cost tab has its own coverage
 * metric (see costCoverage.ts) which handles the lumpy case honestly.
 */

import { toBangkokDateStr } from '@/lib/businessDate'

export type CompletenessLevel = 'green' | 'amber' | 'red'

export interface CompletenessRow {
  metric_date: string
}

export interface OperationalCompleteness {
  /** Days with a complete operational entry in the 30-day window ending at `today`. */
  daysPresent: number
  windowSize: 30
  /** Always daysPresent/30 × 100 rounded — no non-linear fudge. */
  percentage: number
  level: CompletenessLevel
  /**
   * Consecutive most-recent days that are themselves operationally
   * complete AND had a 30/30 window ending on that day. Used to drive
   * the "sustained perfect → ⓘ-only" pill state.
   */
  consecutiveCompleteDays: number
  /** Bangkok-local YYYY-MM-DD dates of complete days, oldest → newest. */
  completeDates: string[]
  /** Full 30-day window in order so callers can render the strip directly. */
  days: { date: string; complete: boolean }[]
}

function levelFor(pct: number): CompletenessLevel {
  if (pct >= 80) return 'green'
  if (pct >= 50) return 'amber'
  return 'red'
}

function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + delta)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function computeOperationalCompleteness<T extends CompletenessRow>(
  rows: T[],
  isComplete: (r: T) => boolean,
  today: string,
): OperationalCompleteness {
  const byDate = new Map<string, boolean>()
  for (const r of rows) {
    const d = toBangkokDateStr(r.metric_date)
    if (!d) continue
    byDate.set(d, (byDate.get(d) ?? false) || isComplete(r))
  }

  const days: { date: string; complete: boolean }[] = []
  for (let i = 29; i >= 0; i--) {
    const date = addDays(today, -i)
    days.push({ date, complete: byDate.get(date) === true })
  }

  const daysPresent = days.reduce((n, d) => (d.complete ? n + 1 : n), 0)
  const percentage = Math.round((daysPresent / 30) * 100)

  // consecutiveCompleteDays: walk back from today counting days that are
  // themselves complete AND had a 30/30 window ending on that day. Needs
  // up to 37 days of input (30 + 7) to resolve fully.
  let consecutiveCompleteDays = 0
  for (let i = 0; i < 7; i++) {
    const refDate = addDays(today, -i)
    if (byDate.get(refDate) !== true) break
    let windowCount = 0
    for (let j = 0; j < 30; j++) {
      if (byDate.get(addDays(refDate, -j)) === true) windowCount++
    }
    if (windowCount < 30) break
    consecutiveCompleteDays++
  }

  return {
    daysPresent,
    windowSize: 30,
    percentage,
    level: levelFor(percentage),
    consecutiveCompleteDays,
    completeDates: days.filter((d) => d.complete).map((d) => d.date),
    days,
  }
}

// ----- business-type predicates (no cost requirement) -------------------

export interface FnbOperationalRow extends CompletenessRow {
  revenue: number | null
  total_customers: number | null
}

/** F&B "operational": sales AND covers entered. Variable cost is intentionally
 *  NOT required — restaurants buy ingredients in batches, not daily. */
export function isFnbRowOperational(r: FnbOperationalRow): boolean {
  return (r.revenue ?? 0) > 0 && (r.total_customers ?? 0) > 0
}

export interface HotelOperationalRow extends CompletenessRow {
  revenue: number | null
  rooms_sold: number | null
}

/** Hotel "operational": sales AND rooms_sold entered. */
export function isHotelRowOperational(r: HotelOperationalRow): boolean {
  return (r.revenue ?? 0) > 0 && (r.rooms_sold ?? 0) > 0
}
