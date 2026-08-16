// MenuDesk analysis engine — value types.
//
// Country-neutral by contract (see scripts/check-boundaries.mjs). Nothing in
// this directory may name a country, a currency symbol, or a channel.
//
// The honesty rule from the Bible (§06) is enforced structurally rather than
// by convention: a free-tier cost estimate is built from an inferred recipe
// priced against market ingredient ranges, so it is genuinely uncertain, and
// the type system refuses to let that uncertainty be dropped. There is no
// `cost: number` field anywhere in this file and there must never be one —
// every money estimate is an EstimateRange plus a Confidence. A single number
// on screen is a promise we cannot keep, and §12 rates one owner catching us
// being sloppy as the existential risk for the whole product.

/** How much we trust an estimate. Always travels with the number it describes. */
export type Confidence = 'high' | 'medium' | 'low'

/** The at-a-glance verdict for one dish. */
export type TrafficLight = 'green' | 'amber' | 'red'

/**
 * Where a dish's recipe came from. `cache` means a curated CommonDish recipe
 * (cheap, consistent, reviewed); `inferred` means the model guessed a standard
 * recipe for this run. Callers surface the difference — an inferred recipe is
 * the weaker claim, and pretending otherwise is the trust leak in §12.
 */
export type RecipeSource = 'cache' | 'inferred'

/**
 * Whether the numbers rest on assumptions or on the restaurant's own data.
 * The free tier is always `estimate` and must be labelled as such in the UI.
 * `measured` is only reachable once a paying owner has confirmed real recipes
 * and real purchase prices (W8) — it is not a tier flag, it is a claim about
 * where the inputs came from, so it can never be set by an upgrade alone.
 */
export type AnalysisBasis = 'estimate' | 'measured'

/**
 * An inclusive low–high band in the provider's currency, major units
 * (whole baht in Thailand, not satang — see AURASEA_HOUSE_STYLE.md).
 *
 * Both bounds are required. That is the whole point of the type: there is no
 * way to express "the cost is 42" without also saying how wide the band is.
 */
export interface EstimateRange {
  low: number
  high: number
}

/** A percentage band, 0–100. Same low/high discipline as EstimateRange. */
export interface PercentRange {
  low: number
  high: number
}

// ── Pass 1: reading the menu ───────────────────────────────────────────────

/**
 * One menu photograph, already downscaled and cropped client-side. Held as
 * base64 rather than a URL or a file handle so the engine stays free of both
 * the network and the filesystem.
 */
export interface MenuPageImage {
  /** Caller's identifier, echoed back on every dish read from this page. */
  pageId: string
  base64: string
  /** e.g. 'image/jpeg' — an IANA type, not a file extension. */
  mediaType: string
}

/**
 * A dish as printed on the menu. The price is READ, never typed by the owner
 * (Bible §02, rule 2: "เจ้าของแทบไม่ต้องกรอกอะไร") — every field an owner has
 * to fill is a place the funnel leaks.
 */
export interface ReadDish {
  pageId: string
  /** Exactly as printed, in the menu's own language and spelling. */
  nameRaw: string
  /**
   * Printed selling price, major currency units. Null when the dish is legible
   * but its price is not — a torn corner, a hand-written amendment, a price
   * column cut off by the photograph's edge.
   *
   * Nullable rather than omitted so a priceless dish still reaches the caller
   * as an UncostedDish ('unreadable_price') instead of vanishing. "We found 24
   * dishes and could not price 3" is honest; silently reading 21 is not.
   */
  menuPrice: number | null
}

// ── Pass 2: costing the dish ───────────────────────────────────────────────

/**
 * One line of a recipe. `ingredientKey` is a country-neutral identifier
 * (`pork_belly`, `palm_sugar`) that a CountryDataProvider resolves to a local
 * name and a local price — this is the seam that lets a second country be a
 * new data set rather than a new engine.
 */
export interface RecipeLine {
  ingredientKey: string
  quantity: number
  /** Unit the quantity is expressed in, matching the ingredient's price unit. */
  unit: string
}

export interface Recipe {
  lines: RecipeLine[]
  /** Portions this recipe yields; costs divide by it. Must be >= 1. */
  yieldServings: number
}

/** A local market price band for one ingredient, per `unit`. */
export interface IngredientPrice {
  ingredientKey: string
  unit: string
  price: EstimateRange
}

/** A curated recipe matched from the country's CommonDish set. */
export interface CommonDishMatch {
  nameNormalized: string
  recipe: Recipe
  /**
   * How sure the matcher is that this cached dish is the same dish as the one
   * printed on the menu. A confident recipe matched to the wrong dish is still
   * a wrong answer, so match confidence caps the analysis confidence.
   */
  matchConfidence: Confidence
}

/** The finished verdict for one dish. */
export interface DishAnalysis {
  pageId: string
  nameRaw: string
  nameNormalized: string
  menuPrice: number

  /** Estimated cost to produce one portion. A band, always. */
  cost: EstimateRange
  /** cost ÷ menuPrice, as a percentage band. */
  foodCostPct: PercentRange

  confidence: Confidence
  trafficLight: TrafficLight
  /**
   * False when the low and high ends of foodCostPct fall in different traffic
   * -light bands — the verdict is then directional, not settled, and the UI
   * should say so rather than paint a confident colour over a coin flip.
   */
  bandCertain: boolean

  recipeSource: RecipeSource
  basis: AnalysisBasis
  /** Null when no recipe could be established; cost is then unresolvable. */
  recipe: Recipe | null
}

/**
 * A dish we read but could not cost — an unmatched name, a missing ingredient
 * price, an unreadable price. Reported explicitly instead of silently dropped:
 * "we found 24 dishes and could not cost 3 of them" is honest, whereas
 * quietly analysing 21 invents a menu the owner does not have.
 */
export interface UncostedDish {
  pageId: string
  nameRaw: string
  menuPrice: number | null
  reason: 'no_recipe' | 'missing_ingredient_price' | 'unreadable_price'
}

// ── Pipeline shape ─────────────────────────────────────────────────────────

export interface AnalyzeMenuInput {
  pages: MenuPageImage[]
}

/**
 * A page the vision pass could not read at all. Distinct from an UncostedDish:
 * nothing was extracted, so we do not know what we missed. Surfaced so the
 * caller can mark the page `unreadable` and ask for a re-shoot rather than
 * presenting a partial menu as if it were whole.
 */
export interface UnreadablePage {
  pageId: string
  /** Diagnostic text, for logs and the retry prompt — never shown raw. */
  reason: string
}

/** Counts that make the free tier's economics auditable (Bible §16). */
export interface AnalyzeMenuStats {
  pagesRead: number
  /** Model calls the analysis caused, across both passes. */
  modelCalls: number
  /** Distinct dishes answered from the CommonDish cache, with no model call. */
  cacheHits: number
  /** Distinct dishes whose recipe the model had to invent. */
  inferredRecipes: number
}

export interface AnalyzeMenuResult {
  dishes: DishAnalysis[]
  uncosted: UncostedDish[]
  unreadablePages: UnreadablePage[]
  /** ISO 4217 code the numbers are denominated in, from the data provider. */
  currencyCode: string
  stats: AnalyzeMenuStats
}
