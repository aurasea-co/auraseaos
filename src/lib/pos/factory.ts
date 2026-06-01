// POS provider factory. Maps a branch_pos_config row to a concrete
// adapter instance. Mirrors lib/pms/factory.ts.
//
// MVP state: every code path returns MockPosProvider with a context-
// specific skip reason. When LoyverseProvider lands, this file changes
// in one place: swap the 'loyverse' case to return new LoyverseProvider(...)
// once env credentials are present. No worker / route / DB changes.

import type { PosProvider } from './types'
import { MockPosProvider } from './mock-provider'

export interface BranchPosConfigRow {
  branch_id: string
  provider: 'loyverse' | 'foodstory' | 'storehub'
  external_store_id: string
  is_active: boolean
}

export function getPosProviderForConfig(config: BranchPosConfigRow | null): PosProvider {
  if (!config) {
    return new MockPosProvider(
      'No POS configured for this branch. Sales are still recorded via manual entry or CSV import.',
    )
  }
  if (!config.is_active) {
    return new MockPosProvider('POS integration is disabled by the owner for this branch.')
  }
  switch (config.provider) {
    case 'loyverse':
      if (!process.env.LOYVERSE_CLIENT_ID || !process.env.LOYVERSE_CLIENT_SECRET) {
        return new MockPosProvider(
          'Loyverse Partner credentials missing from server env. Aurasea Partner account needs to be provisioned before sales sync can fire.',
        )
      }
      // TODO: return new LoyverseProvider(env.id, env.secret) when
      // the scaffold in loyverse-provider.ts is fleshed out.
      return new MockPosProvider('Loyverse adapter not yet implemented. Sales must be entered manually or via CSV until shipping.')
    case 'foodstory':
      return new MockPosProvider('FoodStory adapter not yet implemented. CSV import is the current path.')
    case 'storehub':
      return new MockPosProvider('Storehub adapter not yet implemented. CSV import is the current path.')
    default:
      return new MockPosProvider('Unknown POS provider. Sales must be entered manually or via CSV.')
  }
}
