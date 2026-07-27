import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { upsertCompetitorRate, MAX_COMPETITORS } from '@/lib/ratedesk/competitor-rate-write'

// /api/branches/[branchId]/competitor-rates
//
// GET    — list competitors with the latest rate per room type
// POST   — add a new competitor (placeholder row) or upsert a rate
//          for an existing one (date defaults to Bangkok today)
// DELETE — remove all rate rows for the given competitor name
//          (query param ?competitor=...)
//
// Owner + manager. The page at /ratedesk/competitors is the only caller.

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
    // Most-recent rate EVER recorded per (room_type, channel) cell —
    // distinct from todayRates below. Lets the batch-entry grid
    // prefill "what we last saw" as a suggestion even when today has
    // no entry yet, so an unchanged competitor is one tap to confirm
    // rather than a blank field. c.rates is already in captured_at DESC
    // order (same order the branch-wide query returned), so the FIRST
    // row seen for a given key is its most recent one.
    const lastRates: Record<string, number> = {}
    for (const r of c.rates) {
      const ch = r.channel || 'ota'
      const rateNum = Number(r.rate)
      if (!Number.isFinite(rateNum) || rateNum <= 0) continue
      const key = `${r.room_type}|${ch}`
      if (!(key in lastRates)) lastRates[key] = rateNum
      if (r.captured_at === todayBkk) todayRates[key] = rateNum
    }
    return {
      competitorName: c.competitorName,
      lastRateThb: c.latestRateRow ? Number(c.latestRateRow.rate) : null,
      lastRateRoomType: c.latestRateRow?.room_type ?? null,
      lastRateCapturedAt: c.latestRateRow?.captured_at ?? null,
      lastUpdatedAt: c.lastCreatedAt,
      todayRates,
      lastRates,
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

  // Validation + upsert logic lives in competitor-rate-write.ts so the
  // screenshot-extraction batch-commit route can reuse the exact same
  // rules instead of a second, divergent copy — see that file's header.
  const result = await upsertCompetitorRate(createServiceClient(), {
    branchId,
    competitorName: body.competitorName,
    roomType: body.roomType,
    rateThb: body.rateThb,
    capturedAt: body.capturedAt || bkkToday(),
    channel: body.channel,
    source: body.source,
    notes: body.notes,
  })
  if (!result.ok) return bail(result.status, result.code, result.messageTh, result.messageEn)
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
