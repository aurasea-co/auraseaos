import { describe, it, expect } from 'vitest'
import { computeCostCoverage, type CostCoverageRow } from './costCoverage'

const today = '2026-04-20'

function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + delta)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function row(dateOffset: number, { sales = 0, cost = 0 }: { sales?: number; cost?: number }): CostCoverageRow {
  return {
    metric_date: addDays(today, -dateOffset),
    revenue: sales > 0 ? sales : null,
    additional_cost_today: cost > 0 ? cost : null,
  }
}

describe('computeCostCoverage (Metric B)', () => {
  it('neutral state when there are no sales at all', () => {
    const result = computeCostCoverage([], today)
    expect(result.operationalDays).toBe(0)
    expect(result.daysCovered).toBe(0)
    expect(result.coverageRatio).toBeNull()
    expect(result.level).toBe('neutral')
    expect(result.dayStates).toHaveLength(60)
    // Every day is closed — no sales anywhere.
    expect(result.dayStates.every((d) => d.state === 'closed')).toBe(true)
  })

  it('all sales + zero cost entries → 0% coverage (red)', () => {
    // 30 consecutive sales days with no cost entry anywhere.
    const rows = Array.from({ length: 30 }, (_, i) => row(i, { sales: 8000 }))
    const result = computeCostCoverage(rows, today)
    expect(result.operationalDays).toBe(30)
    expect(result.daysCovered).toBe(0)
    expect(result.coverageRatio).toBe(0)
    expect(result.level).toBe('red')
  })

  it('one cost entry covers its day + the next 7 operational days', () => {
    // Sales every day for 10 consecutive days ending today. Cost entry
    // on day -9 (the oldest of the 10). It should cover day -9 through
    // day -2 (8 calendar days = entry day + 7 following).
    const rows: CostCoverageRow[] = [
      ...Array.from({ length: 10 }, (_, i) => row(i, { sales: 8000 })),
      row(9, { sales: 8000, cost: 3000 }),
    ]
    const result = computeCostCoverage(rows, today)
    expect(result.operationalDays).toBe(10)
    // Day offsets 9..2 covered = 8 days. Day offsets 1, 0 = uncovered.
    expect(result.daysCovered).toBe(8)
  })

  it('cost entry older than the lookback no longer covers', () => {
    // Sales today. Last cost entry was 8 days ago (just outside the
    // 7-day lookback, which is a 0..7 range inclusive).
    const rows: CostCoverageRow[] = [
      row(0, { sales: 8000 }),
      row(8, { cost: 3000 }),
    ]
    const result = computeCostCoverage(rows, today)
    expect(result.operationalDays).toBe(1)
    expect(result.daysCovered).toBe(0)
  })

  it('cost entry exactly 7 days ago DOES cover today (inclusive boundary)', () => {
    const rows: CostCoverageRow[] = [
      row(0, { sales: 8000 }),
      row(7, { cost: 3000 }),
    ]
    const result = computeCostCoverage(rows, today)
    expect(result.daysCovered).toBe(1)
  })

  it('closed days excluded from numerator AND denominator', () => {
    // 3 operating days with a cost entry on each, plus 57 closed days.
    const rows: CostCoverageRow[] = [
      row(0, { sales: 8000, cost: 3000 }),
      row(1, { sales: 8000, cost: 3000 }),
      row(2, { sales: 8000, cost: 3000 }),
    ]
    const result = computeCostCoverage(rows, today)
    expect(result.operationalDays).toBe(3)
    expect(result.daysCovered).toBe(3)
    expect(result.coverageRatio).toBe(1)
    // Sanity — 60 - 3 = 57 closed days rendered.
    expect(result.dayStates.filter((d) => d.state === 'closed')).toHaveLength(57)
  })

  it('cost entry on a closed day still credits following operational days', () => {
    // Cost entry was made on a closed Sunday (day -5). Operational
    // Monday..Friday (days -4..0) should all be covered by it.
    const rows: CostCoverageRow[] = [
      row(5, { cost: 3000 }), // closed day with a cost entry
      row(4, { sales: 8000 }),
      row(3, { sales: 8000 }),
      row(2, { sales: 8000 }),
      row(1, { sales: 8000 }),
      row(0, { sales: 8000 }),
    ]
    const result = computeCostCoverage(rows, today)
    expect(result.operationalDays).toBe(5)
    expect(result.daysCovered).toBe(5)
  })

  it('hasCostEntry flag is true only on dates with a cost row', () => {
    // Cost entry on day -1, operational day 0. Day 0 is covered by
    // the day-before entry via the 7-day lookback, but its own
    // hasCostEntry flag must stay false.
    const rows: CostCoverageRow[] = [
      row(0, { sales: 8000 }),
      row(1, { sales: 8000, cost: 3000 }),
    ]
    const result = computeCostCoverage(rows, today)
    const t = result.dayStates.find((d) => d.date === addDays(today, 0))!
    const y = result.dayStates.find((d) => d.date === addDays(today, -1))!
    expect(t.hasCostEntry).toBe(false)
    expect(y.hasCostEntry).toBe(true)
    expect(t.state).toBe('covered')
    expect(y.state).toBe('covered')
  })

  it('threshold boundaries: 59% red / 60% amber, 84% amber / 85% green', () => {
    // Build fixed denominators that hit the exact ratios.
    // 100 operational days isn't possible in 60-day window, so use:
    //  - 60 ops, 36 covered → 60% (amber)
    //  - 60 ops, 35 covered → 58.3% (red)
    //  - 60 ops, 51 covered → 85% (green)
    //  - 60 ops, 50 covered → 83.3% (amber)
    const mk = (coveredCount: number): CostCoverageRow[] => {
      const out: CostCoverageRow[] = []
      for (let i = 0; i < 60; i++) {
        // Every day operational
        out.push(row(i, { sales: 8000 }))
        // Cover the most-recent `coveredCount` days via a cost entry on each of those days.
        if (i < coveredCount) out.push(row(i, { cost: 3000 }))
      }
      return out
    }

    expect(computeCostCoverage(mk(36), today).level).toBe('amber')
    expect(computeCostCoverage(mk(35), today).level).toBe('red')
    expect(computeCostCoverage(mk(51), today).level).toBe('green')
    expect(computeCostCoverage(mk(50), today).level).toBe('amber')
  })

  it('exports COST_LOOKBACK_DAYS = 7 and windowSize = 60', () => {
    const result = computeCostCoverage([], today)
    expect(result.windowSize).toBe(60)
    expect(result.lookbackDays).toBe(7)
  })
})
