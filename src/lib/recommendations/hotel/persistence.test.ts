import { describe, it, expect } from 'vitest'
import {
  upsertBranchRateRecommendations,
  toPerRoomTypeRate,
  type BranchRateRecommendationRow,
} from './persistence'
import type { PerRoomTypeRate } from './engine'

function makeRec(partial: Partial<PerRoomTypeRate> = {}): PerRoomTypeRate {
  return {
    roomType: 'Suite',
    currentRateThb: 1200,
    suggestedRateThb: 1320,
    currentRateSatang: 120000,
    suggestedRateSatang: 132000,
    direction: 'increase',
    reasonTh: 'Occupancy 88% สูง — แนะนำขึ้น',
    reasonEn: '88% occupancy — suggest raise',
    impactThb: 120,
    ...partial,
  }
}

function makeFakeUpsertClient() {
  const captured: Array<{
    table: string
    rows: Array<Record<string, unknown>>
    options: { onConflict: string }
  }> = []
  let nextError: unknown = null
  const client = {
    from(table: 'branch_rate_recommendations') {
      return {
        upsert(rows: Array<Record<string, unknown>>, options: { onConflict: string }) {
          captured.push({ table, rows, options })
          return Promise.resolve({ data: null, error: nextError })
        },
      }
    },
    _setError(err: unknown) {
      nextError = err
    },
  }
  return { client, captured }
}

describe('upsertBranchRateRecommendations', () => {
  it('writes one row per rec on (branch_id, metric_date, room_type)', async () => {
    const { client, captured } = makeFakeUpsertClient()
    const res = await upsertBranchRateRecommendations(client, {
      branchId: 'ef77c100-e27b-4f69-a930-053750b79f22',
      metricDate: '2026-06-01',
      recs: [
        makeRec({ roomType: 'Deluxe2', currentRateSatang: 95000, suggestedRateSatang: 104500 }),
        makeRec({ roomType: 'Suite',   currentRateSatang: 120000, suggestedRateSatang: 132000 }),
      ],
    })
    expect(res.inserted).toBe(2)
    expect(res.skipped).toBe(0)
    expect(captured).toHaveLength(1)
    const call = captured[0]
    expect(call.options.onConflict).toBe('branch_id,metric_date,room_type')
    expect(call.rows.map((r) => r.room_type)).toEqual(['Deluxe2', 'Suite'])
    expect(call.rows.every((r) => r.metric_date === '2026-06-01')).toBe(true)
    expect(call.rows.every((r) => r.branch_id === 'ef77c100-e27b-4f69-a930-053750b79f22')).toBe(true)
  })

  it('every persisted row carries satang (not THB) for the rate columns', async () => {
    const { client, captured } = makeFakeUpsertClient()
    await upsertBranchRateRecommendations(client, {
      branchId: 'branch-1',
      metricDate: '2026-06-01',
      recs: [makeRec({ currentRateSatang: 95000, suggestedRateSatang: 104500 })],
    })
    const row = captured[0].rows[0]
    expect(row.current_rate_satang).toBe(95000)
    expect(row.suggested_rate_satang).toBe(104500)
    // No baht-named field should leak into the DB write.
    expect(row.current_rate_thb).toBeUndefined()
    expect(row.suggested_rate_thb).toBeUndefined()
  })

  it('filters out rows with roomType="all" (blocked by DB check + sanity)', async () => {
    const { client, captured } = makeFakeUpsertClient()
    const res = await upsertBranchRateRecommendations(client, {
      branchId: 'branch-1',
      metricDate: '2026-06-01',
      recs: [
        makeRec({ roomType: 'all' }),     // blocked — DB CHECK + filter
        makeRec({ roomType: 'Suite' }),   // ok
        makeRec({ roomType: '' }),        // blocked — would violate unique key
      ],
    })
    expect(res.inserted).toBe(1)
    expect(res.skipped).toBe(2)
    expect(captured[0].rows.map((r) => r.room_type)).toEqual(['Suite'])
  })

  it('returns inserted=0 + error string when supabase rejects the upsert', async () => {
    const { client } = makeFakeUpsertClient()
    client._setError({ message: 'constraint violation' })
    const res = await upsertBranchRateRecommendations(client, {
      branchId: 'branch-1',
      metricDate: '2026-06-01',
      recs: [makeRec()],
    })
    expect(res.inserted).toBe(0)
    expect(res.error).toBe('constraint violation')
  })

  it('passes direction + reason fields through unchanged', async () => {
    const { client, captured } = makeFakeUpsertClient()
    await upsertBranchRateRecommendations(client, {
      branchId: 'branch-1',
      metricDate: '2026-06-01',
      recs: [
        makeRec({ direction: 'hold', reasonTh: 'Occupancy 60% — ราคาเหมาะสม', reasonEn: '60% occupancy — current rate is appropriate' }),
      ],
    })
    const row = captured[0].rows[0]
    expect(row.direction).toBe('hold')
    expect(row.reason_th).toContain('ราคาเหมาะสม')
    expect(row.reason_en).toContain('current rate is appropriate')
  })
})

describe('toPerRoomTypeRate — DB row → engine shape', () => {
  it('projects a stored row back to PerRoomTypeRate with satang preserved + THB rounded', () => {
    const row: BranchRateRecommendationRow = {
      branch_id: 'b1',
      metric_date: '2026-06-01',
      room_type: 'Suite',
      current_rate_satang: 120000,
      suggested_rate_satang: 132000,
      direction: 'increase',
      reason_th: 'Occupancy 88% สูง — แนะนำขึ้น',
      reason_en: '88% occupancy — suggest raise',
    }
    const r = toPerRoomTypeRate(row)
    expect(r.roomType).toBe('Suite')
    expect(r.currentRateSatang).toBe(120000)
    expect(r.suggestedRateSatang).toBe(132000)
    expect(r.currentRateThb).toBe(1200)
    expect(r.suggestedRateThb).toBe(1320)
    expect(r.direction).toBe('increase')
    expect(r.impactThb).toBe(120)
  })

  it('returns 0-impact for hold rows projected from DB', () => {
    const row: BranchRateRecommendationRow = {
      branch_id: 'b1',
      metric_date: '2026-06-01',
      room_type: 'Deluxe5',
      current_rate_satang: 79000,
      suggested_rate_satang: 79000,
      direction: 'hold',
      reason_th: null,
      reason_en: null,
    }
    const r = toPerRoomTypeRate(row)
    expect(r.direction).toBe('hold')
    expect(r.impactThb).toBe(0)
    expect(r.currentRateThb).toBe(790)
    expect(r.suggestedRateThb).toBe(790)
    expect(r.reasonTh).toBe('')
    expect(r.reasonEn).toBe('')
  })
})
