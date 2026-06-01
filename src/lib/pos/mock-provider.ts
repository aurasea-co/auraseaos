// MockProvider for POS sales. Active when no real adapter is wired
// in (Loyverse / FoodStory / Storehub credentials missing from env)
// or when a branch_pos_config row uses a provider we haven't
// implemented yet. Returns 'no_data' with a clear reason so the
// settings UI can surface "PMS adapter not yet implemented" without
// looking like a real sync failure.
//
// Parallel of lib/pms/mock-provider.ts; same single-file swap-in
// path for the real Loyverse adapter when credentials arrive.

import type { PosProvider, FetchSalesResult } from './types'

export class MockPosProvider implements PosProvider {
  readonly name = 'mock' as const
  private readonly reason: string

  constructor(reason = 'POS integration is not yet configured for this branch.') {
    this.reason = reason
  }

  async fetchSales(): Promise<FetchSalesResult> {
    return {
      status: 'no_data',
      rows: [],
      error: this.reason,
    }
  }
}
