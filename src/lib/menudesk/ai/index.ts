// Port implementations backed by the Anthropic API.
//
// This module sits OUTSIDE the engine and depends on it, never the reverse:
// it implements MenuVisionPort and RecipeInferencePort so the engine can stay
// free of any model vendor.
//
// It reuses the shared client in src/lib/ai/anthropic-client.ts rather than
// constructing its own, so the API key and provider live in one place shared
// with RateDesk.
//
// Constraints that shaped both implementations, recorded so they are not
// rediscovered the hard way:
//
// - Both passes use structured outputs (`output_config.format` with a JSON
//   schema) rather than forced tool use. Haiku 4.5 supports them and they
//   remove the JSON-repair loop entirely. Assistant prefill — the other way to
//   pin an output shape — returns a 400 on current models.
//
// - Do not set `output_config.effort` on Haiku 4.5; the parameter errors on
//   that model. Leave thinking unset too: reading printed text off a menu is
//   not a reasoning task, and thinking tokens are billed.
//
// - Prompt caching needs a 4096-token prefix on Haiku 4.5. Neither prompt here
//   reaches that, so neither caches — there is no error, just no saving. The
//   CommonDish cache is where pass 2 actually saves.

export {
  DEFAULT_MODEL,
  ESCALATION_MODEL,
  MODEL_PRICING,
  estimateCostUsd,
  maxImageEdgeFor,
} from './models'

export type { ModelPricing, TokenUsage } from './models'

export {
  buildReadPageRequest,
  createAnthropicVisionPort,
  parseReadPageResponse,
} from './vision'

export type { AnthropicVisionPortOptions } from './vision'

export {
  RECIPE_BATCH_SIZE,
  buildInferRecipesRequest,
  createAnthropicRecipePort,
  parseInferRecipesResponse,
} from './recipes'

export type { AnthropicRecipePortOptions, RecipeBatchItem } from './recipes'

export { createInMemoryUsageRecorder, createNullUsageRecorder } from './usage'

export type { InMemoryUsageRecorder, RecordedUsage, UsageSummary } from './usage'
