import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseHotelCsv } from '@/lib/ingestion/csv-hotel'
import type { CanonicalHotelDay } from '@/lib/ingestion/types'

// POST /api/branches/[branchId]/import-hotel
//   body: { csv: string }
//
// Parses the uploaded CSV via the hotel adapter and upserts one
// accommodation_daily_metrics row per date. Idempotent — re-importing
// the same CSV produces the same rows because the unique constraint
// on (branch_id, metric_date) collapses duplicates.
//
// Auth: the caller must be a member (any role) of the org that owns
// the branch. We resolve membership via the user-bound client first
// (RLS-enforced) and then switch to the service client for the
// actual upsert so the write doesn't fight RLS write policies.

interface Body {
  csv?: string
}

interface ImportResponse {
  success: boolean
  daysWritten: number
  daysParsed: number
  warnings: ReturnType<typeof parseHotelCsv>['warnings']
  errors: ReturnType<typeof parseHotelCsv>['errors']
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ branchId: string }> },
) {
  const { branchId } = await ctx.params

  let body: Body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  if (typeof body.csv !== 'string' || body.csv.trim().length === 0) {
    return NextResponse.json({ error: 'csv_required' }, { status: 400 })
  }

  // Auth + branch ownership check via the user-bound client so RLS
  // confirms membership before we let the service client write.
  const userClient = await createClient()
  const { data: userRes } = await userClient.auth.getUser()
  const user = userRes?.user
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ub = userClient as any
  const { data: branch } = await ub
    .from('branches')
    .select('id, business_type, organization_id')
    .eq('id', branchId)
    .maybeSingle()
  if (!branch) {
    // RLS hid it, or it doesn't exist. Both shapes → 404.
    return NextResponse.json({ error: 'branch_not_found' }, { status: 404 })
  }
  if (branch.business_type !== 'accommodation') {
    return NextResponse.json(
      {
        error: 'wrong_business_type',
        message: 'Hotel CSV import is only available for accommodation branches.',
      },
      { status: 400 },
    )
  }

  const parsed = parseHotelCsv(body.csv)
  if (parsed.errors.length > 0) {
    const response: ImportResponse = {
      success: false,
      daysWritten: 0,
      daysParsed: parsed.days.length,
      warnings: parsed.warnings,
      errors: parsed.errors,
    }
    return NextResponse.json(response, { status: 422 })
  }
  if (parsed.days.length === 0) {
    const response: ImportResponse = {
      success: false,
      daysWritten: 0,
      daysParsed: 0,
      warnings: parsed.warnings,
      errors: [
        {
          row: 0,
          code: 'empty_file',
          messageTh: 'ไม่มีข้อมูลให้นำเข้า',
          messageEn: 'No rows to import',
        },
      ],
    }
    return NextResponse.json(response, { status: 422 })
  }

  // Write with the service client — bypasses the RLS write policy so
  // we don't need a duplicate "members can write accommodation_daily_metrics"
  // policy carved out for this route.
  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const rows = parsed.days.map((d: CanonicalHotelDay) => {
    const totalRooms = d.roomTypeBreakdown.reduce((acc, r) => acc + r.totalRooms, 0)
    const roomsSold = d.roomTypeBreakdown.reduce((acc, r) => acc + r.occupiedRooms, 0)
    return {
      branch_id: branchId,
      metric_date: d.date,
      total_rooms: totalRooms,
      rooms_sold: roomsSold,
      revenue: d.totalRevenueThb,
      room_type_breakdown: d.roomTypeBreakdown,
    }
  })

  const { error: upsertErr } = await db
    .from('accommodation_daily_metrics')
    .upsert(rows, { onConflict: 'branch_id,metric_date' })

  if (upsertErr) {
    return NextResponse.json(
      {
        error: 'upsert_failed',
        message: upsertErr.message,
        warnings: parsed.warnings,
        daysParsed: parsed.days.length,
      },
      { status: 500 },
    )
  }

  const response: ImportResponse = {
    success: true,
    daysWritten: rows.length,
    daysParsed: parsed.days.length,
    warnings: parsed.warnings,
    errors: [],
  }
  return NextResponse.json(response)
}
