// Provider factory. Maps (branch_pms_config row) → PmsProvider
// implementation. The worker calls getProviderForConfig() per pending
// approval, so swapping in a new provider is a single switch arm.
//
// MVP state: every code path returns MockProvider with a context-
// specific skip reason. When CloudbedsProvider is built, this file
// changes in two places:
//   1. import { CloudbedsProvider } from './cloudbeds-provider'
//   2. case 'cloudbeds': return new CloudbedsProvider(env.cloudbedsClientId, env.cloudbedsClientSecret, config.external_property_id)
// No changes needed to types.ts, worker.ts, or the cron route.

import type { PmsProvider } from './types'
import { MockProvider } from './mock-provider'

export interface BranchPmsConfigRow {
  branch_id: string
  provider: 'cloudbeds' | 'mews' | 'siteminder' | 'opera'
  external_property_id: string
  is_active: boolean
}

// Resolution rules:
//   - No config row              → MockProvider("not configured")
//   - Config exists but inactive → MockProvider("disabled by owner")
//   - Cloudbeds + no creds in env → MockProvider("Cloudbeds credentials missing")
//   - Cloudbeds + creds + active → CloudbedsProvider (not yet implemented)
//   - Any unknown provider       → MockProvider("provider not supported yet")
export function getProviderForConfig(config: BranchPmsConfigRow | null): PmsProvider {
  if (!config) {
    return new MockProvider('No PMS configured for this branch. Approval is recorded; configure a PMS in /settings to enable automatic push.')
  }
  if (!config.is_active) {
    return new MockProvider('PMS integration is disabled by the owner for this branch.')
  }
  switch (config.provider) {
    case 'cloudbeds':
      // Real CloudbedsProvider lands later. For now, every Cloudbeds-
      // configured branch sees 'skipped' with a clear reason so the
      // dashboard makes the gap visible.
      if (!process.env.CLOUDBEDS_CLIENT_ID || !process.env.CLOUDBEDS_CLIENT_SECRET) {
        return new MockProvider('Cloudbeds OAuth credentials missing from server env. Aurasea Partner credentials need to be provisioned before pushes can fire.')
      }
      return new MockProvider('Cloudbeds adapter not yet implemented. Approval recorded.')
    case 'mews':
    case 'siteminder':
    case 'opera':
      return new MockProvider(`Provider "${config.provider}" is not supported yet. Approval recorded for future replay.`)
    default:
      return new MockProvider('Unknown provider. Approval recorded.')
  }
}
