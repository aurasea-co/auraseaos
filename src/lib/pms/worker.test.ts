import { describe, it, expect } from 'vitest'
import { processApprovalsList, type PendingApprovalRow, type WorkerSupabase } from './worker'
import type { PmsProvider, PushRateInput, PushRateResult } from './types'
import type { BranchPmsConfigRow } from './factory'

// Builds a fake WorkerSupabase that:
//   - returns the given config row from branch_pms_config lookups
//   - records every rate_approvals update for assertion
function makeFakeSupabase(opts: {
  config?: BranchPmsConfigRow | null
  updateError?: unknown
} = {}): { client: WorkerSupabase; updates: Array<{ id: string; values: Record<string, unknown> }> } {
  const updates: Array<{ id: string; values: Record<string, unknown> }> = []

  const client: WorkerSupabase = {
    from(table) {
      if (table === 'branch_pms_config') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: opts.config ?? null, error: null }),
            }),
          }),
          update: () => ({ eq: async () => ({ error: null }) }),
        }
      }
      if (table === 'rate_approvals') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
          update: (values) => ({
            eq: async (_col, val) => {
              updates.push({ id: String(val), values })
              return { error: opts.updateError ?? null }
            },
          }),
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  }

  return { client, updates }
}

function makeProvider(result: PushRateResult, name = 'mock'): PmsProvider {
  return {
    name: name as PmsProvider['name'],
    supportsWriteBack: false,  // tests don't care about the capability flag — false is the safe default
    // No parameter — interface satisfied via TS's contravariant
    // param rules. Avoids the no-unused-vars rule.
    pushRate: async () => result,
  }
}

const sampleRow: PendingApprovalRow = {
  id: 'approval-1',
  branch_id: 'branch-1',
  date: '2026-05-31',
  room_type: 'all',
  suggested_rate_thb: 1850,
}

describe('processApprovalsList — counters', () => {
  it('returns zeros for an empty input', async () => {
    const { client } = makeFakeSupabase()
    const summary = await processApprovalsList(client, [])
    expect(summary.processed).toBe(0)
    expect(summary.succeeded).toBe(0)
    expect(summary.failed).toBe(0)
    expect(summary.skipped).toBe(0)
    expect(summary.results).toEqual([])
  })

  it('counts a single skipped push correctly', async () => {
    const { client } = makeFakeSupabase()
    const summary = await processApprovalsList(client, [sampleRow], {
      providerFactory: () => makeProvider({ status: 'skipped', error: 'no config' }),
    })
    expect(summary.processed).toBe(1)
    expect(summary.skipped).toBe(1)
    expect(summary.succeeded).toBe(0)
    expect(summary.failed).toBe(0)
  })

  it('counts a single success correctly', async () => {
    const { client } = makeFakeSupabase()
    const summary = await processApprovalsList(client, [sampleRow], {
      providerFactory: () => makeProvider({ status: 'success', externalRef: 'cb-9999' }),
    })
    expect(summary.processed).toBe(1)
    expect(summary.succeeded).toBe(1)
    expect(summary.skipped).toBe(0)
    expect(summary.failed).toBe(0)
  })

  it('counts a single failure correctly', async () => {
    const { client } = makeFakeSupabase()
    const summary = await processApprovalsList(client, [sampleRow], {
      providerFactory: () => makeProvider({ status: 'failed', error: 'http 500' }),
    })
    expect(summary.processed).toBe(1)
    expect(summary.failed).toBe(1)
    expect(summary.succeeded).toBe(0)
    expect(summary.skipped).toBe(0)
  })

  it('counts mixed batches correctly', async () => {
    const { client } = makeFakeSupabase()
    const rows: PendingApprovalRow[] = [
      { ...sampleRow, id: 'a' },
      { ...sampleRow, id: 'b' },
      { ...sampleRow, id: 'c' },
      { ...sampleRow, id: 'd' },
    ]
    let call = 0
    const responses: PushRateResult[] = [
      { status: 'success', externalRef: 'cb-1' },
      { status: 'success', externalRef: 'cb-2' },
      { status: 'failed', error: 'rate rejected' },
      { status: 'skipped', error: 'no config' },
    ]
    const summary = await processApprovalsList(client, rows, {
      providerFactory: () => makeProvider(responses[call++]!),
    })
    expect(summary.processed).toBe(4)
    expect(summary.succeeded).toBe(2)
    expect(summary.failed).toBe(1)
    expect(summary.skipped).toBe(1)
  })
})

