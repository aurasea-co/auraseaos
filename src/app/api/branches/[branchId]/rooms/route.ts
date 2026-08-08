// POST /api/branches/[branchId]/rooms
//
// Adds a new room type to the branch's room configuration. Per the
// "edit-the-latest-breakdown" model (see settings/rooms page comment):
//   - finds the MOST RECENT accommodation_daily_metrics row for the
//     branch
//   - appends { roomType, totalRooms, occupiedRooms: 0, rateThb } to
//     that row's room_type_breakdown jsonb
//   - rolls rooms_available up to match (revenue/rooms_sold untouched
//     since occupiedRooms is 0 for the new type today)
//   - going forward, new daily rows naturally inherit the type list
//     (CSV imports + manual entry feed the latest config)
//
// owner OR manager (org or branch level); staff get 403.
// Validates: roomType non-empty + unique within latest breakdown;
// totalRooms integer ≥ 0; rateThb integer ≥ 0 (THB — matches the
// existing jsonb shape).

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { authorizeRoomsMutation } from './_auth'
import type { RoomTypeOccupancy } from '@/lib/ingestion/types'

const MAX_NAME_LEN = 80

export async function POST(req: NextRequest, ctx: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await ctx.params
  const auth = await authorizeRoomsMutation(branchId)
  if (!auth.ok) return auth.response

  let body: { roomType?: unknown; totalRooms?: unknown; rateThb?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'invalid_json', code: 'invalid_json' },
      { status: 400 },
    )
  }

  const roomType = typeof body.roomType === 'string' ? body.roomType.trim() : ''
  if (!roomType) {
    return NextResponse.json(
      { success: false, error: 'room_type_required', code: 'room_type_required' },
      { status: 400 },
    )
  }
  if (roomType.length > MAX_NAME_LEN) {
    return NextResponse.json(
      { success: false, error: 'room_type_too_long', code: 'room_type_too_long' },
      { status: 400 },
    )
  }
  const totalRooms = Number(body.totalRooms)
  if (!Number.isFinite(totalRooms) || totalRooms < 0 || !Number.isInteger(totalRooms)) {
    return NextResponse.json(
      { success: false, error: 'total_rooms_invalid', code: 'total_rooms_invalid' },
      { status: 400 },
    )
  }
  const rateThb = Number(body.rateThb)
  if (!Number.isFinite(rateThb) || rateThb < 0) {
    return NextResponse.json(
      { success: false, error: 'rate_invalid', code: 'rate_invalid' },
      { status: 400 },
    )
  }
  const rateThbInt = Math.round(rateThb)

  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // Pull the LATEST accommodation row for the branch (the user-facing
  // "current configuration"). When no row exists at all — a brand new
  // branch with no daily data yet — we create a stub row anchored at
  // today (BKK) so the config has somewhere to live.
  const { data: latest, error: fetchErr } = await db
    .from('accommodation_daily_metrics')
    .select('id, metric_date, room_type_breakdown, rooms_available, rooms_sold, revenue')
    .eq('branch_id', branchId)
    .order('metric_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (fetchErr) {
    console.error('[rooms POST] fetch failed', fetchErr)
    return NextResponse.json(
      { success: false, error: fetchErr.message, code: 'fetch_failed' },
      { status: 500 },
    )
  }

  const existingBreakdown: RoomTypeOccupancy[] = Array.isArray(latest?.room_type_breakdown)
    ? (latest.room_type_breakdown as RoomTypeOccupancy[])
    : []
  if (existingBreakdown.some((b) => b.roomType.toLowerCase() === roomType.toLowerCase())) {
    return NextResponse.json(
      { success: false, error: 'room_type_duplicate', code: 'room_type_duplicate' },
      { status: 409 },
    )
  }

  const newEntry: RoomTypeOccupancy = {
    roomType,
    totalRooms,
    occupiedRooms: 0,
    rateThb: rateThbInt,
  }
  const newBreakdown = [...existingBreakdown, newEntry]
  const newRoomsAvailable = newBreakdown.reduce((s, r) => s + (r.totalRooms || 0), 0)

  if (latest) {
    // Update the existing latest row. rooms_sold + revenue are
    // forward-looking-only — we don't touch them because adding a
    // type today doesn't retroactively sell anything.
    const { error: updateErr } = await db
      .from('accommodation_daily_metrics')
      .update({
        room_type_breakdown: newBreakdown,
        rooms_available: newRoomsAvailable,
      })
      .eq('id', latest.id)
    if (updateErr) {
      console.error('[rooms POST] update failed', updateErr)
      return NextResponse.json(
        { success: false, error: updateErr.message, code: 'update_failed' },
        { status: 500 },
      )
    }
  } else {
    // No accommodation_daily_metrics row yet — create one anchored on
    // today (BKK). occupiedRooms=0 + revenue=0 is fine: this is just
    // a config carrier until the operator enters today's data.
    const todayBkk = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
    const { error: insertErr } = await db
      .from('accommodation_daily_metrics')
      .insert({
        branch_id: branchId,
        metric_date: todayBkk,
        room_type_breakdown: newBreakdown,
        rooms_available: newRoomsAvailable,
        rooms_sold: 0,
        revenue: 0,
      })
    if (insertErr) {
      console.error('[rooms POST] insert failed', insertErr)
      return NextResponse.json(
        { success: false, error: insertErr.message, code: 'insert_failed' },
        { status: 500 },
      )
    }
  }

  // Mirror branches.total_rooms from the roster sum we just computed.
  // Reuses newRoomsAvailable — no second query. Goes through the RLS
  // user client (not the service client above) so this is subject to
  // the same owner/manager branch-update policy as everything else a
  // manager does; skip when the roster would sum to 0 (e.g. a brand
  // new, still-empty config) rather than writing a misleading 0.
  if (newRoomsAvailable > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rlsDb = auth.userClient as any
    const { data: mirrorRows, error: mirrorErr } = await rlsDb
      .from('branches')
      .update({ total_rooms: newRoomsAvailable })
      .eq('id', branchId)
      .select('id')
    if (mirrorErr) {
      console.error('[rooms POST] total_rooms mirror failed', mirrorErr)
    } else if (!mirrorRows || mirrorRows.length === 0) {
      console.error(
        '[rooms POST] total_rooms mirror matched 0 rows — RLS may be blocking role',
        auth.role,
        'on branch',
        branchId,
      )
    }
  }

  await db.from('audit_log').insert({
    actor_user_id: auth.userId,
    organization_id: auth.branch.organization_id,
    action: 'room_type.added',
    target_entity: 'branch',
    target_id: branchId,
    payload: {
      room_type: roomType,
      total_rooms: totalRooms,
      rate_thb: rateThbInt,
      actor_role: auth.role,
    },
  })

  return NextResponse.json({
    success: true,
    roomType,
    totalRooms,
    rateThb: rateThbInt,
  })
}
