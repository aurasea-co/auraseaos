// The two-pass analysis pipeline (Bible §05, W2 prompt).
//
//   Pass 1 — one vision call PER PAGE returns [dish name, printed price].
//   Pass 2 — the CommonDish cache answers what it can; whatever it misses goes
//            to the model in ONE batch; every recipe is then priced against the
//            country's ingredient table.
//
// Country-neutral by contract: nothing here names a country, a currency, or a
// channel. Everything local arrives through EnginePorts.
//
// Three rules shape the control flow, and all three are honesty rules:
//
//   1. A dish that cannot be costed is REPORTED, never dropped. Silently
//      analysing 21 of 24 dishes invents a menu the owner does not have.
//   2. A page that cannot be read is reported separately from a dish that
//      cannot be costed — with an unreadable page we do not know what we
//      missed, which is a different (worse) claim.
//   3. A failure anywhere is local. One unreadable page does not lose the
//      scan; one missing ingredient price does not lose the dish next to it.

import type {
  AnalyzeMenuInput,
  AnalyzeMenuResult,
  Confidence,
  DishAnalysis,
  EstimateRange,
  IngredientPrice,
  PercentRange,
  ReadDish,
  Recipe,
  RecipeSource,
  UncostedDish,
  UnreadablePage,
} from './types'
import type { CountryDataProvider, EnginePorts, ModelCallUsage } from './ports'
import {
  DEFAULT_THRESHOLDS,
  classifyBand,
  computeFoodCostPct,
  relativeBandWidth,
  weakestConfidence,
  type TrafficLightThresholds,
} from './traffic-light'

export interface AnalyzeMenuOptions {
  /** Per-country or per-format overrides; defaults to DEFAULT_THRESHOLDS. */
  thresholds?: TrafficLightThresholds
}

/**
 * How wide a food-cost band may get before the number stops being a claim.
 *
 * A band of 20–60% has a decisive-looking 40% midpoint and tells the owner
 * nothing. Width caps confidence rather than hiding the dish, because "we are
 * not sure about this one" is information and a missing row is not.
 */
const BAND_WIDTH_MEDIUM = 0.4
const BAND_WIDTH_LOW = 0.8

function bandConfidence(pct: PercentRange): Confidence {
  const width = relativeBandWidth(pct)
  if (width === null) return 'low'
  if (width > BAND_WIDTH_LOW) return 'low'
  if (width > BAND_WIDTH_MEDIUM) return 'medium'
  return 'high'
}

/** A recipe resolved for one normalized dish name, from cache or from the model. */
interface ResolvedRecipe {
  /** The canonical name the recipe is filed under — may differ from the key. */
  nameNormalized: string
  recipe: Recipe
  source: RecipeSource
  confidence: Confidence
}

type CostFailure = 'no_recipe' | 'missing_ingredient_price'

type CostOutcome =
  | { ok: true; cost: EstimateRange }
  | { ok: false; reason: CostFailure }

/**
 * Price one portion of a recipe against the country's ingredient table.
 *
 * A single unpriced ingredient fails the whole dish. Costing the other lines
 * and presenting the total anyway would report a confident under-estimate —
 * exactly the "caught being sloppy" failure §12 calls existential.
 */
