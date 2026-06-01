import { describe, it, expect } from 'vitest'
import { processConfigsList, type PendingPosConfig, type WorkerSupabase, type MenuItemForMatch } from './worker'
import type { PosProvider, FetchSalesResult } from './types'

// Hand-built supabase fake. Two surfaces it needs to support:
//   - .from('menu_items').select('...').eq('branch_id', ...).eq('is_active', true) → data array
//   - .from('fnb_daily_sales').upsert(rows, {onConflict}) → error or null
//   - .from('branch_pos_config').update({...}).eq('id', ...) → error or null
//
// Each fake captures the rows it received so tests can assert on the
// downstream side-effects.
interface FakeOpts {
  menuItems?: MenuItemForMatch[]
  upsertError?: unknown
}

function makeFakeSupabase(opts: FakeOpts = {}): {
  client: WorkerSupabase
  upserts: Array<{ table: string; rows: unknown[] }>
  configUpdates: Array<{ id: string; values: Record<string, unknown> }>
} {
  const menuItems = opts.menuItems ?? []
  const upserts: Array<{ table: string; rows: unknown[] }> = []
  const configUpdates: Array<{ id: string; values: Record<string, unknown> }> = []

  const client: WorkerSupabase = {
    from(table) {
      if (table === 'menu_items') {
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({ data: menuItems, error: null }),
            }),
          }),
          upsert: async () => ({ error: null }),
          update: () => ({ eq: async () => ({ error: null }) }),
        }
      }
      if (table === 'fnb_daily_sales') {
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({ data: [], error: null }),
            }),
          }),
          upsert: async (rows: unknown[]) => {
            upserts.push({ table: 'fnb_daily_sales', rows })
            return { error: opts.upsertError ?? null }
          },
          update: () => ({ eq: async () => ({ error: null }) }),
        }
      }
      if (table === 'branch_pos_config') {
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({ data: [], error: null }),
            }),
          }),
          upsert: async () => ({ error: null }),
          update: (values: Record<string, unknown>) => ({
            eq: async (_col: string, val: unknown) => {
              configUpdates.push({ id: String(val), values })
              return { error: null }
            },
          }),
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  }

  return { client, upserts, configUpdates }
}

function makeProvider(result: FetchSalesResult, name: PosProvider['name'] = 'mock'): PosProvider {
  return {
    name,
    fetchSales: async () => result,
  }
}

const sampleConfig: PendingPosConfig = {
  id: 'cfg-1',
  branch_id: 'branch-1',
  provider: 'loyverse',
  external_store_id: 'store-99',
  is_active: true,
  last_synced_at: null,
}

const fixedToday = (): string => '2026-06-01'

describe('processConfigsList — counters', () => {
  it('zero configs → all-zero summary', async () => {
    const { client } = makeFakeSupabase()
    const summary = await processConfigsList(client, [])
    expect(summary).toEqual({
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      noData: 0,
      totalImported: 0,
      totalUnknownItems: 0,
      results: [],
    })
  })

  it('counts a single skipped sync correctly', async () => {
    const { client } = makeFakeSupabase()
    const summary = await processConfigsList(client, [sampleConfig], {
      providerFactory: () => makeProvider({ status: 'skipped', rows: [], error: 'no creds' }),
      nowBkk: fixedToday,
    })
    expect(summary.processed).toBe(1)
    expect(summary.skipped).toBe(1)
  })

  it('counts no_data correctly', async () => {
    const { client } = makeFakeSupabase()
    const summary = await processConfigsList(client, [sampleConfig], {
      providerFactory: () => makeProvider({ status: 'no_data', rows: [] }),
      nowBkk: fixedToday,
    })
    expect(summary.noData).toBe(1)
  })

  it('counts a successful sync with rows correctly', async () => {
    const { client } = makeFakeSupabase({
      menuItems: [{ id: 'menu-1', name: 'Pad Krapow', external_item_id: 'PK-1' }],
    })
    const summary = await processConfigsList(client, [sampleConfig], {
      providerFactory: () => makeProvider({
        status: 'success',
        rows: [{ date: '2026-05-31', externalItemId: 'PK-1', unitsSold: 12 }],
      }),
      nowBkk: fixedToday,
    })
    expect(summary.succeeded).toBe(1)
    expect(summary.totalImported).toBe(1)
  })
})

