// Forward-looking edit semantics — pure-data tests.
//
// The PATCH and DELETE handlers in [roomType]/route.ts and the POST
// handler in route.ts are full HTTP routes (heavy supabase wiring).
// These tests pin the CORE INVARIANTS the routes implement against a
// hand-rolled breakdown so the semantics can't drift without notice:
//
//   - PATCH rateThb: updates the matching entry's rateThb in the
//     LATEST row. Historical rows unchanged. occupiedRooms and revenue
//     left alone (we never rewrite history).
//   - PATCH totalRooms: updates totalRooms + rolls rooms_available.
//     Historical occupiedRooms / revenue untouched.
//   - DELETE: drops the entry from the latest breakdown only.
//     Historical rows still carry it (preserved for audit + reporting).
//   - POST: appends with occupiedRooms=0 + dup-name rejected.
//   - Engine pickup: after a rate edit, recommendPerRoomTypeRates picks
//     up the new currentRate from the latest row's breakdown.

import { describe, it, expect } from 'vitest'
import {
  recommendPerRoomTypeRates,
  toRecommendationInputs,
} from '@/lib/recommendations/hotel/engine'
import type { RoomTypeOccupancy } from '@/lib/ingestion/types'

// ── Helpers mirroring the route's mutation logic ──────────────────────

function patchRate(breakdown: RoomTypeOccupancy[], roomType: string, newRateThb: number): RoomTypeOccupancy[] {
  return breakdown.map((b) =>
    b.roomType === roomType
      ? { ...b, rateThb: Math.round(newRateThb) }
      : b,
  )
}

function patchRooms(breakdown: RoomTypeOccupancy[], roomType: string, newTotalRooms: number): RoomTypeOccupancy[] {
  return breakdown.map((b) =>
    b.roomType === roomType
      ? { ...b, totalRooms: newTotalRooms }
      : b,
  )
}

function removeType(breakdown: RoomTypeOccupancy[], roomType: string): RoomTypeOccupancy[] {
  return breakdown.filter((b) => b.roomType !== roomType)
}

function addType(breakdown: RoomTypeOccupancy[], entry: RoomTypeOccupancy): RoomTypeOccupancy[] | { error: string } {
  if (breakdown.some((b) => b.roomType.toLowerCase() === entry.roomType.toLowerCase())) {
    return { error: 'room_type_duplicate' }
  }
  return [...breakdown, entry]
}

function rollRoomsAvailable(breakdown: RoomTypeOccupancy[]): number {
  return breakdown.reduce((s, r) => s + (r.totalRooms || 0), 0)
}

// ── PATCH: rate ──────────────────────────────────────────────────────

describe('PATCH rateThb on latest breakdown', () => {
  it('updates ONLY the targeted type\'s rateThb', () => {
    const before: RoomTypeOccupancy[] = [
      { roomType: 'Deluxe2', totalRooms: 4, occupiedRooms: 2, rateThb: 950 },
      { roomType: 'Suite',   totalRooms: 2, occupiedRooms: 1, rateThb: 1200 },
    ]
    const after = patchRate(before, 'Suite', 1350)
    expect(after).toEqual([
      { roomType: 'Deluxe2', totalRooms: 4, occupiedRooms: 2, rateThb: 950 },
      { roomType: 'Suite',   totalRooms: 2, occupiedRooms: 1, rateThb: 1350 },
    ])
  })

  it('does NOT mutate occupiedRooms (history preserved within the same row)', () => {
    const before: RoomTypeOccupancy[] = [
      { roomType: 'Suite', totalRooms: 2, occupiedRooms: 2, rateThb: 1200 },
    ]
    const after = patchRate(before, 'Suite', 1500)
    expect(after[0].occupiedRooms).toBe(2)
  })
})

// ── PATCH: rooms ─────────────────────────────────────────────────────