async function costRecipe(
  recipe: Recipe,
  priceOf: (ingredientKey: string) => Promise<IngredientPrice | null>,
): Promise<CostOutcome> {
  if (recipe.lines.length === 0) return { ok: false, reason: 'no_recipe' }

  const servings = recipe.yieldServings
  if (!Number.isFinite(servings) || servings < 1) return { ok: false, reason: 'no_recipe' }

  let low = 0
  let high = 0

  for (const line of recipe.lines) {
    if (!Number.isFinite(line.quantity) || line.quantity < 0) {
      return { ok: false, reason: 'no_recipe' }
    }

    const price = await priceOf(line.ingredientKey)
    if (!price) return { ok: false, reason: 'missing_ingredient_price' }

    // A price in a different unit is not a price for this line. Multiplying
    // grams by a per-piece rate produces a number, which is the danger.
    if (price.unit !== line.unit) return { ok: false, reason: 'missing_ingredient_price' }

    if (!Number.isFinite(price.price.low) || !Number.isFinite(price.price.high)) {
      return { ok: false, reason: 'missing_ingredient_price' }
    }

    low += line.quantity * price.price.low
    high += line.quantity * price.price.high
  }

  return { ok: true, cost: { low: low / servings, high: high / servings } }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * Read every page, in order.
 *
 * Sequential rather than parallel: the pages of one menu are a handful, and a
 * burst of concurrent vision calls is the shape that trips provider rate limits
 * for no latency win worth having on a flow the visitor is already watching.
 */
async function readPages(
  input: AnalyzeMenuInput,
  ports: EnginePorts,
  usages: ModelCallUsage[],
  unreadablePages: UnreadablePage[],
): Promise<ReadDish[]> {
  const read: ReadDish[] = []

  for (const page of input.pages) {
    try {
      const result = await ports.vision.readPage(page)
      usages.push(...result.usage)
      for (const dish of result.dishes) {
        // Stamp the pageId from the request rather than trusting the port's
        // echo — a mislabelled page silently attributes a dish to the wrong
        // photograph, and nothing downstream could detect it.
        read.push({ ...dish, pageId: page.pageId })
      }
    } catch (error) {
      unreadablePages.push({ pageId: page.pageId, reason: describeError(error) })
    }
  }

  return read
}

/**
 * Drop exact repeats within a page.
 *
 * A menu may legitimately print the same dish twice (two sections, two sizes),
 * so this only collapses rows identical in page, name, and price — the shape a
 * vision model produces when it re-reads a line, not the shape a real menu has.
 */
function dedupeWithinPage(
  dishes: ReadDish[],
  data: CountryDataProvider,
): { dish: ReadDish; nameNormalized: string }[] {
  const seen = new Set<string>()
  const out: { dish: ReadDish; nameNormalized: string }[] = []

  for (const dish of dishes) {
    const nameNormalized = data.normalizeDishName(dish.nameRaw)
    // JSON rather than a joined string: a dish name may contain any separator
    // character we might pick, and a collision here silently eats a real row.
    const key = JSON.stringify([dish.pageId, nameNormalized, dish.menuPrice])
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ dish, nameNormalized })
  }

  return out
}

/**
 * Analyse a photographed menu end to end.
 *
 * Never throws for data reasons — an empty menu, an unreadable page, and a
 * dish with no recipe are all results, not errors. A thrown error here means
 * the ports themselves are broken.
 */
