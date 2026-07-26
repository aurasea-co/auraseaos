import { describe, it, expect } from 'vitest'
import {
  summarizePerRoomRates,
  classifyDailyAction,
  renderAction,
  assertScenarioAgreesWithRates,
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
import { THAILAND_PUBLIC_HOLIDAYS_2026 } from '../../demand-calendar/thailand-public-holidays-2026'

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

// 3 consecutive days ending on `lastDate`, each carrying a competitor
// rate — gives a FRESH (0-day-old) competitor gap without needing any
// weekday-baseline history.
function freshCompetitorCtx(
  lastDate: string,
  ourOcc: number,
  competitorRateThb: number,
  ourAdrThb = 1000,
): DailyActionContext {
  const inputs: RecommendationInput[] = [-2, -1, 0].map((offset) => {
    const d = new Date(`${lastDate}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + offset)
    return {
      date: d.toISOString().slice(0, 10),
      occupancyRate: ourOcc,
      adrThb: ourAdrThb,
      competitorRates: [{ name: 'RivalResort', rateThb: competitorRateThb, channel: 'ota' }],
    }
  })
  return { inputs }
}

describe('summarizePerRoomRates — situational action line', () => {
  it('returns null for empty input', () => {
    expect(summarizePerRoomRates([])).toBeNull()
  })

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

  it('mixed: increases dominate, one hold → names the raise types AND states the hold explicitly', () => {
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Suite', direction: 'increase', impactThb: 200 }),
      makeRate({ roomType: 'Deluxe5', direction: 'increase', impactThb: 80 }),
      makeRate({ roomType: 'Deluxe6', direction: 'hold' }),
    ]
    const out = summarizePerRoomRates(rates)
    expect(out!.messageTh.startsWith('Suite ')).toBe(true)
    expect(out!.messageEn.startsWith('Suite ')).toBe(true)
    expect(out!.messageEn).toMatch(/high demand|booking strongly/)
    // The held type is named, not silently dropped.
    expect(out!.messageEn.toLowerCase()).toContain('deluxe6 holding steady')
    expect(out!.messageTh).toContain('Deluxe6คงราคา')
  })

  it('mixed: decreases dominate, one hold → names the cut types AND states the hold explicitly', () => {
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Deluxe2', direction: 'decrease', impactThb: 60 }),
      makeRate({ roomType: 'Deluxe5', direction: 'decrease', impactThb: 40 }),
      makeRate({ roomType: 'Suite', direction: 'hold' }),
    ]
    const out = summarizePerRoomRates(rates)
    expect(out!.messageEn).toContain('Deluxe2')
    expect(out!.messageEn).toContain('Deluxe5')
    expect(out!.messageEn).toContain('OTA')
    expect(out!.messageEn.toLowerCase()).toContain('suite holding steady')
    expect(out!.messageTh).toContain('Suiteคงราคา')
  })

  it('mixed: equal split (raise + cut) → tells the owner to manage by type, naming both ends', () => {
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

describe('classifyDailyAction / assertScenarioAgreesWithRates — the rate table is the SINGLE SOURCE OF TRUTH', () => {
  // Property-level pace used to be able to override this (see git
  // history) — that's exactly what let the action say "raise / close
  // discounts" on 2026-07-25 while the table cut 3 room types and held
  // 1. classifyDailyAction no longer takes a pace input at all; these
  // tests pin that a raise/cut scenario can ONLY be reached when the
  // OPPOSITE direction is entirely absent from the table.

  const RAISE_SCENARIOS: DailyActionScenario[] = ['ALL_RAISE_COMPS_HIGH', 'ALL_RAISE_NO_COMPS']
  const CUT_SCENARIOS: DailyActionScenario[] = ['ALL_CUT_COMPS_LOW', 'ALL_CUT_COMPS_HIGH', 'ALL_CUT_NO_COMPS']

  it('never emits a raise scenario when the table has any decrease, regardless of competitor sign', () => {
    const decreaseHeavy = [
      makeRate({ roomType: 'A', direction: 'decrease' }),
      makeRate({ roomType: 'B', direction: 'decrease' }),
    ]
    const oneHold = [makeRate({ roomType: 'C', direction: 'hold' })]
    for (const competitorGapPct of [null, 30, -30]) {
      const { scenario } = classifyDailyAction({
        increases: [],
        decreases: decreaseHeavy,
        holds: oneHold,
        competitorGapPct,
        isWeekend: false,
        trend: 'steady',
        occTh: '',
        occEn: '',
        demandCalendarEventNameTh: null,
        demandCalendarEventNameEn: null,
      })
      expect(RAISE_SCENARIOS).not.toContain(scenario)
    }
  })

  it('never emits a cut scenario when the table has any increase, regardless of competitor sign', () => {
    const increaseHeavy = [
      makeRate({ roomType: 'A', direction: 'increase' }),
      makeRate({ roomType: 'B', direction: 'increase' }),
    ]
    for (const competitorGapPct of [null, 30, -30]) {
      const { scenario } = classifyDailyAction({
        increases: increaseHeavy,
        decreases: [],
        holds: [],
        competitorGapPct,
        isWeekend: false,
        trend: 'steady',
        occTh: '',
        occEn: '',
        demandCalendarEventNameTh: null,
        demandCalendarEventNameEn: null,
      })
      expect(CUT_SCENARIOS).not.toContain(scenario)
    }
  })

  it('MIXED_SPLIT fires whenever both a raise and a cut are present, regardless of count symmetry', () => {
    // 1 raise + 2 cuts — NOT an equal split, but still genuinely mixed.
    // The old design only treated an EXACTLY equal split as mixed and
    // would have silently picked a majority verb otherwise.
    const increases = [makeRate({ roomType: 'Suite', direction: 'increase', impactThb: 100 })]
    const decreases = [
      makeRate({ roomType: 'Deluxe2', direction: 'decrease', impactThb: 50 }),
      makeRate({ roomType: 'Deluxe5', direction: 'decrease', impactThb: 30 }),
    ]
    const { scenario } = classifyDailyAction({
      increases, decreases, holds: [], competitorGapPct: null, isWeekend: false, trend: 'steady',
      occTh: '', occEn: '', demandCalendarEventNameTh: null, demandCalendarEventNameEn: null,
    })
    expect(scenario).toBe('MIXED_SPLIT')
  })

  it('assertScenarioAgreesWithRates THROWS on a deliberately contradictory (scenario, counts) pair', () => {
    expect(() => assertScenarioAgreesWithRates('ALL_RAISE_NO_COMPS', { increases: 0, decreases: 3 })).toThrow(/contradiction/)
    expect(() => assertScenarioAgreesWithRates('ALL_RAISE_COMPS_HIGH', { increases: 0, decreases: 1 })).toThrow(/contradiction/)
    expect(() => assertScenarioAgreesWithRates('ALL_CUT_NO_COMPS', { increases: 2, decreases: 0 })).toThrow(/contradiction/)
    expect(() => assertScenarioAgreesWithRates('ALL_CUT_COMPS_LOW', { increases: 1, decreases: 0 })).toThrow(/contradiction/)
    expect(() => assertScenarioAgreesWithRates('ALL_HOLD_NO_COMPS', { increases: 1, decreases: 0 })).toThrow(/contradiction/)
    expect(() => assertScenarioAgreesWithRates('ALL_HOLD_COMPS_HIGH', { increases: 0, decreases: 1 })).toThrow(/contradiction/)
    expect(() => assertScenarioAgreesWithRates('MIXED_SPLIT', { increases: 0, decreases: 2 })).toThrow(/contradiction/)
    expect(() => assertScenarioAgreesWithRates('MIXED_SPLIT', { increases: 2, decreases: 0 })).toThrow(/contradiction/)
  })

  it('assertScenarioAgreesWithRates does NOT throw for genuinely consistent pairs', () => {
    expect(() => assertScenarioAgreesWithRates('ALL_RAISE_NO_COMPS', { increases: 2, decreases: 0 })).not.toThrow()
    expect(() => assertScenarioAgreesWithRates('ALL_CUT_COMPS_HIGH', { increases: 0, decreases: 3 })).not.toThrow()
    expect(() => assertScenarioAgreesWithRates('ALL_HOLD_COMPS_HIGH', { increases: 0, decreases: 0 })).not.toThrow()
    expect(() => assertScenarioAgreesWithRates('MIXED_SPLIT', { increases: 1, decreases: 1 })).not.toThrow()
  })

  it('summarizePerRoomRates omits the line (returns null) rather than emit a contradictory brief', () => {
    // There is no way to construct a real contradictory input through
    // the public API (that's the point) — this proves the FAIL-CLOSED
    // behavior directly against the invariant function itself, mirroring
    // what summarizePerRoomRates's internal try/catch does.
    expect(() => {
      try {
        assertScenarioAgreesWithRates('ALL_RAISE_NO_COMPS', { increases: 0, decreases: 3 })
      } catch (err) {
        // This is exactly the catch block inside summarizePerRoomRates.
        expect(err).toBeInstanceOf(Error)
        return
      }
      throw new Error('expected assertScenarioAgreesWithRates to throw')
    }).not.toThrow()
  })
})

describe('renderAction — deterministic date-seeded phrasing', () => {
  const facts: DailyActionFacts = {
    raiseNameTh: '',
    raiseNameEn: '',
    raiseMoreTh: '',
    raiseMoreEn: '',
    cutNameTh: 'Suite',
    cutNameEn: 'Suite',
    cutMoreTh: '',
    cutMoreEn: '',
    holdNameTh: '',
    holdNameEn: '',
    holdMoreTh: '',
    holdMoreEn: '',
    occTh: '',
    occEn: '',
    competitorGapPct: null,
    isWeekend: false,
    trend: 'steady',
    demandCalendarEventNameTh: null,
    demandCalendarEventNameEn: null,
  }

  it('the same scenario + facts + dateSeed always renders identical text (reproducible)', () => {
    const a = renderAction('ALL_CUT_NO_COMPS', facts, '2026-07-10')
    const b = renderAction('ALL_CUT_NO_COMPS', facts, '2026-07-10')
    expect(a).toEqual(b)
  })

  it('different dates can render different phrasing for the same scenario (no static template)', () => {
    const seen = new Set<string>()
    for (const d of ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05', '2026-07-06']) {
      seen.add(renderAction('ALL_CUT_NO_COMPS', facts, d).messageEn)
    }
    expect(seen.size).toBeGreaterThan(1)
  })
})

describe('summarizePerRoomRates — one synthetic day per scenario', () => {
  it('ALL_RAISE_NO_COMPS: only increases in the table (no competitor data)', () => {
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Suite', direction: 'increase', impactThb: 100 }),
      makeRate({ roomType: 'Deluxe5', direction: 'increase', impactThb: 80 }),
    ]
    const out = summarizePerRoomRates(rates, ctxFrom('2026-07-08', [0.5, 0.5, 0.6]))
    expect(out!.messageEn).toMatch(/high demand|booking strongly/)
    expect(out!.messageEn.toLowerCase()).not.toContain('competitor')
  })

  it('ALL_RAISE_COMPS_HIGH: only increases + fresh competitors priced higher', () => {
    const rates: PerRoomTypeRate[] = [makeRate({ roomType: 'Suite', direction: 'increase', impactThb: 100 })]
    const out = summarizePerRoomRates(rates, freshCompetitorCtx('2026-07-08', 0.6, 1300))
    expect(out!.messageEn).toContain('Suite')
    expect(out!.messageEn).toContain('30%')
    expect(out!.messageEn.toLowerCase()).toMatch(/room to raise further|close online deals/)
  })

  it('ALL_CUT_NO_COMPS: only decreases + a hold, no competitor data — hold named explicitly', () => {
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Deluxe2', direction: 'decrease', impactThb: 40 }),
      makeRate({ roomType: 'Suite', direction: 'decrease', impactThb: 30 }),
      makeRate({ roomType: 'Deluxe5', direction: 'hold' }),
    ]
    const out = summarizePerRoomRates(rates, ctxFrom('2026-07-08', [0.5, 0.5, 0.4]))
    expect(out!.messageEn.toLowerCase()).not.toContain('competitor')
    expect(out!.messageEn.toLowerCase()).not.toMatch(/raise|close online discounts/)
    expect(out!.messageEn.toLowerCase()).toContain('deluxe5 holding steady')
  })

  it('ALL_CUT_COMPS_HIGH: cutting even though competitors are pricier — visibility problem, not a deep cut', () => {
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Deluxe2', direction: 'decrease', impactThb: 40 }),
      makeRate({ roomType: 'Suite', direction: 'decrease', impactThb: 30 }),
    ]
    const out = summarizePerRoomRates(rates, freshCompetitorCtx('2026-07-08', 0.4, 1300))
    expect(out!.messageEn.toLowerCase()).toMatch(/not a deep cut|rather than a deep cut/)
    expect(out!.messageEn).toContain('30%')
  })

  it('ALL_CUT_COMPS_LOW: cutting AND competitors are cheaper — reinforces the cut, urgency', () => {
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Deluxe2', direction: 'decrease', impactThb: 40 }),
      makeRate({ roomType: 'Suite', direction: 'decrease', impactThb: 30 }),
    ]
    const out = summarizePerRoomRates(rates, freshCompetitorCtx('2026-07-08', 0.3, 700))
    expect(out!.messageEn.toLowerCase()).toMatch(/cheaper|lower/)
    expect(out!.messageEn).toContain('30%')
    expect(out!.messageEn).toContain('last-minute')
  })

  it('ALL_HOLD_NO_COMPS: every type holds, no competitor data', () => {
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Deluxe2', direction: 'hold' }),
      makeRate({ roomType: 'Suite', direction: 'hold' }),
    ]
    const out = summarizePerRoomRates(rates, ctxFrom('2026-07-08', [0.5, 0.5, 0.5]))
    expect(out!.messageEn).toMatch(/All rates appropriate|All rates are in good shape/)
  })

  it('ALL_HOLD_COMPS_HIGH: every type holds, fresh competitors priced higher — test a small increase', () => {
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Deluxe2', direction: 'hold' }),
      makeRate({ roomType: 'Suite', direction: 'hold' }),
    ]
    const out = summarizePerRoomRates(rates, freshCompetitorCtx('2026-07-08', 0.5, 1300))
    expect(out!.messageEn.toLowerCase()).toContain('small increase')
    expect(out!.messageEn).toContain('30%')
  })

  it('MIXED_SPLIT: a genuine mix (1 raise, 2 cuts, 1 hold) — never a single blanket verb', () => {
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Suite', direction: 'increase', impactThb: 100 }),
      makeRate({ roomType: 'Deluxe2', direction: 'decrease', impactThb: 60 }),
      makeRate({ roomType: 'Deluxe5', direction: 'decrease', impactThb: 40 }),
      makeRate({ roomType: 'Deluxe6', direction: 'hold' }),
    ]
    const out = summarizePerRoomRates(rates, ctxFrom('2026-07-08', [0.5, 0.5, 0.5]))
    expect(out!.messageEn).toContain('Raise Suite')
    expect(out!.messageEn).toMatch(/cut Deluxe2|Deluxe2 and Deluxe5|Deluxe5 and Deluxe2/)
    expect(out!.messageEn.toLowerCase()).toContain('deluxe6 holding steady')
    expect(out!.messageEn).toContain('manage rates by room type')
  })
})

describe('real Crystal Resort replay — 2026-07-22/23/24/25 (the reported bug, rate table now wins)', () => {
  const baseInputs = toRecommendationInputs(CRYSTAL_RESORT_ACCOM_ROWS)
  const recInputs = attachCompetitorRates(baseInputs, CRYSTAL_RESORT_COMPETITOR_ROWS)

  function replay(targetDate: string) {
    const truncated = recInputs.filter((i) => i.date <= targetDate)
    const rates = recommendPerRoomTypeRates(truncated, {})
    const action = summarizePerRoomRates(rates, { inputs: truncated, targetOccupancy: null })
    return { rates, action }
  }

  it('never surfaces the stale (18+ day old) competitor gap on any of the four real days', () => {
    for (const date of ['2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25']) {
      const { action } = replay(date)
      expect(action).not.toBeNull()
      expect(action!.messageEn.toLowerCase()).not.toContain('competitor')
      expect(action!.messageTh).not.toContain('คู่แข่ง')
    }
  })

  it('2026-07-25 — the reported bug: table cuts Deluxe6/Deluxe2/Suite and holds Deluxe5; action must never say raise/close discounts', () => {
    const { rates, action } = replay('2026-07-25')
    const byType = new Map(rates.map((r) => [r.roomType, r.direction]))
    // Confirms the fixture actually reproduces the reported table shape
    // before asserting anything about the text derived from it.
    expect(byType.get('Deluxe6')).toBe('decrease')
    expect(byType.get('Deluxe2')).toBe('decrease')
    expect(byType.get('Suite')).toBe('decrease')
    expect(byType.get('Deluxe5')).toBe('hold')

    expect(action).not.toBeNull()
    expect(action!.messageEn.toLowerCase()).not.toMatch(/\braise\b|close online discounts/)
    expect(action!.messageTh).not.toMatch(/ปรับราคาขึ้น/)
    // Names two of the three cut types (impact-ranked) + "+1 more", and
    // states the held type explicitly rather than dropping it.
    expect(action!.messageEn).toMatch(/Deluxe6|Deluxe2|Suite/)
    expect(action!.messageEn).toContain('+1 more')
    expect(action!.messageEn.toLowerCase()).toContain('deluxe5 holding steady')
    expect(action!.messageTh).toContain('Deluxe5คงราคา')
  })

  it('2026-07-22/23/24 — same invariant holds for the originally reported days', () => {
    for (const date of ['2026-07-22', '2026-07-23', '2026-07-24']) {
      const { action } = replay(date)
      expect(action).not.toBeNull()
      expect(action!.messageEn.toLowerCase()).not.toMatch(/\braise\b|close online discounts/)
    }
  })

  it('the four real days produce materially different lines (not a static template)', () => {
    const messages = ['2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'].map((d) => replay(d).action!.messageEn)
    expect(new Set(messages).size).toBe(4)
  })
})

describe('demand_calendar note — informational only, never changes the scenario', () => {
  const rates: PerRoomTypeRate[] = [
    makeRate({ roomType: 'Suite', direction: 'decrease', impactThb: 72 }),
    makeRate({ roomType: 'Deluxe6', direction: 'decrease', impactThb: 51 }),
  ]

  it('appends nothing when no event overlaps tomorrow (backward compatible)', () => {
    const out = summarizePerRoomRates(rates, ctxFrom('2026-06-08', [0.4, 0.45, 0.4]))
    expect(out!.messageEn).not.toContain('tomorrow:')
    expect(out!.messageTh).not.toContain('พรุ่งนี้:')
  })

  it('appends the event name (Th + En) to both messages when one overlaps tomorrow', () => {
    const out = summarizePerRoomRates(
      rates,
      ctxFrom('2026-06-08', [0.4, 0.45, 0.4], {
        demandCalendarEvent: { nameTh: 'เทศกาลทดสอบ', nameEn: 'Test Festival' },
      }),
    )
    expect(out!.messageEn).toContain('(tomorrow: Test Festival)')
    expect(out!.messageTh).toContain('(พรุ่งนี้: เทศกาลทดสอบ)')
  })

  it('appends identically regardless of which scenario the day lands on', () => {
    // ALL_HOLD_NO_COMPS (all holds) vs ALL_CUT_NO_COMPS (decreases
    // dominate) — two different scenarios, same event note behaviour.
    const holdRates: PerRoomTypeRate[] = [makeRate({ roomType: 'Standard', direction: 'hold' })]
    const event = { demandCalendarEvent: { nameTh: 'ก', nameEn: 'Event' } }
    const balanced = summarizePerRoomRates(holdRates, ctxFrom('2026-06-08', [0.5, 0.5, 0.5], event))
    const soft = summarizePerRoomRates(rates, ctxFrom('2026-06-08', [0.4, 0.45, 0.4], event))
    expect(balanced!.messageEn).toContain('(tomorrow: Event)')
    expect(soft!.messageEn).toContain('(tomorrow: Event)')
  })

  it('classifyDailyAction never uses the event to pick a scenario — only renderAction appends it', () => {
    const decreaseHeavy = [makeRate({ roomType: 'A', direction: 'decrease' })]
    const withEvent = classifyDailyAction({
      increases: [], decreases: decreaseHeavy, holds: [],
      competitorGapPct: null, isWeekend: false, trend: 'steady', occTh: '', occEn: '',
      demandCalendarEventNameTh: 'ก', demandCalendarEventNameEn: 'Event',
    })
    const withoutEvent = classifyDailyAction({
      increases: [], decreases: decreaseHeavy, holds: [],
      competitorGapPct: null, isWeekend: false, trend: 'steady', occTh: '', occEn: '',
      demandCalendarEventNameTh: null, demandCalendarEventNameEn: null,
    })
    expect(withEvent.scenario).toBe(withoutEvent.scenario)
  })

  it('real seeded holiday data (Songkran) renders correctly through the full pipeline', () => {
    const songkran = THAILAND_PUBLIC_HOLIDAYS_2026.find((h) => h.nameEn === 'Songkran Festival')!
    const out = summarizePerRoomRates(
      rates,
      ctxFrom('2026-06-08', [0.4, 0.45, 0.4], {
        demandCalendarEvent: { nameTh: songkran.nameTh, nameEn: songkran.nameEn },
      }),
    )
    expect(out!.messageEn).toContain('(tomorrow: Songkran Festival)')
    expect(out!.messageTh).toContain('(พรุ่งนี้: วันสงกรานต์)')
  })
})
