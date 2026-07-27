// Flagship regression for the Tier 1 "Calendar & Context" forward
// modifier: on 2026-07-26 the engine recommended rate CUTS for the
// night of 2026-07-27 — the eve of H.M. King Vajiralongkorn's Birthday
// (2026-07-28, a real seeded public holiday) — even though 07-27 is
// also a bridge day connecting the weekend to a two-day holiday run
// (07-28 King's Birthday + 07-29 Asarnha Bucha Day), making it part of
// a genuine 5-day long weekend. This file proves the forward demand
// signal (classifyCalendarContext + recommendPerRoomTypeRates'
// demandContext option) fixes that without touching anything else.
//
// Occupancy inputs below are SYNTHETIC (deliberately soft, to trigger
// the engine's natural 'decrease' band) — not the real Crystal Resort
// history in __fixtures__/crystal-resort-2026-07.ts, which only runs
// through 2026-07-25. The calendar data is real: the actual seeded
// 2026 Thai public holidays.

import { describe, it, expect } from 'vitest'
import { recommendPerRoomTypeRates, type RecommendationInput } from './engine'
import { classifyCalendarContext } from '@/lib/demand-calendar/classify'
import { THAILAND_PUBLIC_HOLIDAYS_2026, toDemandCalendarSeedRows } from '@/lib/demand-calendar/thailand-public-holidays-2026'
import type { DemandCalendarEvent } from '@/lib/demand-calendar/queries'

const HOLIDAYS_2026: DemandCalendarEvent[] = toDemandCalendarSeedRows(THAILAND_PUBLIC_HOLIDAYS_2026).map(
  (row, i) => ({
    id: `holiday-${i}`,
    startDate: row.start_date,
    endDate: row.end_date,
    type: row.type,
    nameTh: row.name_th,
    nameEn: row.name_en,
    province: row.province,
    expectedImpactModifier: null,
    source: row.source,
    confidence: row.confidence,
    organizationId: row.organization_id,
    branchId: row.branch_id,
  }),
)

// Trailing 3-day window ending 2026-07-26 (the morning the brief runs),
// pricing the night of 2026-07-27. Soft, uniformly low occupancy across
// two room types — deliberately below the engine's 35% decrease floor
// on its own, so the test isolates the calendar modifier's effect
// rather than relying on borderline data.
const SOFT_TRAILING_DAYS: RecommendationInput[] = ['2026-07-24', '2026-07-25', '2026-07-26'].map((date) => ({
  date,
  occupancyRate: 0.2,
  adrThb: 850,
  roomTypeBreakdown: [
    { roomType: 'Deluxe6', totalRooms: 21, occupiedRooms: 5, rateThb: 850 }, // ~24%
    { roomType: 'Suite', totalRooms: 11, occupiedRooms: 3, rateThb: 1200 }, // ~27%
  ],
}))

describe('King\'s Birthday eve regression — 2026-07-26 pricing the night of 2026-07-27', () => {
  it('without a calendar signal, soft trailing occupancy alone recommends CUTS (reproduces the reported bug)', () => {
    const rates = recommendPerRoomTypeRates(SOFT_TRAILING_DAYS, {})
    const byType = new Map(rates.map((r) => [r.roomType, r.direction]))
    expect(byType.get('Deluxe6')).toBe('decrease')
    expect(byType.get('Suite')).toBe('decrease')
  })

  it('with the forward demand signal for 2026-07-27, the engine no longer cuts any room type', () => {
    const demandContext = classifyCalendarContext('2026-07-27', HOLIDAYS_2026).demandSignal
    // Sanity-check the classifier actually fired strongly for this date
    // before trusting the engine's behaviour on top of it.
    expect(demandContext.level).toBe('elevated')
    expect(demandContext.modifier).toBeCloseTo(0.15, 5)

    const rates = recommendPerRoomTypeRates(SOFT_TRAILING_DAYS, { demandContext })
    for (const r of rates) {
      expect(r.direction).not.toBe('decrease')
    }
  })

  it('exposes the calendar reason on each row for later use by the brief (explainable, not silently applied)', () => {
    const demandContext = classifyCalendarContext('2026-07-27', HOLIDAYS_2026).demandSignal
    const rates = recommendPerRoomTypeRates(SOFT_TRAILING_DAYS, { demandContext })
    for (const r of rates) {
      expect(r.calendarContext).toBeDefined()
      expect(r.calendarContext?.reasonEn).toBe('eve of a public holiday')
    }
  })

  it('the modifier only shifts the band, never the lift/drop magnitude formula (bounded, not aggressive)', () => {
    // A room type sitting deep in 'increase' territory already (avgOcc
    // > 0.85) must still get exactly the existing 10% lift — the
    // calendar signal cannot inflate it further.
    const busyDays: RecommendationInput[] = ['2026-07-24', '2026-07-25', '2026-07-26'].map((date) => ({
      date,
      occupancyRate: 0.9,
      adrThb: 850,
      roomTypeBreakdown: [{ roomType: 'Deluxe6', totalRooms: 21, occupiedRooms: 19, rateThb: 850 }], // ~90%
    }))
    const demandContext = classifyCalendarContext('2026-07-27', HOLIDAYS_2026).demandSignal
    const withoutSignal = recommendPerRoomTypeRates(busyDays, {})
    const withSignal = recommendPerRoomTypeRates(busyDays, { demandContext })
    expect(withoutSignal[0].direction).toBe('increase')
    expect(withSignal[0].direction).toBe('increase')
    expect(withSignal[0].suggestedRateThb).toBe(withoutSignal[0].suggestedRateThb)
  })
})
