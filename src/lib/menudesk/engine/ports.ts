// The interfaces the engine needs the outside world to satisfy.
//
// These live HERE, inside the engine, rather than beside their implementations
// — that is what keeps the dependency arrow pointing inward. data/th and ai/
// import from this file; the engine imports nothing from them. Move these
// declarations next to an implementation and the inversion collapses, which is
// exactly the failure scripts/check-boundaries.mjs exists to catch.

import type {
  CommonDishMatch,
  Confidence,
  IngredientPrice,
  MenuPageImage,
  ReadDish,
  Recipe,
} from './types'

/**
 * Everything country-specific the engine needs, bound to one country.
 *
 * The Bible's W3 prompt writes these as free functions taking a countryCode
 * argument. Binding the country into the instance instead means the engine
 * cannot accidentally mix two countries' data inside a single analysis, and
 * `getCountryDataProvider('TH')` at the composition root reads the same way.
 */
export interface CountryDataProvider {
  /** ISO 3166-1 alpha-2, e.g. 'TH'. */
  readonly countryCode: string
  /** ISO 4217, e.g. 'THB'. The engine never assumes this. */
  readonly currencyCode: string

  /**
   * Collapse a printed dish name to the country's canonical form: strip
   * decoration and portion words, fold spelling variants, transliterate where
   * that is what makes two menus comparable. Pure and synchronous — it is a
   * lookup key, and callers use it far too often to pay for a round trip.
   */
  normalizeDishName(nameRaw: string): string

  /**
   * Look for a curated recipe for this dish. A hit costs nothing and keeps
   * answers consistent between restaurants; a miss sends the dish to the
   * model. Bible §05 wants most dishes to land here — the cache is what makes
   * the free hook close to free.
   */
  findCommonDish(nameRaw: string): Promise<CommonDishMatch | null>

  /**
   * Current local market price band for an ingredient. Returns null when the
   * ingredient is unknown, which makes the dish uncostable — better than
   * guessing a price and reporting the result as if we knew it.
   */
  getIngredientPrice(ingredientKey: string): Promise<IngredientPrice | null>

  /**
   * Every ingredient this country can price, with the unit its price is quoted
   * in. The engine never calls it — a recipe arrives already written.
   *
   * It lives on this interface because it is country data and has nowhere
   * better to be: RecipeInferencePort implementations need the vocabulary to
   * write recipes IN, or the model invents ingredient keys nothing can price
   * and every inferred dish comes back uncostable.
   */
  listIngredients(): Promise<IngredientVocabularyEntry[]>
}

/** One ingredient a country can price — the key, and the unit to quantify it in. */
export interface IngredientVocabularyEntry {
  ingredientKey: string
  unit: string
}

/**
 * What one model call cost, in tokens. Ports report it; the engine forwards it
 * to the UsageRecorder. Reported per CALL rather than per port invocation, so a
 * batched or retried implementation stays auditable call by call.
 */
export interface ModelCallUsage {
  model: string
  inputTokens: number
  outputTokens: number
  /** Tokens served from the prompt cache, billed at the cache-read rate. */
  cacheReadTokens?: number
}

/**
 * Pass 1 — read a whole page in one call.
 *
 * The unit is deliberately the PAGE, not the dish: Bible §05 puts the cost
 * difference at 20–40×, because a page of 30 dishes is one image either way.
 * An implementation that loops per dish is a correctness-neutral, cost-fatal
 * mistake, so the interface does not offer that shape at all.
 *
 * Throwing means the page is unreadable; the engine records it as such and
 * carries on with the remaining pages rather than losing the whole scan.
 */
export interface MenuVisionPort {
  readPage(page: MenuPageImage): Promise<{ dishes: ReadDish[]; usage: ModelCallUsage[] }>
}

/** One dish the CommonDish cache could not answer. */
export interface RecipeInferenceRequest {
  nameRaw: string
  /** The engine's lookup key — echo it back so results can be re-matched. */
  nameNormalized: string
  menuPrice: number
}

export interface InferredRecipe {
  /** Must echo the requested `nameNormalized`; unknown keys are discarded. */
  nameNormalized: string
  recipe: Recipe
  confidence: Confidence
}

/**
 * Pass 2 — infer standard recipes for the dishes the CommonDish cache missed.
 *
 * Takes the whole batch, for the same reason pass 1 takes the whole page: a
 * per-dish call multiplies the fixed prompt cost by the length of the menu.
 * The implementation may chunk internally — that is a cost policy, and cost
 * policy belongs beside the model, not inside the engine.
 *
 * A dish absent from the returned array is reported as uncostable rather than
 * guessed at.
 */
export interface RecipeInferencePort {
  inferRecipes(input: {
    dishes: RecipeInferenceRequest[]
    countryCode: string
  }): Promise<{ recipes: InferredRecipe[]; usage: ModelCallUsage[] }>
}

/**
 * Where a model call's token spend is recorded. Every call the engine causes
 * passes through here — Bible §16 makes AI cost per free analysis a tracked
 * KPI, and a KPI nobody can compute is a KPI nobody manages.
 *
 * Implementations must not throw: losing a usage row is an accounting problem,
 * losing the owner's analysis because accounting failed is a product problem.
 */
export interface UsageRecorder {
  record(usage: {
    model: string
    inputTokens: number
    outputTokens: number
    cacheHits: number
  }): Promise<void>
}

/** Everything the engine is handed at the composition root. */
export interface EnginePorts {
  data: CountryDataProvider
  vision: MenuVisionPort
  recipes: RecipeInferencePort
  usage: UsageRecorder
}
