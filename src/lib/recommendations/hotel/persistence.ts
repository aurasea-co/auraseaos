// Persistence for hotel rate recommendations.
//
// The morning-flash job runs the engine, then writes its output to
// branch_rate_recommendations so:
//   - the brief reads from the table (single source of truth, not the
//     in-memory engine pass-through that used to feed it),
//   - the RateDesk dashboard can render the same rows the owner saw in
//     LINE without re-running the engine,
//   - the bulk-approval flow can correlate rate_approvals back to the
//     recommendation that produced each row.
//
// All money in **satang** (bigint). The engine's PerRoomTypeRate
// already carries currentRateSatang + suggestedRateSatang so callers
// don't do unit conversion here.

import type { PerRoomTypeRate } from './engine'

/** Minimal Supabase surface used by the upsert path. Lets tests pass a
 *  fake client without depending on @supabase/supabase-js. */
export interface UpsertSupabase {
  from(table: 'branch_rate_recommendations'): {
    upsert(
      rows: Array<Record<string, unknown>>,
      options: { onConflict: string },
    ): Promise<{ data: unknown; error: unknown }>
  }
}

export interface UpsertResult {
  inserted: number
  /** Rows received from the caller but not written because they failed
   *  validation. Currently only the 'all' guard fires here — the engine
   *  shouldn't ever emit such a row, but we belt-and-brace because
   *  branch_rate_recommendations.room_type has a CHECK constraint that
   *  would otherwise reject the whole upsert. */
  skipped: number
  /** When the supabase upsert call fails, error carries the message —
   *  caller logs it; the morning-flash job continues. */
  error?: string
}

/** Upsert one row per PerRoomTypeRate onto
 *  (branch_id, metric_date, room_type). The unique constraint from
 *  migration 037 makes re-running the morning-flash same-day idempotent.
 *
 *  Rows with roomType === 'all' (or empty) are filtered out — the DB
 *  CHECK constraint blocks 'all', and an empty roomType would violate
 *  the unique key. We log them via the return.skipped counter rather
 *  than throwing because a partial write is better than a total loss. */
export async function upsertBranchRateRecommendations(
  supabase: UpsertSupabase,
  params: {
    branchId: string
    metricDate: string  // YYYY-MM-DD, Bangkok wall time
    recs: ReadonlyArray<PerRoomTypeRate>
  },
): Promise<UpsertResult> {
  const valid = params.recs.filter(
    (r) => r.roomType && r.roomType !== 'all',
  )
  const skipped = params.recs.length - valid.length
  if (valid.length === 0) {
    return { inserted: 0, skipped }
  }
  const rows = valid.map((r) => ({
    branch_id: params.branchId,
    metric_date: params.metricDate,
    room_type: r.roomType,
    current_rate_satang: r.currentRateSatang,
    suggested_rate_satang: r.suggestedRateSatang,
    direction: r.direction,
    reason_th: r.reasonTh,
    reason_en: r.reasonEn,
  }))
  const { error } = await supabase
    .from('branch_rate_recommendations')
    .upsert(rows, { onConflict: 'branch_id,metric_date,room_type' })
  if (error) {
    return {
      inserted: 0,
      skipped,
      error: typeof error === 'object' && error != null && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error),
    }
  }
  return { inserted: valid.length, skipped }
}

/** Row shape returned by reads of branch_rate_recommendations. The
 *  brief renderer accepts a related shape (PerRoomTypeRate); use
 *  toPerRoomTypeRate() to project. */
export interface BranchRateRecommendationRow {
  branch_id: string
  metric_date: string
  room_type: string
  current_rate_satang: number
  suggested_rate_satang: number
  direction: 'increase' | 'hold' | 'decrease'
  reason_th: string | null
  reason_en: string | null
}

/** Project a stored row back into PerRoomTypeRate so the brief
 *  renderer (which already knows that shape) doesn't need a parallel
 *  code path. Display values (THB) are derived via satangToThb. */
import { satangToThb } from '@/lib/money/satang'

export function toPerRoomTypeRate(row: BranchRateRecommendationRow): PerRoomTypeRate {
  const currentThb = satangToThb(row.current_rate_satang)
  const suggestedThb = satangToThb(row.suggested_rate_satang)
  return {
    roomType: row.room_type,
    currentRateThb: currentThb,
    suggestedRateThb: suggestedThb,
    currentRateSatang: row.current_rate_satang,
    suggestedRateSatang: row.suggested_rate_satang,
    direction: row.direction,
    reasonTh: row.reason_th ?? '',
    reasonEn: row.reason_en ?? '',
    impactThb: Math.abs(suggestedThb - currentThb),
  }
}
