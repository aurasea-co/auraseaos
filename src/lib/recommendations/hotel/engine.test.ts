import { describe, it, expect, vi } from 'vitest'
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
      // These tests exercise the undercut/overpricing thresholds against
      // OTA data (their own dedicated describe block below covers
      // channel-filtering itself) — channel must be explicit now that a
      // missing channel is excluded rather than defaulted to OTA.
      competitorRates: compRatesPerDay[i].map((rate, j) => ({
        name: `Competitor ${j + 1}`,
        rateThb: rate,
        channel: 'ota',
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
      competitorRates: [{ name: 'C', rateThb: 980, channel: 'ota' }],
    }
    const b: RecommendationInput = {
      date: '2026-05-29', occupancyRate: 0.5, adrThb: 810,
      competitorRates: [{ name: 'C', rateThb: 970, channel: 'ota' }],
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
          { name: 'Cheap Co', rateThb: 950, channel: 'ota' },
          { name: 'Premium Co', rateThb: 1020, channel: 'ota' },
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

  it('threads channel through when provided', () => {
    const inputs: RecommendationInput[] = [
      { date: '2026-05-27', occupancyRate: 0.4, adrThb: 800 },
    ]
    const out = attachCompetitorRates(inputs, [
      { captured_at: '2026-05-27', competitor_name: 'OTA-only', rate: 950, channel: 'ota' },
      { captured_at: '2026-05-27', competitor_name: 'Walk-in', rate: 1100, channel: 'walk_in' },
    ])
    expect(out[0].competitorRates).toEqual([
      { name: 'OTA-only', rateThb: 950, channel: 'ota' },
      { name: 'Walk-in', rateThb: 1100, channel: 'walk_in' },
    ])
  })

  it('omits channel field when source row has null/undefined channel (legacy data)', () => {
    const inputs: RecommendationInput[] = [
      { date: '2026-05-27', occupancyRate: 0.4, adrThb: 800 },
    ]
    const out = attachCompetitorRates(inputs, [
      { captured_at: '2026-05-27', competitor_name: 'Legacy', rate: 950 },
      { captured_at: '2026-05-27', competitor_name: 'Legacy null', rate: 950, channel: null },
    ])
    expect(out[0].competitorRates?.[0]).toEqual({ name: 'Legacy', rateThb: 950 })
    expect(out[0].competitorRates?.[1]).toEqual({ name: 'Legacy null', rateThb: 950 })
  })
})

describe('competitor signals — OTA-only filtering', () => {
  // Helper: 3 days at low occupancy + ourAdrThb, each day with the
  // given competitor rates. Used to set up the undercut signal threshold.
  function daysWithRates(
    rates: ReadonlyArray<{ name: string; rateThb: number; channel?: string }>,
    ourAdrThb = 800,
  ): RecommendationInput[] {
    return [
      { date: '2026-05-27', occupancyRate: 0.5, adrThb: ourAdrThb, competitorRates: rates },
      { date: '2026-05-28', occupancyRate: 0.5, adrThb: ourAdrThb, competitorRates: rates },
      { date: '2026-05-29', occupancyRate: 0.5, adrThb: ourAdrThb, competitorRates: rates },
    ]
  }

  it('fires undercut signal when 3+ days carry OTA-channel competitor rates', () => {
    const recs = detectCompetitorUndercutting(daysWithRates([
      { name: 'Pullman', rateThb: 1200, channel: 'ota' },
    ]))
    expect(recs).toHaveLength(1)
    expect(recs[0].type).toBe('competitor_undercut')
  })

  it('does NOT fire when ALL competitor rates are walk_in (3 days)', () => {
    const recs = detectCompetitorUndercutting(daysWithRates([
      { name: 'Pullman walk-in', rateThb: 1500, channel: 'walk_in' },
    ]))
    expect(recs).toHaveLength(0)
  })

  it('does NOT fire when ALL competitor rates are package or promo', () => {
    expect(detectCompetitorUndercutting(daysWithRates([
      { name: 'Suite + breakfast', rateThb: 1800, channel: 'package' },
    ]))).toHaveLength(0)
    expect(detectCompetitorUndercutting(daysWithRates([
      { name: 'Flash sale', rateThb: 700, channel: 'promo' },
    ]))).toHaveLength(0)
  })

  it('fires using ONLY the OTA rates when both OTA + walk-in are mixed', () => {
    // OTA rates are 1100 (low gap), walk-in rates are 2400 (huge gap).
    // The OTA-only filter should ignore the 2400 walk-in — gap stays
    // small enough to NOT fire (15% threshold).
    const recs = detectCompetitorUndercutting(daysWithRates([
      { name: 'Pullman OTA', rateThb: 900, channel: 'ota' },
      { name: 'Pullman walk-in', rateThb: 2400, channel: 'walk_in' },
    ], 800))
    // With walk-in filtered out, the OTA avg of 900 vs our 800 is
    // ~12.5% — below the 15% threshold. Without the filter, blending
    // 900 + 2400 / 2 = 1650 avg would be 106% gap — would fire as high.
    expect(recs).toHaveLength(0)
  })

  it('excludes rows with a missing/unrecognized channel rather than defaulting to OTA', () => {
    // competitor_rates.channel is NOT NULL with a CHECK constraint at
    // the DB layer (migration 033) — every real row the caller actually
    // selects this column for carries an explicit value. A missing
    // channel here means the caller didn't select/thread the column
    // (the per-branch-loader bug this filter guards against), not
    // "legacy pre-migration data" — so it's excluded and surfaced via a
    // warning, never silently folded into the OTA bucket.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const recs = detectCompetitorUndercutting(daysWithRates([
      { name: 'No-channel row', rateThb: 1200 }, // no channel field
    ]))
    expect(recs).toHaveLength(0)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('does not warn for legitimate non-OTA channels (walk_in/package/promo) — only for missing/unrecognized ones', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    detectCompetitorUndercutting(daysWithRates([
      { name: 'Walk-in', rateThb: 1200, channel: 'walk_in' },
    ]))
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

// ── Multi-room-type behaviour ───────────────────────────────────────────────
//
// Replicates the Crystal Resort shape: 4 room types with very different
// rates. The blended ADR for a mixed-occupancy day is meaningless to the
// owner — they need per-room signals.

interface RoomDayRow {
  roomType: string
  totalRooms: number
  occupied: number
  rateThb: number
}

function multiRoomDays(
  perDayRows: RoomDayRow[][],
  endDate = ANCHOR,
): RecommendationInput[] {
  return perDayRows.map((rows, i) => {
    const d = new Date(`${endDate}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - (perDayRows.length - 1 - i))
    const totalRooms = rows.reduce((s, r) => s + r.totalRooms, 0)
    const totalOccupied = rows.reduce((s, r) => s + r.occupied, 0)
    const totalRevenue = rows.reduce((s, r) => s + r.occupied * r.rateThb, 0)
    const adr = totalOccupied > 0 ? totalRevenue / totalOccupied : 0
    return {
      date: d.toISOString().slice(0, 10),
      occupancyRate: totalRooms > 0 ? totalOccupied / totalRooms : 0,
      adrThb: adr,
      roomTypeBreakdown: rows.map((r) => ({
        roomType: r.roomType,
        totalRooms: r.totalRooms,
        occupiedRooms: r.occupied,
        rateThb: r.rateThb,
      })),
    }
  })
}

describe('suggestRates — multi-room-type dispatch', () => {
  it('emits a per-room rate_increase for a single high-occupancy room type', () => {
    const recs = suggestRates(multiRoomDays([
      [
        { roomType: 'Suite', totalRooms: 11, occupied: 10, rateThb: 1920 },  // 91%
        { roomType: 'Deluxe5', totalRooms: 33, occupied: 18, rateThb: 790 }, // 55% — comfortable
      ],
      [
        { roomType: 'Suite', totalRooms: 11, occupied: 10, rateThb: 1920 },
        { roomType: 'Deluxe5', totalRooms: 33, occupied: 20, rateThb: 790 },
      ],
      [
        { roomType: 'Suite', totalRooms: 11, occupied: 11, rateThb: 1920 },
        { roomType: 'Deluxe5', totalRooms: 33, occupied: 17, rateThb: 790 },
      ],
    ]))

    const suiteRec = recs.find((r) => r.roomType === 'Suite')
    expect(suiteRec?.type).toBe('rate_increase')
    expect(suiteRec?.urgency).toBe('high')
    // Suite rate is the input rate, not a blended figure.
    expect(suiteRec?.currentRateThb).toBe(1920)
    expect(suiteRec?.suggestedRateThb).toBeGreaterThan(1920)

    // Deluxe5 stays silent — middle of the hold band.
    expect(recs.find((r) => r.roomType === 'Deluxe5')).toBeUndefined()
  })

  it('emits per-room signals for high AND low rooms in the same window', () => {
    const recs = suggestRates(multiRoomDays([
      [
        { roomType: 'Suite', totalRooms: 11, occupied: 10, rateThb: 1920 },   // 91% → up
        { roomType: 'Deluxe2', totalRooms: 19, occupied: 5, rateThb: 950 },   // 26% → down
      ],
      [
        { roomType: 'Suite', totalRooms: 11, occupied: 10, rateThb: 1920 },
        { roomType: 'Deluxe2', totalRooms: 19, occupied: 4, rateThb: 950 },
      ],
      [
        { roomType: 'Suite', totalRooms: 11, occupied: 11, rateThb: 1920 },
        { roomType: 'Deluxe2', totalRooms: 19, occupied: 6, rateThb: 950 },
      ],
    ]))

    const suite = recs.find((r) => r.roomType === 'Suite')
    const deluxe = recs.find((r) => r.roomType === 'Deluxe2')

    expect(suite?.type).toBe('rate_increase')
    expect(suite?.suggestedRateThb).toBeGreaterThan(suite?.currentRateThb ?? 0)

    expect(deluxe?.type).toBe('rate_decrease')
    expect(deluxe?.suggestedRateThb).toBeLessThan(deluxe?.currentRateThb ?? Infinity)
  })

  it('per-room recs use each room type\'s own current rate (not blended ADR)', () => {
    const recs = suggestRates(multiRoomDays([
      [
        { roomType: 'Suite', totalRooms: 10, occupied: 9, rateThb: 1920 },
        { roomType: 'Deluxe', totalRooms: 30, occupied: 28, rateThb: 790 },
      ],
      [
        { roomType: 'Suite', totalRooms: 10, occupied: 10, rateThb: 1920 },
        { roomType: 'Deluxe', totalRooms: 30, occupied: 27, rateThb: 790 },
      ],
      [
        { roomType: 'Suite', totalRooms: 10, occupied: 9, rateThb: 1920 },
        { roomType: 'Deluxe', totalRooms: 30, occupied: 28, rateThb: 790 },
      ],
    ]))
    // Both above 85% — both should suggest increase using their OWN rates.
    const suite = recs.find((r) => r.roomType === 'Suite')
    const deluxe = recs.find((r) => r.roomType === 'Deluxe')
    expect(suite?.currentRateThb).toBe(1920)
    expect(deluxe?.currentRateThb).toBe(790)
    // Critical: the blended ADR for this window is ~৻900, but neither
    // suggested rate should be near 900 — that's the bug we're fixing.
    expect(suite?.suggestedRateThb).toBeGreaterThan(1900)
    expect(deluxe?.suggestedRateThb).toBeGreaterThan(800)
  })

  it('falls back to blended hold when no per-room signal fires', () => {
    // Every room type comfortably in the 35-85 band → blended path
    // returns rate_hold so the property still has SOME signal.
    const recs = suggestRates(multiRoomDays([
      [
        { roomType: 'Suite', totalRooms: 11, occupied: 6, rateThb: 1920 },   // 55%
        { roomType: 'Deluxe', totalRooms: 33, occupied: 18, rateThb: 790 }, // 55%
      ],
      [
        { roomType: 'Suite', totalRooms: 11, occupied: 7, rateThb: 1920 },
        { roomType: 'Deluxe', totalRooms: 33, occupied: 19, rateThb: 790 },
      ],
      [
        { roomType: 'Suite', totalRooms: 11, occupied: 7, rateThb: 1920 },
        { roomType: 'Deluxe', totalRooms: 33, occupied: 20, rateThb: 790 },
      ],
    ]))
    expect(recs).toHaveLength(1)
    expect(recs[0].type).toBe('rate_hold')
    // The blended hold rec has NO roomType — it's a property-level signal.
    expect(recs[0].roomType).toBeUndefined()
  })

  it('rate signals stay integers and never go negative', () => {
    const recs = suggestRates(multiRoomDays([
      [{ roomType: 'Suite', totalRooms: 11, occupied: 2, rateThb: 1920 }],
      [{ roomType: 'Suite', totalRooms: 11, occupied: 2, rateThb: 1920 }],
      [{ roomType: 'Suite', totalRooms: 11, occupied: 2, rateThb: 1920 }],
    ]))
    for (const r of recs) {
      if (r.suggestedRateThb !== undefined) {
        expect(Number.isInteger(r.suggestedRateThb)).toBe(true)
        expect(r.suggestedRateThb).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('single-room-type breakdown falls through to blended', () => {
    // One room type in the breakdown — engine should treat as blended.
    const recs = suggestRates(multiRoomDays([
      [{ roomType: 'Suite', totalRooms: 11, occupied: 10, rateThb: 1920 }],
      [{ roomType: 'Suite', totalRooms: 11, occupied: 10, rateThb: 1920 }],
      [{ roomType: 'Suite', totalRooms: 11, occupied: 11, rateThb: 1920 }],
    ]))
    expect(recs).toHaveLength(1)
    // Blended path emits one property-level rec with no roomType.
    expect(recs[0].roomType).toBeUndefined()
  })

  it('handles room types that vanish on some days within the window', () => {
    // Deluxe2 appears on days 1+3 but not day 2 (e.g. all rooms blocked
    // for maintenance) — engine should still compute its 2-day average.
    const recs = suggestRates(multiRoomDays([
      [
        { roomType: 'Suite', totalRooms: 11, occupied: 6, rateThb: 1920 },
        { roomType: 'Deluxe2', totalRooms: 19, occupied: 5, rateThb: 950 }, // 26%
      ],
      [
        { roomType: 'Suite', totalRooms: 11, occupied: 6, rateThb: 1920 },
        // Deluxe2 missing today
      ],
      [
        { roomType: 'Suite', totalRooms: 11, occupied: 7, rateThb: 1920 },
        { roomType: 'Deluxe2', totalRooms: 19, occupied: 4, rateThb: 950 }, // 21%
      ],
    ]))
    // Deluxe2 has 2 days of data (above the ≥2-day threshold), 23% avg
    // → should still fire rate_decrease.
    const deluxe = recs.find((r) => r.roomType === 'Deluxe2')
    expect(deluxe?.type).toBe('rate_decrease')
  })
})

describe('generateDailyRecommendations dedup — preserves per-room recs', () => {
  it('returns BOTH Suite and Deluxe rate_increase when both fire', () => {
    const recs = generateDailyRecommendations(multiRoomDays([
      [
        { roomType: 'Suite', totalRooms: 11, occupied: 10, rateThb: 1920 },
        { roomType: 'Deluxe', totalRooms: 30, occupied: 28, rateThb: 790 },
      ],
      [
        { roomType: 'Suite', totalRooms: 11, occupied: 11, rateThb: 1920 },
        { roomType: 'Deluxe', totalRooms: 30, occupied: 27, rateThb: 790 },
      ],
      [
        { roomType: 'Suite', totalRooms: 11, occupied: 10, rateThb: 1920 },
        { roomType: 'Deluxe', totalRooms: 30, occupied: 28, rateThb: 790 },
      ],
    ]))
    const increases = recs.filter((r) => r.type === 'rate_increase')
    const rooms = increases.map((r) => r.roomType).sort()
    expect(rooms).toEqual(['Deluxe', 'Suite'])
  })
})

describe('toRecommendationInputs — passes room_type_breakdown through', () => {
  it('threads breakdown rows into RecommendationInput unchanged', () => {
    const out = toRecommendationInputs([{
      metric_date: '2026-05-29',
      rooms_available: 84,
      rooms_sold: 50,
      revenue: 50000,
      room_type_breakdown: [
        { roomType: 'Suite', totalRooms: 11, occupiedRooms: 10, rateThb: 1920 },
        { roomType: 'Deluxe', totalRooms: 33, occupiedRooms: 25, rateThb: 790 },
      ],
    }])
    expect(out[0].roomTypeBreakdown).toHaveLength(2)
    expect(out[0].roomTypeBreakdown?.[0].roomType).toBe('Suite')
  })

  it('omits roomTypeBreakdown when the column is null', () => {
    const out = toRecommendationInputs([{
      metric_date: '2026-05-29',
      rooms_available: 84,
      rooms_sold: 50,
      revenue: 50000,
      room_type_breakdown: null,
    }])
    expect(out[0].roomTypeBreakdown).toBeUndefined()
  })

  it('omits roomTypeBreakdown when the column is an empty array', () => {
    const out = toRecommendationInputs([{
      metric_date: '2026-05-29',
      rooms_available: 84,
      rooms_sold: 50,
      revenue: 50000,
      room_type_breakdown: [],
    }])
    expect(out[0].roomTypeBreakdown).toBeUndefined()
  })

  it('filters out malformed breakdown entries that lack a roomType', () => {
    // Build the breakdown array as `unknown` and cast — production
    // jsonb can carry malformed objects (e.g. from legacy imports),
    // and the adapter is supposed to drop them silently. Test simulates
    // exactly that shape without resorting to `any`.
    type ValidEntry = { roomType: string; totalRooms: number; occupiedRooms: number; rateThb: number }
    const malformed: unknown = [
      { roomType: 'Suite', totalRooms: 11, occupiedRooms: 10, rateThb: 1920 },
      { roomType: undefined, totalRooms: 1, occupiedRooms: 1, rateThb: 0 },
    ]
    const out = toRecommendationInputs([{
      metric_date: '2026-05-29',
      rooms_available: 84,
      rooms_sold: 50,
      revenue: 50000,
      room_type_breakdown: malformed as ReadonlyArray<ValidEntry>,
    }])
    expect(out[0].roomTypeBreakdown).toHaveLength(1)
    expect(out[0].roomTypeBreakdown?.[0].roomType).toBe('Suite')
  })
})
