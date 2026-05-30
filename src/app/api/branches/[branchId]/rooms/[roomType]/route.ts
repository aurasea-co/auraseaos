import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { RoomTypeOccupancy } from '@/lib/ingestion/types'

// DELETE /api/branches/[branchId]/rooms/[roomType]
//
// Surgically removes a single room_type from every
// accommodation_daily_metrics row in this branch:
//   - splice the entry out of the row's room_type_breakdown jsonb
//   - recompute rooms_available / rooms_sold / revenue from what's left
//   - if no room types remain, delete the entire day row
// Then log to audit_log with the affected/deleted counts.
//
// Auth: user-bound client confirms owner membership of the branch's
// org before we hand off to the service client for writes. Owner-only
// because this is destructive.

interface DeleteResponse {
  success: boolean
  affectedDays: number   // rows where the breakdown was edited and metrics recomputed
  deletedDays: number    // rows where this was the only room type so the row got removed
  totalTouched: number   // sum of the two
  error?: string
  code?: string
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ branchId: string; roomType: string }> },
) {
  const { branchId, roomType } = await ctx.params
  const decodedRoomType = decodeURIComponent(roomType)

  // ---- auth + ownership check via the user-bound client (RLS-enforced)
  const userClient = await createClient()
  const { data: userRes } = await userClient.auth.getUser()
  const user = userRes?.user
  if (!user) {
    return NextResponse.json<DeleteResponse>(
      { success: false, affectedDays: 0, deletedDays: 0, totalTouched: 0, error: 'unauthenticated', code: 'unauthenticated' },
      { status: 401 },
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ub = userClient as any
  const { data: branch } = await ub
    .from('branches')
    .select('id, organization_id, business_type')
    .eq('id', branchId)
    .maybeSingle()
  if (!branch) {
    return NextResponse.json<DeleteResponse>(
      { success: false, affectedDays: 0, deletedDays: 0, totalTouched: 0, error: 'branch_not_found', code: 'branch_not_found' },
      { status: 404 },
    )
  }
  if (branch.business_type !== 'accommodation') {
    return NextResponse.json<DeleteResponse>(
      { success: false, affectedDays: 0, deletedDays: 0, totalTouched: 0, error: 'wrong_business_type', code: 'wrong_business_type' },
      { status: 400 },
    )
  }

  // Owner-only — manage room inventory is administrative, not daily-op.
  const { data: membership } = await ub
    .from('organization_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', branch.organization_id)
    .eq('role', 'owner')
    .maybeSingle()
  if (!membership) {
    return NextResponse.json<DeleteResponse>(
      { success: false, affectedDays: 0, deletedDays: 0, totalTouched: 0, error: 'owner_only', code: 'owner_only' },
      { status: 403 },
    )
  }

  // ---- mutations through the service client to skip the RLS write
  // policy mismatch in dev environments.
  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data: dayRows, error: fetchErr } = await db
    .from('accommodation_daily_metrics')
    .select('id, metric_date, room_type_breakdown')
    .eq('branch_id', branchId)

  if (fetchErr) {
    console.error('[delete-room-type] fetch failed', fetchErr)
    return NextResponse.json<DeleteResponse>(
      { success: false, affectedDays: 0, deletedDays: 0, totalTouched: 0, error: fetchErr.message, code: 'fetch_failed' },
      { status: 500 },
    )
  }

  let affectedDays = 0
  let deletedDays = 0
  const idsToDelete: string[] = []

  for (const row of dayRows || []) {
    const breakdown: RoomTypeOccupancy[] = Array.isArray(row.room_type_breakdown) ? row.room_type_breakdown : []
    if (!breakdown.some((b) => b.roomType === decodedRoomType)) continue

    const remaining = breakdown.filter((b) => b.roomType !== decodedRoomType)
    if (remaining.length === 0) {
      idsToDelete.push(row.id)
      deletedDays++
      continue
    }

    const roomsAvailable = remaining.reduce((s, r) => s + (r.totalRooms || 0), 0)
    const roomsSold = remaining.reduce((s, r) => s + (r.occupiedRooms || 0), 0)
    const revenue = remaining.reduce((s, r) => s + (r.rateThb || 0) * (r.occupiedRooms || 0), 0)

    const { error: updateErr } = await db
      .from('accommodation_daily_metrics')
      .update({
        room_type_breakdown: remaining,
        rooms_available: roomsAvailable,
        rooms_sold: roomsSold,
        revenue,
      })
      .eq('id', row.id)

    if (updateErr) {
      console.error('[delete-room-type] update failed for row', row.id, updateErr)
      return NextResponse.json<DeleteResponse>(
        { success: false, affectedDays, deletedDays, totalTouched: affectedDays + deletedDays, error: updateErr.message, code: 'update_failed' },
        { status: 500 },
      )
    }
    affectedDays++
  }

  if (idsToDelete.length > 0) {
    const { error: deleteErr } = await db
      .from('accommodation_daily_metrics')
      .delete()
      .in('id', idsToDelete)
    if (deleteErr) {
      console.error('[delete-room-type] delete failed', deleteErr)
      return NextResponse.json<DeleteResponse>(
        { success: false, affectedDays, deletedDays: 0, totalTouched: affectedDays, error: deleteErr.message, code: 'delete_failed' },
        { status: 500 },
      )
    }
  }

  // Audit log — uses the actual column names per migrations 003 + 008
  // (actor_user_id, target_entity, payload), not the spec's alternates.
  await db.from('audit_log').insert({
    actor_user_id: user.id,
    organization_id: branch.organization_id,
    action: 'room_type.deleted',
    target_entity: 'branch',
    target_id: branchId,
    payload: {
      room_type: decodedRoomType,
      affected_days: affectedDays,
      deleted_days: deletedDays,
    },
  })

  return NextResponse.json<DeleteResponse>({
    success: true,
    affectedDays,
    deletedDays,
    totalTouched: affectedDays + deletedDays,
  })
}
