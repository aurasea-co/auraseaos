// Thailand CountryDataProvider — the first of N.
//
// Adding Vietnam means adding a sibling directory and one registry entry. It
// must never mean touching src/lib/menudesk/engine; if it does, the seam has
// been broken and check-boundaries should have caught it.
//
// The catalogue is TypeScript, not a database read, and that is a deliberate
// choice rather than a shortcut. It is code-reviewed like anything else, it
// answers with no round trip while a scanner waits, and `npm run analyze`
// works on a laptop with no Supabase credentials. `npm run seed:menudesk`
// generates the equivalent SQL for migration 043's `common_dishes` /
// `ingredient_prices` tables, so the DB copy exists for the concierge admin
// (W9) — at which point the DB becomes the source of truth and these files
// become its bootstrap. Both lookups are already async, so that swap does not
// ripple outward.

import type {
  CommonDishMatch,
  CountryDataProvider,
  IngredientPrice,
  IngredientVocabularyEntry,
} from '@/lib/menudesk/engine'
import { TH_COMMON_DISHES } from './dishes'
import { TH_INGREDIENTS } from './ingredients'

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
 * Words that look like a bracketed aside but are actually the dish.
 *
 * Thai café menus price hot and iced separately — "ลาเต้ (ร้อน) 55 / ลาเต้
 * (เย็น) 65" is two products with two prices and two recipes, since an iced
 * drink carries a cup of ice and a different milk volume. Stripping the
 * bracket the way we strip "(พิเศษ)" would collapse them into one dish and
 * cost the iced one as if it were hot: a confident wrong answer on a menu
 * section every café in the ICP has.
 */
const TEMPERATURE_QUALIFIERS = ['ร้อน', 'เย็น', 'ปั่น', 'hot', 'iced', 'blended', 'frappe']

/**
 * Re-attach a qualifier that survived in the raw name but was cleaned away —
 * without duplicating one the cleaned name already carries ("ชาเย็น" must not
 * become "ชาเย็น เย็น").
 */
function preserveTemperature(nameRaw: string, cleaned: string): string {
  const rawLower = nameRaw.toLowerCase()
  const cleanedLower = cleaned.toLowerCase()

  const missing = TEMPERATURE_QUALIFIERS.filter(
    (word) => rawLower.includes(word) && !cleanedLower.includes(word),
  )

  return missing.length > 0 ? `${cleaned} ${missing.join(' ')}`.trim() : cleaned
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

  const stripped = stripDecorations(withoutBrackets)
    .replace(/[.,;:!?"'`~*_/\\|–—-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const cleaned = preserveTemperature(nameRaw, stripped)

  // Latin names fold to lowercase and join on underscores so they line up with
  // the canonical keys in dishes.ts; Thai has no case, so it is left as written.
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

// The seed carries nameLocal and a provenance tag for the admin and the SQL
// generator; the engine only ever needs the key, the unit, and the band.
const PRICE_INDEX = new Map<string, IngredientPrice>(
  TH_INGREDIENTS.map(({ ingredientKey, unit, price }) => [
    ingredientKey,
    { ingredientKey, unit, price },
  ]),
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
    return TH_INGREDIENTS.map(({ ingredientKey, unit }) => ({ ingredientKey, unit }))
  },
}
