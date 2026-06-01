import { describe, it, expect } from 'vitest'
import {
  detectHighFoodCost,
  detectTopMover,
  detectDeadItems,
  detectFnbWeekendOpportunity,
  detectRevenueDrop,
  generateFnbDailyRecommendations,
  toFnbRecommendationInputs,
  attachItemSales,
  type FnbRecommendationInput,
} from './engine'

const ANCHOR = '2026-05-29'  // Friday — for weekend tests

function days(
  revenues: number[],
  opts: { foodCosts?: Array<number | null>; covers?: Array<number | null> } = {},
  endDate = ANCHOR,
): FnbRecommendationInput[] {
  return revenues.map((rev, i) => {
    const d = new Date(`${endDate}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - (revenues.length - 1 - i))
    return {
      date: d.toISOString().slice(0, 10),
      revenueThb: rev,
      totalCovers: opts.covers?.[i] ?? null,
      costFoodThb: opts.foodCosts?.[i] ?? null,
      costNonFoodThb: null,
    }
  })
}

// ── High food cost ─────────────────────────────────────────────────────────

describe('detectHighFoodCost', () => {
  it('returns empty for fewer than 3 days of data', () => {
    expect(detectHighFoodCost(days([10000, 11000], { foodCosts: [5000, 5500] }))).toEqual([])
  })

  it('fires medium-urgency when food cost % is 40-45%', () => {
    const recs = detectHighFoodCost(days(
      [10000, 10000, 10000],
      { foodCosts: [4200, 4200, 4200] }, // 42%
    ))
    expect(recs).toHaveLength(1)
    expect(recs[0].type).toBe('high_food_cost')
    expect(recs[0].urgency).toBe('medium')
  })

  it('fires high-urgency when food cost % > 45%', () => {
    const recs = detectHighFoodCost(days(
      [10000, 10000, 10000],
      { foodCosts: [5000, 5000, 5000] }, // 50%
    ))
    expect(recs[0].urgency).toBe('high')
  })

  it('does NOT fire when food cost % is at or below 40%', () => {
    expect(detectHighFoodCost(days(
      [10000, 10000, 10000],
      { foodCosts: [3500, 3800, 4000] }, // 37.7%
    ))).toEqual([])
  })

  it('does NOT fire when ANY day in the window is missing cost_food', () => {
    expect(detectHighFoodCost(days(
      [10000, 10000, 10000],
      { foodCosts: [5000, null, 5000] },  // gap on day 2
    ))).toEqual([])
  })

  it('does NOT fire when cost is 0 (treat as unentered)', () => {
    expect(detectHighFoodCost(days(
      [10000, 10000, 10000],
      { foodCosts: [5000, 0, 5000] },
    ))).toEqual([])
  })
})

// ── Top mover ──────────────────────────────────────────────────────────────

describe('detectTopMover', () => {
  function withItemSales(input: FnbRecommendationInput[], sales: Array<Array<{ name: string; units: number }>>): FnbRecommendationInput[] {
    return input.map((d, i) => ({
      ...d,
      itemSales: sales[i]?.map((s) => ({
        menuItemId: `id-${s.name}`,
        name: s.name,
        category: null,
        unitsSold: s.units,
        priceThb: 100,
        costThb: null,
      })),
    }))
  }

  it('returns empty when fewer than 2 days carry itemSales', () => {
    const inputs = withItemSales(days([1000, 1000, 1000, 1000, 1000, 1000, 1000]), [
      [{ name: 'Pad Krapow', units: 5 }],
      // only 1 day has sales — not enough to call a "mover"
    ])
    expect(detectTopMover(inputs)).toEqual([])
  })

  it('fires when exactly 2 days carry itemSales (low-data floor)', () => {
    const inputs = withItemSales(days([1000, 1000, 1000, 1000, 1000, 1000, 1000]), [
      [{ name: 'Pad Krapow', units: 5 }],
      [{ name: 'Pad Krapow', units: 7 }],
    ])
    const recs = detectTopMover(inputs)
    expect(recs).toHaveLength(1)
    expect(recs[0].messageEn).toContain('Pad Krapow')
  })

  it('picks the highest-volume item across the window', () => {
    const inputs = withItemSales(days([1000, 1000, 1000, 1000, 1000, 1000, 1000]), [
      [{ name: 'Pad Krapow', units: 10 }, { name: 'Iced Coffee', units: 30 }],
      [{ name: 'Pad Krapow', units: 12 }, { name: 'Iced Coffee', units: 25 }],
      [{ name: 'Pad Krapow', units: 8 }, { name: 'Iced Coffee', units: 28 }],
      [{ name: 'Pad Krapow', units: 15 }],
      [{ name: 'Pad Krapow', units: 14 }, { name: 'Iced Coffee', units: 22 }],
      [{ name: 'Pad Krapow', units: 16 }, { name: 'Iced Coffee', units: 20 }],
      [{ name: 'Pad Krapow', units: 11 }, { name: 'Iced Coffee', units: 30 }],
    ])
    const recs = detectTopMover(inputs)
    expect(recs).toHaveLength(1)
    expect(recs[0].type).toBe('top_mover')
    expect(recs[0].urgency).toBe('low')
    expect(recs[0].messageEn).toContain('Iced Coffee')
  })

  it('shows the share % in the message', () => {
    const inputs = withItemSales(days([1000, 1000, 1000]), [
      [{ name: 'A', units: 50 }, { name: 'B', units: 50 }],
      [{ name: 'A', units: 50 }, { name: 'B', units: 50 }],
      [{ name: 'A', units: 50 }, { name: 'B', units: 50 }],
    ])
    const recs = detectTopMover(inputs)
    // Total 300, A = 150, share = 50%. Messages should mention 50%.
    expect(recs[0].messageEn).toMatch(/50%/)
  })
})

// ── Dead items ─────────────────────────────────────────────────────────────

describe('detectDeadItems', () => {
  // Helper: 28 days of revenue + per-day item sales.
  function build(perDay: Array<Array<{ name: string; units: number }>>): FnbRecommendationInput[] {
    const revs = Array(perDay.length).fill(5000)
    const baseDays = days(revs)
    return baseDays.map((d, i) => ({
      ...d,
      itemSales: perDay[i].map((s) => ({
        menuItemId: `id-${s.name}`,
        name: s.name,
        category: null,
        unitsSold: s.units,
        priceThb: 100,
        costThb: null,
      })),
    }))
  }

  it('returns empty when window is too narrow', () => {
    const input = build(Array(20).fill([{ name: 'A', units: 5 }]))
    expect(detectDeadItems(input)).toEqual([])
  })

  it('fires when an item was selling and now has zero sales', () => {
    // 28 days: A sold heavily in days 0-13 (prior), zero in days 14-27 (recent).
    const prior = Array(14).fill(0).map(() => [{ name: 'A', units: 10 }, { name: 'B', units: 5 }])
    const recent = Array(14).fill(0).map(() => [{ name: 'B', units: 5 }])  // A absent
    const input = build([...prior, ...recent])
    const recs = detectDeadItems(input)
    expect(recs).toHaveLength(1)
    expect(recs[0].type).toBe('dead_item')
    expect(recs[0].messageEn).toContain('A')
  })

  it('ignores items with very low prior sales (noise filter)', () => {
    // A only sold 5 units in prior window total — below 10 threshold.
    const prior = Array(14).fill(0).map((_, i) => i < 5 ? [{ name: 'A', units: 1 }] : [{ name: 'B', units: 5 }])
    const recent = Array(14).fill(0).map(() => [{ name: 'B', units: 5 }])
    const input = build([...prior, ...recent])
    expect(detectDeadItems(input)).toEqual([])
  })

  it('caps the message to 3 named items even when more are dead', () => {
    // Prior window: A, B, C, D, E all selling well. Recent window:
    // ONLY 'F' (a different item) sells — so A..E are all dead, but
    // the recent window still has activity (passes the "5+ days with
    // sales" floor in the detector).
    const prior = Array(14).fill(0).map(() => [
      { name: 'A', units: 10 }, { name: 'B', units: 10 },
      { name: 'C', units: 10 }, { name: 'D', units: 10 }, { name: 'E', units: 10 },
    ])
    const recent = Array(14).fill(0).map(() => [{ name: 'F', units: 5 }])
    const input = build([...prior, ...recent])
    const recs = detectDeadItems(input)
    expect(recs).toHaveLength(1)
    // Should mention 3 items maximum.
    const names = (recs[0].supportingData.items as string[])
    expect(names).toHaveLength(3)
  })
})

// ── Weekend opportunity ────────────────────────────────────────────────────

describe('detectFnbWeekendOpportunity', () => {
  it('returns empty for fewer than 7 days', () => {
    expect(detectFnbWeekendOpportunity(days([1000, 1000, 1000]))).toEqual([])
  })

  it('fires when weekend revenue exceeds weekday by > 30%', () => {
    // 7 days ending Friday (ANCHOR). Days 0..6 = Sat Sun Mon Tue Wed Thu Fri.
    // High weekend (Sat/Fri), low weekday.
    const recs = detectFnbWeekendOpportunity(days([
      20000, // Sat (weekend)
      8000,  // Sun (weekday in our weekend def Fri+Sat)
      8000,  // Mon
      8000,  // Tue
      8000,  // Wed
      8000,  // Thu
      20000, // Fri (weekend)
    ]))
    expect(recs).toHaveLength(1)
    expect(recs[0].type).toBe('weekend_opportunity')
  })

  it('does not fire when weekend is only marginally above weekday', () => {
    expect(detectFnbWeekendOpportunity(days([
      11000, 10000, 10000, 10000, 10000, 10000, 11000,
    ]))).toEqual([])
  })
})

// ── Revenue drop ───────────────────────────────────────────────────────────

describe('detectRevenueDrop', () => {
  it('returns empty for fewer than 14 days', () => {
    expect(detectRevenueDrop(days([1000, 2000]))).toEqual([])
  })

  it('fires when recent 7-day avg drops ≥15% vs prior 7-day', () => {
    const recs = detectRevenueDrop(days([
      10000, 10000, 10000, 10000, 10000, 10000, 10000,  // prior
      8000, 8000, 8000, 8000, 8000, 8000, 8000,         // recent (20% drop)
    ]))
    expect(recs).toHaveLength(1)
    expect(recs[0].type).toBe('revenue_drop')
    expect(recs[0].urgency).toBe('medium')
  })

  it('fires with high urgency on > 25% drop', () => {
    const recs = detectRevenueDrop(days([
      10000, 10000, 10000, 10000, 10000, 10000, 10000,
      6000, 6000, 6000, 6000, 6000, 6000, 6000,  // 40% drop
    ]))
    expect(recs[0].urgency).toBe('high')
  })

  it('does NOT fire on a < 15% drop (noise)', () => {
    expect(detectRevenueDrop(days([
      10000, 10000, 10000, 10000, 10000, 10000, 10000,
      9000, 9000, 9000, 9000, 9000, 9000, 9000,  // 10% drop
    ]))).toEqual([])
  })

  it('does NOT fire on a revenue INCREASE', () => {
    expect(detectRevenueDrop(days([
      8000, 8000, 8000, 8000, 8000, 8000, 8000,
      10000, 10000, 10000, 10000, 10000, 10000, 10000,
    ]))).toEqual([])
  })
})

// ── Composer ───────────────────────────────────────────────────────────────

describe('generateFnbDailyRecommendations', () => {
  it('returns empty for empty input', () => {
    expect(generateFnbDailyRecommendations([])).toEqual([])
  })

  it('dedupes by type and orders by urgency', () => {
    // 14 days with both high_food_cost AND revenue_drop firing — high
    // and medium urgency. Output should have both, high first.
    const input = days(
      [
        10000, 10000, 10000, 10000, 10000, 10000, 10000,
        7000, 7000, 7000, 7000, 7000, 7000, 7000,
      ],
      {
        foodCosts: Array(14).fill(5000),  // 50% food cost throughout
      },
    )
    const recs = generateFnbDailyRecommendations(input)
    expect(recs.length).toBeGreaterThanOrEqual(2)
    const types = recs.map((r) => r.type)
    expect(types).toContain('high_food_cost')
    expect(types).toContain('revenue_drop')
    // Highest urgency first.
    expect(recs[0].urgency).toBe('high')
  })

  it('caps the total to 5 recommendations', () => {
    // Synthesize a window that fires everything possible.
    const input = days(
      [
        10000, 10000, 10000, 10000, 10000, 10000, 20000,  // weekend opportunity
        7000, 7000, 7000, 7000, 7000, 7000, 6000,         // drop
      ],
      { foodCosts: Array(14).fill(5000) },                // high food cost
    )
    const recs = generateFnbDailyRecommendations(input)
    expect(recs.length).toBeLessThanOrEqual(5)
  })
})

// ── Adapters ───────────────────────────────────────────────────────────────

describe('toFnbRecommendationInputs', () => {
  it('drops rows with revenue ≤ 0', () => {
    const out = toFnbRecommendationInputs([
      { metric_date: '2026-05-27', revenue: 10000, total_customers: 50, cost_food: 4000, cost_nonfood: 500 },
      { metric_date: '2026-05-28', revenue: 0, total_customers: 0, cost_food: null, cost_nonfood: null },  // dropped
      { metric_date: '2026-05-29', revenue: 11000, total_customers: 55, cost_food: 4200, cost_nonfood: 500 },
    ])
    expect(out).toHaveLength(2)
    expect(out.map((r) => r.date)).toEqual(['2026-05-27', '2026-05-29'])
  })

  it('sorts ascending by date', () => {
    const out = toFnbRecommendationInputs([
      { metric_date: '2026-05-29', revenue: 11000, total_customers: 55, cost_food: 4200, cost_nonfood: 500 },
      { metric_date: '2026-05-27', revenue: 10000, total_customers: 50, cost_food: 4000, cost_nonfood: 500 },
    ])
    expect(out.map((r) => r.date)).toEqual(['2026-05-27', '2026-05-29'])
  })

  it('preserves null costs', () => {
    const out = toFnbRecommendationInputs([
      { metric_date: '2026-05-27', revenue: 10000, total_customers: 50, cost_food: null, cost_nonfood: null },
    ])
    expect(out[0].costFoodThb).toBeNull()
    expect(out[0].costNonFoodThb).toBeNull()
  })
})

describe('attachItemSales', () => {
  it('decorates matching dates with item sales', () => {
    const inputs = toFnbRecommendationInputs([
      { metric_date: '2026-05-27', revenue: 10000, total_customers: 50, cost_food: null, cost_nonfood: null },
      { metric_date: '2026-05-28', revenue: 11000, total_customers: 55, cost_food: null, cost_nonfood: null },
    ])
    const out = attachItemSales(inputs, [
      { date: '2026-05-27', menuItemId: 'i1', name: 'Pad Krapow', category: 'Main', unitsSold: 12, priceThb: 100, costThb: null },
      { date: '2026-05-27', menuItemId: 'i2', name: 'Iced Coffee', category: 'Drinks', unitsSold: 20, priceThb: 70, costThb: null },
      // 28 intentionally missing
    ])
    expect(out[0].itemSales).toHaveLength(2)
    expect(out[1].itemSales).toBeUndefined()
  })
})
