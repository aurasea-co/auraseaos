import { describe, it, expect } from 'vitest'
import { upsertCompetitorRate, MAX_COMPETITORS } from './competitor-rate-write'

// Minimal fake Supabase client — enough surface for
// upsertCompetitorRate's two calls (select distinct names, upsert).
// Mirrors the fake-client pattern already used for
// hotel/persistence.test.ts (UpsertSupabase).
function makeFakeSupabase(opts: {
  existingNames?: string[]
  upsertError?: { code?: string; message?: string } | null
}) {
  const existingNames = opts.existingNames ?? []
  const upsertCalls: Array<Record<string, unknown>> = []
  return {
    upsertCalls,
    client: {
      from(table: string) {
        if (table !== 'competitor_rates') throw new Error(`unexpected table ${table}`)
        return {
          select() {
            return {
              eq() {
                return Promise.resolve({ data: existingNames.map((n) => ({ competitor_name: n })) })
              },
            }
          },
          upsert(row: Record<string, unknown>) {
            upsertCalls.push(row)
            return Promise.resolve({ error: opts.upsertError ?? null })
          },
        }
      },
    },
  }
}

const BASE_INPUT = {
  branchId: 'branch-1',
  competitorName: 'Sima Thani',
  roomType: 'Suite',
  rateThb: 1200,
  capturedAt: '2026-07-27',
  channel: 'ota' as const,
}

describe('upsertCompetitorRate — validation (same rules the route inlined before extraction)', () => {
  it('rejects a missing competitor name', async () => {
    const { client } = makeFakeSupabase({})
    const result = await upsertCompetitorRate(client, { ...BASE_INPUT, competitorName: '  ' })
    expect(result).toEqual({
      ok: false,
      status: 400,
      code: 'missing_competitor_name',
      messageTh: 'กรุณากรอกชื่อคู่แข่ง',
      messageEn: 'Competitor name is required',
    })
  })

  it('rejects a competitor name over 80 chars', async () => {
    const { client } = makeFakeSupabase({})
    const result = await upsertCompetitorRate(client, { ...BASE_INPUT, competitorName: 'A'.repeat(81) })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('name_too_long')
  })

  it('rejects a negative rate', async () => {
    const { client } = makeFakeSupabase({})
    const result = await upsertCompetitorRate(client, { ...BASE_INPUT, rateThb: -5 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('invalid_rate')
  })

  it('defaults an invalid/unknown channel to ota rather than rejecting', async () => {
    const { client, upsertCalls } = makeFakeSupabase({})
    const result = await upsertCompetitorRate(client, { ...BASE_INPUT, channel: 'not_a_channel' })
    expect(result.ok).toBe(true)
    expect(upsertCalls[0].channel).toBe('ota')
  })

  it('defaults room type to Standard when blank', async () => {
    const { client, upsertCalls } = makeFakeSupabase({})
    await upsertCompetitorRate(client, { ...BASE_INPUT, roomType: '  ' })
    expect(upsertCalls[0].room_type).toBe('Standard')
  })

  it('applies the channel-appropriate default source when none is given', async () => {
    const { client, upsertCalls } = makeFakeSupabase({})
    await upsertCompetitorRate(client, { ...BASE_INPUT, channel: 'walk_in', source: undefined })
    expect(upsertCalls[0].source).toBe('Manual — phone/front desk')
  })
})

describe('upsertCompetitorRate — MAX_COMPETITORS enforcement', () => {
  it('rejects a brand-new competitor name once the branch is at the cap', async () => {
    const { client } = makeFakeSupabase({
      existingNames: Array.from({ length: MAX_COMPETITORS }, (_, i) => `Competitor ${i}`),
    })
    const result = await upsertCompetitorRate(client, { ...BASE_INPUT, competitorName: 'A New Hotel' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('max_competitors')
  })

  it('still allows re-entering a rate for an EXISTING competitor at the cap', async () => {
    const names = Array.from({ length: MAX_COMPETITORS }, (_, i) => `Competitor ${i}`)
    const { client } = makeFakeSupabase({ existingNames: names })
    const result = await upsertCompetitorRate(client, { ...BASE_INPUT, competitorName: names[0] })
    expect(result.ok).toBe(true)
  })

  // A STATEFUL fake (existingNames grows as upserts land) so this
  // proves the exact scenario the batch-commit route's sequential-
  // await design exists for: two brand-new names submitted in one
  // batch, with only one free slot, must resolve to exactly one
  // success and one max_competitors failure — never both succeeding
  // (which a parallel/racing implementation could allow).
  it('sequential calls (as batch-commit does) enforce the cap correctly across multiple NEW names in one batch', async () => {
    const state = { names: Array.from({ length: MAX_COMPETITORS - 1 }, (_, i) => `Competitor ${i}`) }
    const statefulClient = {
      from() {
        return {
          select() {
            return { eq() { return Promise.resolve({ data: state.names.map((n) => ({ competitor_name: n })) }) } }
          },
          upsert(row: { competitor_name: string }) {
            if (!state.names.includes(row.competitor_name)) state.names.push(row.competitor_name)
            return Promise.resolve({ error: null })
          },
        }
      },
    }
    const first = await upsertCompetitorRate(statefulClient, { ...BASE_INPUT, competitorName: 'New Hotel A' })
    const second = await upsertCompetitorRate(statefulClient, { ...BASE_INPUT, competitorName: 'New Hotel B' })
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.code).toBe('max_competitors')
  })
})

describe('upsertCompetitorRate — upsert payload + dedupe key', () => {
  it('writes the exact onConflict key (branch, competitor, room_type, channel, captured_at)', async () => {
    const calls: Array<{ onConflict: string }> = []
    const client = {
      from() {
        return {
          select() { return { eq() { return Promise.resolve({ data: [] }) } } },
          upsert(_row: unknown, opts: { onConflict: string }) {
            calls.push(opts)
            return Promise.resolve({ error: null })
          },
        }
      },
    }
    await upsertCompetitorRate(client, BASE_INPUT)
    expect(calls[0].onConflict).toBe('branch_id,competitor_name,room_type,channel,captured_at')
  })

  it('surfaces a clear hint when the DB is missing the unique constraint (42P10)', async () => {
    const { client } = makeFakeSupabase({ upsertError: { code: '42P10' } })
    const result = await upsertCompetitorRate(client, BASE_INPUT)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('42P10')
      expect(result.messageEn).toContain('migration 033')
    }
  })

  it('surfaces a generic failure for any other upsert error', async () => {
    const { client } = makeFakeSupabase({ upsertError: { code: 'XX000' } })
    const result = await upsertCompetitorRate(client, BASE_INPUT)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('XX000')
  })
})
