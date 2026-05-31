import { describe, it, expect } from 'vitest'
import { deriveRoomTypesFromBreakdowns } from './room-types'

describe('deriveRoomTypesFromBreakdowns', () => {
  it('returns empty for empty input', () => {
    expect(deriveRoomTypesFromBreakdowns([])).toEqual([])
  })

  it('returns empty when no rows have breakdown data', () => {
    expect(deriveRoomTypesFromBreakdowns([
      { metric_date: '2026-05-30', room_type_breakdown: null },
      { metric_date: '2026-05-29', room_type_breakdown: null },
    ])).toEqual([])
  })

  it('aggregates a single type across multiple days', () => {
    const out = deriveRoomTypesFromBreakdowns([
      { metric_date: '2026-05-30', room_type_breakdown: [{ roomType: 'Suite', totalRooms: 11, occupiedRooms: 7, rateThb: 1920 }] },
      { metric_date: '2026-05-29', room_type_breakdown: [{ roomType: 'Suite', totalRooms: 11, occupiedRooms: 4, rateThb: 1800 }] },
    ])
    expect(out).toEqual([
      { roomType: 'Suite', inventory: 11, latestRateThb: 1920, dayCount: 2 },
    ])
  })

  it('uses MAX inventory across days (handles room count edits)', () => {
    const out = deriveRoomTypesFromBreakdowns([
      { metric_date: '2026-05-30', room_type_breakdown: [{ roomType: 'Suite', totalRooms: 11, occupiedRooms: 7, rateThb: 1920 }] },
      { metric_date: '2026-05-20', room_type_breakdown: [{ roomType: 'Suite', totalRooms: 13, occupiedRooms: 8, rateThb: 1800 }] },
    ])
    expect(out[0].inventory).toBe(13)
  })

  it('latestRateThb tracks the newest metric_date carrying that type', () => {
    const out = deriveRoomTypesFromBreakdowns([
      { metric_date: '2026-05-30', room_type_breakdown: [{ roomType: 'Deluxe', totalRooms: 21, occupiedRooms: 5, rateThb: 850 }] },
      { metric_date: '2026-05-29', room_type_breakdown: [{ roomType: 'Deluxe', totalRooms: 21, occupiedRooms: 9, rateThb: 900 }] },
    ])
    expect(out[0].latestRateThb).toBe(850)
  })

  it('skips zero/missing rates so a junk row does not nuke a real rate', () => {
    const out = deriveRoomTypesFromBreakdowns([
      { metric_date: '2026-05-30', room_type_breakdown: [{ roomType: 'Deluxe', totalRooms: 21, occupiedRooms: 0, rateThb: 0 }] },
      { metric_date: '2026-05-29', room_type_breakdown: [{ roomType: 'Deluxe', totalRooms: 21, occupiedRooms: 9, rateThb: 900 }] },
    ])
    expect(out[0].latestRateThb).toBe(900)
  })

  it('sorts by dayCount desc, then roomType asc on ties', () => {
    const out = deriveRoomTypesFromBreakdowns([
      // Suite: 1 day
      { metric_date: '2026-05-30', room_type_breakdown: [
        { roomType: 'Suite', totalRooms: 11, occupiedRooms: 7, rateThb: 1920 },
        { roomType: 'Deluxe5', totalRooms: 33, occupiedRooms: 10, rateThb: 790 },
        { roomType: 'Deluxe2', totalRooms: 19, occupiedRooms: 4, rateThb: 950 },
      ]},
      // Deluxe5 + Deluxe2 also on day 2; Suite not on day 2
      { metric_date: '2026-05-29', room_type_breakdown: [
        { roomType: 'Deluxe5', totalRooms: 33, occupiedRooms: 12, rateThb: 800 },
        { roomType: 'Deluxe2', totalRooms: 19, occupiedRooms: 6, rateThb: 950 },
      ]},
    ])
    expect(out.map((r) => r.roomType)).toEqual(['Deluxe2', 'Deluxe5', 'Suite'])
    // Deluxe2 + Deluxe5 both have dayCount=2; alphabetical tie-break.
  })

  it('trims whitespace and drops blank type names', () => {
    const out = deriveRoomTypesFromBreakdowns([
      { metric_date: '2026-05-30', room_type_breakdown: [
        { roomType: '  Suite  ', totalRooms: 11, occupiedRooms: 7, rateThb: 1920 },
        { roomType: '', totalRooms: 5, occupiedRooms: 1, rateThb: 500 },
      ]},
    ])
    expect(out).toEqual([
      { roomType: 'Suite', inventory: 11, latestRateThb: 1920, dayCount: 1 },
    ])
  })

  it('handles null totalRooms / occupiedRooms without crashing', () => {
    const out = deriveRoomTypesFromBreakdowns([
      { metric_date: '2026-05-30', room_type_breakdown: [
        { roomType: 'Suite', totalRooms: null, occupiedRooms: null, rateThb: 1920 },
      ]},
    ])
    expect(out[0].inventory).toBe(0)
    expect(out[0].latestRateThb).toBe(1920)
  })
})
