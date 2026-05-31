// PMS push worker — pure per-row processing logic. The cron route
// fetches the batch of pending rows (using the real supabase client's
// `.not()` filter, which we don't reproduce in our minimal test
// seam), then hands the list to processApprovalsList() here.
//
// Splitting the fetch from the processing keeps this file
// dependency-free at compile time and 100% testable with hand-built
// fake supabase + provider objects.

import type { PmsProvider, PushRateInput, PushRateResult } from './types'
import { getProviderForConfig, type BranchPmsConfigRow } from './factory'

export interface PendingApprovalRow {
  id: string
  branch_id: string
  date: string
  room_type: string
  suggested_rate_thb: number
}

// Minimal supabase client surface — lets us pass mocks in tests
// without depending on @supabase/supabase-js types. The cron route
// hands us the real client which satisfies a superset of this shape.
export interface WorkerSupabase {
  from(table: 'branch_pms_config' | 'rate_approvals'): {
    select(cols: string): {
      eq(col: string, val: unknown): {
        maybeSingle(): Promise<{ data: unknown | null; error: unknown }>
      }
    }
    update(values: Record<string, unknown>): {
      eq(col: string, val: unknown): Promise<{ error: unknown }>
    }
  }
}

export interface ProcessSummary {
  processed: number
  succeeded: number
  failed: number
  skipped: number
  results: Array<{
    approvalId: string
    status: 'success' | 'failed' | 'skipped'
    provider: string
    error?: string
  }>
}

export interface ProcessOptions {
  /** Override the provider factory — test seam. Defaults to the real
   *  factory.getProviderForConfig. */
  providerFactory?: (config: BranchPmsConfigRow | null) => PmsProvider
}

export async function processApprovalsList(
  supabase: WorkerSupabase,
  rows: PendingApprovalRow[],
  options: ProcessOptions = {},
): Promise<ProcessSummary> {
  const factory = options.providerFactory ?? getProviderForConfig

  const summary: ProcessSummary = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    results: [],
  }

  for (const row of rows) {
    summary.processed += 1
    const result = await processOneApproval(supabase, row, factory)
    summary.results.push({
      approvalId: row.id,
      status: result.status,
      provider: result.provider,
      error: result.error,
    })
    if (result.status === 'success') summary.succeeded += 1
    else if (result.status === 'failed') summary.failed += 1
    else if (result.status === 'skipped') summary.skipped += 1
  }

  return summary
}

interface OneResult {
  status: 'success' | 'failed' | 'skipped'
  provider: string
  error?: string
}

async function processOneApproval(
  supabase: WorkerSupabase,
  row: PendingApprovalRow,
  factory: (config: BranchPmsConfigRow | null) => PmsProvider,
): Promise<OneResult> {
  // Fetch the branch's PMS config (may be null — owner hasn't set it).
  const cfgRes = await supabase
    .from('branch_pms_config')
    .select('branch_id, provider, external_property_id, is_active')
    .eq('branch_id', row.branch_id)
    .maybeSingle()

  const config = (cfgRes.data ?? null) as BranchPmsConfigRow | null
  const provider = factory(config)

  let pushResult: PushRateResult
  try {
    const input: PushRateInput = {
      approvalId: row.id,
      externalPropertyId: config?.external_property_id ?? '',
      date: row.date,
      roomType: row.room_type,
      rateThb: row.suggested_rate_thb,
    }
    pushResult = await provider.pushRate(input)
  } catch (err) {
    // Network / runtime error from the provider — treat as a transient
    // failure. Next hourly cron tick will retry (push_status stays at
    // 'failed' but the next cron filters those out; we'd need to
    // re-flip to 'pending' for a true retry. MVP behaviour: a failed
    // push stays failed until the owner re-approves — clear ownership
    // of intent. Adding "retry-with-backoff" is a separate ticket.)
    pushResult = {
      status: 'failed',
      error: `Provider threw: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  // Persist the result back to the approval row.
  const updateRes = await supabase
    .from('rate_approvals')
    .update({
      push_status: pushResult.status,
      pushed_to_pms_at: pushResult.status === 'success' ? new Date().toISOString() : null,
      push_error: pushResult.error ?? null,
    })
    .eq('id', row.id)

  if (updateRes.error) {
    // Update failed — the row stays in its current state. Log so the
    // operator can investigate; the next cron tick will retry only
    // if the row is still 'pending' (which it is here because the
    // update didn't take effect).
    return {
      status: 'failed',
      provider: provider.name,
      error: `Update failed: ${JSON.stringify(updateRes.error)}`,
    }
  }

  return {
    status: pushResult.status,
    provider: provider.name,
    error: pushResult.error,
  }
}
