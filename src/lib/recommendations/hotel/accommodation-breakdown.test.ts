// End-to-end test for the morning-flash hasSingleHotel path's
// breakdown sourcing.
//
// The route used to read room_type_breakdown off branch_daily_metrics
// rows; that view doesn't expose the column, so the engine always saw
// undefined and fell back to a single blended rate. The fix sources
// the breakdown from accommodation_daily_metrics (migration 029) and
// merges it into the engine inputs by metric_date.
//
// This test exercises the data path that mirrors the route exactly:
//   1. Synthesise an accommodation_daily_metrics SELECT result with a
//      4-type breakdown (Crystal Resort shape).
//   2. Build the breakdownByDate Map the route builds.
//   3. Project to RecommendationInput[] the way the route does inside
//      its toRecommendationInputs(...) call.
//   4. Run recommendPerRoomTypeRates.
//   5. Pipe the engine output through upsertBranchRateRecommendations
//      with a fake supabase client.
//
// Asserts 4 PerRoomTypeRate entries land at the engine AND 4 rows hit
// the upsert call (one per active room type — never room_type='all').

import { describe, it, expect } from 'vitest'
import {
  recommendPerRoomTypeRates,
  toRecommendationInputs,
  type RecommendationInput,
} from './engine'
import { upsertBranchRateRecommendations } from './persistence'

interface BreakdownEntry {
  roomType: string
  totalRooms: number
  occupiedRooms: number
  rateThb: number
}

// Mirrors the route's accommodation_daily_metrics row → Map step. Kept
// in-test so a refactor of the route also has to refactor here, which
// is exactly the integrity we want.
function buildBreakdownMap(
  rows: ReadonlyArray<{ metric_date: string; room_type_breakdown: unknown }>,
): Map<string, BreakdownEntry[]> {
  const out = new Map<string, BreakdownEntry[]>()
  for (const row of rows) {
    const raw = row.room_type_breakdown
    if (!Array.isArray(raw) || raw.length === 0) continue
    const cleaned: BreakdownEntry[] = []
    for (const b of raw as Array<Record<string, unknown>>) {
      if (!b || typeof b !== 'object') continue
      const roomType = typeof b.roomType === 'string' ? b.roomType : null
      const totalRooms = Number(b.totalRooms)
      const occupiedRooms = Number(b.occupiedRooms)
      const rateThb = Number(b.rateThb)
      if (
        !roomType ||
        !Number.isFinite(totalRooms) ||
        !Number.isFinite(occupiedRooms) ||
        !Number.isFinite(rateThb)
      ) continue
      cleaned.push({ roomType, totalRooms, occupiedRooms, rateThb })
    }
    if (cleaned.length > 0) out.set(String(row.metric_date), cleaned)
  }
  return out
}

// Mirrors the route's branch_daily_metrics row shape. Real rows have
// many more columns; the engine only uses these three plus the
// breakdown we attach below.
interface MetricRow {
  metric_date: string
  rooms_available: number
  rooms_sold: number
  revenue: number
}

function buildRecInputs(
  metrics: ReadonlyArray<MetricRow>,
  breakdownByDate: Map<string, BreakdownEntry[]>,
): RecommendationInput[] {
  return toRecommendationInputs(
    metrics.map((m) => ({
      metric_date: m.metric_date,
      rooms_available: m.rooms_available,
      rooms_sold: m.rooms_sold,
      revenue: m.revenue,
      room_type_breakdown: breakdownByDate.get(m.metric_date) ?? null,
    })),
  )
}

function makeFakeUpsertClient() {
  const captured: Array<{ rows: Array<Record<string, unknown>>; onConflict: string }> = []
  return {
    client: {
      from() {
        return {
          upsert(
            rows: Array<Record<string, unknown>>,
            options: { onConflict: string },
          ) {
            captured.push({ rows, onConflict: options.onConflict })
            return Promise.resolve({ data: null, error: null })
          },
        }
      },
    },
    captured,
  }
}

