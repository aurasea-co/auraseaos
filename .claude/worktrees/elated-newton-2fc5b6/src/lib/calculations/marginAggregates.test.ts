import { describe, it, expect } from 'vitest'
import {
  periodAvgMargin,
  latestCompleteDayMargin,
  type MarginInputRow,
} from './marginAggregates'

const row = (
  date: string,
  revenue: number | null,
  variableCost: number | null,
): MarginInputRow => ({ metric_date: date, revenue, variableCost })

describe('periodAvgMargin', () => {
  it('returns null when no day has both revenue and cost', () => {
    const rows: MarginInputRow[] = [
      row('2026-04-18', 8000, null),
      row('2026-04-19', 0, 3000),
      row('2026-04-20', null, null),
    ]
    expect(periodAvgMargin(rows, 20000, 26)).toBeNull()
  })

  it('aggregates totals-of-totals (not an avg-of-avgs)', () => {
    // Two days: 10000 rev / 3000 cost, 5000 rev / 2000 cost.
    // avg-of-avgs would give (70% + 60%)/2 = 65% (gross).
    // totals-of-totals: (15000 - 5000) / 15000 = 66.67% — different.
    const rows: MarginInputRow[] = [
      row('2026-04-19', 10000, 3000),
      row('2026-04-20', 5000, 2000),
    ]
    const agg = periodAvgMargin(rows, 0, 0) // gross mode
    expect(agg).not.toBeNull()
    expect(agg!.mode).toBe('gross')
    expect(agg!.daysIncluded).toBe(2)
    // (1 - 5000/15000) * 100 = 66.666… → rounded to 66.7
    expect(agg!.value).toBeCloseTo(66.7, 1)
  })

  it('subtracts daily salary share in net mode', () => {
    // Single day: 10000 rev, 3000 variable cost, salary 26k/26 = 1000/day
    // → net = (10000 - 3000 - 1000) / 10000 = 60%
    const rows: MarginInputRow[] = [row('2026-04-19', 10000, 3000)]
    const agg = periodAvgMargin(rows, 26000, 26)
    expect(agg).not.toBeNull()
    expect(agg!.mode).toBe('net')
    expect(agg!.value).toBeCloseTo(60, 1)
  })

  it('skips days without cost (does not zero-fill)', () => {
    // Without skipping, a day with revenue but null cost would push
    // effective cost ratio down and inflate margin.
    const rows: MarginInputRow[] = [
      row('2026-04-17', 10000, null), // should be excluded
      row('2026-04-18', 10000, 3000),
      row('2026-04-19', 10000, null), // should be excluded
    ]
    const agg = periodAvgMargin(rows, 0, 0)
    expect(agg!.daysIncluded).toBe(1)
    expect(agg!.value).toBeCloseTo(70, 1) // (1 - 3000/10000) * 100
  })

  it('returns null for nonsensical aggregate (sanity band)', () => {
    // Massive cost vs tiny revenue → margin deeply negative → null.
    const rows: MarginInputRow[] = [row('2026-04-19', 100, 100000)]
    expect(periodAvgMargin(rows, 0, 0)).toBeNull()
  })
})

describe('latestCompleteDayMargin', () => {
  it('returns the most recent day with revenue + cost', () => {
    const rows: MarginInputRow[] = [
      row('2026-04-17', 8000, 3000),
      row('2026-04-18', 8000, 3000),
      row('2026-04-19', 8000, 3000),
      row('2026-04-20', 8000, null), // today, cost not entered yet
    ]
    const r = latestCompleteDayMargin(rows, 0, 0)
    expect(r).not.toBeNull()
    expect(r!.date).toBe('2026-04-19')
    expect(r!.mode).toBe('gross')
    expect(r!.value).toBeCloseTo(62.5, 1) // (1 - 3000/8000) * 100
  })

  it('walks backwards past rows missing revenue or cost', () => {
    const rows: MarginInputRow[] = [
      row('2026-04-15', 8000, 3000),
      row('2026-04-16', 0, 3000),
      row('2026-04-17', 8000, null),
      row('2026-04-18', null, null),
      row('2026-04-19', null, null),
    ]
    const r = latestCompleteDayMargin(rows, 0, 0)
    expect(r).not.toBeNull()
    expect(r!.date).toBe('2026-04-15')
  })

  it('normalises a UTC-timestamp metric_date to Bangkok date', () => {
    // 2026-04-16 17:00 UTC = 2026-04-17 midnight Bangkok
    const rows: MarginInputRow[] = [
      row('2026-04-16T17:00:00+00:00', 8000, 3000),
    ]
    const r = latestCompleteDayMargin(rows, 0, 0)
    expect(r!.date).toBe('2026-04-17')
  })

  it('returns null when no row is complete', () => {
    const rows: MarginInputRow[] = [
      row('2026-04-19', 8000, null),
      row('2026-04-20', null, 2000),
    ]
    expect(latestCompleteDayMargin(rows, 0, 0)).toBeNull()
  })
})

describe('periodAvgMargin + latestCompleteDayMargin agree per day', () => {
  it('single-day period aggregate matches the latest-day margin', () => {
    const rows: MarginInputRow[] = [row('2026-04-19', 10000, 3500)]
    const agg = periodAvgMargin(rows, 0, 0)
    const latest = latestCompleteDayMargin(rows, 0, 0)
    expect(agg!.value).toBeCloseTo(latest!.value, 1)
  })
})
