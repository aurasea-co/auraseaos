import { describe, it, expect } from 'vitest'
import {
  suggestRates,
  detectLowOccupancy,
  detectWeekendOpportunity,
  detectCompetitorUndercutting,
  detectOverpricing,
  forecastTomorrow,
  generateDailyRecommendations,
  toRecommendationInputs,
  attachCompetitorRates,
  type RecommendationInput,
} from './engine'

// Sequence helper — produces N days of input ending on the given
// date with the given occupancy / ADR pattern. Use a real anchor
// date so weekend tests can rely on day-of-week being correct.
const ANCHOR = '2026-05-29' // Friday

function days(occupancies: number[], adrThb = 876, endDate = ANCHOR): RecommendationInput[] {
  return occupancies.map((occ, i) => {
    const d = new Date(`${endDate}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - (occupancies.length - 1 - i))
    return { date: d.toISOString().slice(0, 10), occupancyRate: occ, adrThb }
  })
}

describe('suggestRates', () => {
  it('returns rate_increase when avg occupancy > 85% for 3 days', () => {
    const recs = suggestRates(days([0.9, 0.87, 0.91]))
    expect(recs).toHaveLength(1)
    expect(recs[0].type).toBe('rate_increase')
    expect(recs[0].urgency).toBe('high')
    expect(recs[0].suggestedRateThb!).toBeGreaterThan(recs[0].currentRateThb!)
    expect(Number.isInteger(recs[0].suggestedRateThb)).toBe(true)
    expect(Number.isInteger(recs[0].currentRateThb)).toBe(true)
  })

  it('returns rate_decrease when avg occupancy < 40% for 3 days', () => {
    const recs = suggestRates(days([0.3, 0.35, 0.28]))
    expect(recs[0].type).toBe('rate_decrease')
    expect(recs[0].urgency).toBe('medium')
    expect(recs[0].suggestedRateThb!).toBeLessThan(recs[0].currentRateThb!)
  })

  it('returns rate_hold for mid-range occupancy', () => {
    const recs = suggestRates(days([0.6, 0.65, 0.58]))
    expect(recs[0].type).toBe('rate_hold')
    expect(recs[0].urgency).toBe('low')
    expect(recs[0].suggestedRateThb).toBeUndefined()
  })

  it('returns empty array with fewer than 3 days', () => {
    expect(suggestRates(days([0.9, 0.9]))).toHaveLength(0)
    expect(suggestRates([])).toHaveLength(0)
  })

  it('produces a recommendation date that is the day after the latest input', () => {
    // Anchor 2026-05-29 → next day = 2026-05-30 even though host TZ
    // varies. addDays uses UTC-anchored math to dodge double-shifts.
    const recs = suggestRates(days([0.9, 0.9, 0.9]))
    expect(recs[0].date).toBe('2026-05-30')
  })
})

describe('detectLowOccupancy', () => {
  it('triggers high-urgency alert below 30%', () => {
    const recs = detectLowOccupancy(days([0.2, 0.25, 0.22]))
    expect(recs).toHaveLength(1)
    expect(recs[0].type).toBe('low_occupancy_alert')
    expect(recs[0].urgency).toBe('high')
  })

  it('returns nothing when avg ≥ 30%', () => {
    expect(detectLowOccupancy(days([0.35, 0.40, 0.38]))).toHaveLength(0)
  })

  it('returns nothing with fewer than 3 days', () => {
    expect(detectLowOccupancy(days([0.1, 0.1]))).toHaveLength(0)
  })
})

describe('detectWeekendOpportunity', () => {
  it('triggers when weekend avg is > 20% above weekday avg', () => {
    // 7 days ending Fri 2026-05-29:
    //   Sat 23 (high), Sun 24 (low), Mon 25 (low), Tue 26 (low),
    //   Wed 27 (low), Thu 28 (low), Fri 29 (high)
    // Wait — by the engine: weekend = Fri + Sat, weekday = Sun..Thu.
    const recs = detectWeekendOpportunity(days([0.95, 0.30, 0.30, 0.30, 0.30, 0.30, 0.95]))
    expect(recs).toHaveLength(1)
    expect(recs[0].type).toBe('weekend_opportunity')
    expect(recs[0].urgency).toBe('medium')
    expect(recs[0].requiresMinDays).toBe(7)
  })

  it('returns nothing when weekend is not meaningfully higher', () => {
    expect(detectWeekendOpportunity(days([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]))).toHaveLength(0)
  })

  it('returns nothing with fewer than 7 days', () => {
    expect(detectWeekendOpportunity(days([0.9, 0.5, 0.5, 0.5, 0.5, 0.5]))).toHaveLength(0)
  })
})

describe('forecastTomorrow', () => {
  it('returns a forecast with valid bounds', () => {
    const result = forecastTomorrow(days([0.3, 0.4, 0.35, 0.5, 0.45, 0.38, 0.42]))
    expect(result).not.toBeNull()
    expect(result!.expectedOccupancy).toBeGreaterThan(0)
    expect(result!.expectedOccupancy).toBeLessThanOrEqual(1)
    expect(Number.isInteger(result!.suggestedRateThb)).toBe(true)
  })

  it('returns null with fewer than 3 days', () => {
    expect(forecastTomorrow(days([0.4, 0.5]))).toBeNull()
  })

  it('suggests a rate lift when expected occupancy > 75%', () => {
    const result = forecastTomorrow(days([0.9, 0.9, 0.9, 0.9, 0.9]))
    expect(result!.suggestedRateThb).toBeGreaterThan(876)
  })

  it('suggests a rate drop when expected occupancy < 35%', () => {
    const result = forecastTomorrow(days([0.2, 0.2, 0.2, 0.2, 0.2]))
    expect(result!.suggestedRateThb).toBeLessThan(876)
  })
})

describe('generateDailyRecommendations', () => {
  it('never returns more than 5 recommendations', () => {
    const recs = generateDailyRecommendations(days([0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2]))
    expect(recs.length).toBeLessThanOrEqual(5)
  })

  it('orders high-urgency recs before low-urgency', () => {
    const recs = generateDailyRecommendations(days([0.2, 0.2, 0.2]))
    expect(recs[0].urgency).toBe('high')
  })

  it('all rate fields are integers (no fractional baht)', () => {
    const recs = generateDailyRecommendations(days([0.9, 0.9, 0.9]))
    for (const rec of recs) {
      if (rec.suggestedRateThb !== undefined) expect(Number.isInteger(rec.suggestedRateThb)).toBe(true)
      if (rec.currentRateThb !== undefined) expect(Number.isInteger(rec.currentRateThb)).toBe(true)
    }
  })

  it('returns empty array when input is empty', () => {
    expect(generateDailyRecommendations([])).toHaveLength(0)
  })

  it('degrades to just the 3-day signals when only 3 days are available', () => {
    // Crystal Resort's current state — make sure something useful
    // surfaces even before there's a full week of data.
    const recs = generateDailyRecommendations(days([0.3, 0.35, 0.4]))
    expect(recs.length).toBeGreaterThan(0)
    expect(recs.every((r) => r.requiresMinDays <= 3)).toBe(true)
  })
})

describe('toRecommendationInputs', () => {
  it('computes occupancy and ADR per row in THB', () => {
    const input = [
      { metric_date: '2026-05-27', rooms_available: 84, rooms_sold: 15, revenue: 14020 },
      { metric_date: '2026-05-28', rooms_available: 84, rooms_sold: 29, revenue: 25430 },
    ]
    const out = toRecommendationInputs(input)
    expect(out).toHaveLength(2)
    expect(out[0].date).toBe('2026-05-27')
    expect(out[0].occupancyRate).toBeCloseTo(15 / 84, 5)
    expect(out[0].adrThb).toBeCloseTo(14020 / 15, 5)
  })

  it('skips rows where occupancy can\'t be computed (no rooms_sold)', () => {
    const input = [
      { metric_date: '2026-05-27', rooms_available: 84, rooms_sold: 0, revenue: 0 },
      { metric_date: '2026-05-28', rooms_available: 84, rooms_sold: 29, revenue: 25430 },
    ]
    const out = toRecommendationInputs(input)
    expect(out).toHaveLength(1)
    expect(out[0].date).toBe('2026-05-28')
  })

  it('handles null fields without crashing', () => {
    const input = [
      { metric_date: '2026-05-27', rooms_available: null, rooms_sold: null, revenue: null },
      { metric_date: '2026-05-28', rooms_available: 84, rooms_sold: 29, revenue: 25430 },
    ]
    const out = toRecommendationInputs(input)
    expect(out).toHaveLength(1)
  })

  it('returns rows sorted oldest → newest regardless of input order', () => {
    const input = [
      { metric_date: '2026-05-29', rooms_available: 84, rooms_sold: 35, revenue: 30410 },
      { metric_date: '2026-05-27', rooms_available: 84, rooms_sold: 15, revenue: 14020 },
      { metric_date: '2026-05-28', rooms_available: 84, rooms_sold: 29, revenue: 25430 },
    ]
    const out = toRecommendationInputs(input)
    expect(out.map((r) => r.date)).toEqual(['2026-05-27', '2026-05-28', '2026-05-29'])
  })
})

// ── Competitor signals ────────────────────────────────────────────────────

// Build a 3-day sequence with our ADR + per-day competitor rate list.
// All in THB.
function compDays(
  ourAdrPerDay: number[],
  compRatesPerDay: number[][],
  occPerDay: number[] = ourAdrPerDay.map(() => 0.5),
): RecommendationInput[] {
  if (ourAdrPerDay.length !== compRatesPerDay.length) {
    throw new Error('compDays: ourAdr / compRates length mismatch')
  }
  return ourAdrPerDay.map((adr, i) => {
    const d = new Date(`${ANCHOR}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - (ourAdrPerDay.length - 1 - i))
    return {
      date: d.toISOString().slice(0, 10),
      occupancyRate: occPerDay[i] ?? 0.5,
      adrThb: adr,
      competitorRates: compRatesPerDay[i].map((rate, j) => ({
        name: `Competitor ${j + 1}`,
        rateThb: rate,
      })),
    }
  })
}

