/**
 * Shared F&B margin selectors — one source of truth for Home + Trends.
 *
 * Previously each page inlined its own aggregation, which drifted:
 *   - Home used the single latest row (blew up when today's cost wasn't
 *     in yet → card rendered "-").
 *   - Trends aggregated totals-of-totals across days-with-cost.
 * Consolidating them here means the Home "30-day avg" line and the
 * Trends "Avg margin (after salary)" tile are guaranteed to match for
 * the same venue + period.
 */

import { toBangkokDateStr } from '@/lib/businessDate'

export type MarginMode = 'net' | 'gross'

/** Minimum shape the aggregators need — works for both branch_daily_metrics
 *  rows (Trends) and the unified Home shape as long as the caller maps the
 *  total variable cost into `variableCost`. */
export interface MarginInputRow {
  metric_date: string
  revenue: number | null
  /** Total variable cost for the day (additional_cost_today). NOT per-cover. */
  variableCost: number | null
}

export interface PeriodMarginResult {
  value: number
  mode: MarginMode
  daysIncluded: number
}

export interface LatestMarginResult {
  value: number
  mode: MarginMode
  date: string
}

function hasSalary(monthlySalary: number, operatingDays: number): boolean {
  return monthlySalary > 0 && operatingDays > 0
}

function isCompleteRow(r: MarginInputRow): boolean {
  return (r.revenue ?? 0) > 0 && (r.variableCost ?? 0) > 0
}

/**
 * Period-average margin — sums totals across all days with revenue + cost,
 * then divides (totals-of-totals). Days without cost are excluded, not
 * zero-filled. Returns `null` if no day in the period has a complete entry.
 */
export function periodAvgMargin(
  rows: MarginInputRow[],
  monthlySalary: number,
  operatingDays: number,
): PeriodMarginResult | null {
  const withCost = rows.filter(isCompleteRow)
  if (withCost.length === 0) return null

  const totalRevenue = withCost.reduce((s, r) => s + (r.revenue as number), 0)
  const totalCost = withCost.reduce((s, r) => s + (r.variableCost as number), 0)
  if (totalRevenue <= 0) return null

  const mode: MarginMode = hasSalary(monthlySalary, operatingDays) ? 'net' : 'gross'

  let pct: number
  if (mode === 'net') {
    const totalSalary = (monthlySalary / operatingDays) * withCost.length
    pct = ((totalRevenue - totalCost - totalSalary) / totalRevenue) * 100
    if (pct > 80 || pct < -100) return null
  } else {
    pct = (1 - totalCost / totalRevenue) * 100
    if (pct > 85 || pct < 0) return null
  }

  return {
    value: Math.round(pct * 10) / 10,
    mode,
    daysIncluded: withCost.length,
  }
}

/**
 * Margin for the most recent day with a complete entry (revenue + cost).
 * Returns `null` if no day in the input has both. Date is normalised to
 * Bangkok YYYY-MM-DD so callers can display it consistently.
 */
export function latestCompleteDayMargin(
  rows: MarginInputRow[],
  monthlySalary: number,
  operatingDays: number,
): LatestMarginResult | null {
  // Assume rows are ascending by date (matches the hook order). Walk from
  // the end so the first complete row we find is the most recent.
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i]
    if (!isCompleteRow(r)) continue

    const revenue = r.revenue as number
    const variableCost = r.variableCost as number
    const mode: MarginMode = hasSalary(monthlySalary, operatingDays) ? 'net' : 'gross'

    let pct: number
    if (mode === 'net') {
      const dailySalary = monthlySalary / operatingDays
      pct = ((revenue - variableCost - dailySalary) / revenue) * 100
      if (pct > 80 || pct < -100) continue
    } else {
      pct = (1 - variableCost / revenue) * 100
      if (pct > 85 || pct < 0) continue
    }

    return {
      value: Math.round(pct * 10) / 10,
      mode,
      date: toBangkokDateStr(r.metric_date),
    }
  }
  return null
}