describe('processConfigsList — item matching', () => {
  it('matches by external_item_id first', async () => {
    const { client, upserts } = makeFakeSupabase({
      menuItems: [
        { id: 'menu-A', name: 'Pad Krapow', external_item_id: 'PK-1' },
        { id: 'menu-B', name: 'Pad Krapow Spicy', external_item_id: null },
      ],
    })
    await processConfigsList(client, [sampleConfig], {
      providerFactory: () => makeProvider({
        status: 'success',
        rows: [{ date: '2026-05-31', externalItemId: 'PK-1', itemName: 'Pad Krapow Spicy', unitsSold: 5 }],
      }),
      nowBkk: fixedToday,
    })
    // The externalItemId match wins over the itemName (even though the
    // itemName happens to match a different menu_items row).
    expect((upserts[0].rows[0] as { menu_item_id: string }).menu_item_id).toBe('menu-A')
  })

  it('falls back to itemName (case-insensitive) when external_item_id is missing', async () => {
    const { client, upserts } = makeFakeSupabase({
      menuItems: [{ id: 'menu-B', name: 'Iced Coffee', external_item_id: null }],
    })
    await processConfigsList(client, [sampleConfig], {
      providerFactory: () => makeProvider({
        status: 'success',
        rows: [{ date: '2026-05-31', itemName: 'iced coffee', unitsSold: 30 }],
      }),
      nowBkk: fixedToday,
    })
    expect((upserts[0].rows[0] as { menu_item_id: string }).menu_item_id).toBe('menu-B')
  })

  it('counts unmatched rows as unknownItems and excludes from upsert', async () => {
    const { client, upserts } = makeFakeSupabase({
      menuItems: [{ id: 'menu-A', name: 'Pad Krapow', external_item_id: 'PK-1' }],
    })
    const summary = await processConfigsList(client, [sampleConfig], {
      providerFactory: () => makeProvider({
        status: 'success',
        rows: [
          { date: '2026-05-31', externalItemId: 'PK-1', unitsSold: 5 },     // match
          { date: '2026-05-31', externalItemId: 'UNKNOWN-XX', unitsSold: 3 }, // miss
          { date: '2026-05-31', itemName: 'Mystery Dish', unitsSold: 2 },      // miss
        ],
      }),
      nowBkk: fixedToday,
    })
    expect(summary.totalImported).toBe(1)
    expect(summary.totalUnknownItems).toBe(2)
    expect(upserts[0].rows).toHaveLength(1)
  })

  it('returns no_data status when ALL rows fail to match', async () => {
    const { client } = makeFakeSupabase({ menuItems: [] })
    const summary = await processConfigsList(client, [sampleConfig], {
      providerFactory: () => makeProvider({
        status: 'success',
        rows: [{ date: '2026-05-31', externalItemId: 'XX', unitsSold: 1 }],
      }),
      nowBkk: fixedToday,
    })
    // Provider said success but every row was unknown → no upsert
    // happened; result tagged as no_data so the operator sees that
    // the sync ran cleanly but produced zero usable rows.
    expect(summary.noData).toBe(1)
    expect(summary.totalUnknownItems).toBe(1)
  })
})

