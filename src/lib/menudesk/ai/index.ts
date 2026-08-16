// Port implementations backed by the Anthropic API.
//
// This module sits OUTSIDE the engine and depends on it, never the reverse:
// it implements MenuVisionPort and RecipeInferencePort so the engine can stay
// free of any model vendor. The actual calls land in W2 — W0 fixes the model
// choice, the cost accounting, and the direction of the dependency arrow.
//
// It reuses the shared client in src/lib/ai/anthropic-client.ts rather than
// constructing its own, so the API key and provider live in one place shared
// with RateDesk.

export {
  DEFAULT_MODEL,
  ESCALATION_MODEL,
  MODEL_PRICING,
  estimateCostUsd,
  maxImageEdgeFor,
} from './models'

export type { ModelPricing, TokenUsage } from './models'

/**
 * Notes for W2, recorded here so the constraints are not rediscovered later:
 *
 * - Pass 1 reads ONE page per call and returns [dish name, printed price].
 *   Use structured outputs (`output_config.format` with a JSON schema) —
 *   Haiku 4.5 supports them, and they remove the JSON-repair loop entirely.
 *   Assistant prefill is not an option: it returns a 400 on current models.
 *
 * - Do not set `output_config.effort` on Haiku 4.5 — the parameter errors on
 *   that model. Leave thinking unset too; reading printed text off a menu is
 *   not a reasoning task and thinking tokens are billed.
 *
 * - Prompt caching needs a 4096-token prefix on Haiku 4.5. A short extraction
 *   prompt will sit under that and silently not cache, so do not count on
 *   cache savings for pass 1; the CommonDish cache is where pass 2 saves.
 */
