// /api/cron/push-approved-rates — hourly worker that pushes
// owner-approved rate changes from rate_approvals to whichever PMS
// each branch is configured with (Cloudbeds, Mews, etc — see
// lib/pms/factory.ts). Fired by Vercel cron at the top of every hour
// (vercel.json). Manual triggering supported via CRON_SECRET so the
// operator can re-run after deploys.
//
// Auth model — same envelope morning-flash uses:
//   - Vercel cron sends header `x-vercel-cron: 1`
//   - Manual triggers send `Authorization: Bearer $CRON_SECRET`
// Anything else returns 401.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { processApprovalsList, type PendingApprovalRow } from '@/lib/pms/worker'

const BATCH_SIZE = 50

async function handle(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // Fetch pending rows: approved by owner but not yet pushed.
  // Note: .not('approved_at', 'is', null) is the supabase-js way to
  // say "approved_at IS NOT NULL"; .is would invert the meaning.
  //
  // Pulls BOTH rate columns during the satang phaseout: the worker
  // prefers suggested_rate_satang, falls back to suggested_rate_thb
  // for legacy rows (pre-migration-038). The shape adapter below
  // projects to PendingApprovalRow.rateSatang so the worker doesn't
  // have to know about the dual columns.
  const { data: rows, error: fetchErr } = await supabase
    .from('rate_approvals')
    .select('id, branch_id, date, room_type, suggested_rate_satang, suggested_rate_thb')
    .eq('push_status', 'pending')
    .not('approved_at', 'is', null)
    .order('approved_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (fetchErr) {
    console.error('[push-approved-rates] fetch error:', fetchErr)
    return NextResponse.json({ error: 'fetch_failed', detail: fetchErr.message }, { status: 500 })
  }

  interface RawRow {
    id: string
    branch_id: string
    date: string
    room_type: string
    suggested_rate_satang: number | null
    suggested_rate_thb: number | null
  }
  const pending: PendingApprovalRow[] = ((rows ?? []) as RawRow[]).map((r) => ({
    id: r.id,
    branch_id: r.branch_id,
    date: r.date,
    room_type: r.room_type,
    suggested_rate_satang:
      r.suggested_rate_satang ??
      (r.suggested_rate_thb != null ? r.suggested_rate_thb * 100 : 0),
  }))

  if (pending.length === 0) {
    console.log('[push-approved-rates] no pending approvals — nothing to push')
    return NextResponse.json({
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      results: [],
    })
  }

  console.log(`[push-approved-rates] processing ${pending.length} approval(s)`)

  // The worker accepts our minimal WorkerSupabase surface — the real
  // supabase client satisfies it (and exposes more). Cast at the
  // boundary so the worker stays test-friendly without depending on
  // @supabase/supabase-js types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summary = await processApprovalsList(supabase as any, pending)

  console.log(
    `[push-approved-rates] done · processed=${summary.processed}` +
    ` ok=${summary.succeeded} failed=${summary.failed} skipped=${summary.skipped}`,
  )

  return NextResponse.json(summary)
}

// Both GET and POST so manual ops can curl with either verb.
export const GET = handle
export const POST = handle
