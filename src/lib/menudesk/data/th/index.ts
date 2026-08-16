// Thailand CountryDataProvider — the first of N.
//
// Adding Vietnam means adding a sibling directory and one registry entry. It
// must never mean touching src/lib/menudesk/engine; if it does, the seam has
// been broken and check-boundaries should have caught it.
//
// W0 answers from the in-memory seed in ./seed.ts. W3 swaps the two lookups
// for reads against `common_dishes` / `ingredient_prices` (migration 043) —
// both are already async so that change does not ripple outward.

import type {
  CommonDishMatch,
  CountryDataProvider,
  IngredientPrice,
  IngredientVocabularyEntry,
} from '@/lib/menudesk/engine'
import { TH_COMMON_DISHES, TH_INGREDIENT_PRICES } from './seed'

/** Thai script block; used to decide whether to strip Latin-only noise. */
const THAI_CHAR = /[฀-๿]/

/**
 * Decoration Thai menus add around the dish itself. Stripped before matching
 * so "ผัดกะเพราหมู (พิเศษ)" and "ผัดกะเพราหมู" are the same dish.
 */
const DECORATIONS = [
  'พิเศษ',
  'จานใหญ่',
  'ธรรมดา',
  'ราดข้าว',
  'เมนูแนะนำ',
  'ใหม่',
  'special',
  'recommended',
  'new',
]

function stripDecorations(value: string): string {
  let out = value
  for (const token of DECORATIONS) {
    out = out.split(token).join(' ')
  }
  return out
}

/**
 * Normalize a printed dish name to a matching key.
 *
 * Thai is written without spaces between words, so this cannot tokenise the
 * way an English normalizer would. It removes bracketed asides, prices, and
 * decoration words, folds Latin text to lowercase, and collapses whitespace.
 * Deliberately conservative: over-normalizing collides two genuinely different
 * dishes, and a confident recipe on the wrong dish is the worst failure mode
 * we have.
 */
export function normalizeThaiDishName(nameRaw: string): string {
  const withoutBrackets = nameRaw
    .replace(/[([{（][^)\]}）]*[)\]}）]/g, ' ')
    // Trailing price fragments the vision pass may include with the name.
    .replace(/[฿]\s*\d[\d,.]*/g, ' ')
    .replace(/\b\d+\s*(?:บาท|baht|thb)\b/gi, ' ')

  const cleaned = stripDecorations(withoutBrackets)
    .replace(/[.,;:!?"'`~*_/\\|–—-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Latin names fold to lowercase and join on underscores so they line up with
  // the canonical keys in seed.ts; Thai has no case, so it is left as written.
  return THAI_CHAR.test(cleaned)
    ? cleaned
    : cleaned.toLowerCase().replace(/\s+/g, '_')
}

// Alias → dish, built once at module load. Aliases are normalized with the
// same function used on incoming names, so the two sides cannot drift.
const ALIAS_INDEX = new Map<string, (typeof TH_COMMON_DISHES)[number]>()
for (const dish of TH_COMMON_DISHES) {
  ALIAS_INDEX.set(dish.nameNormalized, dish)
  for (const alias of dish.aliases) {
    ALIAS_INDEX.set(normalizeThaiDishName(alias), dish)
  }
}

const PRICE_INDEX = new Map<string, IngredientPrice>(
  TH_INGREDIENT_PRICES.map((p) => [p.ingredientKey, p]),
)

export const thailandDataProvider: CountryDataProvider = {
  countryCode: 'TH',
  currencyCode: 'THB',

  normalizeDishName(nameRaw: string): string {
    return normalizeThaiDishName(nameRaw)
  },

  async findCommonDish(nameRaw: string): Promise<CommonDishMatch | null> {
    const key = normalizeThaiDishName(nameRaw)
    const hit = ALIAS_INDEX.get(key)
    if (!hit) return null

    return {
      nameNormalized: hit.nameNormalized,
      recipe: hit.recipe,
      // Exact alias hit only — this provider does no fuzzy matching yet, so a
      // hit is as good as the curated data behind it. Once W3 introduces
      // near-matching, a fuzzy hit must report lower confidence than this.
      matchConfidence: 'high',
    }
  },

  async getIngredientPrice(ingredientKey: string): Promise<IngredientPrice | null> {
    return PRICE_INDEX.get(ingredientKey) ?? null
  },

  async listIngredients(): Promise<IngredientVocabularyEntry[]> {
    return TH_INGREDIENT_PRICES.map(({ ingredientKey, unit }) => ({ ingredientKey, unit }))
  },
}