describe('detectCompetitorUndercutting', () => {
  it('fires when competitors are >15% higher for 3 days', () => {
    // Our avg ~฿810, competitor avg ~฿955 → ~18% gap
    const recs = detectCompetitorUndercutting(
      compDays(
        [800, 820, 810],
        [[950, 970], [960, 980], [940, 960]],
      ),
    )
    expect(recs).toHaveLength(1)
    expect(recs[0].type).toBe('competitor_undercut')
    expect(recs[0].suggestedRateThb!).toBeGreaterThan(810)
    expect(recs[0].suggestedRateThb!).toBeLessThan(960)
  })

  it('does not fire when gap is under 15%', () => {
    // ~10% gap — below threshold
    const recs = detectCompetitorUndercutting(
      compDays(
        [900, 910, 920],
        [[1000], [1000], [1000]],
      ),
    )
    expect(recs).toHaveLength(0)
  })

  it('returns empty with fewer than 3 days of competitor data', () => {
    // Only 2 days carry competitor rates; the third is bare.
    const a: RecommendationInput = {
      date: '2026-05-28', occupancyRate: 0.5, adrThb: 800,
      competitorRates: [{ name: 'C', rateThb: 980 }],
    }
    const b: RecommendationInput = {
      date: '2026-05-29', occupancyRate: 0.5, adrThb: 810,
      competitorRates: [{ name: 'C', rateThb: 970 }],
    }
    const c: RecommendationInput = {
      date: '2026-05-27', occupancyRate: 0.5, adrThb: 800,
      // no competitorRates
    }
    expect(detectCompetitorUndercutting([c, a, b])).toHaveLength(0)
  })

  it('returns empty when no input carries competitor data at all', () => {
    expect(detectCompetitorUndercutting(days([0.5, 0.5, 0.5]))).toHaveLength(0)
  })

  it('suggested rate closes ~60% of the gap', () => {
    // Our 800, competitors 1000 → gap 200 → suggested = 800 + 60% × 200 = 920
    const recs = detectCompetitorUndercutting(
      compDays(
        [800, 800, 800],
        [[1000], [1000], [1000]],
      ),
    )
    expect(recs[0].suggestedRateThb).toBe(920)
  })

  it('urgency is high when gap exceeds 25%', () => {
    // 700 vs 950 → ~36%
    const recs = detectCompetitorUndercutting(
      compDays(
        [700, 700, 700],
        [[950], [950], [950]],
      ),
    )
    expect(recs[0].urgency).toBe('high')
  })

  it('urgency is medium for 15-25% gap', () => {
    // 800 vs 960 → 20%
    const recs = detectCompetitorUndercutting(
      compDays(
        [800, 800, 800],
        [[960], [960], [960]],
      ),
    )
    expect(recs[0].urgency).toBe('medium')
  })

  it('names the highest-rate competitor in the message', () => {
    const input: RecommendationInput[] = ['2026-05-27', '2026-05-28', '2026-05-29'].map(
      (d) => ({
        date: d,
        occupancyRate: 0.5,
        adrThb: 800,
        competitorRates: [
          { name: 'Cheap Co', rateThb: 950 },
          { name: 'Premium Co', rateThb: 1020 },
        ],
      }),
    )
    const recs = detectCompetitorUndercutting(input)
    expect(recs[0].messageTh).toContain('Premium Co')
    expect(recs[0].messageEn).toContain('Premium Co')
  })

  it('all rate fields are integer THB', () => {
    const recs = detectCompetitorUndercutting(
      compDays(
        [790, 800, 810],
        [[970], [980], [990]],
      ),
    )
    for (const rec of recs) {
      if (rec.suggestedRateThb !== undefined) expect(Number.isInteger(rec.suggestedRateThb)).toBe(true)
      if (rec.currentRateThb !== undefined) expect(Number.isInteger(rec.currentRateThb)).toBe(true)
    }
  })
})

