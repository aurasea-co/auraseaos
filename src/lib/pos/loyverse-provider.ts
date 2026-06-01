// LoyverseProvider — pulls daily sales from the Loyverse Cloud POS API.
//
// STATUS: scaffold only. Real implementation drops in here when
// Aurasea has Loyverse Partner credentials. The factory currently
// returns MockPosProvider for any 'loyverse' branch_pos_config row
// until both LOYVERSE_CLIENT_ID and LOYVERSE_CLIENT_SECRET are set
// in the deploy environment.
//
// API reference: https://developer.loyverse.com
// Relevant endpoints:
//   GET /v1.0/receipts?store_id={id}&created_at_min={iso}&created_at_max={iso}
//     — list receipts in a date range
//     — each receipt has line_items with item_id, item_name, quantity
//   GET /v1.0/items?store_id={id}
//     — fetch item catalog for the store (used to cross-reference
//       receipt line_items if the receipt response lacks item_name)
//
// OAuth flow:
//   - Token endpoint: https://api.loyverse.com/oauth/token
//   - Client credentials grant — Aurasea acts as the Partner app
//   - Token TTL ~1 hour; cache + refresh on demand
//   - Per-property auth comes via the store_id parameter on every
//     receipt call (no per-tenant OAuth needed for read-only sales)
//
// Implementation outline (commented; uncomment + flesh out when
// credentials arrive):
//
//   1. Refresh OAuth token if absent / expired
//   2. GET /receipts in the requested window (paginated)
//   3. Flatten receipts → line_items, group by (date, item_id)
//   4. Map to PosSaleRow[] with date in Bangkok wall time
//   5. Return { status: 'success', rows, externalRef: requestId }

import type {
  PosProvider,
  FetchSalesInput,
  FetchSalesResult,
} from './types'

export class LoyverseProvider implements PosProvider {
  readonly name = 'loyverse' as const

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_clientId: string, _clientSecret: string) {
    // TODO(R2): cache OAuth token + expiry. For MVP, a fresh token
    // per fetchSales call is fine — Loyverse rate-limits OAuth at
    // 100 req/min per client which is well above one cron tick.
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async fetchSales(_input: FetchSalesInput): Promise<FetchSalesResult> {
    // TODO: real implementation per the outline above. Until then,
    // return a clear "not implemented" signal so the worker logs
    // a meaningful reason for the operator.
    return {
      status: 'skipped',
      rows: [],
      error: 'LoyverseProvider not yet implemented. Configure LOYVERSE_CLIENT_ID + LOYVERSE_CLIENT_SECRET in the deploy env and replace this stub.',
    }
  }
}
