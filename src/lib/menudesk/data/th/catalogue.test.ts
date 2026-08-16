// Integrity of the Thai reference catalogue.
//
// This is data, not logic, so the tests are invariants rather than behaviour:
// the things that go wrong when a hundred recipes are edited by hand over
// months. The alias-collision test is the one that matters most — two dishes
// sharing a printed spelling means one silently inherits the other's recipe,
// and a confident recipe on the wrong dish is the worst answer this system can
// give.

import { describe, expect, it } from 'vitest'
import { TH_INGREDIENTS } from './ingredients'
import { TH_COMMON_DISHES } from './dishes'
import { normalizeThaiDishName, thailandDataProvider } from './index'

describe('TH ingredient catalogue', () => {
  it('has no duplicate ingredient keys', () => {
    const seen = new Set<string>()
    const duplicates = TH_INGREDIENTS.filter((i) => !seen.add(i.ingredientKey) || false)
      .map((i) => i.ingredientKey)
    expect(duplicates).toEqual([])
  })

  it('quotes every price as a positive, ordered band', () => {
    for (const ingredient of TH_INGREDIENTS) {
      const { low, high } = ingredient.price
      expect(low, `${ingredient.ingredientKey} low`).toBeGreaterThan(0)
      expect(high, `${ingredient.ingredientKey} high`).toBeGreaterThanOrEqual(low)
    }
  })

  it('keeps every band inside the honesty rule\'s width', () => {
    // Bible §06 puts free-tier ingredient accuracy at ±20–40%. A band wider
    // than that is not an estimate, it is a shrug, and it should either be
    // researched or split into two ingredients.
    for (const ingredient of TH_INGREDIENTS) {
      const { low, high } = ingredient.price
      const relativeWidth = (high - low) / ((high + low) / 2)
      expect(relativeWidth, `${ingredient.ingredientKey} band width`).toBeLessThanOrEqual(1)
    }
  })

  it('uses only units the recipes can express', () => {
    for (const ingredient of TH_INGREDIENTS) {
      expect(['g', 'ml', 'piece']).toContain(ingredient.unit)
    }
  })
})

describe('TH common-dish catalogue', () => {
  it('holds roughly the hundred dishes Bible §05 asks for', () => {
    expect(TH_COMMON_DISHES.length).toBeGreaterThanOrEqual(100)
  })

  it('has no duplicate canonical names', () => {
    const names = TH_COMMON_DISHES.map((d) => d.nameNormalized)
    expect(names.length).toBe(new Set(names).size)
  })

  it('never lets one printed spelling resolve to two different dishes', () => {
    const owner = new Map<string, string>()
    const collisions: string[] = []

    for (const dish of TH_COMMON_DISHES) {
      for (const alias of [dish.nameNormalized, ...dish.aliases]) {
        const key = normalizeThaiDishName(alias)
        const existing = owner.get(key)
        if (existing && existing !== dish.nameNormalized) {
          collisions.push(`'${alias}' claimed by both ${existing} and ${dish.nameNormalized}`)
        }
        owner.set(key, dish.nameNormalized)
      }
    }

    expect(collisions).toEqual([])
  })

  it('normalizes every alias to a non-empty key', () => {
    // An alias that normalizes away to '' would match every unreadable name.
    for (const dish of TH_COMMON_DISHES) {
      for (const alias of dish.aliases) {
        expect(normalizeThaiDishName(alias), `${dish.nameNormalized}: '${alias}'`).not.toBe('')
      }
    }
  })

  it('gives every dish a usable recipe', () => {
    for (const dish of TH_COMMON_DISHES) {
      expect(dish.recipe.lines.length, dish.nameNormalized).toBeGreaterThan(0)
      expect(dish.recipe.yieldServings, dish.nameNormalized).toBeGreaterThanOrEqual(1)
      for (const line of dish.recipe.lines) {
        expect(line.quantity, `${dish.nameNormalized}/${line.ingredientKey}`).toBeGreaterThan(0)
      }
    }
  })

  it('prices every recipe line — no dish is uncostable by construction', async () => {
    const unpriceable: string[] = []

    for (const dish of TH_COMMON_DISHES) {
      for (const line of dish.recipe.lines) {
        const price = await thailandDataProvider.getIngredientPrice(line.ingredientKey)
        if (!price) {
          unpriceable.push(`${dish.nameNormalized} → ${line.ingredientKey} (no price)`)
        } else if (price.unit !== line.unit) {
          unpriceable.push(
            `${dish.nameNormalized} → ${line.ingredientKey} (${line.unit} vs ${price.unit})`,
          )
        }
      }
    }

    expect(unpriceable).toEqual([])
  })
})

describe('thailandDataProvider', () => {
  it('matches a dish through its Thai alias', async () => {
    const match = await thailandDataProvider.findCommonDish('ผัดกะเพราหมู')
    expect(match?.nameNormalized).toBe('pad_krapao_moo')
  })

  it('matches the common misspelling of กะเพรา', async () => {
    const match = await thailandDataProvider.findCommonDish('ผัดกระเพราหมู')
    expect(match?.nameNormalized).toBe('pad_krapao_moo')
  })

  it('matches a dish printed with its ข้าว prefix', async () => {
    const match = await thailandDataProvider.findCommonDish('ข้าวกะเพราหมู')
    expect(match?.nameNormalized).toBe('pad_krapao_moo')
  })

  it('matches through a Latin transliteration and an English name', async () => {
    expect((await thailandDataProvider.findCommonDish('Pad Krapao Moo'))?.nameNormalized).toBe(
      'pad_krapao_moo',
    )
    expect((await thailandDataProvider.findCommonDish('Green Curry Chicken'))?.nameNormalized).toBe(
      'gaeng_keow_wan_gai',
    )
  })

  it('strips a printed decoration before matching', async () => {
    const match = await thailandDataProvider.findCommonDish('ผัดกะเพราหมู (พิเศษ)')
    expect(match?.nameNormalized).toBe('pad_krapao_moo')
  })

  it('returns null for a dish it does not know', async () => {
    expect(await thailandDataProvider.findCommonDish('Wagyu Steak Rice')).toBeNull()
  })

  it('keeps hot and iced apart even when the qualifier is bracketed', async () => {
    // The failure this guards against is silent: "(เย็น)" read as decoration
    // costs an iced latte as a hot one — no ice, less milk, wrong price band.
    expect((await thailandDataProvider.findCommonDish('ลาเต้ (เย็น)'))?.nameNormalized).toBe(
      'latte_iced',
    )
    expect((await thailandDataProvider.findCommonDish('ลาเต้ร้อน'))?.nameNormalized).toBe(
      'latte_hot',
    )
    expect((await thailandDataProvider.findCommonDish('อเมริกาโน่ (เย็น)'))?.nameNormalized).toBe(
      'americano_iced',
    )
  })

  it('does not duplicate a qualifier the name already carries', () => {
    expect(normalizeThaiDishName('ชาเย็น')).toBe('ชาเย็น')
    expect(normalizeThaiDishName('iced latte')).toBe('iced_latte')
  })

  it('exposes the whole vocabulary to the recipe-inference prompt', async () => {
    const vocabulary = await thailandDataProvider.listIngredients()
    expect(vocabulary.length).toBe(TH_INGREDIENTS.length)
    expect(vocabulary).toContainEqual({ ingredientKey: 'pork_minced', unit: 'g' })
  })
})
