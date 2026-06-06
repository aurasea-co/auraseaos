import { describe, it, expect } from 'vitest'
import {
  recommendPerRoomTypeRates,
  type RecommendationInput,
} from './engine'

// Build a synthetic 3-day window with the same room types across each
// day. Per-type occupancy is derived from occupied/total in the
// breakdown rows.
function makeWindow(
  perDay: Array<{
    date: string
    types: Array<{
      roomType: string
      totalRooms: number
      occupiedRooms: number
      rateThb: number
    }>
  }>,
): RecommendationInput[] {
  return perDay.map(({ date, types }) => {
    const totalRooms = types.reduce((s, t) => s + t.totalRooms, 0)
    const occupiedRooms = types.reduce((s, t) => s + t.occupiedRooms, 0)
    const revenue = types.reduce((s, t) => s + t.occupiedRooms * t.rateThb, 0)
    return {
      date,
      occupancyRate: totalRooms > 0 ? occupiedRooms / totalRooms : 0,
      adrThb: occupiedRooms > 0 ? revenue / occupiedRooms : 0,
      roomTypeBreakdown: types,
    }
  })
}

describe('recommendPerRoomTypeRates — every active room type produces a row', () => {
  it('emits one row per type in the latest breakdown (Crystal Resort: 4)', () => {
    const days = makeWindow([
      {
        date: '2026-05-27',
        types: [
          { roomType: 'Deluxe2', totalRooms: 4, occupiedRooms: 4, rateThb: 950 },
          { roomType: 'Deluxe5', totalRooms: 4, occupiedRooms: 2, rateThb: 790 },
          { roomType: 'Deluxe6', totalRooms: 4, occupiedRooms: 1, rateThb: 850 },
          { roomType: 'Suite',   totalRooms: 2, occupiedRooms: 2, rateThb: 1200 },
        ],
      },
      {
        date: '2026-05-28',
        types: [
          { roomType: 'Deluxe2', totalRooms: 4, occupiedRooms: 4, rateThb: 950 },
          { roomType: 'Deluxe5', totalRooms: 4, occupiedRooms: 2, rateThb: 790 },
          { roomType: 'Deluxe6', totalRooms: 4, occupiedRooms: 1, rateThb: 850 },
          { roomType: 'Suite',   totalRooms: 2, occupiedRooms: 2, rateThb: 1200 },
        ],
      },
      {
        date: '2026-05-29',
        types: [
          { roomType: 'Deluxe2', totalRooms: 4, occupiedRooms: 4, rateThb: 950 },
          { roomType: 'Deluxe5', totalRooms: 4, occupiedRooms: 2, rateThb: 790 },
          { roomType: 'Deluxe6', totalRooms: 4, occupiedRooms: 1, rateThb: 850 },
          { roomType: 'Suite',   totalRooms: 2, occupiedRooms: 2, rateThb: 1200 },
        ],
      },
    ])
    const out = recommendPerRoomTypeRates(days)
    expect(out.map((r) => r.roomType)).toEqual([
      'Deluxe2',
      'Deluxe5',
      'Deluxe6',
      'Suite',
    ])
  })

  it('preserves the input (breakdown) order, not impact order', () => {
    const days = makeWindow([
      {
        date: '2026-05-29',
        types: [
          // Z is first in input but has highest impact — output should still start with Z.
          { roomType: 'Z', totalRooms: 4, occupiedRooms: 4, rateThb: 1000 },  // 100% → increase (lift 100)
          { roomType: 'A', totalRooms: 4, occupiedRooms: 2, rateThb: 1000 },  // 50% → hold
        ],
      },
    ])
    const out = recommendPerRoomTypeRates(days)
    expect(out[0].roomType).toBe('Z')
    expect(out[1].roomType).toBe('A')
  })

  it('emits increase direction with the same 10% lift the blended engine uses', () => {
    const days = makeWindow([
      {
        date: '2026-05-27',
        types: [{ roomType: 'Suite', totalRooms: 2, occupiedRooms: 2, rateThb: 1200 }],
      },
      {
        date: '2026-05-28',
        types: [{ roomType: 'Suite', totalRooms: 2, occupiedRooms: 2, rateThb: 1200 }],
      },
      {
        date: '2026-05-29',
        types: [{ roomType: 'Suite', totalRooms: 2, occupiedRooms: 2, rateThb: 1200 }],
      },
    ])
    const [r] = recommendPerRoomTypeRates(days)
    expect(r.direction).toBe('increase')
    expect(r.currentRateThb).toBe(1200)
    expect(r.suggestedRateThb).toBe(1320)  // +10%
    expect(r.impactThb).toBe(120)
  })

  it('emits hold direction for occupancy in the comfortable middle band', () => {
    const days = makeWindow([
      {
        date: '2026-05-27',
        types: [{ roomType: 'Deluxe', totalRooms: 10, occupiedRooms: 6, rateThb: 1000 }],  // 60%
      },
      {
        date: '2026-05-28',
        types: [{ roomType: 'Deluxe', totalRooms: 10, occupiedRooms: 6, rateThb: 1000 }],
      },
      {
        date: '2026-05-29',
        types: [{ roomType: 'Deluxe', totalRooms: 10, occupiedRooms: 6, rateThb: 1000 }],
      },
    ])
    const [r] = recommendPerRoomTypeRates(days)
    expect(r.direction).toBe('hold')
    expect(r.suggestedRateThb).toBe(r.currentRateThb)
    expect(r.impactThb).toBe(0)
    expect(r.reasonTh).toContain('60%')
  })

  it('emits decrease direction below 35% occupancy with a 6% drop', () => {
    const days = makeWindow([
      {
        date: '2026-05-27',
        types: [{ roomType: 'Deluxe', totalRooms: 10, occupiedRooms: 3, rateThb: 1000 }],  // 30%
      },
      {
        date: '2026-05-28',
        types: [{ roomType: 'Deluxe', totalRooms: 10, occupiedRooms: 3, rateThb: 1000 }],
      },
      {
        date: '2026-05-29',
        types: [{ roomType: 'Deluxe', totalRooms: 10, occupiedRooms: 3, rateThb: 1000 }],
      },
    ])
    const [r] = recommendPerRoomTypeRates(days)
    expect(r.direction).toBe('decrease')
    expect(r.currentRateThb).toBe(1000)
    expect(r.suggestedRateThb).toBe(940)  // −6%
    expect(r.impactThb).toBe(60)
  })

  it('returns hold with a "not enough data" reason when no occupancy data for this type', () => {
    // Type exists in the latest day's breakdown but every prior day's
    // breakdown has totalRooms=0 — sparse type.
    const days = makeWindow([
      {
        date: '2026-05-27',
        types: [{ roomType: 'Suite', totalRooms: 0, occupiedRooms: 0, rateThb: 1500 }],
      },
      {
        date: '2026-05-28',
        types: [{ roomType: 'Suite', totalRooms: 0, occupiedRooms: 0, rateThb: 1500 }],
      },
      {
        date: '2026-05-29',
        types: [{ roomType: 'Suite', totalRooms: 0, occupiedRooms: 0, rateThb: 1500 }],
      },
    ])
    const [r] = recommendPerRoomTypeRates(days)
    expect(r.direction).toBe('hold')
    expect(r.reasonTh).toContain('ข้อมูลยังไม่พอ')
  })

  it('skips types with no captured rack rate (currentRateThb <= 0)', () => {
    const days = makeWindow([
      {
        date: '2026-05-29',
        types: [
          { roomType: 'GoodType', totalRooms: 4, occupiedRooms: 2, rateThb: 1000 },
          { roomType: 'NoRate',   totalRooms: 4, occupiedRooms: 2, rateThb: 0 },
        ],
      },
    ])
    const out = recommendPerRoomTypeRates(days)
    expect(out.map((r) => r.roomType)).toEqual(['GoodType'])
  })

  it('returns empty array when the latest day carries no breakdown', () => {
    const days: RecommendationInput[] = [
      { date: '2026-05-29', occupancyRate: 0.5, adrThb: 1000 },
    ]
    expect(recommendPerRoomTypeRates(days)).toEqual([])
  })

  it('returns empty array for empty input', () => {
    expect(recommendPerRoomTypeRates([])).toEqual([])
  })

  // ── Satang fields (migration 037 / 038 requirements) ─────────────────

  it('every emitted row carries integer satang fields = THB × 100', () => {
    const days = makeWindow([
      {
        date: '2026-05-29',
        types: [
          { roomType: 'Suite',  totalRooms: 2, occupiedRooms: 2, rateThb: 1200 },  // 100% → increase
          { roomType: 'Deluxe', totalRooms: 4, occupiedRooms: 2, rateThb: 950 },   // 50% → hold
        ],
      },
    ])
    const out = recommendPerRoomTypeRates(days)
    for (const r of out) {
      expect(Number.isInteger(r.currentRateSatang)).toBe(true)
      expect(Number.isInteger(r.suggestedRateSatang)).toBe(true)
      expect(r.currentRateSatang).toBeGreaterThanOrEqual(0)
      expect(r.suggestedRateSatang).toBeGreaterThanOrEqual(0)
      expect(r.currentRateSatang).toBe(r.currentRateThb * 100)
      expect(r.suggestedRateSatang).toBe(r.suggestedRateThb * 100)
    }
  })

  it('never emits roomType="all" — per-room only', () => {
    // Even if the input somehow carried a literal 'all' label (it
    // shouldn't), the engine would just emit it back as-is — but the
    // breakdown shapes the engine accepts from the route never use
    // 'all'. This test asserts the contract on a normal Crystal Resort
    // shape.
    const days = makeWindow([
      {
        date: '2026-05-29',
        types: [
          { roomType: 'Deluxe2', totalRooms: 4, occupiedRooms: 2, rateThb: 950 },
          { roomType: 'Suite',   totalRooms: 2, occupiedRooms: 1, rateThb: 1200 },
        ],
      },
    ])
    const out = recommendPerRoomTypeRates(days)
    expect(out.length).toBeGreaterThan(0)
    for (const r of out) {
      expect(r.roomType).not.toBe('all')
      expect(r.roomType.length).toBeGreaterThan(0)
    }
  })

  it('Crystal Resort 4-type output: satang integers, no blended row', () => {
    const days = makeWindow([
      {
        date: '2026-05-29',
        types: [
          { roomType: 'Deluxe2', totalRooms: 4, occupiedRooms: 4, rateThb: 950 },   // 100% → increase
          { roomType: 'Deluxe5', totalRooms: 4, occupiedRooms: 2, rateThb: 790 },   // 50% → hold
          { roomType: 'Deluxe6', totalRooms: 4, occupiedRooms: 1, rateThb: 850 },   // 25% → decrease
          { roomType: 'Suite',   totalRooms: 2, occupiedRooms: 2, rateThb: 1200 },  // 100% → increase
        ],
      },
      {
        date: '2026-05-28',
        types: [
          { roomType: 'Deluxe2', totalRooms: 4, occupiedRooms: 4, rateThb: 950 },
          { roomType: 'Deluxe5', totalRooms: 4, occupiedRooms: 2, rateThb: 790 },
          { roomType: 'Deluxe6', totalRooms: 4, occupiedRooms: 1, rateThb: 850 },
          { roomType: 'Suite',   totalRooms: 2, occupiedRooms: 2, rateThb: 1200 },
        ],
      },
    ])
    const out = recommendPerRoomTypeRates(days)
    expect(out.length).toBe(4)
    expect(out.every((r) => r.roomType !== 'all')).toBe(true)
    expect(out.every((r) => Number.isInteger(r.currentRateSatang))).toBe(true)
    expect(out.every((r) => Number.isInteger(r.suggestedRateSatang))).toBe(true)
    // Suite suggested = 1200 + 120 = 1320 THB → 132000 satang
    const suite = out.find((r) => r.roomType === 'Suite')!
    expect(suite.suggestedRateSatang).toBe(132000)
    expect(suite.direction).toBe('increase')
  })

  // ── BUG 1: every room type gets a row, even with zero/no occupancy ──

  it('a 4-type branch where Suite had zero sales still produces 4 rows including Suite', () => {
    // Suite is OMITTED from every day's breakdown (it sold nothing and
    // the import dropped the row), but it's a known room type via the
    // config roster. The sheet must still list all 4 types.
    const days = makeWindow([
      {
        date: '2026-05-27',
        types: [
          { roomType: 'Deluxe2', totalRooms: 4, occupiedRooms: 3, rateThb: 950 },
          { roomType: 'Deluxe5', totalRooms: 4, occupiedRooms: 2, rateThb: 790 },
          { roomType: 'Deluxe6', totalRooms: 4, occupiedRooms: 2, rateThb: 850 },
        ],
      },
      {
        date: '2026-05-28',
        types: [
          { roomType: 'Deluxe2', totalRooms: 4, occupiedRooms: 3, rateThb: 950 },
          { roomType: 'Deluxe5', totalRooms: 4, occupiedRooms: 2, rateThb: 790 },
          { roomType: 'Deluxe6', totalRooms: 4, occupiedRooms: 2, rateThb: 850 },
        ],
      },
      {
        date: '2026-05-29',
        types: [
          { roomType: 'Deluxe2', totalRooms: 4, occupiedRooms: 3, rateThb: 950 },
          { roomType: 'Deluxe5', totalRooms: 4, occupiedRooms: 2, rateThb: 790 },
          { roomType: 'Deluxe6', totalRooms: 4, occupiedRooms: 2, rateThb: 850 },
        ],
      },
    ])
    const out = recommendPerRoomTypeRates(days, {
      roster: [
        { roomType: 'Deluxe2', inventory: 4, rackRateThb: 950 },
        { roomType: 'Deluxe5', inventory: 4, rackRateThb: 790 },
        { roomType: 'Deluxe6', inventory: 4, rackRateThb: 850 },
        { roomType: 'Suite', inventory: 2, rackRateThb: 1500 },
      ],
    })
    expect(out.length).toBe(4)
    expect(out.map((r) => r.roomType).sort()).toEqual(['Deluxe2', 'Deluxe5', 'Deluxe6', 'Suite'])

    // Suite had inventory but sold nothing → 0% occupancy → DECREASE,
    // with the "no bookings" reason copy (NOT "not enough data").
    const suite = out.find((r) => r.roomType === 'Suite')!
    expect(suite.direction).toBe('decrease')
    expect(suite.currentRateThb).toBe(1500) // rack rate from config roster
    expect(suite.suggestedRateThb).toBe(1410) // −6%
    expect(suite.reasonTh).toContain('ไม่มีการจองห้องนี้')
    expect(suite.reasonEn).toContain('No bookings')
  })

  it('zero-bookings is a decrease signal, not missing data, even without a roster', () => {
    // Suite appears in an EARLIER window day (so its inventory + rate
    // are known) but is absent from the latest two days — sold nothing.
    const days = makeWindow([
      {
        date: '2026-05-27',
        types: [
          { roomType: 'Deluxe', totalRooms: 4, occupiedRooms: 3, rateThb: 900 },
          { roomType: 'Suite', totalRooms: 2, occupiedRooms: 1, rateThb: 1500 },
        ],
      },
      {
        date: '2026-05-28',
        types: [{ roomType: 'Deluxe', totalRooms: 4, occupiedRooms: 0, rateThb: 900 }],
      },
      {
        date: '2026-05-29',
        types: [{ roomType: 'Deluxe', totalRooms: 4, occupiedRooms: 0, rateThb: 900 }],
      },
    ])
    const out = recommendPerRoomTypeRates(days)
    expect(out.map((r) => r.roomType).sort()).toEqual(['Deluxe', 'Suite'])
    // Suite: known inventory (2 from the 27th), absent on the latest two
    // days → those count as 0% → drags the avg into the decrease band.
    // The KEY point: it's a decrease signal, NOT "not enough data".
    const suite = out.find((r) => r.roomType === 'Suite')!
    expect(suite.direction).toBe('decrease')
    expect(suite.reasonTh).not.toContain('ข้อมูลยังไม่พอ')
    // Deluxe: present but 0/4 occupied on the latest two days → soft
    // decrease too (not dropped from the sheet).
    const deluxe = out.find((r) => r.roomType === 'Deluxe')!
    expect(deluxe.direction).toBe('decrease')
  })

  it('config-only type with a rack rate but no inventory holds at "not enough data"', () => {
    // A roster type that never appeared in any breakdown and whose
    // config carries a rack rate but no inventory → we have no evidence
    // it had rooms to sell, so we hold (case b), but STILL emit a row.
    const days = makeWindow([
      {
        date: '2026-05-29',
        types: [{ roomType: 'Deluxe', totalRooms: 4, occupiedRooms: 2, rateThb: 900 }],
      },
    ])
    const out = recommendPerRoomTypeRates(days, {
      roster: [{ roomType: 'Villa', rackRateThb: 5000 }],
    })
    expect(out.map((r) => r.roomType).sort()).toEqual(['Deluxe', 'Villa'])
    const villa = out.find((r) => r.roomType === 'Villa')!
    expect(villa.direction).toBe('hold')
    expect(villa.currentRateThb).toBe(5000)
    expect(villa.reasonTh).toContain('ข้อมูลยังไม่พอ')
  })

  it('emits roster rows even when NO type sold on the day (empty-ish breakdowns)', () => {
    // Every type present but with zero occupied — the brief is never an
    // empty/partial sheet. All known types appear with a decrease.
    const days = makeWindow([
      {
        date: '2026-05-29',
        types: [
          { roomType: 'Deluxe2', totalRooms: 4, occupiedRooms: 0, rateThb: 950 },
          { roomType: 'Suite', totalRooms: 2, occupiedRooms: 0, rateThb: 1200 },
        ],
      },
    ])
    const out = recommendPerRoomTypeRates(days)
    expect(out.length).toBe(2)
    expect(out.every((r) => r.direction === 'decrease')).toBe(true)
    expect(out.every((r) => r.reasonEn.includes('No bookings'))).toBe(true)
  })

  it('impactThb is the absolute delta — sortable by magnitude', () => {
    const days = makeWindow([
      {
        date: '2026-05-27',
        types: [
          { roomType: 'High',   totalRooms: 4, occupiedRooms: 4, rateThb: 2000 },  // +200 lift
          { roomType: 'Low',    totalRooms: 4, occupiedRooms: 1, rateThb: 500 },   // −30 drop
          { roomType: 'Mid',    totalRooms: 4, occupiedRooms: 2, rateThb: 1000 },  // hold
        ],
      },
      {
        date: '2026-05-28',
        types: [
          { roomType: 'High',   totalRooms: 4, occupiedRooms: 4, rateThb: 2000 },
          { roomType: 'Low',    totalRooms: 4, occupiedRooms: 1, rateThb: 500 },
          { roomType: 'Mid',    totalRooms: 4, occupiedRooms: 2, rateThb: 1000 },
        ],
      },
      {
        date: '2026-05-29',
        types: [
          { roomType: 'High',   totalRooms: 4, occupiedRooms: 4, rateThb: 2000 },
          { roomType: 'Low',    totalRooms: 4, occupiedRooms: 1, rateThb: 500 },
          { roomType: 'Mid',    totalRooms: 4, occupiedRooms: 2, rateThb: 1000 },
        ],
      },
    ])
    const out = recommendPerRoomTypeRates(days)
    const byType = Object.fromEntries(out.map((r) => [r.roomType, r]))
    expect(byType['High'].impactThb).toBe(200)
    expect(byType['Low'].impactThb).toBe(30)
    expect(byType['Mid'].impactThb).toBe(0)
  })
})
