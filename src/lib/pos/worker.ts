// POS sync worker — pulls daily sales from each branch's configured
// POS provider and upserts them into fnb_daily_sales. Pure
// orchestration; the route is a thin auth wrapper around this.
//
// Architecture mirrors lib/pms/worker.ts:
//   - Cron route fetches active config rows (uses real supabase
//     client's filters) and hands the list to processConfigsList here.
//   - Worker iterates configs, calls the provider, matches each
//     POS sale row to a menu_items.id, upserts to fnb_daily_sales.
//   - DB writes go through a minimal WorkerSupabase interface so
//     tests can inject mocks without depending on
//     @supabase/supabase-js types.
//
// Matching: provider returns externalItemId / itemName per row.
// Worker resolves to menu_items.id by:
//   1. external_item_id (case-sensitive)
//   2. case-insensitive name
//   3. unknown → row skipped, recorded in summary.unknownItems

import type { PosProvider, FetchSalesResult, PosSaleRow } from './types'
import { getPosProviderForConfig, type BranchPosConfigRow } from './factory'

export interface MenuItemForMatch {
  id: string
  name: string
  external_item_id: string | null
}

export interface PendingPosConfig extends BranchPosConfigRow {
  id: string
  last_synced_at: string | null
}

export interface WorkerSupabase {
  from(table: 'menu_items' | 'fnb_daily_sales' | 'branch_pos_config'): {
    select(cols: string): {
      eq(col: string, val: unknown): {
        eq(col: string, val: unknown): Promise<{ data: unknown[] | null; error: unknown }>
      }
    }
    upsert(rows: unknown[], options: { onConflict: string }): Promise<{ error: unknown }>
    update(values: Record<string, unknown>): {
      eq(col: string, val: unknown): Promise<{ error: unknown }>
    }
  }
}

export interface ProcessConfigSummary {
  branchId: string
  provider: string
  status: 'success' | 'failed' | 'skipped' | 'no_data'
  imported: number
  unknownItems: number
  error?: string
}

export interface ProcessSummary {
  processed: number
  succeeded: number
  failed: number
  skipped: number
  noData: number
  totalImported: number
  totalUnknownItems: number
  results: ProcessConfigSummary[]
}

export interface ProcessOptions {
  /** Default 30 days for branches that have never synced; subsequent
   *  runs use last_synced_at - 1 day for overlap (catches late-
   *  arriving POS data). Configurable for tests + future tuning. */
  initialWindowDays?: number
  /** Override the provider factory — test seam. */
  providerFactory?: (config: BranchPosConfigRow | null) => PosProvider
  /** Override "today" — test seam. Default: Bangkok wall date. */
  nowBkk?: () => string
}

function bkkToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export async function processConfigsList(
  supabase: WorkerSupabase,
  configs: PendingPosConfig[],
  options: ProcessOptions = {},
): Promise<ProcessSummary> {
  const factory = options.providerFactory ?? getPosProviderForConfig
  const initialWindowDays = options.initialWindowDays ?? 30
  const nowBkk = options.nowBkk ?? bkkToday

  const summary: ProcessSummary = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    noData: 0,
    totalImported: 0,
    totalUnknownItems: 0,
    results: [],
  }

  for (const cfg of configs) {
    summary.processed += 1
    const result = await processOneConfig(supabase, cfg, factory, {
      initialWindowDays,
      todayBkk: nowBkk(),
    })
    summary.results.push(result)
    summary.totalImported += result.imported
    summary.totalUnknownItems += result.unknownItems
    if (result.status === 'success') summary.succeeded += 1
    else if (result.status === 'failed') summary.failed += 1
    else if (result.status === 'skipped') summary.skipped += 1
    else if (result.status === 'no_data') summary.noData += 1
  }

  return summary
}

interface OneOptions {
  initialWindowDays: number
  todayBkk: string
}