describe('morning-flash route path: accommodation_daily_metrics → engine → persist', () => {
  // Crystal Resort live data shape (branch ef77c100-…). Two days of
  // breakdown — minimum the engine needs for a stable per-type signal.
  // Mixed occupancy so the engine emits at least one of each direction
  // (increase / hold / decrease) — proves the WHOLE table populates,
  // not just movers.
  const accomRows = [
    {
      metric_date: '2026-05-28',
      room_type_breakdown: [
        { roomType: 'Deluxe2', totalRooms: 4, occupiedRooms: 4, rateThb: 950 },
        { roomType: 'Deluxe5', totalRooms: 4, occupiedRooms: 2, rateThb: 790 },
        { roomType: 'Deluxe6', totalRooms: 4, occupiedRooms: 1, rateThb: 850 },
        { roomType: 'Suite',   totalRooms: 2, occupiedRooms: 2, rateThb: 1200 },
      ],
    },
    {
      metric_date: '2026-05-29',
      room_type_breakdown: [
        { roomType: 'Deluxe2', totalRooms: 4, occupiedRooms: 4, rateThb: 950 },
        { roomType: 'Deluxe5', totalRooms: 4, occupiedRooms: 2, rateThb: 790 },
        { roomType: 'Deluxe6', totalRooms: 4, occupiedRooms: 1, rateThb: 850 },
        { roomType: 'Suite',   totalRooms: 2, occupiedRooms: 2, rateThb: 1200 },
      ],
    },
  ]

  // Mirror branch_daily_metrics for the same two days. Note these
  // rows do NOT carry room_type_breakdown — that's the source of the
  // original bug.
  const metricRows: MetricRow[] = [
    { metric_date: '2026-05-28', rooms_available: 14, rooms_sold: 9, revenue: 8230 },
    { metric_date: '2026-05-29', rooms_available: 14, rooms_sold: 9, revenue: 8230 },
  ]

  it('builds a Map<date, breakdown[]> with one entry per data day', () => {
    const map = buildBreakdownMap(accomRows)
    expect(map.size).toBe(2)
    expect(map.get('2026-05-29')!.length).toBe(4)
    expect(map.get('2026-05-29')!.map((b) => b.roomType)).toEqual([
      'Deluxe2', 'Deluxe5', 'Deluxe6', 'Suite',
    ])
  })

  it('engine receives 4 room types via the merged inputs (regression: was 0 before fix)', () => {
    const map = buildBreakdownMap(accomRows)
    const recInputs = buildRecInputs(metricRows, map)
    // The latest input day's breakdown is what the engine reads. It
    // MUST carry all 4 types or the engine falls back to a blended row.
    const latest = recInputs[recInputs.length - 1]
    expect(latest.roomTypeBreakdown).toBeDefined()
    expect(latest.roomTypeBreakdown!.length).toBe(4)
    expect(latest.roomTypeBreakdown!.map((b) => b.roomType)).toEqual([
      'Deluxe2', 'Deluxe5', 'Deluxe6', 'Suite',
    ])
  })

  it('recommendPerRoomTypeRates emits 4 rows when accommodation_daily_metrics has 4 types', () => {
    const map = buildBreakdownMap(accomRows)
    const recInputs = buildRecInputs(metricRows, map)
    const recs = recommendPerRoomTypeRates(recInputs)
    expect(recs.length).toBe(4)
    expect(recs.map((r) => r.roomType)).toEqual([
      'Deluxe2', 'Deluxe5', 'Deluxe6', 'Suite',
    ])
    // None are blended/all rows.
    expect(recs.every((r) => r.roomType !== 'all')).toBe(true)
  })

  it('upsertBranchRateRecommendations writes 4 rows when given the engine output', async () => {
    const map = buildBreakdownMap(accomRows)
    const recInputs = buildRecInputs(metricRows, map)
    const recs = recommendPerRoomTypeRates(recInputs)
    const { client, captured } = makeFakeUpsertClient()
    const result = await upsertBranchRateRecommendations(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      {
        branchId: 'ef77c100-e27b-4f69-a930-053750b79f22',
        metricDate: '2026-05-29',
        recs,
      },
    )
    expect(result.inserted).toBe(4)
    expect(result.skipped).toBe(0)
    expect(captured).toHaveLength(1)
    expect(captured[0].onConflict).toBe('branch_id,metric_date,room_type')
    expect(captured[0].rows.map((r) => r.room_type)).toEqual([
      'Deluxe2', 'Deluxe5', 'Deluxe6', 'Suite',
    ])
    // Every persisted row carries satang values from the engine,
    // not THB. (Sanity-check the boundary: 950 THB → 95000 satang.)
    const deluxe2 = captured[0].rows.find((r) => r.room_type === 'Deluxe2')!
    expect(deluxe2.current_rate_satang).toBe(95000)
  })

  it('falls back gracefully to empty Map when accommodation_daily_metrics returns null/empty rows', () => {
    // The fix has to be tolerant of (a) NULL room_type_breakdown
    // (branch that never imported per-type CSV), (b) empty array, and
    // (c) a non-array (legacy malformed import). All three skip the row.
    const map = buildBreakdownMap([
      { metric_date: '2026-05-29', room_type_breakdown: null },
      { metric_date: '2026-05-28', room_type_breakdown: [] },
      { metric_date: '2026-05-27', room_type_breakdown: 'not-an-array' as unknown },
    ])
    expect(map.size).toBe(0)
    // Engine receives no breakdown → emits no per-room recs → the
    // route falls back to the blended forecast strip in the brief.
    const recInputs = buildRecInputs(metricRows, map)
    expect(recommendPerRoomTypeRates(recInputs)).toEqual([])
  })

  it('drops malformed entries within a breakdown but keeps the rest of the day', () => {
    const map = buildBreakdownMap([
      {
        metric_date: '2026-05-29',
        room_type_breakdown: [
          { roomType: 'Suite', totalRooms: 2, occupiedRooms: 2, rateThb: 1200 },     // ok
          { roomType: null,    totalRooms: 4, occupiedRooms: 2, rateThb: 950 },      // bad: no roomType
          { roomType: 'Deluxe2', totalRooms: 'four' as unknown, occupiedRooms: 2, rateThb: 950 },  // bad: NaN
          { roomType: 'Deluxe5', totalRooms: 4, occupiedRooms: 2, rateThb: 790 },    // ok
        ],
      },
    ])
    const cleaned = map.get('2026-05-29')!
    expect(cleaned.map((b) => b.roomType)).toEqual(['Suite', 'Deluxe5'])
  })

  it('only the days with a breakdown carry it through — others remain null', () => {
    const partial = [accomRows[1]]  // only 2026-05-29 has breakdown
    const map = buildBreakdownMap(partial)
    const recInputs = buildRecInputs(metricRows, map)
    // Day with breakdown: defined; day without: undefined (engine treats
    // it as "no per-type signal").
    expect(recInputs.find((r) => r.date === '2026-05-29')!.roomTypeBreakdown).toBeDefined()
    expect(recInputs.find((r) => r.date === '2026-05-28')!.roomTypeBreakdown).toBeUndefined()
  })
})
