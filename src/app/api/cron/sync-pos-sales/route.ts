// /api/cron/sync-pos-sales — nightly worker that pulls daily sales
// from each active POS-configured branch and upserts them into
// fnb_daily_sales. Fired by Vercel cron at 02:00 UTC (~09:00 BKK) so
// the data is ready when the owner opens MenuDesk for the morning
// review. Manual triggering supported via CRON_SECRET for ops.
//
// Auth model — same envelope as the other cron routes:
//   - Vercel cron sends `x-vercel-cron: 1`
//   - Manual triggers send `Authorization: Bearer $CRON_SECRET`

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { processConfigsList, type PendingPosConfig } from '@/lib/pos/worker'

async function handle(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // Pull all active POS configs. Order by last_synced_at NULLS FIRST
  // so brand-new configurations get their initial 30-day backfill
  // ahead of incremental syncs.
  const { data: configs, error: fetchErr } = await supabase
    .from('branch_pos_config')
    .select('id, branch_id, provider, external_store_id, is_active, last_synced_at')
    .eq('is_active', true)
    .order('last_synced_at', { ascending: true, nullsFirst: true })

  if (fetchErr) {
    console.error('[sync-pos-sales] fetch error:', fetchErr)
    return NextResponse.json({ error: 'fetch_failed', detail: fetchErr.message }, { status: 500 })
  }

  const pending = (configs ?? []) as PendingPosConfig[]

  if (pending.length === 0) {
    console.log('[sync-pos-sales] no active POS configs — nothing to sync')
    return NextResponse.json({
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      noData: 0,
      totalImported: 0,
      totalUnknownItems: 0,
      results: [],
    })
  }

  console.log(`[sync-pos-sales] syncing ${pending.length} active config(s)`)

  // The worker accepts our minimal WorkerSupabase surface. Cast at
  // the boundary so the worker stays test-friendly without depending
  // on @supabase/supabase-js types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summary = await processConfigsList(supabase as any, pending)

  console.log(
    `[sync-pos-sales] done · processed=${summary.processed}` +
    ` ok=${summary.succeeded} failed=${summary.failed}` +
    ` skipped=${summary.skipped} no_data=${summary.noData}` +
    ` rows=${summary.totalImported} unknown_items=${summary.totalUnknownItems}`,
  )

  return NextResponse.json(summary)
}

export const GET = handle
export const POST = handle
