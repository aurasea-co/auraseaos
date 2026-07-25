import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// /api/branches/[branchId]/competitor-rates
//
// GET    — list competitors with the latest rate per room type
// POST   — add a new competitor (placeholder row) or upsert a rate
//          for an existing one (date defaults to Bangkok today)
// DELETE — remove all rate rows for the given competitor name
//          (query param ?competitor=...)
//
// Owner + manager. The page at /ratedesk/competitors is the only caller.

const MAX_COMPETITORS = 5

interface CompetitorRow {
  competitor_name: string
  room_type: string
  rate: number
  captured_at: string
  created_at: string
  channel?: string | null
  source?: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────

async function authorize(branchId: string) {
  const userClient = await createClient()
  const { data: userRes } = await userClient.auth.getUser()
  const user = userRes?.user
  if (!user) return { ok: false as const, status: 401, error: 'unauthenticated' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ub = userClient as any
  const { data: branch } = await ub
    .from('branches')
    .select('id, organization_id, business_type')
    .eq('id', branchId)
    .maybeSingle()
  if (!branch) return { ok: false as const, status: 404, error: 'branch_not_found' }
  if (branch.business_type !== 'accommodation') {
    return { ok: false as const, status: 400, error: 'wrong_business_type' }
  }
  // Owner + manager — mirrors the RateDesk access matrix
  // (ratedesk_competitors). Schema reality (see invite/accept/route.ts
  // and get-user-context.ts): organization_members holds OWNERS ONLY —
  // the live CHECK constraint rejects any other role — while invited
  // managers live in branch_members with role 'manager' (legacy rows:
  // 'branch_manager'). So: org ownership grants access to every branch
  // in the org; manager access is per-branch via branch_members, which
  // also keeps multi-tenancy intact (a manager from another org has no
  // row for this branch_id).
  const [{ data: ownerRow }, { data: managerRow }] = await Promise.all([
    ub
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', branch.organization_id)
      .eq('role', 'owner')
      .maybeSingle(),
    ub
      .from('branch_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('branch_id', branchId)
      .in('role', ['manager', 'branch_manager'])
      .maybeSingle(),
  ])
  if (!ownerRow && !managerRow) {
    return { ok: false as const, status: 403, error: 'forbidden_role' }
  }
  // Hand back the RLS user client so GET can read through it instead of
  // the service role — members_read_competitor_rates (migration 029) is
  // already branch/org-membership scoped (not owner-only), so this is
  // the same access the role check above already grants, just enforced
  // at the DB layer too rather than solely by app logic.
  return { ok: true as const, user, branch, supabase: userClient }
}

function bkkToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function bail(status: number, code: string, messageTh: string, messageEn: string) {
  return NextResponse.json({ error: code, code, messageTh, messageEn }, { status })
}

// ─── GET ──────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, ctx: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await ctx.params
  const auth = await authorize(branchId)
  if (!auth.ok) return bail(auth.status, auth.error, '', '')

  // RLS user client, not service role — members_read_competitor_rates
  // (branch/org membership, not owner-scoped) is the actual enforcement
  // for viewing; the role check in authorize() just gives a clean 403
  // instead of a silent empty list for a genuinely unauthorized caller.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = auth.supabase as any
  const { data, error } = await db
    .from('competitor_rates')
    .select('competitor_name, room_type, rate, captured_at, created_at, channel, source')
    .eq('branch_id', branchId)
    .order('captured_at', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[competitor-rates] GET failed', error)
    return bail(500, 'fetch_failed', '', error.message)
  }

  // Group by competitor name. Each competitor carries its latest non-zero
  // rate row (across any room type) for the "last known rate" column, plus
  // the most recent capture timestamp so the UI can show "X hours ago".
  const rows: CompetitorRow[] = data || []
  const byName = new Map<string, {
    competitorName: string
    latestRateRow: CompetitorRow | null
    lastCapturedAt: string | null
    lastCreatedAt: string | null
    rates: CompetitorRow[]
  }>()
  for (const r of rows) {
    const existing = byName.get(r.competitor_name) || {
      competitorName: r.competitor_name,
      latestRateRow: null,
      lastCapturedAt: null,
      lastCreatedAt: null,
      rates: [] as CompetitorRow[],
    }
    existing.rates.push(r)
    if (!existing.lastCreatedAt || r.created_at > existing.lastCreatedAt) {
      existing.lastCapturedAt = r.captured_at
      existing.lastCreatedAt = r.created_at
    }
    if (!existing.latestRateRow && Number(r.rate) > 0) existing.latestRateRow = r
    byName.set(r.competitor_name, existing)
  }

  // Surface every (room_type, channel) rate captured TODAY so the
  // multi-channel grid in /ratedesk/competitors can pre-fill its
  // inputs without a second round-trip. Keyed by `${roomType}|${channel}`
  // because object-of-object adds two layers of optional-chaining
  // pain in the client; a flat string key is simpler.
  const todayBkk = bkkToday()
  const competitors = Array.from(byName.values()).map((c) => {
    const todayRates: Record<string, number> = {}
    for (const r of c.rates) {
      if (r.captured_at !== todayBkk) continue
      const ch = r.channel || 'ota'
      const rateNum = Number(r.rate)
      if (!Number.isFinite(rateNum) || rateNum <= 0) continue
      todayRates[`${r.room_type}|${ch}`] = rateNum
    }
    return {
      competitorName: c.competitorName,
      lastRateThb: c.latestRateRow ? Number(c.latestRateRow.rate) : null,
      lastRateRoomType: c.latestRateRow?.room_type ?? null,
      lastRateCapturedAt: c.latestRateRow?.captured_at ?? null,
      lastUpdatedAt: c.lastCreatedAt,
      todayRates,
    }
  })

  return NextResponse.json({ competitors, maxCompetitors: MAX_COMPETITORS })
}

// ─── POST ─────────────────────────────────────────────────────────────────

interface PostBody {
  competitorName?: string
  roomType?: string
  /** THB. When absent, a placeholder row is written so the competitor
   *  appears in the list before the owner enters any real rates. */
  rateThb?: number
  /** ISO YYYY-MM-DD; defaults to BKK today. */
  capturedAt?: string
  /** Rate channel — defaults to 'ota' to match the existing UX where
   *  the daily check captures Agoda/Booking online rates. */
  channel?: 'ota' | 'walk_in' | 'package' | 'promo'
  /** Free-text label for where the rate was seen ("Agoda", "Booking
   *  phone call", etc). Falls back to a channel-appropriate default. */
  source?: string
  /** Optional free-text notes from staff. */
  notes?: string
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await ctx.params
  const auth = await authorize(branchId)
  if (!auth.ok) return bail(auth.status, auth.error, '', '')

  let body: PostBody
  try {
    body = await req.json()
  } catch {
    return bail(400, 'invalid_json', 'ข้อมูลที่ส่งมาไม่ถูกต้อง', 'Invalid JSON in request body')
  }
  const competitorName = (body.competitorName || '').trim()
  if (!competitorName) {
    return bail(
      400,
      'missing_competitor_name',
      'กรุณากรอกชื่อคู่แข่ง',
      'Competitor name is required',
    )
  }
  if (competitorName.length > 80) {
    return bail(
      400,
      'name_too_long',
      'ชื่อคู่แข่งยาวเกินไป (สูงสุด 80 ตัวอักษร)',
      'Competitor name is too long (max 80 chars)',
    )
  }
  const roomType = (body.roomType || 'Standard').trim() || 'Standard'
  const rateThb = body.rateThb != null ? Number(body.rateThb) : 0
  if (Number.isNaN(rateThb) || rateThb < 0) {
    return bail(400, 'invalid_rate', 'ราคาไม่ถูกต้อง', 'Rate must be a non-negative number')
  }
  const capturedAt = body.capturedAt || bkkToday()

  // Channel + source. Channel defaults to 'ota' (matches the existing
  // UX where daily checks track Agoda/Booking). Source defaults to a
  // channel-appropriate label when the caller doesn't pass one. Both
  // get validated lightly — channel against the migration's CHECK
  // constraint set, source clamped to 200 chars.
  const ALLOWED_CHANNELS: ReadonlyArray<string> = ['ota', 'walk_in', 'package', 'promo']
  const channel = body.channel && ALLOWED_CHANNELS.includes(body.channel) ? body.channel : 'ota'
  const defaultSourceByChannel: Record<string, string> = {
    ota: 'Manual — Agoda/Booking check',
    walk_in: 'Manual — phone/front desk',
    package: 'Manual entry',
    promo: 'Manual entry',
  }
  const source = (body.source && body.source.trim().slice(0, 200)) || defaultSourceByChannel[channel]
  const notes = body.notes ? body.notes.trim().slice(0, 500) : null

  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // Enforce MAX_COMPETITORS — count distinct names already on file
  // for this branch. Cheap because every owner caps out at 5.
  const { data: existingNames } = await db
    .from('competitor_rates')
    .select('competitor_name')
    .eq('branch_id', branchId)
  const distinct = new Set<string>((existingNames || []).map((r: { competitor_name: string }) => r.competitor_name))
  if (!distinct.has(competitorName) && distinct.size >= MAX_COMPETITORS) {
    return bail(
      400,
      'max_competitors',
      `เพิ่มได้สูงสุด ${MAX_COMPETITORS} คู่แข่ง — กรุณาลบรายการเก่าก่อน`,
      `Maximum ${MAX_COMPETITORS} competitors allowed — remove an existing one first.`,
    )
  }

  const { error: upsertErr } = await db
    .from('competitor_rates')
    .upsert(
      {
        branch_id: branchId,
        competitor_name: competitorName,
        room_type: roomType,
        rate: rateThb,
        captured_at: capturedAt,
        channel,
        source,
        notes,
      },
      // onConflict updated to include channel (migration 033) so
      // re-entering the walk-in rate doesn't clobber the day's OTA rate
      // (and vice versa).
      { onConflict: 'branch_id,competitor_name,room_type,channel,captured_at' },
    )

  if (upsertErr) {
    console.error('[competitor-rates] upsert failed', upsertErr)
    // 42P10 = no_unique_or_exclusion_constraint — migration 033 hasn't
    // been applied yet (or 030 is partially rolled back). Surface a
    // clear hint with both possible fixes.
    const hintTh =
      upsertErr.code === '42P10'
        ? 'ตารางยังไม่มี unique constraint — กรุณารัน migration 033'
        : 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
    const hintEn =
      upsertErr.code === '42P10'
        ? 'Database is missing the unique constraint — apply migration 033.'
        : 'Failed to save the rate. Please try again.'
    return bail(500, upsertErr.code || 'upsert_failed', hintTh, hintEn)
  }

  return NextResponse.json({ success: true })
}

// ─── DELETE ───────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await ctx.params
  const auth = await authorize(branchId)
  if (!auth.ok) return bail(auth.status, auth.error, '', '')

  const competitorName = req.nextUrl.searchParams.get('competitor')?.trim() || ''
  if (!competitorName) {
    return bail(400, 'missing_competitor', 'กรุณาระบุชื่อคู่แข่ง', 'Competitor name is required')
  }

  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { error: deleteErr, count } = await db
    .from('competitor_rates')
    .delete({ count: 'exact' })
    .eq('branch_id', branchId)
    .eq('competitor_name', competitorName)
  if (deleteErr) {
    console.error('[competitor-rates] delete failed', deleteErr)
    return bail(500, 'delete_failed', 'ลบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', deleteErr.message)
  }
  return NextResponse.json({ success: true, deleted: count ?? 0 })
}
