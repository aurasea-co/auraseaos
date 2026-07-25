import { describe, it, expect } from 'vitest'
import {
  summarizePerRoomRates,
  classifyDailyAction,
  renderAction,
  toRecommendationInputs,
  attachCompetitorRates,
  recommendPerRoomTypeRates,
  type PerRoomTypeRate,
  type RecommendationInput,
  type DailyActionContext,
  type DailyActionScenario,
  type DailyActionFacts,
} from './engine'
import {
  CRYSTAL_RESORT_ACCOM_ROWS,
  CRYSTAL_RESORT_COMPETITOR_ROWS,
} from './__fixtures__/crystal-resort-2026-07'

function makeRate(partial: Partial<PerRoomTypeRate> = {}): PerRoomTypeRate {
  return {
    roomType: 'Deluxe',
    currentRateThb: 1000,
    suggestedRateThb: 1000,
    currentRateSatang: 100000,
    suggestedRateSatang: 100000,
    direction: 'hold',
    reasonTh: '',
    reasonEn: '',
    impactThb: 0,
    ...partial,
  }
}

// Build a synthetic occupancy history ending on `lastDate`. Each entry
// is a per-day occupancy fraction; the last is the most recent.
function ctxFrom(
  lastDate: string,
  occs: number[],
  extra: Partial<DailyActionContext> = {},
): DailyActionContext {
  const inputs: RecommendationInput[] = occs.map((o, i) => {
    const d = new Date(`${lastDate}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - (occs.length - 1 - i))
    return { date: d.toISOString().slice(0, 10), occupancyRate: o, adrThb: 1000 }
  })
  return { inputs, ...extra }
}

describe('summarizePerRoomRates — situational action line', () => {
  it('returns null for empty input', () => {
    expect(summarizePerRoomRates([])).toBeNull()
  })

  // ── BUG 2: the line is derived from the day's signals, not a static
  // template. These assert the SHAPE (weakest types named, numbers
  // interpolated) rather than an exact static string. ──

  it('all decreases — names the weakest types and gives a demand-gen action', () => {
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Deluxe2', direction: 'decrease', suggestedRateThb: 893, impactThb: 57 }),
      makeRate({ roomType: 'Deluxe5', direction: 'decrease', suggestedRateThb: 743, impactThb: 47 }),
      makeRate({ roomType: 'Suite', direction: 'decrease', suggestedRateThb: 1128, impactThb: 72 }),
    ]
    const out = summarizePerRoomRates(rates)
    expect(out).not.toBeNull()
    // The two biggest movers (Suite 72, Deluxe2 57) are named.
    expect(out!.messageEn).toContain('Suite')
    expect(out!.messageEn).toContain('Deluxe2')
    expect(out!.messageEn).toContain('OTA')
    expect(out!.messageTh).toContain('Suite')
  })

  it('Crystal Resort 4-decrease case still carries a substantive action line', () => {
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Deluxe2', direction: 'decrease', currentRateThb: 950, suggestedRateThb: 893, impactThb: 57 }),
      makeRate({ roomType: 'Deluxe5', direction: 'decrease', currentRateThb: 790, suggestedRateThb: 743, impactThb: 47 }),
      makeRate({ roomType: 'Deluxe6', direction: 'decrease', currentRateThb: 850, suggestedRateThb: 799, impactThb: 51 }),
      makeRate({ roomType: 'Suite', direction: 'decrease', currentRateThb: 1200, suggestedRateThb: 1128, impactThb: 72 }),
    ]
    const out = summarizePerRoomRates(rates)
    expect(out).not.toBeNull()
    expect(out!.messageTh.length).toBeGreaterThan(20)
    expect(out!.messageEn.length).toBeGreaterThan(20)
    // 4 decreases, 2 named → "+2 more" surfaced.
    expect(out!.messageEn).toContain('+2 more')
  })

  it('all increases — names the strongest types and warns about discounts', () => {
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Suite', direction: 'increase', impactThb: 120 }),
      makeRate({ roomType: 'Deluxe2', direction: 'increase', impactThb: 95 }),
    ]
    const out = summarizePerRoomRates(rates)
    expect(out!.messageEn).toContain('Suite')
    expect(out!.messageEn).toMatch(/high demand|booking strongly/)
    expect(out!.messageEn).toContain('discount')
    expect(out!.messageTh).toMatch(/ดีมานด์สูง|จองดีต่อเนื่อง/)
  })

  it('all holds — focuses on channels + reviews', () => {
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Standard', direction: 'hold' }),
      makeRate({ roomType: 'Suite', direction: 'hold' }),
    ]
    const out = summarizePerRoomRates(rates)
    expect(out!.messageTh).toMatch(/ราคาทุกห้องเหมาะสม|ราคาทุกห้องพอดี/)
    expect(out!.messageEn).toMatch(/All rates appropriate|All rates are in good shape/)
    expect(out!.messageEn).toContain('channels')
  })

  it('mixed: increases dominate → names the top-impact type to raise', () => {
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Suite', direction: 'increase', impactThb: 200 }),
      makeRate({ roomType: 'Deluxe5', direction: 'increase', impactThb: 80 }),
      makeRate({ roomType: 'Deluxe6', direction: 'hold' }),
    ]
    const out = summarizePerRoomRates(rates)
    expect(out!.messageTh.startsWith('Suite ')).toBe(true)
    expect(out!.messageEn.startsWith('Suite ')).toBe(true)
    expect(out!.messageEn).toMatch(/high demand|booking strongly/)
  })

  it('mixed: decreases dominate → names the weakest types', () => {
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Deluxe2', direction: 'decrease', impactThb: 60 }),
      makeRate({ roomType: 'Deluxe5', direction: 'decrease', impactThb: 40 }),
      makeRate({ roomType: 'Suite', direction: 'hold' }),
    ]
    const out = summarizePerRoomRates(rates)
    expect(out!.messageEn).toContain('Deluxe2')
    expect(out!.messageEn).toContain('Deluxe5')
    expect(out!.messageEn).toContain('OTA')
  })

  it('mixed: equal split → tells the owner to manage by type, naming both ends', () => {
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Suite', direction: 'increase', impactThb: 100 }),
      makeRate({ roomType: 'Deluxe2', direction: 'decrease', impactThb: 50 }),
    ]
    const out = summarizePerRoomRates(rates)
    expect(out!.messageTh).toContain('บริหารราคาตามประเภทห้อง')
    expect(out!.messageEn).toContain('manage rates by room type')
    expect(out!.messageEn).toContain('Suite')
    expect(out!.messageEn).toContain('Deluxe2')
  })

  it('single hold-only row → still emits the all-holds action', () => {
    const rates: PerRoomTypeRate[] = [makeRate({ roomType: 'Standard', direction: 'hold' })]
    const out = summarizePerRoomRates(rates)
    expect(out).not.toBeNull()
    expect(out!.messageEn).toMatch(/All rates appropriate|All rates are in good shape/)
  })

  // ── BUG 2 core: two different days produce visibly different lines ──

  it('two days with different numbers produce different action strings', () => {
    // Day 1: Suite + Deluxe6 soft, occupancy steady ~40%, weekday.
    const day1Rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Suite', direction: 'decrease', impactThb: 72 }),
      makeRate({ roomType: 'Deluxe6', direction: 'decrease', impactThb: 51 }),
    ]
    // Thu 2026-06-04 → tomorrow Fri (weekend), occupancy worsening.
    const day1 = summarizePerRoomRates(
      day1Rates,
      ctxFrom('2026-06-04', [0.55, 0.5, 0.4], { targetOccupancy: 0.7 }),
    )
    // Day 2: only Deluxe2 soft, occupancy higher, midweek, improving.
    const day2Rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Deluxe2', direction: 'decrease', impactThb: 40 }),
      makeRate({ roomType: 'Suite', direction: 'hold' }),
    ]
    const day2 = summarizePerRoomRates(
      day2Rates,
      ctxFrom('2026-06-08', [0.4, 0.5, 0.6], { targetOccupancy: 0.7 }),
    )
    expect(day1!.messageEn).not.toBe(day2!.messageEn)
    expect(day1!.messageTh).not.toBe(day2!.messageTh)
    // Day 1 names the weakest types and the weekend context.
    expect(day1!.messageEn).toContain('Suite')
    // Day 2 names its (different) weakest type.
    expect(day2!.messageEn).toContain('Deluxe2')
  })

  it('interpolates occupancy and gap-to-target when context is supplied', () => {
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Suite', direction: 'decrease', impactThb: 72 }),
      makeRate({ roomType: 'Deluxe6', direction: 'decrease', impactThb: 51 }),
    ]
    const out = summarizePerRoomRates(
      rates,
      ctxFrom('2026-06-08', [0.45, 0.45, 0.45], { targetOccupancy: 0.7 }),
    )
    expect(out!.messageEn).toContain('occ 45%')
    expect(out!.messageEn).toContain('below target')
  })

  it('weekend vs weekday soft demand give different advice', () => {
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Suite', direction: 'decrease', impactThb: 72 }),
      makeRate({ roomType: 'Deluxe6', direction: 'decrease', impactThb: 51 }),
    ]
    // 2026-06-05 is a Friday → tomorrow Sat (weekend).
    const weekend = summarizePerRoomRates(rates, ctxFrom('2026-06-05', [0.5, 0.45, 0.4]))
    // 2026-06-09 is a Tuesday → tomorrow Wed (weekday).
    const weekday = summarizePerRoomRates(rates, ctxFrom('2026-06-09', [0.5, 0.45, 0.4]))
    expect(weekend!.messageEn).not.toBe(weekday!.messageEn)
    expect(weekend!.messageEn.toLowerCase()).toContain('weekend')
    expect(weekday!.messageEn.toLowerCase()).toContain('midweek')
  })

  it('references the competitor gap when competitors are priced higher', () => {
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Suite', direction: 'decrease', impactThb: 72 }),
      makeRate({ roomType: 'Deluxe6', direction: 'decrease', impactThb: 51 }),
    ]
    // 3+ days carrying competitor rates ~30% above our ADR.
    const inputs: RecommendationInput[] = ['2026-06-06', '2026-06-07', '2026-06-08'].map((date) => ({
      date,
      occupancyRate: 0.4,
      adrThb: 1000,
      competitorRates: [{ name: 'RivalResort', rateThb: 1300, channel: 'ota' }],
    }))
    const out = summarizePerRoomRates(rates, { inputs })
    expect(out!.messageEn).toContain('competitors')
    expect(out!.messageEn).toMatch(/\d+%/)
  })

  it('degrades to type-name-only copy when no context is supplied', () => {
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Suite', direction: 'decrease', impactThb: 72 }),
    ]
    const out = summarizePerRoomRates(rates)
    expect(out).not.toBeNull()
    expect(out!.messageEn).toContain('Suite')
    // No occupancy fragment when there are no inputs.
    expect(out!.messageEn).not.toContain('occ ')
  })

  it('omits the competitor gap when the shop is stale (>2 days old), even though the gap is large', () => {
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Suite', direction: 'decrease', impactThb: 72 }),
      makeRate({ roomType: 'Deluxe6', direction: 'decrease', impactThb: 51 }),
    ]
    // Competitor data only exists ~18 days before "today" (2026-06-08) —
    // the exact staleness pattern found in the real Crystal Resort data
    // (last competitor_rates entry: 2026-07-04, replayed brief: 07-22+).
    const staleCompetitorDays = ['2026-05-19', '2026-05-20', '2026-05-21'].map((date) => ({
      date,
      occupancyRate: 0.4,
      adrThb: 1000,
      competitorRates: [{ name: 'RivalResort', rateThb: 1300, channel: 'ota' }],
    }))
    const recentDaysNoShop = ['2026-06-06', '2026-06-07', '2026-06-08'].map((date) => ({
      date,
      occupancyRate: 0.4,
      adrThb: 1000,
    }))
    const out = summarizePerRoomRates(rates, { inputs: [...staleCompetitorDays, ...recentDaysNoShop] })
    expect(out!.messageEn.toLowerCase()).not.toContain('competitor')
    expect(out!.messageTh).not.toContain('คู่แข่ง')
  })
})

describe('classifyDailyAction — pace precedence invariant', () => {
  const cutScenarios: DailyActionScenario[] = [
    'SOFT_TYPES_COMPS_HIGH', 'SOFT_TYPES_NO_COMPS', 'BEHIND_COMPS_LOWER', 'BEHIND_NO_COMPS',
  ]
  const raiseScenarios: DailyActionScenario[] = [
    'AHEAD_COMPS_HIGHER', 'AHEAD_NO_COMPS', 'HOT_TYPES_COMPS_HIGH', 'HOT_TYPES_NO_COMPS',
  ]

  it('never emits a cut/soft scenario when pace is ahead, regardless of the per-room mix or competitor sign', () => {
    const decreaseHeavy = [
      makeRate({ roomType: 'A', direction: 'decrease' }),
      makeRate({ roomType: 'B', direction: 'decrease' }),
      makeRate({ roomType: 'C', direction: 'decrease' }),
    ]
    for (const competitorGapPct of [null, 30, -30]) {
      const { scenario } = classifyDailyAction({
        increases: [],
        decreases: decreaseHeavy,
        holds: [],
        pace: 'ahead',
        competitorGapPct,
        isWeekend: false,
        trend: 'steady',
        occTh: '',
        occEn: '',
      })
      expect(cutScenarios).not.toContain(scenario)
    }
  })

  it('never emits a raise scenario when pace is behind, regardless of the per-room mix or competitor sign', () => {
    const increaseHeavy = [
      makeRate({ roomType: 'A', direction: 'increase' }),
      makeRate({ roomType: 'B', direction: 'increase' }),
    ]
    for (const competitorGapPct of [null, 30, -30]) {
      const { scenario } = classifyDailyAction({
        increases: increaseHeavy,
        decreases: [],
        holds: [],
        pace: 'behind',
        competitorGapPct,
        isWeekend: false,
        trend: 'steady',
        occTh: '',
        occEn: '',
      })
      expect(raiseScenarios).not.toContain(scenario)
    }
  })

  it('MIXED_SPLIT is pace-independent — naming a raise and a cut target for DIFFERENT room types is not the blanket contradiction', () => {
    const increases = [makeRate({ roomType: 'Suite', direction: 'increase', impactThb: 100 })]
    const decreases = [makeRate({ roomType: 'Deluxe2', direction: 'decrease', impactThb: 50 })]
    for (const pace of ['ahead', 'behind', 'on'] as const) {
      const { scenario } = classifyDailyAction({
        increases,
        decreases,
        holds: [],
        pace,
        competitorGapPct: null,
        isWeekend: false,
        trend: 'steady',
        occTh: '',
        occEn: '',
      })
      expect(scenario).toBe('MIXED_SPLIT')
    }
  })
})

describe('renderAction — deterministic date-seeded phrasing', () => {
  const facts: DailyActionFacts = {
    mixedRaiseType: null,
    mixedCutType: null,
    raiseNameTh: '',
    raiseNameEn: '',
    raiseMoreTh: '',
    raiseMoreEn: '',
    cutNameTh: 'Suite',
    cutNameEn: 'Suite',
    cutMoreTh: '',
    cutMoreEn: '',
    occTh: '',
    occEn: '',
    competitorGapPct: null,
    isWeekend: false,
    trend: 'steady',
  }

  it('the same scenario + facts + dateSeed always renders identical text (reproducible)', () => {
    const a = renderAction('SOFT_TYPES_NO_COMPS', facts, '2026-07-10')
    const b = renderAction('SOFT_TYPES_NO_COMPS', facts, '2026-07-10')
    expect(a).toEqual(b)
  })

  it('different dates can render different phrasing for the same scenario (no static template)', () => {
    const seen = new Set<string>()
    for (const d of ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05', '2026-07-06']) {
      seen.add(renderAction('SOFT_TYPES_NO_COMPS', facts, d).messageEn)
    }
    expect(seen.size).toBeGreaterThan(1)
  })
})

// Builds a DailyActionContext with `weeksOfHistory` same-weekday samples
// (7 days apart) at `weekdayHistoryOccs`, ending on `todayDate` at
// `todayOcc` — enough for computeWeekdayBaseline to use the true
// 'weekday' source (≥3 samples), so `pace` is driven by a real norm
// rather than defaulting to 'on'. Optionally attaches competitor data on
// the N days immediately before `todayDate` (freshDaysAgo) so the
// freshness gate sees it as current.
function weekdayPaceCtx(
  todayDate: string,
  weekdayHistoryOccs: number[],
  todayOcc: number,
  opts: { competitorRateThb?: number; freshDaysAgo?: number[]; ourAdrThb?: number } = {},
): DailyActionContext {
  const { competitorRateThb, freshDaysAgo, ourAdrThb = 1000 } = opts
  const dateAt = (daysAgo: number) => {
    const d = new Date(`${todayDate}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - daysAgo)
    return d.toISOString().slice(0, 10)
  }
  const inputs: RecommendationInput[] = weekdayHistoryOccs.map((o, i) => ({
    date: dateAt((weekdayHistoryOccs.length - i) * 7),
    occupancyRate: o,
    adrThb: ourAdrThb,
  }))
  if (competitorRateThb != null && freshDaysAgo) {
    for (const daysAgo of freshDaysAgo) {
      inputs.push({
        date: dateAt(daysAgo),
        occupancyRate: todayOcc,
        adrThb: ourAdrThb,
        competitorRates: [{ name: 'RivalResort', rateThb: competitorRateThb, channel: 'ota' }],
      })
    }
  }
  inputs.push({ date: todayDate, occupancyRate: todayOcc, adrThb: ourAdrThb })
  inputs.sort((a, b) => a.date.localeCompare(b.date))
  return { inputs }
}

describe('summarizePerRoomRates — one synthetic day per scenario', () => {
  it('AHEAD_COMPS_HIGHER: pacing well ahead of the weekday norm + fresh competitors higher, room types named', () => {
    const rates: PerRoomTypeRate[] = [makeRate({ roomType: 'Suite', direction: 'increase', impactThb: 100 })]
    const ctx = weekdayPaceCtx('2026-07-08', [0.3, 0.3, 0.3], 0.6, { competitorRateThb: 1300, freshDaysAgo: [1, 2, 3] })
    const out = summarizePerRoomRates(rates, ctx)
    expect(out!.messageEn).toContain('Suite')
    expect(out!.messageEn.toLowerCase()).toContain('ahead')
    // 30% is the actual competitor gap (1300 vs our 1000 ADR) — proves
    // this is the COMPS_HIGHER branch, not just any digit in occTh.
    expect(out!.messageEn).toContain('30%')
    expect(out!.messageEn.toLowerCase()).toMatch(/room to raise further|push the rate up now/)
  })

  it('AHEAD_NO_COMPS (property-wide fallback): pacing ahead but NO room type individually shows increase', () => {
    // Mirrors the real Crystal Resort case: property way ahead of its
    // weekday norm, yet every room type's own trailing average still
    // reads as a decrease. Must not name an empty room-type list.
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Deluxe2', direction: 'decrease', impactThb: 20 }),
      makeRate({ roomType: 'Suite', direction: 'decrease', impactThb: 30 }),
    ]
    const ctx = weekdayPaceCtx('2026-07-08', [0.3, 0.3, 0.3], 0.6)
    const out = summarizePerRoomRates(rates, ctx)
    expect(out!.messageEn.toLowerCase()).toContain('ahead')
    expect(out!.messageEn.startsWith(' ')).toBe(false)
    expect(out!.messageEn.toLowerCase()).not.toContain('sitting soft')
  })

  it('BEHIND_COMPS_LOWER: pacing well behind the weekday norm + fresh competitors cheaper', () => {
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Deluxe2', direction: 'decrease', impactThb: 40 }),
      makeRate({ roomType: 'Suite', direction: 'decrease', impactThb: 30 }),
    ]
    const ctx = weekdayPaceCtx('2026-07-08', [0.6, 0.6, 0.6], 0.25, { competitorRateThb: 700, freshDaysAgo: [1, 2, 3] })
    const out = summarizePerRoomRates(rates, ctx)
    expect(out!.messageEn.toLowerCase()).toMatch(/behind|lagging/)
    expect(out!.messageEn.toLowerCase()).toMatch(/lower|cheaper/)
    expect(out!.messageEn).toContain('30%')
    expect(out!.messageEn).toContain('last-minute')
  })

  it('BEHIND_NO_COMPS: pacing behind, no competitor data at all', () => {
    const rates: PerRoomTypeRate[] = [makeRate({ roomType: 'Deluxe2', direction: 'decrease', impactThb: 40 })]
    const ctx = weekdayPaceCtx('2026-07-08', [0.6, 0.6, 0.6], 0.25)
    const out = summarizePerRoomRates(rates, ctx)
    expect(out!.messageEn.toLowerCase()).toMatch(/behind|lagging/)
    expect(out!.messageEn.toLowerCase()).not.toContain('competitor')
  })

  it('SOFT_TYPES_COMPS_HIGH: on-pace, decreases dominate, fresh competitors higher — hold, no deep cut', () => {
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Deluxe2', direction: 'decrease', impactThb: 40 }),
      makeRate({ roomType: 'Suite', direction: 'decrease', impactThb: 30 }),
    ]
    const ctx = weekdayPaceCtx('2026-07-08', [0.5, 0.5, 0.5], 0.48, { competitorRateThb: 1300, freshDaysAgo: [1, 2, 3] })
    const out = summarizePerRoomRates(rates, ctx)
    expect(out!.messageEn.toLowerCase()).toMatch(/not a deep cut|rather than a deep cut/)
    expect(out!.messageEn).toContain('30%')
  })

  it('HOT_TYPES_COMPS_HIGH: on-pace, increases dominate, fresh competitors higher', () => {
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Suite', direction: 'increase', impactThb: 100 }),
      makeRate({ roomType: 'Deluxe5', direction: 'increase', impactThb: 80 }),
    ]
    const ctx = weekdayPaceCtx('2026-07-08', [0.5, 0.5, 0.5], 0.52, { competitorRateThb: 1300, freshDaysAgo: [1, 2, 3] })
    const out = summarizePerRoomRates(rates, ctx)
    expect(out!.messageEn.toLowerCase()).toMatch(/high demand|strong demand/)
    expect(out!.messageEn).toContain('30%')
  })

  it('ON_PACE_BALANCED: on-pace, all holds, fresh competitors higher — test a small increase', () => {
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Deluxe2', direction: 'hold' }),
      makeRate({ roomType: 'Suite', direction: 'hold' }),
    ]
    const ctx = weekdayPaceCtx('2026-07-08', [0.5, 0.5, 0.5], 0.5, { competitorRateThb: 1300, freshDaysAgo: [1, 2, 3] })
    const out = summarizePerRoomRates(rates, ctx)
    expect(out!.messageEn.toLowerCase()).toContain('small increase')
    expect(out!.messageEn).toContain('30%')
  })
})