export async function analyzeMenu(
  input: AnalyzeMenuInput,
  ports: EnginePorts,
  options: AnalyzeMenuOptions = {},
): Promise<AnalyzeMenuResult> {
  const thresholds = options.thresholds ?? DEFAULT_THRESHOLDS

  const usages: ModelCallUsage[] = []
  const unreadablePages: UnreadablePage[] = []
  const dishes: DishAnalysis[] = []
  const uncosted: UncostedDish[] = []

  // ── Pass 1: read the pages ───────────────────────────────────────────────
  const read = await readPages(input, ports, usages, unreadablePages)
  const deduped = dedupeWithinPage(read, ports.data)

  // Split off the dishes we read but cannot price. They are reported, not lost.
  const costable: { dish: ReadDish; nameNormalized: string; menuPrice: number }[] = []
  for (const { dish, nameNormalized } of deduped) {
    const price = dish.menuPrice
    if (price === null || !Number.isFinite(price) || price <= 0) {
      uncosted.push({
        pageId: dish.pageId,
        nameRaw: dish.nameRaw,
        menuPrice: null,
        reason: 'unreadable_price',
      })
      continue
    }
    costable.push({ dish, nameNormalized, menuPrice: price })
  }

  // ── Pass 2a: the CommonDish cache answers what it can ────────────────────
  // Keyed by normalized name so a dish printed on three pages costs one lookup
  // and, if it misses, one share of one model call.
  const firstOccurrence = new Map<string, { nameRaw: string; menuPrice: number }>()
  for (const item of costable) {
    if (!firstOccurrence.has(item.nameNormalized)) {
      firstOccurrence.set(item.nameNormalized, {
        nameRaw: item.dish.nameRaw,
        menuPrice: item.menuPrice,
      })
    }
  }

  const resolved = new Map<string, ResolvedRecipe>()
  const misses: { nameRaw: string; nameNormalized: string; menuPrice: number }[] = []
  let cacheHits = 0

  for (const [nameNormalized, sample] of firstOccurrence) {
    const match = await ports.data.findCommonDish(sample.nameRaw)
    if (match) {
      cacheHits++
      resolved.set(nameNormalized, {
        // The provider's canonical name wins: an alias hit means the dish is
        // really the cached one, and reporting the printed spelling as its
        // normalized form would make two restaurants incomparable.
        nameNormalized: match.nameNormalized,
        recipe: match.recipe,
        source: 'cache',
        confidence: match.matchConfidence,
      })
      continue
    }
    misses.push({ nameNormalized, nameRaw: sample.nameRaw, menuPrice: sample.menuPrice })
  }

  // ── Pass 2b: one batched inference for the misses ────────────────────────
  let inferredRecipes = 0
  let recipeCallCount = 0

  if (misses.length > 0) {
    const result = await ports.recipes.inferRecipes({
      dishes: misses,
      countryCode: ports.data.countryCode,
    })
    usages.push(...result.usage)
    recipeCallCount = result.usage.length

    const requested = new Set(misses.map((m) => m.nameNormalized))
    for (const inferred of result.recipes) {
      // Discard keys we did not ask about rather than filing a recipe under a
      // name the model invented.
      if (!requested.has(inferred.nameNormalized)) continue
      if (resolved.has(inferred.nameNormalized)) continue
      inferredRecipes++
      resolved.set(inferred.nameNormalized, {
        nameNormalized: inferred.nameNormalized,
        recipe: inferred.recipe,
        source: 'inferred',
        confidence: inferred.confidence,
      })
    }
  }

  // ── Pass 2c: price every recipe ──────────────────────────────────────────
  const priceCache = new Map<string, IngredientPrice | null>()
  const priceOf = async (ingredientKey: string): Promise<IngredientPrice | null> => {
    const cached = priceCache.get(ingredientKey)
    if (cached !== undefined) return cached
    const price = await ports.data.getIngredientPrice(ingredientKey)
    priceCache.set(ingredientKey, price)
    return price
  }

  for (const item of costable) {
    const entry = resolved.get(item.nameNormalized)
    if (!entry) {
      uncosted.push({
        pageId: item.dish.pageId,
        nameRaw: item.dish.nameRaw,
        menuPrice: item.menuPrice,
        reason: 'no_recipe',
      })
      continue
    }

    const costed = await costRecipe(entry.recipe, priceOf)
    if (!costed.ok) {
      uncosted.push({
        pageId: item.dish.pageId,
        nameRaw: item.dish.nameRaw,
        menuPrice: item.menuPrice,
        reason: costed.reason,
      })
      continue
    }

    const foodCostPct = computeFoodCostPct(costed.cost, item.menuPrice)
    if (!foodCostPct) {
      uncosted.push({
        pageId: item.dish.pageId,
        nameRaw: item.dish.nameRaw,
        menuPrice: item.menuPrice,
        reason: 'unreadable_price',
      })
      continue
    }

    const verdict = classifyBand(foodCostPct, thresholds)

    dishes.push({
      pageId: item.dish.pageId,
      nameRaw: item.dish.nameRaw,
      nameNormalized: entry.nameNormalized,
      menuPrice: item.menuPrice,
      cost: costed.cost,
      foodCostPct,
      // A dish is only as trustworthy as its shakiest input: how sure we are of
      // the recipe, and how wide the resulting band came out.
      confidence: weakestConfidence(entry.confidence, bandConfidence(foodCostPct)),
      trafficLight: verdict.trafficLight,
      bandCertain: verdict.bandCertain,
      recipeSource: entry.source,
      // Always an estimate here. `measured` is only reachable once a paying
      // owner has confirmed real recipes and real purchase prices (W8).
      basis: 'estimate',
      recipe: entry.recipe,
    })
  }

  // ── Accounting ───────────────────────────────────────────────────────────
  // One row per model call. Cache hits ride on the first pass-2 row, because
  // that is the call whose size the cache reduced; with no pass-2 call there is
  // no honest row to hang them on, and `stats.cacheHits` carries them instead.
  const firstRecipeUsageIndex = recipeCallCount > 0 ? usages.length - recipeCallCount : -1

  for (const [index, usage] of usages.entries()) {
    try {
      await ports.usage.record({
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheHits: index === firstRecipeUsageIndex ? cacheHits : 0,
      })
    } catch {
      // Losing a usage row is an accounting problem; losing the owner's
      // analysis because accounting failed is a product problem.
    }
  }

  return {
    dishes,
    uncosted,
    unreadablePages,
    currencyCode: ports.data.currencyCode,
    stats: {
      pagesRead: input.pages.length - unreadablePages.length,
      modelCalls: usages.length,
      cacheHits,
      inferredRecipes,
    },
  }
}
