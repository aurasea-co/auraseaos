// PATCH  /api/branches/[branchId]/rooms/[roomType] — edit existing
// DELETE /api/branches/[branchId]/rooms/[roomType] — remove from latest
//
// Both operate ONLY on the most-recent accommodation_daily_metrics
// row's room_type_breakdown jsonb (forward-looking semantics). The
// edit-the-latest-breakdown model:
//   - the latest row IS the live room configuration the page edits
//   - historical rows are immutable (audit + integrity)
//   - the engine + LINE brief read the latest row so edits propagate
//     to tomorrow's brief automatically
//
// PATCH body: { totalRooms?: number; rateThb?: number }
//   - totalRooms updates the inventory count on the latest row only,
//     rolls rooms_available up to match. Historical occupiedRooms and
//     revenue are untouched (you can't retroactively "un-sell" rooms).
//   - rateThb updates the forward-looking baseline the engine reads as
//     currentRate. We do NOT recompute historical revenue from this —
//     that would corrupt the audit trail.
//
// DELETE: removes the entry from the latest row's breakdown. If that
// leaves an empty breakdown, the row stays (with rooms_available=0)
// — we never delete the day row itself in this flow because the row
// may carry other valid daily fields (revenue, customers, etc).
//
// owner OR manager (org or branch-level); staff get 403.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { authorizeRoomsMutation } from '../_auth'
import type { RoomTypeOccupancy } from '@/lib/ingestion/types'

interface MutationResponse {
  success: boolean
  affectedDays: number   // back-compat field (always 1 here — only the latest row)
  deletedDays: number    // back-compat field (always 0 here — we never delete day rows)
  totalTouched: number   // = affectedDays + deletedDays
  error?: string
  code?: string
}

// ─── PATCH ────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ branchId: string; roomType: string }> },
) {
  const { branchId, roomType } = await ctx.params
  const decodedRoomType = decodeURIComponent(roomType)

  const auth = await authorizeRoomsMutation(branchId)
  if (!auth.ok) return auth.response

  let body: { totalRooms?: unknown; rateThb?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json<MutationResponse>(
      { success: false, affectedDays: 0, deletedDays: 0, totalTouched: 0, error: 'invalid_json', code: 'invalid_json' },
      { status: 400 },
    )
  }

  const updates: Partial<RoomTypeOccupancy> = {}
  if (body.totalRooms !== undefined) {
    const n = Number(body.totalRooms)
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      return NextResponse.json<MutationResponse>(
        { success: false, affectedDays: 0, deletedDays: 0, totalTouched: 0, error: 'total_rooms_invalid', code: 'total_rooms_invalid' },
        { status: 400 },
      )
    }
    updates.totalRooms = n
  }
  if (body.rateThb !== undefined) {
    const n = Number(body.rateThb)
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json<MutationResponse>(
        { success: false, affectedDays: 0, deletedDays: 0, totalTouched: 0, error: 'rate_invalid', code: 'rate_invalid' },
        { status: 400 },
      )
    }
    updates.rateThb = Math.round(n)
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json<MutationResponse>(
      { success: false, affectedDays: 0, deletedDays: 0, totalTouched: 0, error: 'no_changes', code: 'no_changes' },
      { status: 400 },
    )
  }

  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data: latest, error: fetchErr } = await db
    .from('accommodation_daily_metrics')
    .select('id, metric_date, room_type_breakdown, rooms_available, rooms_sold, revenue')
    .eq('branch_id', branchId)
    .order('metric_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (fetchErr) {
    console.error('[rooms PATCH] fetch failed', fetchErr)
    return NextResponse.json<MutationResponse>(
      { success: false, affectedDays: 0, deletedDays: 0, totalTouched: 0, error: fetchErr.message, code: 'fetch_failed' },
      { status: 500 },
    )
  }
  if (!latest) {
    return NextResponse.json<MutationResponse>(
      { success: false, affectedDays: 0, deletedDays: 0, totalTouched: 0, error: 'no_data_row', code: 'no_data_row' },
      { status: 404 },
    )
  }

  const existingBreakdown: RoomTypeOccupancy[] = Array.isArray(latest.room_type_breakdown)
    ? (latest.room_type_breakdown as RoomTypeOccupancy[])
    : []
  const idx = existingBreakdown.findIndex((b) => b.roomType === decodedRoomType)
  if (idx < 0) {
    return NextResponse.json<MutationResponse>(
      { success: false, affectedDays: 0, deletedDays: 0, totalTouched: 0, error: 'room_type_not_found', code: 'room_type_not_found' },
      { status: 404 },
    )
  }

  const before = existingBreakdown[idx]
  const after: RoomTypeOccupancy = {
    roomType: before.roomType,
    totalRooms: updates.totalRooms ?? before.totalRooms,
    occupiedRooms: before.occupiedRooms,  // NEVER rewrite history
    rateThb: updates.rateThb ?? before.rateThb,
  }
  const newBreakdown = existingBreakdown.slice()
  newBreakdown[idx] = after

  // rooms_available re-derives from the new breakdown when totalRooms
  // changed. revenue + rooms_sold left alone — that's yesterday's
  // result, not today's config.
  const updatePayload: Record<string, unknown> = { room_type_breakdown: newBreakdown }
  if (updates.totalRooms !== undefined) {
    updatePayload.rooms_available = newBreakdown.reduce((s, r) => s + (r.totalRooms || 0), 0)
  }

  const { error: updateErr } = await db
    .from('accommodation_daily_metrics')
    .update(updatePayload)
    .eq('id', latest.id)
  if (updateErr) {
    console.error('[rooms PATCH] update failed', updateErr)
    return NextResponse.json<MutationResponse>(
      { success: false, affectedDays: 0, deletedDays: 0, totalTouched: 0, error: updateErr.message, code: 'update_failed' },
      { status: 500 },
    )
  }

  // Mirror branches.total_rooms — same roster sum just written above,
  // via the RLS user client (see rooms/route.ts POST for rationale).
  // Only fires when totalRooms actually changed (updatePayload carries
  // rooms_available in that case); skip when the sum would be 0.
  if (updatePayload.rooms_available !== undefined && (updatePayload.rooms_available as number) > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rlsDb = auth.userClient as any
    const { data: mirrorRows, error: mirrorErr } = await rlsDb
      .from('branches')
      .update({ total_rooms: updatePayload.rooms_available })
      .eq('id', branchId)
      .select('id')
    if (mirrorErr) {
      console.error('[rooms PATCH] total_rooms mirror failed', mirrorErr)
    } else if (!mirrorRows || mirrorRows.length === 0) {
      console.error(
        '[rooms PATCH] total_rooms mirror matched 0 rows — RLS may be blocking role',
        auth.role,
        'on branch',
        branchId,
      )
    }
  }

  await db.from('audit_log').insert({
    actor_user_id: auth.userId,
    organization_id: auth.branch.organization_id,
    action: 'room_type.edited',
    target_entity: 'branch',
    target_id: branchId,
    payload: {
      room_type: decodedRoomType,
      before: { total_rooms: before.totalRooms, rate_thb: before.rateThb },
      after: { total_rooms: after.totalRooms, rate_thb: after.rateThb },
      actor_role: auth.role,
    },
  })

  return NextResponse.json<MutationResponse>({
    success: true,
    affectedDays: 1,
    deletedDays: 0,
    totalTouched: 1,
  })
}

