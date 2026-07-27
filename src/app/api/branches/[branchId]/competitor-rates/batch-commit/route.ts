// /api/branches/[branchId]/competitor-rates/batch-commit
//
// Writes a batch of OPERATOR-CONFIRMED competitor-rate rows in one
// request. Two callers: the screenshot-review flow (after the operator
// edits/confirms draft rows from /extract) and the fast batch-entry
// grid (item 11 — many competitors × room types × one date in one
// tap). Both reuse the EXACT SAME validation/upsert/dedupe logic as
// the manual single-cell route via upsertCompetitorRate() — this file
// contains no parallel write logic, just a loop.
//
// Owner + manager (same access matrix as the manual competitor-rates
// route).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { upsertCompetitorRate, type UpsertCompetitorRateInput } from '@/lib/ratedesk/competitor-rate-write'

// Generous ceiling for one commit — a full screenshot batch or a
// same-day multi-competitor/multi-room-type/multi-channel save is
// nowhere near this (5 competitors × ~6 room types × 4 channels = 120).
const MAX_BATCH_ROWS = 300

interface AuthOk { ok: true; userId: string; organizationId: string }
interface AuthFail { ok: false; status: number; error: string }

async function authorize(branchId: string): Promise<AuthOk | AuthFail> {
  const userClient = await createClient()
  const { data: userRes } = await userClient.auth.getUser()
  const user = userRes?.user
  if (!user) return { ok: false, status: 401, error: 'unauthenticated' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ub = userClient as any
  const { data: branch } = await ub
    .from('branches')
    .select('id, organization_id, business_type')
    .eq('id', branchId)
    .maybeSingle()
  if (!branch) return { ok: false, status: 404, error: 'branch_not_found' }
  if (branch.business_type !== 'accommodation') {
    return { ok: false, status: 400, error: 'wrong_business_type' }
  }
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
  if (!ownerRow && !managerRow) return { ok: false, status: 403, error: 'forbidden_role' }
  return { ok: true, userId: user.id, organizationId: branch.organization_id }
}

interface BatchRowInput {
  competitorName?: string
  roomType?: string
  rateThb?: number
  capturedAt?: string
  channel?: string
  source?: string
  notes?: string
}

interface BatchRowResult {
  index: number
  ok: boolean
  code?: string
  messageTh?: string
  messageEn?: string
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await ctx.params
  const auth = await authorize(branchId)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: { rows?: BatchRowInput[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const inputRows = Array.isArray(body.rows) ? body.rows : []
  if (inputRows.length === 0) {
    return NextResponse.json({ error: 'empty_batch' }, { status: 400 })
  }
  if (inputRows.length > MAX_BATCH_ROWS) {
    return NextResponse.json({ error: 'batch_too_large', max: MAX_BATCH_ROWS }, { status: 400 })
  }
  // capturedAt is REQUIRED per row here (unlike the single-row manual
  // route, which defaults to Bangkok-today) — a batch commit spans a
  // screenshot's stay date or a chosen batch-entry date, and silently
  // defaulting every row to "today" would be wrong for either case.
  const missingDateAt = inputRows.findIndex((r) => !r.capturedAt)
  if (missingDateAt !== -1) {
    return NextResponse.json({ error: 'missing_captured_at', index: missingDateAt }, { status: 400 })
  }

  const svc = createServiceClient()

  // Sequential, not parallel — upsertCompetitorRate's MAX_COMPETITORS
  // check re-reads current distinct names on every call, so a batch
  // introducing two brand-new competitor names must process one at a
  // time for the cap to be enforced across the whole set correctly
  // (a parallel Promise.all would race the same "distinct count" read
  // and could let both through, or wrongly reject both).
  const results: BatchRowResult[] = []
  for (let i = 0; i < inputRows.length; i++) {
    const r = inputRows[i]
    const input: UpsertCompetitorRateInput = {
      branchId,
      competitorName: r.competitorName,
      roomType: r.roomType,
      rateThb: r.rateThb,
      capturedAt: r.capturedAt as string,
      channel: r.channel,
      source: r.source,
      notes: r.notes,
    }
    // eslint-disable-next-line no-await-in-loop
    const result = await upsertCompetitorRate(svc, input)
    results.push(
      result.ok
        ? { index: i, ok: true }
        : { index: i, ok: false, code: result.code, messageTh: result.messageTh, messageEn: result.messageEn },
    )
  }

  const succeeded = results.filter((r) => r.ok).length

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = svc as any
  await db.from('audit_log').insert({
    actor_user_id: auth.userId,
    organization_id: auth.organizationId,
    action: 'competitor_rates.batch_commit',
    target_entity: 'competitor_rates',
    target_id: null,
    payload: { branch_id: branchId, submitted: inputRows.length, succeeded, failed: inputRows.length - succeeded },
  })

  return NextResponse.json({ succeeded, failed: inputRows.length - succeeded, results })
}