describe('detectOverpricing', () => {
  it('fires when we are >20% above competitors AND occupancy is soft', () => {
    // Our 1200 vs comp 950 → ~26% above. Occupancy 40% (≤60%).
    const recs = detectOverpricing(
      compDays(
        [1200, 1200, 1200],
        [[950], [950], [950]],
        [0.4, 0.4, 0.4],
      ),
    )
    expect(recs).toHaveLength(1)
    expect(recs[0].type).toBe('rate_decrease')
    expect(recs[0].suggestedRateThb).toBeLessThan(1200)
  })

  it('does NOT fire when our premium is working (occupancy > 60%)', () => {
    const recs = detectOverpricing(
      compDays(
        [1200, 1200, 1200],
        [[950], [950], [950]],
        [0.8, 0.85, 0.82],
      ),
    )
    expect(recs).toHaveLength(0)
  })

  it('does NOT fire when our premium is under 20%', () => {
    // 1100 vs 1000 → 10%
    const recs = detectOverpricing(
      compDays(
        [1100, 1100, 1100],
        [[1000], [1000], [1000]],
        [0.3, 0.3, 0.3],
      ),
    )
    expect(recs).toHaveLength(0)
  })

  it('returns empty without 3 days of competitor data', () => {
    expect(detectOverpricing(days([0.3, 0.3, 0.3], 1200))).toHaveLength(0)
  })
})

