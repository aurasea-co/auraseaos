// Model selection and cost accounting for the MenuDesk scan engine.
//
// Bible §05 sets the economics: the free scan is the hook, so one restaurant's
// analysis has to land near 15–20 US cents and fall toward zero as the
// CommonDish cache fills. That budget is what picks the model — Haiku-class
// for the default read, with escalation only for a page that fails to parse.
//
// Rates below are Anthropic list prices per million tokens, verified against
// the claude-api skill rather than recalled. They are the only place in the
// codebase that knows what a token costs; update here when pricing moves.

/** Default for both passes — the cheap workhorse (Bible §05). */
export const DEFAULT_MODEL = 'claude-haiku-4-5'

/**
 * Escalation for a page Haiku could not read: a dense, handwritten, or badly
 * lit menu. Reserved for retries — routing every page here would blow the
 * per-scan budget several times over.
 */
export const ESCALATION_MODEL = 'claude-opus-5'

export interface ModelPricing {
  /** USD per 1M input tokens. */
  inputPerMTok: number
  /** USD per 1M output tokens. */
  outputPerMTok: number
  /** USD per 1M tokens read from the prompt cache. */
  cacheReadPerMTok: number
  /** Longest image edge the model accepts, in pixels. */
  maxImageEdgePx: number
  /**
   * Smallest prompt prefix that can be cached at all. Below this the request
   * silently does not cache — no error, just no saving.
   */
  minCacheablePromptTokens: number
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-haiku-4-5': {
    inputPerMTok: 1.0,
    outputPerMTok: 5.0,
    // Cache reads run about a tenth of the base input rate.
    cacheReadPerMTok: 0.1,
    // Haiku 4.5 is NOT in the high-resolution tier — it caps at 1568px on the
    // long edge. This is the number the client-side downscaler in W1 targets:
    // sending a 3000px photo buys no extra fidelity, only upload time.
    maxImageEdgePx: 1568,
    minCacheablePromptTokens: 4096,
  },
  'claude-opus-5': {
    inputPerMTok: 5.0,
    outputPerMTok: 25.0,
    cacheReadPerMTok: 0.5,
    maxImageEdgePx: 2576,
    minCacheablePromptTokens: 512,
  },
}

export interface TokenUsage {
  model: string
  inputTokens: number
  outputTokens: number
  /** Tokens served from the prompt cache, billed at the cache-read rate. */
  cacheReadTokens?: number
}

/**
 * What one model call cost, in USD.
 *
 * Returns null for an unknown model rather than guessing a rate — a fabricated
 * cost figure in `ai_usage` is worse than a null, because it looks like data.
 */
export function estimateCostUsd(usage: TokenUsage): number | null {
  const pricing = MODEL_PRICING[usage.model]
  if (!pricing) return null

  const cacheRead = usage.cacheReadTokens ?? 0

  return (
    (usage.inputTokens / 1_000_000) * pricing.inputPerMTok +
    (usage.outputTokens / 1_000_000) * pricing.outputPerMTok +
    (cacheRead / 1_000_000) * pricing.cacheReadPerMTok
  )
}

/**
 * Longest image edge worth sending to a model. The client downscaler uses this
 * before upload — pixels past the cap are discarded server-side after we have
 * already paid to transfer them.
 */
export function maxImageEdgeFor(model: string): number {
  return MODEL_PRICING[model]?.maxImageEdgePx ?? 1568
}
