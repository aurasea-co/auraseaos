import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveTodaysAction, type ActionCache } from './per-branch-loader'
import type { DailyAction, DerivedDayContext, PerRoomTypeRate, RecommendationInput } from './engine'
import * as llmAction from './llm-action'

// Fake Supabase — just enough surface for action-persistence.ts's
// readDailyAction/writeDailyAction chains. `rows` is the in-memory table;
// tests seed it directly to simulate "already resolved by an earlier
// recipient this morning".
function makeFakeSupabase(seed: Record<string, unknown> | null = null) {
  const rows: Record<string, unknown> | null = seed
  const upsertCalls: Array<Record<string, unknown>> = []
  const supabase = {
    from(table: string) {
      expect(table).toBe('branch_daily_actions')
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return { maybeSingle: async () => ({ data: rows, error: null }) }
                },
              }
            },
          }
        },
        upsert(row: Record<string, unknown>) {
          upsertCalls.push(row)
          return Promise.resolve({ error: null })
        },
      }
    },
  }
  return { supabase, upsertCalls }
}

const templateAction: DailyAction = { messageTh: 'เทมเพลตเดิม', messageEn: 'template fallback' }

const weekdayContext: DerivedDayContext = {
  occPct: 80,
  belowTargetPct: null,
  trend: 'steady',
  isWeekend: false,
  competitorGapPct: null,
  weekdayOccupancyBaseline: 60,
  todayVsWeekdayNorm: 20,
  wowDirection: 'ahead',
  weekdaySampleCount: 4,
  weekdayNameTh: 'เสาร์',
  weekdayNameEn: 'Saturday',
  demandCalendarEventNameTh: null,
  demandCalendarEventNameEn: null,
}

const perRoomRates: PerRoomTypeRate[] = [
  {
    roomType: 'Deluxe',
    currentRateThb: 1000,
    suggestedRateThb: 1100,
    currentRateSatang: 100000,
    suggestedRateSatang: 110000,
    direction: 'increase',
    reasonTh: '',
    reasonEn: '',
    impactThb: 100,
  },
]

const recInputs: RecommendationInput[] = [
  { date: '2026-08-11', occupancyRate: 0.8, adrThb: 900, competitorRates: [] },
]

function baseParams(cache?: ActionCache) {
  return {
    branchId: 'branch-1',
    branchName: 'Crystal Resort',
    metricDate: '2026-08-11',
    templateAction,
    weekdayContext,
    perRoomRates,
    recInputs,
    demandCalendarEvent: null,
    cache,
  }
}

describe('resolveTodaysAction', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the in-memory cached value without touching Supabase or the LLM', async () => {
    const generateSpy = vi.spyOn(llmAction, 'generateTodaysAction')
    const cached: DailyAction = { messageTh: 'แคชไว้แล้ว', messageEn: 'cached' }
    const cache: ActionCache = new Map([['branch-1', cached]])
    const { supabase } = makeFakeSupabase()
    const fromSpy = vi.spyOn(supabase, 'from')

    const result = await resolveTodaysAction(supabase, baseParams(cache))

    expect(result).toBe(cached)
    expect(fromSpy).not.toHaveBeenCalled()
    expect(generateSpy).not.toHaveBeenCalled()
  })

  it('reuses a persisted row from an earlier recipient this morning and skips the LLM', async () => {
    const generateSpy = vi.spyOn(llmAction, 'generateTodaysAction')
    const { supabase, upsertCalls } = makeFakeSupabase({
      message_th: 'คนแรกสร้างไว้แล้ว',
      message_en: 'resolved by an earlier recipient',
      source: 'llm',
    })
    const cache: ActionCache = new Map()

    const result = await resolveTodaysAction(supabase, baseParams(cache))

    expect(result?.messageTh).toBe('คนแรกสร้างไว้แล้ว')
    expect(generateSpy).not.toHaveBeenCalled()
    expect(upsertCalls).toHaveLength(0) // reading an existing row never re-writes it
    expect(cache.get('branch-1')?.messageTh).toBe('คนแรกสร้างไว้แล้ว')
  })

  it('persists the LLM result with source=llm on success', async () => {
    const llmResult = {
      action: { messageTh: 'จาก LLM', messageEn: 'จาก LLM' },
      model: 'claude-haiku-4-5-20251001',
      latencyMs: 1234,
    }
    vi.spyOn(llmAction, 'generateTodaysAction').mockResolvedValue(llmResult)
    const { supabase, upsertCalls } = makeFakeSupabase(null)
    const cache: ActionCache = new Map()

    const result = await resolveTodaysAction(supabase, baseParams(cache))

    expect(result?.messageTh).toBe('จาก LLM')
    expect(upsertCalls).toHaveLength(1)
    expect(upsertCalls[0]).toMatchObject({
      source: 'llm',
      model: 'claude-haiku-4-5-20251001',
      latency_ms: 1234,
      message_th: 'จาก LLM',
    })
    expect(cache.get('branch-1')?.messageTh).toBe('จาก LLM')
  })

  it('falls back to the template and persists source=template when the LLM returns null', async () => {
    vi.spyOn(llmAction, 'generateTodaysAction').mockResolvedValue(null)
    const { supabase, upsertCalls } = makeFakeSupabase(null)
    const cache: ActionCache = new Map()

    const result = await resolveTodaysAction(supabase, baseParams(cache))

    expect(result).toEqual(templateAction)
    expect(upsertCalls).toHaveLength(1)
    expect(upsertCalls[0]).toMatchObject({
      source: 'template',
      model: null,
      message_th: templateAction.messageTh,
    })
  })

  it('never calls the LLM when there is no weekdayContext, and still persists the template', async () => {
    const generateSpy = vi.spyOn(llmAction, 'generateTodaysAction')
    const { supabase, upsertCalls } = makeFakeSupabase(null)
    const cache: ActionCache = new Map()

    const params = { ...baseParams(cache), weekdayContext: null }
    const result = await resolveTodaysAction(supabase, params)

    expect(result).toEqual(templateAction)
    expect(generateSpy).not.toHaveBeenCalled()
    expect(upsertCalls[0]).toMatchObject({ source: 'template' })
  })

  it('returns null and persists nothing when there are no per-room rates', async () => {
    const { supabase, upsertCalls } = makeFakeSupabase(null)
    const cache: ActionCache = new Map()

    const params = { ...baseParams(cache), perRoomRates: [] }
    const result = await resolveTodaysAction(supabase, params)

    expect(result).toBeNull()
    expect(upsertCalls).toHaveLength(0)
    expect(cache.get('branch-1')).toBeNull()
  })
})
