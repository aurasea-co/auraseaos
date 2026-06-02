// MockProvider — used when no real PMS integration is configured.
// Returns 'skipped' for every push so the dashboard surfaces the
// approval history with a "Skipped" badge instead of stalling on
// 'pending'. The skip reason is filled in so the owner understands
// why the rate didn't reach the PMS.
//
// This provider is the active one until a real Cloudbeds /
// Mews / etc client is wired into the factory. Swapping in the real
// client is a one-file change: implement PmsProvider in
// lib/pms/cloudbeds-provider.ts, return it from factory.ts when
// branch_pms_config.provider === 'cloudbeds'.

import type { PmsProvider, PushRateInput, PushRateResult } from './types'

export class MockProvider implements PmsProvider {
  readonly name = 'mock' as const
  /** Mock cannot write to a real PMS — it skips every push. The morning
   *  brief reads this (via branch_pms_config.supports_write_back) to
   *  suppress the live approve button on branches whose adapter isn't
   *  capable of acting on the approval. */
  readonly supportsWriteBack = false
  private readonly reason: string

  constructor(reason = 'PMS integration is not yet configured for this branch.') {
    this.reason = reason
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async pushRate(_input: PushRateInput): Promise<PushRateResult> {
    return {
      status: 'skipped',
      error: this.reason,
    }
  }
}
