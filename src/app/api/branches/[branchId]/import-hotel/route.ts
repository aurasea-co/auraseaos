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
  // Top-level error block for HTTP / auth / validation failures the
  // parser doesn't emit (invalid_json, csv_required, unauthenticated,
  // branch_not_found, wrong_business_type, upsert_failed,
  // binary_file_detected). Lets the client render a consistent
  // friendly message without crashing on missing array fields.
  routeError?: { code: string; messageTh: string; messageEn: string }
}

// Empty envelope used by every early-bail path. Guarantees
// `warnings` and `errors` are always arrays so the client can call
// .length without checking.
function envelopeError(
  code: string,
  messageTh: string,
  messageEn: string,
): ImportResponse {
  return {
    success: false,
    daysWritten: 0,
    daysParsed: 0,
    warnings: [],
    errors: [],
    routeError: { code, messageTh, messageEn },
  }
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
    return NextResponse.json(
      envelopeError(
        'invalid_json',
        'ข้อมูลที่ส่งมาไม่ถูกต้อง',
        'Request body could not be read as JSON.',
      ),
      { status: 400 },
    )
  }
  if (typeof body.csv !== 'string' || body.csv.trim().length === 0) {
    return NextResponse.json(
      envelopeError(
        'csv_required',
        'ไม่พบเนื้อหา CSV — กรุณาเลือกไฟล์ก่อน',
        'CSV content is required — please choose a file first.',
      ),
      { status: 400 },
    )
  }

  // Defense in depth — if the client check is bypassed and a binary
  // file (.numbers / .xlsx, which are ZIP archives) gets here, the
  // string will start with the ZIP magic 'PK\x03\x04' (decoded as
  // 'PK' followed by control bytes). The parser would otherwise
  // produce "missing column 'date'" — a useless error for the owner.
  if (body.csv.length >= 2 && body.csv.charCodeAt(0) === 0x50 && body.csv.charCodeAt(1) === 0x4b) {
    return NextResponse.json(
      envelopeError(
        'binary_file_detected',
        'ไฟล์นี้ดูเหมือนเป็น .numbers หรือ .xlsx — กรุณา Export เป็น CSV ก่อน',
        'This looks like a .numbers or .xlsx file — please export to CSV first.',
      ),
      { status: 400 },
    )
  }

  // Auth + branch ownership check via the user-bound client so RLS
  // confirms membership before we let the service client write.
  const userClient = await createClient()
  const { data: userRes } = await userClient.auth.getUser()
  const user = userRes?.user
  if (!user) {
    return NextResponse.json(
      envelopeError(
        'unauthenticated',
        'กรุณาเข้าสู่ระบบใหม่อีกครั้ง',
        'Your session has expired — please sign in again.',
      ),
      { status: 401 },
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ub = userClient as any
  const { data: branch } = await ub
    .from('branches')
    .select('id, business_type, organization_id')
    .eq('id', branchId)
    .maybeSingle()
  if (!branch) {
    // RLS hid it, or it doesn't exist. Both shapes → 404.
    return NextResponse.json(
      envelopeError(
        'branch_not_found',
        'ไม่พบสาขา หรือคุณไม่มีสิทธิ์เข้าถึงสาขานี้',
        'Branch not found, or you do not have access to it.',
      ),
      { status: 404 },
    )
  }
  if (branch.business_type !== 'accommodation') {
    return NextResponse.json(
      envelopeError(
        'wrong_business_type',
        'การนำเข้านี้ใช้ได้เฉพาะสาขาประเภทโรงแรม / รีสอร์ทเท่านั้น',
        'Hotel CSV import is only available for accommodation branches.',
      ),
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
    const response: ImportResponse = {
      ...envelopeError(
        'upsert_failed',
        'บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
        'Failed to save the imported data. Please try again.',
      ),
      // Surface the parser's warnings even though the write failed —
      // they may still be useful context for the owner.
      warnings: parsed.warnings,
      daysParsed: parsed.days.length,
    }
    return NextResponse.json(response, { status: 500 })
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