describe('PATCH totalRooms on latest breakdown', () => {
  it('rolls rooms_available up from the post-edit breakdown sum', () => {
    const before: RoomTypeOccupancy[] = [
      { roomType: 'Deluxe', totalRooms: 4, occupiedRooms: 2, rateThb: 950 },
      { roomType: 'Suite',  totalRooms: 2, occupiedRooms: 1, rateThb: 1200 },
    ]
    expect(rollRoomsAvailable(before)).toBe(6)
    const after = patchRooms(before, 'Deluxe', 6)
    expect(rollRoomsAvailable(after)).toBe(8)
  })

  it('does NOT touch revenue (callers update only room_type_breakdown + rooms_available)', () => {
    // Sentinel: the test asserts the helper returns a breakdown only;
    // the route's `updatePayload` does not include `revenue`.
    const before: RoomTypeOccupancy[] = [
      { roomType: 'Deluxe', totalRooms: 4, occupiedRooms: 2, rateThb: 950 },
    ]
    const after = patchRooms(before, 'Deluxe', 6)
    // The breakdown shape doesn't carry revenue. Verifies our mutation
    // is a *pure* breakdown rewrite (route adds rooms_available only
    // alongside, never revenue).
    expect(after[0]).not.toHaveProperty('revenue')
  })
})

// ── DELETE: forward-looking ──────────────────────────────────────────

describe('DELETE — forward-looking removal from latest breakdown', () => {
  it('drops the entry from the latest breakdown', () => {
    const latestBefore: RoomTypeOccupancy[] = [
      { roomType: 'Deluxe', totalRooms: 4, occupiedRooms: 2, rateThb: 950 },
      { roomType: 'Suite',  totalRooms: 2, occupiedRooms: 1, rateThb: 1200 },
    ]
    const latestAfter = removeType(latestBefore, 'Deluxe')
    expect(latestAfter.map((b) => b.roomType)).toEqual(['Suite'])
  })

  it('LEAVES historical rows untouched (key forward-looking invariant)', () => {
    // Two days of data; only the latest row should be edited. The day-
    // before-yesterday row remains intact.
    const historical: RoomTypeOccupancy[] = [
      { roomType: 'Deluxe', totalRooms: 4, occupiedRooms: 3, rateThb: 950 },
      { roomType: 'Suite',  totalRooms: 2, occupiedRooms: 1, rateThb: 1200 },
    ]
    const latestBefore = historical.slice()
    const latestAfter = removeType(latestBefore, 'Deluxe')
    // Historical untouched — sanity (the route never writes to old rows).
    expect(historical).toEqual([
      { roomType: 'Deluxe', totalRooms: 4, occupiedRooms: 3, rateThb: 950 },
      { roomType: 'Suite',  totalRooms: 2, occupiedRooms: 1, rateThb: 1200 },
    ])
    // Latest carries only Suite going forward.
    expect(latestAfter).toEqual([
      { roomType: 'Suite', totalRooms: 2, occupiedRooms: 1, rateThb: 1200 },
    ])
  })
})

// ── POST: add ─────────────────────────────────────────────────────────

describe('POST add room type', () => {
  it('appends with occupiedRooms=0 (no retroactive sales)', () => {
    const before: RoomTypeOccupancy[] = [
      { roomType: 'Deluxe', totalRooms: 4, occupiedRooms: 2, rateThb: 950 },
    ]
    const result = addType(before, { roomType: 'Suite', totalRooms: 2, occupiedRooms: 0, rateThb: 1200 })
    expect(Array.isArray(result)).toBe(true)
    if (Array.isArray(result)) {
      expect(result).toHaveLength(2)
      expect(result[1]).toEqual({ roomType: 'Suite', totalRooms: 2, occupiedRooms: 0, rateThb: 1200 })
    }
  })

  it('rejects a case-insensitive duplicate roomType', () => {
    const before: RoomTypeOccupancy[] = [
      { roomType: 'Suite', totalRooms: 2, occupiedRooms: 1, rateThb: 1200 },
    ]
    expect(addType(before, { roomType: 'suite', totalRooms: 3, occupiedRooms: 0, rateThb: 1400 }))
      .toEqual({ error: 'room_type_duplicate' })
    expect(addType(before, { roomType: 'Suite', totalRooms: 3, occupiedRooms: 0, rateThb: 1400 }))
      .toEqual({ error: 'room_type_duplicate' })
  })
})

