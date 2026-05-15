import { describe, it, expect } from 'vitest'
import {
  computeOperationalCompleteness,
  isFnbRowOperational,
  type FnbOperationalRow,
} from './operationalCompleteness'

const today = '2026-04-20'

function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + delta)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function opRow(date: string): FnbOperationalRow {
  return { metric_date: date, revenue: 8000, total_customers: 40 }
}

describe('computeOperationalCompleteness (Metric A)', () => {
  it('does NOT require variable cost to mark a day complete', () => {
    // Shape includes cost-irrelevant fields only. If anything secretly
    // required `additional_cost_today` we'd regress immediately.
    const rows: FnbOperationalRow[] = [
      { metric_date: addDays(today, -1), revenue: 8000, total_customers: 40 },
      { metric_date: addDays(today, -2), revenue: 8000, total_customers: 40 },
    ]
    const result = computeOperationalCompleteness(rows, isFnbRowOperational, today)
    expect(result.daysPresent).toBe(2)
  })

  it('marks sales-only rows as incomplete (covers still required)', () => {
    const rows: FnbOperationalRow[] = [
      { metric_date: addDays(today, -1), revenue: 8000, total_customers: null },
    ]
    expect(computeOperationalCompleteness(rows, isFnbRowOperational, today).daysPresent).toBe(0)
  })

  it('linear percentage with threshold colors', () => {
    const make = (n: number) => Array.from({ length: n }, (_, i) => opRow(addDays(today, -i)))
    expect(computeOperationalCompleteness(make(7), isFnbRowOperational, today).level).toBe('red')
    expect(computeOperationalCompleteness(make(18), isFnbRowOperational, today).level).toBe('amber')
    expect(computeOperationalCompleteness(make(24), isFnbRowOperational, today)).toMatchObject({
      percentage: 80,
      level: 'green',
    })
  })

  it('consecutiveCompleteDays = 7 after 36 perfect days; resets on any miss', () => {
    const rows36 = Array.from({ length: 36 }, (_, i) => opRow(addDays(today, -i)))
    expect(
      computeOperationalCompleteness(rows36, isFnbRowOperational, today).consecutiveCompleteDays,
    ).toBe(7)

    const withGap = rows36.filter((_, i) => i !== 3)
    expect(
      computeOperationalCompleteness(withGap, isFnbRowOperational, today)
        .consecutiveCompleteDays,
    ).toBe(0)
  })
})