// ─── DELETE ───────────────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ branchId: string; roomType: string }> },
) {
  const { branchId, roomType } = await ctx.params
  const decodedRoomType = decodeURIComponent(roomType)

  const auth = await authorizeRoomsMutation(branchId)
  if (!auth.ok) return auth.response

  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data: latest, error: fetchErr } = await db
    .from('accommodation_daily_metrics')
    .select('id, metric_date, room_type_breakdown')
    .eq('branch_id', branchId)
    .order('metric_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (fetchErr) {
    console.error('[rooms DELETE] fetch failed', fetchErr)
    return NextResponse.json<MutationResponse>(
      { success: false, affectedDays: 0, deletedDays: 0, totalTouched: 0, error: fetchErr.message, code: 'fetch_failed' },
      { status: 500 },
    )
  }
  if (!latest) {
    return NextResponse.json<MutationResponse>(
      { success: false, affectedDays: 0, deletedDays: 0, totalTouched: 0, error: 'no_data_row', code: 'no_data_row' },
      { status: 404 },
    )
  }

  const existingBreakdown: RoomTypeOccupancy[] = Array.isArray(latest.room_type_breakdown)
    ? (latest.room_type_breakdown as RoomTypeOccupancy[])
    : []
  if (!existingBreakdown.some((b) => b.roomType === decodedRoomType)) {
    return NextResponse.json<MutationResponse>(
      { success: false, affectedDays: 0, deletedDays: 0, totalTouched: 0, error: 'room_type_not_found', code: 'room_type_not_found' },
      { status: 404 },
    )
  }

  const newBreakdown = existingBreakdown.filter((b) => b.roomType !== decodedRoomType)
  const newRoomsAvailable = newBreakdown.reduce((s, r) => s + (r.totalRooms || 0), 0)

  const { error: updateErr } = await db
    .from('accommodation_daily_metrics')
    .update({
      room_type_breakdown: newBreakdown,
      rooms_available: newRoomsAvailable,
    })
    .eq('id', latest.id)
  if (updateErr) {
    console.error('[rooms DELETE] update failed', updateErr)
    return NextResponse.json<MutationResponse>(
      { success: false, affectedDays: 0, deletedDays: 0, totalTouched: 0, error: updateErr.message, code: 'update_failed' },
      { status: 500 },
    )
  }

  // Mirror branches.total_rooms — same roster sum just written above,
  // via the RLS user client (see rooms/route.ts POST for rationale).
  // Deliberately skipped when the last room type was just removed
  // (newRoomsAvailable === 0): total_rooms is left at its prior value
  // rather than zeroed, since 0 would break the Entry page's max
  // and read as "this hotel has no rooms" everywhere else that reads
  // it, for what's normally a transient mid-edit state.
  if (newRoomsAvailable > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rlsDb = auth.userClient as any
    const { data: mirrorRows, error: mirrorErr } = await rlsDb
      .from('branches')
      .update({ total_rooms: newRoomsAvailable })
      .eq('id', branchId)
      .select('id')
    if (mirrorErr) {
      console.error('[rooms DELETE] total_rooms mirror failed', mirrorErr)
    } else if (!mirrorRows || mirrorRows.length === 0) {
      console.error(
        '[rooms DELETE] total_rooms mirror matched 0 rows — RLS may be blocking role',
        auth.role,
        'on branch',
        branchId,
      )
    }
  }

  await db.from('audit_log').insert({
    actor_user_id: auth.userId,
    organization_id: auth.branch.organization_id,
    action: 'room_type.removed_from_config',
    target_entity: 'branch',
    target_id: branchId,
    payload: {
      room_type: decodedRoomType,
      // Forward-looking semantics — historical breakdown rows are
      // preserved. The "removed_from_config" verb makes the audit
      // entry's intent clear vs the legacy 'room_type.deleted' which
      // wiped every historical row.
      historical_rows_preserved: true,
      actor_role: auth.role,
    },
  })

  return NextResponse.json<MutationResponse>({
    success: true,
    affectedDays: 1,
    deletedDays: 0,
    totalTouched: 1,
  })
}
