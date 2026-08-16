// UsageRecorder implementations.
//
// Bible §16 makes "AI cost per free analysis" a tracked KPI, and a KPI nobody
// can compute is a KPI nobody manages. The in-memory recorder is what the CLI
// and the tests use; the route layer will write the same rows to `ai_usage`
// (migration 043) once the scan pipeline is wired up in W4.

import type { UsageRecorder } from '@/lib/menudesk/engine'
import { estimateCostUsd } from './models'

export interface RecordedUsage {
  model: string
  inputTokens: number
  outputTokens: number
  cacheHits: number
  /** Null for a model with no known price — see estimateCostUsd. */
  costUsd: number | null
}

export interface UsageSummary {
  calls: number
  inputTokens: number
  outputTokens: number
  cacheHits: number
  /** Total for the calls we could price. */
  costUsd: number
  /**
   * Calls whose model has no entry in MODEL_PRICING, and so are missing from
   * costUsd. Reported rather than folded in as zero: an under-stated cost that
   * looks complete is how a budget quietly stops being true.
   */
  unpricedCalls: number
}

export interface InMemoryUsageRecorder extends UsageRecorder {
  rows(): RecordedUsage[]
  summary(): UsageSummary
}

/** Collects usage rows in memory and totals their cost. Never throws. */
export function createInMemoryUsageRecorder(): InMemoryUsageRecorder {
  const rows: RecordedUsage[] = []

  return {
    async record(usage) {
      rows.push({
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheHits: usage.cacheHits,
        costUsd: estimateCostUsd({
          model: usage.model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        }),
      })
    },

    rows() {
      return [...rows]
    },

    summary() {
      return rows.reduce<UsageSummary>(
        (acc, row) => ({
          calls: acc.calls + 1,
          inputTokens: acc.inputTokens + row.inputTokens,
          outputTokens: acc.outputTokens + row.outputTokens,
          cacheHits: acc.cacheHits + row.cacheHits,
          costUsd: acc.costUsd + (row.costUsd ?? 0),
          unpricedCalls: acc.unpricedCalls + (row.costUsd === null ? 1 : 0),
        }),
        { calls: 0, inputTokens: 0, outputTokens: 0, cacheHits: 0, costUsd: 0, unpricedCalls: 0 },
      )
    },
  }
}

/** Discards every row. For callers that genuinely do not want accounting. */
export function createNullUsageRecorder(): UsageRecorder {
  return {
    async record() {
      /* intentionally empty */
    },
  }
}