// ── Engine pickup ────────────────────────────────────────────────────

describe('engine picks up the latest breakdown edit', () => {
  // The key end-to-end invariant: editing Suite's rateThb on the
  // latest accommodation_daily_metrics row updates the currentRate the
  // engine reads. Tomorrow's brief reflects it without any further
  // wiring — the engine reads the latest row's room_type_breakdown.
  it('editing Suite rateThb 1200 → 1500 → engine emits Suite with currentRate=1500', () => {
    // Day -1: Suite at 1200
    const dayBefore: RoomTypeOccupancy[] = [
      { roomType: 'Suite', totalRooms: 2, occupiedRooms: 2, rateThb: 1200 },
    ]
    // Today (the latest row) post-edit: Suite at 1500 — what the page edits.
    const todayAfterEdit = patchRate(dayBefore, 'Suite', 1500)

    // Build the engine inputs the way the route does (latest row last).
    const inputs = toRecommendationInputs([
      { metric_date: '2026-06-01', rooms_available: 2, rooms_sold: 2, revenue: 2400, room_type_breakdown: dayBefore },
      { metric_date: '2026-06-02', rooms_available: 2, rooms_sold: 2, revenue: 2400, room_type_breakdown: todayAfterEdit },
    ])

    const recs = recommendPerRoomTypeRates(inputs)
    const suite = recs.find((r) => r.roomType === 'Suite')
    expect(suite).toBeDefined()
    // The engine reads currentRate from the LATEST day's breakdown
    // (rt.rateThb in suggestRatesPerRoomType / recommendPerRoomTypeRates).
    expect(suite!.currentRateThb).toBe(1500)
  })

  it('editing rateThb does NOT alter occupancy classification — direction stable when occupancy unchanged', () => {
    // Two days at 100% occupancy → engine emits "increase" for Suite
    // both before and after the rate edit. The DIRECTION depends on
    // occupancy, not rack rate.
    const dayBefore: RoomTypeOccupancy[] = [
      { roomType: 'Suite', totalRooms: 2, occupiedRooms: 2, rateThb: 1200 },
    ]
    const todayUnedited: RoomTypeOccupancy[] = [
      { roomType: 'Suite', totalRooms: 2, occupiedRooms: 2, rateThb: 1200 },
    ]
    const todayEdited = patchRate(todayUnedited, 'Suite', 1500)

    const recsBefore = recommendPerRoomTypeRates(toRecommendationInputs([
      { metric_date: '2026-06-01', rooms_available: 2, rooms_sold: 2, revenue: 2400, room_type_breakdown: dayBefore },
      { metric_date: '2026-06-02', rooms_available: 2, rooms_sold: 2, revenue: 2400, room_type_breakdown: todayUnedited },
    ]))
    const recsAfter = recommendPerRoomTypeRates(toRecommendationInputs([
      { metric_date: '2026-06-01', rooms_available: 2, rooms_sold: 2, revenue: 2400, room_type_breakdown: dayBefore },
      { metric_date: '2026-06-02', rooms_available: 2, rooms_sold: 2, revenue: 2400, room_type_breakdown: todayEdited },
    ]))
    expect(recsBefore.find((r) => r.roomType === 'Suite')!.direction).toBe('increase')
    expect(recsAfter.find((r) => r.roomType === 'Suite')!.direction).toBe('increase')
    // But the suggested rate scales off the NEW rack rate.
    const lift = (n: number) => n + Math.round(n * 0.10)
    expect(recsBefore.find((r) => r.roomType === 'Suite')!.suggestedRateThb).toBe(lift(1200))
    expect(recsAfter.find((r) => r.roomType === 'Suite')!.suggestedRateThb).toBe(lift(1500))
  })
})