describe('generateDailyRecommendations — with competitor signals', () => {
  it('includes the competitor_undercut rec when competitor data triggers it', () => {
    const inputs = compDays(
      [800, 800, 800],
      [[1000], [1000], [1000]],
      [0.5, 0.5, 0.5],
    )
    const recs = generateDailyRecommendations(inputs)
    expect(recs.some((r) => r.type === 'competitor_undercut')).toBe(true)
  })

  it('still degrades gracefully when no competitor data is present', () => {
    // 3 days, no competitor input — should still produce a rate_hold
    // from suggestRates but never a competitor_* rec.
    const recs = generateDailyRecommendations(days([0.55, 0.6, 0.58]))
    expect(recs.some((r) => r.type === 'competitor_undercut')).toBe(false)
  })
})

describe('attachCompetitorRates', () => {
  it('decorates matching dates and leaves the rest untouched', () => {
    const inputs: RecommendationInput[] = [
      { date: '2026-05-27', occupancyRate: 0.4, adrThb: 800 },
      { date: '2026-05-28', occupancyRate: 0.5, adrThb: 810 },
      { date: '2026-05-29', occupancyRate: 0.6, adrThb: 820 },
    ]
    const out = attachCompetitorRates(inputs, [
      { captured_at: '2026-05-27', competitor_name: 'A', rate: 950 },
      { captured_at: '2026-05-28', competitor_name: 'A', rate: 960 },
      // 05-29 intentionally missing
    ])
    expect(out[0].competitorRates).toEqual([{ name: 'A', rateThb: 950 }])
    expect(out[1].competitorRates).toEqual([{ name: 'A', rateThb: 960 }])
    expect(out[2].competitorRates).toBeUndefined()
  })

  it('drops zero / NaN / null rates without crashing', () => {
    const inputs: RecommendationInput[] = [
      { date: '2026-05-27', occupancyRate: 0.4, adrThb: 800 },
    ]
    const out = attachCompetitorRates(inputs, [
      { captured_at: '2026-05-27', competitor_name: 'Skip-zero', rate: 0 },
      { captured_at: '2026-05-27', competitor_name: 'Skip-null', rate: null },
      { captured_at: '2026-05-27', competitor_name: 'Skip-NaN', rate: 'abc' },
      { captured_at: '2026-05-27', competitor_name: 'Keep', rate: '975' },
    ])
    expect(out[0].competitorRates).toEqual([{ name: 'Keep', rateThb: 975 }])
  })

  it('groups multiple competitors per day under the same input', () => {
    const inputs: RecommendationInput[] = [
      { date: '2026-05-27', occupancyRate: 0.4, adrThb: 800 },
    ]
    const out = attachCompetitorRates(inputs, [
      { captured_at: '2026-05-27', competitor_name: 'A', rate: 950 },
      { captured_at: '2026-05-27', competitor_name: 'B', rate: 1020 },
      { captured_at: '2026-05-27', competitor_name: 'C', rate: 990 },
    ])
    expect(out[0].competitorRates).toHaveLength(3)
  })
})