async function processOneConfig(
  supabase: WorkerSupabase,
  config: PendingPosConfig,
  factory: (config: BranchPosConfigRow | null) => PosProvider,
  options: OneOptions,
): Promise<ProcessConfigSummary> {
  const provider = factory(config)
  const fromDate = config.last_synced_at
    ? addDays(config.last_synced_at.slice(0, 10), -1)
    : addDays(options.todayBkk, -options.initialWindowDays)
  const toDate = options.todayBkk

  // 1) Call the provider. Failures (network, auth, rate limit) are
  //    isolated to this branch — the batch continues with the next
  //    config.
  let result: FetchSalesResult
  try {
    result = await provider.fetchSales({
      externalStoreId: config.external_store_id,
      fromDate,
      toDate,
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    await recordSyncResult(supabase, config.id, 'failed', errMsg)
    return {
      branchId: config.branch_id,
      provider: provider.name,
      status: 'failed',
      imported: 0,
      unknownItems: 0,
      error: `Provider threw: ${errMsg}`,
    }
  }

  // 2) For non-success states, record + bail. No upsert work to do.
  if (result.status !== 'success' || result.rows.length === 0) {
    const statusForRecord = result.status === 'success' ? 'success' : result.status
    // 'no_data' is also success-y in the sense that the sync completed
    // — record as success in branch_pos_config so the next run picks
    // up from the new last_synced_at.
    await recordSyncResult(
      supabase,
      config.id,
      statusForRecord === 'no_data' ? 'success' : statusForRecord,
      result.error ?? null,
    )
    return {
      branchId: config.branch_id,
      provider: provider.name,
      status: result.status,
      imported: 0,
      unknownItems: 0,
      error: result.error,
    }
  }

  // 3) Pull the branch's active menu_items catalog for matching.
  const menuRes = await supabase
    .from('menu_items')
    .select('id, name, external_item_id')
    .eq('branch_id', config.branch_id)
    .eq('is_active', true)
  const menuItems = (menuRes.data ?? []) as MenuItemForMatch[]

  const byExtId = new Map<string, string>()
  const byNameLower = new Map<string, string>()
  for (const m of menuItems) {
    if (m.external_item_id) byExtId.set(m.external_item_id, m.id)
    byNameLower.set(m.name.toLowerCase(), m.id)
  }

  // 4) Match each provider row to a menu_items.id.
  let unknown = 0
  const upsertRows = result.rows
    .map((r: PosSaleRow) => {
      let menuItemId: string | undefined
      if (r.externalItemId && byExtId.has(r.externalItemId)) {
        menuItemId = byExtId.get(r.externalItemId)
      } else if (r.itemName && byNameLower.has(r.itemName.toLowerCase())) {
        menuItemId = byNameLower.get(r.itemName.toLowerCase())
      }
      if (!menuItemId) {
        unknown += 1
        return null
      }
      return {
        branch_id: config.branch_id,
        date: r.date,
        menu_item_id: menuItemId,
        units_sold: r.unitsSold,
        source: provider.name,  // 'loyverse' / 'foodstory' / 'storehub' / 'mock'
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  if (upsertRows.length === 0) {
    await recordSyncResult(supabase, config.id, 'success', null)
    return {
      branchId: config.branch_id,
      provider: provider.name,
      status: 'no_data',
      imported: 0,
      unknownItems: unknown,
    }
  }

  // 5) Upsert into fnb_daily_sales. Idempotent on the migration 034
  //    unique (branch_id, date, menu_item_id).
  const upsertRes = await supabase
    .from('fnb_daily_sales')
    .upsert(upsertRows, { onConflict: 'branch_id,date,menu_item_id' })

  if (upsertRes.error) {
    const errMsg = JSON.stringify(upsertRes.error)
    await recordSyncResult(supabase, config.id, 'failed', errMsg)
    return {
      branchId: config.branch_id,
      provider: provider.name,
      status: 'failed',
      imported: 0,
      unknownItems: unknown,
      error: `Upsert failed: ${errMsg}`,
    }
  }

  await recordSyncResult(supabase, config.id, 'success', null)
  return {
    branchId: config.branch_id,
    provider: provider.name,
    status: 'success',
    imported: upsertRows.length,
    unknownItems: unknown,
  }
}

async function recordSyncResult(
  supabase: WorkerSupabase,
  configId: string,
  status: 'success' | 'failed' | 'skipped',
  error: string | null,
): Promise<void> {
  await supabase
    .from('branch_pos_config')
    .update({
      last_synced_at: new Date().toISOString(),
      last_sync_status: status,
      last_sync_error: error,
    })
    .eq('id', configId)
}