describe('real Crystal Resort replay — 2026-07-22/23/24 (the reported bug)', () => {
  const baseInputs = toRecommendationInputs(CRYSTAL_RESORT_ACCOM_ROWS)
  const recInputs = attachCompetitorRates(baseInputs, CRYSTAL_RESORT_COMPETITOR_ROWS)

  function replay(targetDate: string) {
    const truncated = recInputs.filter((i) => i.date <= targetDate)
    const rates = recommendPerRoomTypeRates(truncated, {})
    return summarizePerRoomRates(rates, { inputs: truncated, targetOccupancy: null })
  }

  it('never surfaces the stale (18-20 day old) competitor gap on any of the three real days', () => {
    for (const date of ['2026-07-22', '2026-07-23', '2026-07-24']) {
      const action = replay(date)
      expect(action).not.toBeNull()
      expect(action!.messageEn.toLowerCase()).not.toContain('competitor')
      expect(action!.messageTh).not.toContain('คู่แข่ง')
    }
  })

  it('never emits a soft-demand/cut framing despite per-room decreases dominating each day — property is pacing well ahead of its weekday norm', () => {
    for (const date of ['2026-07-22', '2026-07-23', '2026-07-24']) {
      const action = replay(date)
      expect(action!.messageEn.toLowerCase()).not.toContain('sitting soft')
      expect(action!.messageTh).not.toContain('ว่างมาก')
      expect(action!.messageEn.toLowerCase()).toContain('ahead')
    }
  })

  it('the three real days produce materially different lines (not the reported near-static repeat)', () => {
    const messages = ['2026-07-22', '2026-07-23', '2026-07-24'].map((d) => replay(d)!.messageEn)
    expect(new Set(messages).size).toBe(3)
  })
})
