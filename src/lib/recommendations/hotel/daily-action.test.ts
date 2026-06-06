import { describe, it, expect } from 'vitest'
import {
  summarizePerRoomRates,
  type PerRoomTypeRate,
  type RecommendationInput,
  type DailyActionContext,
} from './engine'

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
    expect(out!.messageEn).toContain('high demand')
    expect(out!.messageEn).toContain('discount')
    expect(out!.messageTh).toContain('ดีมานด์สูง')
  })

  it('all holds — focuses on channels + reviews', () => {
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Standard', direction: 'hold' }),
      makeRate({ roomType: 'Suite', direction: 'hold' }),
    ]
    const out = summarizePerRoomRates(rates)
    expect(out!.messageTh).toContain('ราคาทุกห้องเหมาะสม')
    expect(out!.messageEn).toContain('All rates appropriate')
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
    expect(out!.messageEn).toContain('high demand')
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
    expect(out!.messageEn).toContain('All rates appropriate')
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
})
