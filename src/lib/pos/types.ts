// POS provider contract. Parallel of lib/pms/types.ts but for the
// opposite data direction:
//
//   PMS providers PUSH rate approvals OUT of Aurasea.
//   POS providers PULL sales data INTO Aurasea.
//
// Implemented by LoyverseProvider, FoodStoryProvider, StorehubProvider,
// and the MockProvider used in environments without real credentials.
// The sync worker (lib/pos/worker.ts) speaks only this interface, so
// adding a new POS is a single file + a factory entry — never a worker
// rewrite.
//
// THB integers throughout — matches AURASEA_HOUSE_STYLE.md. The raw
// POS APIs typically return values in their own units (cents,
// decimal); the adapter is responsible for converting before the
// worker sees the data.

export type PosProviderName = 'loyverse' | 'foodstory' | 'storehub' | 'mock'

export interface FetchSalesInput {
  /** Provider-specific store / outlet identifier from
   *  branch_pos_config.external_store_id. */
  externalStoreId: string

  /** Inclusive YYYY-MM-DD start of the window to fetch. The worker
   *  computes this from last_synced_at (with 1-day overlap to catch
   *  late-arriving data); first sync uses a wider 30-day window. */
  fromDate: string

  /** Inclusive YYYY-MM-DD end of the window. Usually today (BKK). */
  toDate: string
}

export interface PosSaleRow {
  /** YYYY-MM-DD, normalized to Bangkok wall date by the adapter. */
  date: string
  /** Provider-specific item ID. Worker matches to menu_items via
   *  menu_items.external_item_id first, then by name. */
  externalItemId?: string
  /** Item display name as the POS reports it. Used as fallback when
   *  externalItemId doesn't resolve to a menu_items row. */
  itemName?: string
  /** Aggregated units sold for this (date × item) across all sales
   *  events that day. POS APIs typically return one event per
   *  transaction; the adapter is responsible for grouping. */
  unitsSold: number
}

export interface FetchSalesResult {
  status: 'success' | 'failed' | 'skipped' | 'no_data'
  /** Rows the worker should upsert into fnb_daily_sales. Empty array
   *  for 'no_data' / 'failed' / 'skipped'. */
  rows: PosSaleRow[]
  /** Provider-side reference for audit (sync ID, request ID). When
   *  success, stored in audit_log.payload for cross-referencing. */
  externalRef?: string
  /** Human-readable error / skip reason. Stored in
   *  branch_pos_config.last_sync_error so the owner sees it in the
   *  settings UI when the next sync UI ships. */
  error?: string
}

export interface PosProvider {
  readonly name: PosProviderName
  /** Idempotency: re-running fetchSales for the same window returns
   *  the same data (the worker dedupes at the upsert layer via the
   *  unique constraint on fnb_daily_sales). Adapters that have rate
   *  limits should respect them via exponential backoff; the worker
   *  catches thrown errors and treats them as 'failed' for that
   *  branch without aborting the whole sync run. */
  fetchSales(input: FetchSalesInput): Promise<FetchSalesResult>
}
