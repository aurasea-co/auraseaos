// Single source of truth for "validate + write one competitor_rates
// row" — extracted from the manual-entry POST route so a new caller
// (the screenshot-extraction batch-commit route) can reuse the EXACT
// same validation, channel handling, and upsert/dedupe key instead of
// a second, divergent copy. Behavior-preserving extraction: every
// error code/message/threshold below matches what the route inlined
// before this file existed.
//
// Money: competitor_rates.rate is plain NUMERIC THB, not satang — see
// migration 029's own comment ("Satang convention from the spec
// doesn't apply here"). This file follows that existing convention;
// it does not introduce satang here.

import { RATE_CHANNELS, isRateChannel, type RateChannel } from '@/lib/types/competitor-rates'

const MAX_COMPETITORS = 5

export interface UpsertCompetitorRateInput {
  branchId: string
  competitorName?: string
  roomType?: string
  /** THB. When absent, a placeholder row is written (rate 0) so the
   *  competitor appears in the list before a real rate exists. */
  rateThb?: number
  /** ISO YYYY-MM-DD. Caller resolves "today" if omitted — this
   *  function requires it explicit so a batch caller covering many
   *  dates can't accidentally default every row to the same day. */
  capturedAt: string
  channel?: string
  source?: string
  notes?: string
}

export type UpsertCompetitorRateResult =
  | { ok: true }
  | { ok: false; status: number; code: string; messageTh: string; messageEn: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

const DEFAULT_SOURCE_BY_CHANNEL: Record<RateChannel, string> = {
  ota: 'Manual — Agoda/Booking check',
  walk_in: 'Manual — phone/front desk',
  package: 'Manual entry',
  promo: 'Manual entry',
}

/** Validates and upserts one competitor_rates row. `supabase` must be
 *  a service-role client — competitor_rates' write RLS is owner-only
 *  while the app-level gate additionally allows branch-scoped
 *  managers (see route.ts's authorize()), which is why every existing
 *  write path already uses the service role rather than the caller's
 *  RLS session. This function doesn't re-decide that; it just expects
 *  whatever client its caller has already resolved. */
export async function upsertCompetitorRate(
  supabase: SupabaseLike,
  input: UpsertCompetitorRateInput,
): Promise<UpsertCompetitorRateResult> {
  const competitorName = (input.competitorName || '').trim()
  if (!competitorName) {
    return {
      ok: false,
      status: 400,
      code: 'missing_competitor_name',
      messageTh: 'กรุณากรอกชื่อคู่แข่ง',
      messageEn: 'Competitor name is required',
    }
  }
  if (competitorName.length > 80) {
    return {
      ok: false,
      status: 400,
      code: 'name_too_long',
      messageTh: 'ชื่อคู่แข่งยาวเกินไป (สูงสุด 80 ตัวอักษร)',
      messageEn: 'Competitor name is too long (max 80 chars)',
    }
  }
  const roomType = (input.roomType || 'Standard').trim() || 'Standard'
  const rateThb = input.rateThb != null ? Number(input.rateThb) : 0
  if (Number.isNaN(rateThb) || rateThb < 0) {
    return {
      ok: false,
      status: 400,
      code: 'invalid_rate',
      messageTh: 'ราคาไม่ถูกต้อง',
      messageEn: 'Rate must be a non-negative number',
    }
  }
  const capturedAt = input.capturedAt

  const channel: RateChannel = isRateChannel(input.channel) ? input.channel : 'ota'
  const source = (input.source && input.source.trim().slice(0, 200)) || DEFAULT_SOURCE_BY_CHANNEL[channel]
  const notes = input.notes ? input.notes.trim().slice(0, 500) : null

  const { data: existingNames } = await supabase
    .from('competitor_rates')
    .select('competitor_name')
    .eq('branch_id', input.branchId)
  const distinct = new Set<string>(
    (existingNames || []).map((r: { competitor_name: string }) => r.competitor_name),
  )
  if (!distinct.has(competitorName) && distinct.size >= MAX_COMPETITORS) {
    return {
      ok: false,
      status: 400,
      code: 'max_competitors',
      messageTh: `เพิ่มได้สูงสุด ${MAX_COMPETITORS} คู่แข่ง — กรุณาลบรายการเก่าก่อน`,
      messageEn: `Maximum ${MAX_COMPETITORS} competitors allowed — remove an existing one first.`,
    }
  }

  const { error: upsertErr } = await supabase
    .from('competitor_rates')
    .upsert(
      {
        branch_id: input.branchId,
        competitor_name: competitorName,
        room_type: roomType,
        rate: rateThb,
        captured_at: capturedAt,
        channel,
        source,
        notes,
      },
      { onConflict: 'branch_id,competitor_name,room_type,channel,captured_at' },
    )

  if (upsertErr) {
    console.error('[competitor-rate-write] upsert failed', upsertErr)
    const hintTh =
      upsertErr.code === '42P10'
        ? 'ตารางยังไม่มี unique constraint — กรุณารัน migration 033'
        : 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
    const hintEn =
      upsertErr.code === '42P10'
        ? 'Database is missing the unique constraint — apply migration 033.'
        : 'Failed to save the rate. Please try again.'
    return { ok: false, status: 500, code: upsertErr.code || 'upsert_failed', messageTh: hintTh, messageEn: hintEn }
  }

  return { ok: true }
}

export { MAX_COMPETITORS, RATE_CHANNELS }
