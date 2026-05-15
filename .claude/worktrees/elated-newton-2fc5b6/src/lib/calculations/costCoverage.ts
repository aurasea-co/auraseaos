/**
 * Metric B — Cost coverage.
 *
 * F&B ingredient purchases are lumpy — a weekly Makro run plus frequent
 * fresh-item top-ups. Judging the venue by "cost entered every day?"
 * penalises normal behaviour. Cost coverage asks a better question:
 *
 *   "Do the cost entries in the last 60 days actually cover the days
 *    the restaurant was operating?"
 *
 * A cost entry covers the day it was made AND the 7 preceding days
 * (8 calendar days total including the entry day itself). An operational
 * day is a day with sales recorded. Closed days are excluded from both
 * numerator and denominator.
 */

import { toBangkokDateStr } from '@/lib/businessDate'

export type CoverageLevel = 'green' | 'amber' | 'red' | 'neutral'

export type DayState = 'covered' | 'uncovered' | 'closed'

/** Number of preceding days a cost entry credits (in addition to the
 *  entry day itself). Kept as a single named constant so tests + docs
 *  stay consistent when the number is revisited. */
export const COST_LOOKBACK_DAYS = 7

export const COST_COVERAGE_WINDOW = 60

export interface CostCoverageRow {
  metric_date: string
  revenue: number | null
  additional_cost_today: number | null
}

export interface DayCoverage {
  date: string
  state: DayState
  /** True if this specific date had a cost entry recorded (the blue dots
   *  in the popover). Independent of whether the day is operational. */
  hasCostEntry: boolean
}

export interface CostCoverage {
  /** Days with sales in the 60-day window. Excludes closed days. */
  operationalDays: number
  /** Operational days covered by a cost entry on that day or in the
   *  preceding `COST_LOOKBACK_DAYS` days. */
  daysCovered: number
  /** daysCovered / operationalDays, 0..1. Undefined when operationalDays
   *  is 0 (no sales at all) — callers render a neutral "not enough data"
   *  state rather than NaN%. */
  coverageRatio: number | null
  level: CoverageLevel
  windowSize: typeof COST_COVERAGE_WINDOW
  lookbackDays: typeof COST_LOOKBACK_DAYS
  /** Every day in the 60-day window, oldest → newest, with its state and
   *  whether a cost entry was recorded on that specific calendar day. */
  dayStates: DayCoverage[]
}

function levelFor(ratio: number | null): CoverageLevel {
  if (ratio == null) return 'neutral'
  const pct = ratio * 100
  if (pct >= 85) return 'green'
  if (pct >= 60) return 'amber'
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

/**
 * Compute cost coverage for the 60-day window ending at `today`.
 *
 * @param rows  Entry rows spanning at least the 60-day window AND the
 *              `COST_LOOKBACK_DAYS` preceding it — so 67+ days of data.
 *              Rows outside the window are still inspected for cost
 *              entries that cover the early days of the window.
 * @param today  Bangkok-local YYYY-MM-DD.
 */
export function computeCostCoverage(
  rows: CostCoverageRow[],
  today: string,
): CostCoverage {
  // Flatten into two per-day maps. Multiple rows on the same date
  // collapse: operational if ANY has revenue > 0; hasCostEntry if ANY
  // has cost > 0.
  const hasSales = new Map<string, boolean>()
  const hasCost = new Map<string, boolean>()
  for (const r of rows) {
    const d = toBangkokDateStr(r.metric_date)
    if (!d) continue
    if ((r.revenue ?? 0) > 0) hasSales.set(d, true)
    if ((r.additional_cost_today ?? 0) > 0) hasCost.set(d, true)
  }

  // Build the 60-day window oldest → today.
  const dayStates: DayCoverage[] = []
  for (let i = COST_COVERAGE_WINDOW - 1; i >= 0; i--) {
    const date = addDays(today, -i)
    const operational = hasSales.get(date) === true
    if (!operational) {
      dayStates.push({ date, state: 'closed', hasCostEntry: hasCost.get(date) === true })
      continue
    }
    // Covered if a cost entry exists on this day or any of the
    // COST_LOOKBACK_DAYS preceding days.
    let covered = false
    for (let j = 0; j <= COST_LOOKBACK_DAYS; j++) {
      if (hasCost.get(addDays(date, -j)) === true) {
        covered = true
        break
      }
    }
    dayStates.push({
      date,
      state: covered ? 'covered' : 'uncovered',
      hasCostEntry: hasCost.get(date) === true,
    })
  }

  const operationalDays = dayStates.filter((d) => d.state !== 'closed').length
  const daysCovered = dayStates.filter((d) => d.state === 'covered').length
  const coverageRatio = operationalDays > 0 ? daysCovered / operationalDays : null

  return {
    operationalDays,
    daysCovered,
    coverageRatio,
    level: levelFor(coverageRatio),
    windowSize: COST_COVERAGE_WINDOW,
    lookbackDays: COST_LOOKBACK_DAYS,
    dayStates,
  }
}