describe('processApprovalsList — DB updates', () => {
  it('writes push_status=success + pushed_to_pms_at when provider succeeds', async () => {
    const { client, updates } = makeFakeSupabase()
    await processApprovalsList(client, [sampleRow], {
      providerFactory: () => makeProvider({ status: 'success', externalRef: 'cb-9999' }),
    })
    expect(updates).toHaveLength(1)
    expect(updates[0].id).toBe('approval-1')
    expect(updates[0].values.push_status).toBe('success')
    expect(updates[0].values.pushed_to_pms_at).toBeDefined()
    expect(updates[0].values.pushed_to_pms_at).not.toBeNull()
  })

  it('writes push_status=skipped + null pushed_to_pms_at when provider skips', async () => {
    const { client, updates } = makeFakeSupabase()
    await processApprovalsList(client, [sampleRow], {
      providerFactory: () => makeProvider({ status: 'skipped', error: 'no config' }),
    })
    expect(updates[0].values.push_status).toBe('skipped')
    expect(updates[0].values.pushed_to_pms_at).toBeNull()
    expect(updates[0].values.push_error).toBe('no config')
  })

  it('writes push_status=failed + null pushed_to_pms_at on failure', async () => {
    const { client, updates } = makeFakeSupabase()
    await processApprovalsList(client, [sampleRow], {
      providerFactory: () => makeProvider({ status: 'failed', error: 'rate rejected' }),
    })
    expect(updates[0].values.push_status).toBe('failed')
    expect(updates[0].values.pushed_to_pms_at).toBeNull()
    expect(updates[0].values.push_error).toBe('rate rejected')
  })
})

describe('processApprovalsList — provider error handling', () => {
  it('treats a thrown provider as a failed push (recorded, batch continues)', async () => {
    const { client, updates } = makeFakeSupabase()
    const throwingProvider: PmsProvider = {
      name: 'mock',
      supportsWriteBack: false,
      pushRate: async () => {
        throw new Error('network down')
      },
    }
    const summary = await processApprovalsList(client, [sampleRow], {
      providerFactory: () => throwingProvider,
    })
    expect(summary.failed).toBe(1)
    expect(updates[0].values.push_status).toBe('failed')
    expect(String(updates[0].values.push_error)).toContain('network down')
  })

  it('one row failing does not stop subsequent rows in the batch', async () => {
    const { client } = makeFakeSupabase()
    const rows: PendingApprovalRow[] = [
      { ...sampleRow, id: 'a' },
      { ...sampleRow, id: 'b' },
      { ...sampleRow, id: 'c' },
    ]
    let call = 0
    const summary = await processApprovalsList(client, rows, {
      providerFactory: () => ({
        name: 'mock',
        supportsWriteBack: false,
        pushRate: async () => {
          if (call++ === 1) throw new Error('mid-batch boom')
          return { status: 'success', externalRef: 'cb-ok' }
        },
      }),
    })
    expect(summary.processed).toBe(3)
    expect(summary.succeeded).toBe(2)
    expect(summary.failed).toBe(1)
  })
})

describe('processApprovalsList — provider factory uses config row', () => {
  it('passes the branch config (if any) to the factory', async () => {
    const config: BranchPmsConfigRow = {
      branch_id: 'branch-1',
      provider: 'cloudbeds',
      external_property_id: 'prop-42',
      is_active: true,
    }
    const { client } = makeFakeSupabase({ config })
    const seenConfigs: Array<BranchPmsConfigRow | null> = []
    await processApprovalsList(client, [sampleRow], {
      providerFactory: (cfg) => {
        seenConfigs.push(cfg)
        return makeProvider({ status: 'skipped', error: 'stub' })
      },
    })
    expect(seenConfigs).toEqual([config])
  })

  it('passes null when no config row exists', async () => {
    const { client } = makeFakeSupabase({ config: null })
    const seenConfigs: Array<BranchPmsConfigRow | null> = []
    await processApprovalsList(client, [sampleRow], {
      providerFactory: (cfg) => {
        seenConfigs.push(cfg)
        return makeProvider({ status: 'skipped', error: 'no config' })
      },
    })
    expect(seenConfigs).toEqual([null])
  })

  it('passes the externalPropertyId from config to the provider input', async () => {
    const config: BranchPmsConfigRow = {
      branch_id: 'branch-1',
      provider: 'cloudbeds',
      external_property_id: 'prop-42',
      is_active: true,
    }
    const { client } = makeFakeSupabase({ config })
    const seenInputs: PushRateInput[] = []
    await processApprovalsList(client, [sampleRow], {
      providerFactory: () => ({
        name: 'mock',
        supportsWriteBack: false,
        pushRate: async (input) => {
          seenInputs.push(input)
          return { status: 'success', externalRef: 'cb-1' }
        },
      }),
    })
    expect(seenInputs[0].externalPropertyId).toBe('prop-42')
    expect(seenInputs[0].date).toBe('2026-05-31')
    expect(seenInputs[0].rateThb).toBe(1850)
  })
})
