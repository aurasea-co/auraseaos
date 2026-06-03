// PMS provider contract. Implemented by Cloudbeds, Mews, SiteMinder,
// etc — and by MockProvider for environments without real credentials.
// The push worker (lib/pms/worker.ts) speaks only this interface, so
// adding a new PMS is a single file + a factory entry, never a worker
// rewrite.

export type ProviderName = 'cloudbeds' | 'mews' | 'siteminder' | 'opera' | 'mock'

// All possible values of rate_approvals.push_status (DB CHECK matches).
export type PushStatus = 'pending' | 'success' | 'failed' | 'skipped'

// Subset a provider can return — 'pending' is the initial state, never
// a push result. Keeping this tighter than PushStatus prevents a buggy
// provider from accidentally re-flagging a row as pending and looping
// forever through the hourly cron.
export type ProviderPushStatus = Exclude<PushStatus, 'pending'>

export interface PushRateInput {
  /** RateDesk rate_approvals.id — passed through so the worker can
   *  correlate provider responses with the row to update. */
  approvalId: string

  /** Provider-specific property identifier from branch_pms_config. */
  externalPropertyId: string

  /** Date the new rate applies to (YYYY-MM-DD, Bangkok wall time). */
  date: string

  /** Room type the rate applies to. With the per-room-type flow
   *  this is always the actual type ('Suite', 'Deluxe2', etc.).
   *  Legacy 'all' values from pre-038 rows are still possible until
   *  those rows expire (~20h TTL). */
  roomType: string

  /** Rate in **satang** (bigint, 1 THB = 100 satang). The worker
   *  passes satang through verbatim; providers convert to whatever
   *  unit their API wants (Cloudbeds takes THB, so the adapter
   *  divides by 100 at the boundary). */
  rateSatang: number
}

export interface PushRateResult {
  /** New push_status value for the rate_approvals row. Excludes
   *  'pending' since a provider response always represents an
   *  outcome (success / failure / skip), not the initial state. */
  status: ProviderPushStatus

  /** Provider-side identifier for the rate update (e.g. Cloudbeds
   *  rateUpdateID) when the push succeeded. Stored on the approval
   *  row for later reconciliation; absent on failure/skip. */
  externalRef?: string

  /** Human-readable error / skip reason. Stored in push_error on the
   *  approval row so the owner sees it on the dashboard. */
  error?: string
}

export interface PmsProvider {
  /** Display name for logs + dashboard. */
  readonly name: ProviderName

  /** Capability flag: does this adapter actually write back to the PMS?
   *  Read by the morning-flash brief at brief-build time AND mirrored
   *  into branch_pms_config.supports_write_back at config-set time. The
   *  former is the live source of truth; the latter is a denormalised
   *  copy so the LINE brief code path doesn't have to instantiate every
   *  provider just to ask whether the button should render.
   *
   *  MockProvider returns false — it logs 'skipped' on every push so
   *  there's no point teasing the owner with a live approve button.
   *  Future Cloudbeds/Mews/etc. implementations flip this to true once
   *  the real API call is wired. */
  readonly supportsWriteBack: boolean

  /** Push a single rate update to the PMS. Idempotent at the worker
   *  level (the worker filters on push_status='pending') but
   *  individual providers may also need idempotency keys if their
   *  API doesn't natively deduplicate. */
  pushRate(input: PushRateInput): Promise<PushRateResult>
}

/** Map of provider name → capability flags. Single source of truth for
 *  "when an owner picks provider X in /settings, what can it do?" The
 *  PMS config write path reads this so it can populate
 *  branch_pms_config.supports_write_back without instantiating the
 *  adapter (no env creds, no construction side effects).
 *
 *  Until a real adapter for a given provider is wired in factory.ts,
 *  supportsWriteBack stays false here — matches what the runtime
 *  adapter (MockProvider) would advertise. */
export const PROVIDER_CAPABILITIES: Record<
  Exclude<ProviderName, 'mock'>,
  { supportsWriteBack: boolean }
> = {
  cloudbeds:  { supportsWriteBack: false },  // adapter deferred to Phase R3
  mews:       { supportsWriteBack: false },
  siteminder: { supportsWriteBack: false },
  opera:      { supportsWriteBack: false },
}