describe('processConfigsList — config update side-effects', () => {
  it('writes last_synced_at + success on a clean sync', async () => {
    const { client, configUpdates } = makeFakeSupabase({
      menuItems: [{ id: 'menu-A', name: 'Pad Krapow', external_item_id: 'PK-1' }],
    })
    await processConfigsList(client, [sampleConfig], {
      providerFactory: () => makeProvider({
        status: 'success',
        rows: [{ date: '2026-05-31', externalItemId: 'PK-1', unitsSold: 5 }],
      }),
      nowBkk: fixedToday,
    })
    expect(configUpdates).toHaveLength(1)
    expect(configUpdates[0].id).toBe('cfg-1')
    expect(configUpdates[0].values.last_sync_status).toBe('success')
    expect(configUpdates[0].values.last_synced_at).toBeDefined()
    expect(configUpdates[0].values.last_sync_error).toBeNull()
  })

  it('writes last_sync_status=failed when the provider throws', async () => {
    const { client, configUpdates } = makeFakeSupabase()
    const throwingProvider: PosProvider = {
      name: 'mock',
      fetchSales: async () => {
        throw new Error('network down')
      },
    }
    const summary = await processConfigsList(client, [sampleConfig], {
      providerFactory: () => throwingProvider,
      nowBkk: fixedToday,
    })
    expect(summary.failed).toBe(1)
    expect(configUpdates[0].values.last_sync_status).toBe('failed')
    expect(String(configUpdates[0].values.last_sync_error)).toContain('network down')
  })

  it('writes last_sync_status=failed when upsert errors', async () => {
    const { client, configUpdates } = makeFakeSupabase({
      menuItems: [{ id: 'menu-A', name: 'Pad Krapow', external_item_id: 'PK-1' }],
      upsertError: { message: 'unique violation' },
    })
    const summary = await processConfigsList(client, [sampleConfig], {
      providerFactory: () => makeProvider({
        status: 'success',
        rows: [{ date: '2026-05-31', externalItemId: 'PK-1', unitsSold: 5 }],
      }),
      nowBkk: fixedToday,
    })
    expect(summary.failed).toBe(1)
    expect(configUpdates[0].values.last_sync_status).toBe('failed')
  })

  it('still records last_synced_at on skipped/no_data so next run picks a fresh window', async () => {
    const { client, configUpdates } = makeFakeSupabase()
    await processConfigsList(client, [sampleConfig], {
      providerFactory: () => makeProvider({ status: 'no_data', rows: [] }),
      nowBkk: fixedToday,
    })
    expect(configUpdates).toHaveLength(1)
    expect(configUpdates[0].values.last_synced_at).toBeDefined()
  })
})

describe('processConfigsList — provider gets correct fetchSales window', () => {
  it('first sync uses the configured initialWindowDays', async () => {
    const { client } = makeFakeSupabase()
    let captured: { fromDate: string; toDate: string } | null = null
    const provider: PosProvider = {
      name: 'mock',
      fetchSales: async (input) => {
        captured = { fromDate: input.fromDate, toDate: input.toDate }
        return { status: 'no_data', rows: [] }
      },
    }
    await processConfigsList(client, [{ ...sampleConfig, last_synced_at: null }], {
      providerFactory: () => provider,
      initialWindowDays: 14,
      nowBkk: () => '2026-06-01',
    })
    expect(captured).not.toBeNull()
    expect(captured!.fromDate).toBe('2026-05-18')  // 14 days before today
    expect(captured!.toDate).toBe('2026-06-01')
  })

  it('subsequent sync uses last_synced_at - 1 day (overlap window)', async () => {
    const { client } = makeFakeSupabase()
    let captured: { fromDate: string; toDate: string } | null = null
    const provider: PosProvider = {
      name: 'mock',
      fetchSales: async (input) => {
        captured = { fromDate: input.fromDate, toDate: input.toDate }
        return { status: 'no_data', rows: [] }
      },
    }
    await processConfigsList(
      client,
      [{ ...sampleConfig, last_synced_at: '2026-05-30T12:00:00Z' }],
      {
        providerFactory: () => provider,
        nowBkk: () => '2026-06-01',
      },
    )
    expect(captured!.fromDate).toBe('2026-05-29')  // 1 day before last sync
    expect(captured!.toDate).toBe('2026-06-01')
  })
})
