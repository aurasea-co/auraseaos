// The pipeline's contract, exercised with fake ports — no network, no country.
//
// Most of these assert the honesty rules rather than the arithmetic: what
// happens to a dish we cannot cost, a page we cannot read, a band that
// straddles a threshold. Those are the behaviours a well-meaning refactor
// quietly breaks, and the ones an owner would catch us on.

import { describe, expect, it, vi } from 'vitest'
import { analyzeMenu } from './analyze'
import type {
  CountryDataProvider,
  EnginePorts,
  IngredientPrice,
  MenuPageImage,
  MenuVisionPort,
  ReadDish,
  Recipe,
  RecipeInferencePort,
  UsageRecorder,
} from './index'

const PAGE: MenuPageImage = { pageId: 'p1', base64: 'AAAA', mediaType: 'image/jpeg' }

const RICE_AND_PORK: Recipe = {
  yieldServings: 1,
  lines: [
    { ingredientKey: 'pork', quantity: 100, unit: 'g' },
    { ingredientKey: 'rice', quantity: 200, unit: 'g' },
  ],
}

const PRICES: Record<string, IngredientPrice> = {
  // 100g pork = 20–30; 200g rice = 6–10 → 26–40 per portion.
  pork: { ingredientKey: 'pork', unit: 'g', price: { low: 0.2, high: 0.3 } },
  rice: { ingredientKey: 'rice', unit: 'g', price: { low: 0.03, high: 0.05 } },
}

function fakeData(overrides: Partial<CountryDataProvider> = {}): CountryDataProvider {
  return {
    countryCode: 'XX',
    currencyCode: 'XXX',
    normalizeDishName: (name) => name.trim().toLowerCase(),
    findCommonDish: async () => null,
    getIngredientPrice: async (key) => PRICES[key] ?? null,
    listIngredients: async () =>
      Object.values(PRICES).map(({ ingredientKey, unit }) => ({ ingredientKey, unit })),
    ...overrides,
  }
}

function fakeVision(dishes: ReadDish[]): MenuVisionPort {
  return { readPage: async () => ({ dishes, usage: [] }) }
}

const NO_RECIPES: RecipeInferencePort = {
  inferRecipes: async () => ({ recipes: [], usage: [] }),
}

const NULL_USAGE: UsageRecorder = { record: async () => {} }

function portsWith(overrides: Partial<EnginePorts>): EnginePorts {
  return {
    data: fakeData(),
    vision: fakeVision([]),
    recipes: NO_RECIPES,
    usage: NULL_USAGE,
    ...overrides,
  }
}

describe('analyzeMenu', () => {
  it('costs a cached dish against the ingredient table', async () => {
    const result = await analyzeMenu(
      { pages: [PAGE] },
      portsWith({
        vision: fakeVision([{ pageId: 'p1', nameRaw: 'Pork Rice', menuPrice: 100 }]),
        data: fakeData({
          findCommonDish: async () => ({
            nameNormalized: 'pork_rice',
            recipe: RICE_AND_PORK,
            matchConfidence: 'high',
          }),
        }),
      }),
    )

    expect(result.uncosted).toEqual([])
    expect(result.dishes).toHaveLength(1)

    const dish = result.dishes[0]
    expect(dish.cost.low).toBeCloseTo(26)
    expect(dish.cost.high).toBeCloseTo(40)
    expect(dish.foodCostPct.low).toBeCloseTo(26)
    expect(dish.foodCostPct.high).toBeCloseTo(40)
    // The canonical name from the cache, not the printed spelling.
    expect(dish.nameNormalized).toBe('pork_rice')
    expect(dish.recipeSource).toBe('cache')
    expect(dish.basis).toBe('estimate')
    expect(result.stats).toMatchObject({ cacheHits: 1, inferredRecipes: 0, modelCalls: 0 })
  })

  it('divides a multi-portion recipe by its yield', async () => {
    const result = await analyzeMenu(
      { pages: [PAGE] },
      portsWith({
        vision: fakeVision([{ pageId: 'p1', nameRaw: 'Sharing Platter', menuPrice: 100 }]),
        data: fakeData({
          findCommonDish: async () => ({
            nameNormalized: 'platter',
            recipe: { ...RICE_AND_PORK, yieldServings: 2 },
            matchConfidence: 'high',
          }),
        }),
      }),
    )

    expect(result.dishes[0].cost.low).toBeCloseTo(13)
    expect(result.dishes[0].cost.high).toBeCloseTo(20)
  })

  it('reports a dish with no recipe instead of dropping it', async () => {
    const result = await analyzeMenu(
      { pages: [PAGE] },
      portsWith({ vision: fakeVision([{ pageId: 'p1', nameRaw: 'Mystery Dish', menuPrice: 80 }]) }),
    )

    expect(result.dishes).toEqual([])
    expect(result.uncosted).toEqual([
      { pageId: 'p1', nameRaw: 'Mystery Dish', menuPrice: 80, reason: 'no_recipe' },
    ])
  })

  it('reports a dish whose ingredient has no price', async () => {
    const result = await analyzeMenu(
      { pages: [PAGE] },
      portsWith({
        vision: fakeVision([{ pageId: 'p1', nameRaw: 'Beef Rice', menuPrice: 120 }]),
        data: fakeData({
          findCommonDish: async () => ({
            nameNormalized: 'beef_rice',
            recipe: {
              yieldServings: 1,
              lines: [{ ingredientKey: 'wagyu', quantity: 100, unit: 'g' }],
            },
            matchConfidence: 'high',
          }),
        }),
      }),
    )

    expect(result.uncosted[0].reason).toBe('missing_ingredient_price')
  })

  it('refuses to price a recipe line quoted in the wrong unit', async () => {
    // 2 "pieces" of an ingredient priced per gram is not 0.4–0.6 — it is
    // unknown, and multiplying anyway produces a confident wrong number.
    const result = await analyzeMenu(
      { pages: [PAGE] },
      portsWith({
        vision: fakeVision([{ pageId: 'p1', nameRaw: 'Pork Skewer', menuPrice: 40 }]),
        data: fakeData({
          findCommonDish: async () => ({
            nameNormalized: 'skewer',
            recipe: {
              yieldServings: 1,
              lines: [{ ingredientKey: 'pork', quantity: 2, unit: 'piece' }],
            },
            matchConfidence: 'high',
          }),
        }),
      }),
    )

    expect(result.uncosted[0].reason).toBe('missing_ingredient_price')
  })

  it('keeps a dish read without a price, as unreadable_price', async () => {
    const result = await analyzeMenu(
      { pages: [PAGE] },
      portsWith({
        vision: fakeVision([{ pageId: 'p1', nameRaw: 'Special of the day', menuPrice: null }]),
      }),
    )

    expect(result.uncosted).toEqual([
      { pageId: 'p1', nameRaw: 'Special of the day', menuPrice: null, reason: 'unreadable_price' },
    ])
  })

  it('records an unreadable page and still analyses the others', async () => {
    const vision: MenuVisionPort = {
      readPage: async (page) => {
        if (page.pageId === 'bad') throw new Error('too blurry')
        return {
          dishes: [{ pageId: page.pageId, nameRaw: 'Pork Rice', menuPrice: 100 }],
          usage: [],
        }
      },
    }

    const result = await analyzeMenu(
      { pages: [{ ...PAGE, pageId: 'bad' }, { ...PAGE, pageId: 'good' }] },
      portsWith({
        vision,
        data: fakeData({
          findCommonDish: async () => ({
            nameNormalized: 'pork_rice',
            recipe: RICE_AND_PORK,
            matchConfidence: 'high',
          }),
        }),
      }),
    )

    expect(result.unreadablePages).toEqual([{ pageId: 'bad', reason: 'too blurry' }])
    expect(result.dishes).toHaveLength(1)
    expect(result.dishes[0].pageId).toBe('good')
    expect(result.stats.pagesRead).toBe(1)
  })

  it('attributes dishes to the requested page, not the one the port claims', async () => {
    const result = await analyzeMenu(
      { pages: [PAGE] },
      portsWith({
        vision: fakeVision([{ pageId: 'hallucinated', nameRaw: 'Pork Rice', menuPrice: 100 }]),
        data: fakeData({
          findCommonDish: async () => ({
            nameNormalized: 'pork_rice',
            recipe: RICE_AND_PORK,
            matchConfidence: 'high',
          }),
        }),
      }),
    )

    expect(result.dishes[0].pageId).toBe('p1')
  })

  it('sends only cache misses to the model, once per distinct dish', async () => {
    const inferRecipes = vi.fn<RecipeInferencePort['inferRecipes']>(async ({ dishes }) => ({
      recipes: dishes.map((dish) => ({
        nameNormalized: dish.nameNormalized,
        recipe: RICE_AND_PORK,
        confidence: 'medium' as const,
      })),
      usage: [{ model: 'test-model', inputTokens: 100, outputTokens: 50 }],
    }))

    const result = await analyzeMenu(
      { pages: [PAGE, { ...PAGE, pageId: 'p2' }] },
      portsWith({
        vision: fakeVision([
          { pageId: 'p1', nameRaw: 'Pork Rice', menuPrice: 100 },
          { pageId: 'p1', nameRaw: 'Noodles', menuPrice: 90 },
          // Same dish, second page: must not be looked up or inferred twice.
          { pageId: 'p1', nameRaw: 'noodles', menuPrice: 90 },
        ]),
        data: fakeData({
          findCommonDish: async (nameRaw) =>
            nameRaw.toLowerCase() === 'pork rice'
              ? { nameNormalized: 'pork_rice', recipe: RICE_AND_PORK, matchConfidence: 'high' }
              : null,
        }),
        recipes: { inferRecipes },
      }),
    )

    expect(inferRecipes).toHaveBeenCalledTimes(1)
    expect(inferRecipes.mock.calls[0][0].dishes).toEqual([
      { nameNormalized: 'noodles', nameRaw: 'Noodles', menuPrice: 90 },
    ])
    // Both pages' copies of the noodles are costed from the one inference.
    expect(result.dishes.filter((d) => d.nameNormalized === 'noodles')).toHaveLength(2)
    expect(result.stats).toMatchObject({ cacheHits: 1, inferredRecipes: 1, modelCalls: 1 })
  })

  it('drops an inferred recipe filed under a name it was not asked about', async () => {
    const result = await analyzeMenu(
      { pages: [PAGE] },
      portsWith({
        vision: fakeVision([{ pageId: 'p1', nameRaw: 'Noodles', menuPrice: 90 }]),
        recipes: {
          inferRecipes: async () => ({
            recipes: [
              { nameNormalized: 'something_else', recipe: RICE_AND_PORK, confidence: 'high' },
            ],
            usage: [],
          }),
        },
      }),
    )

    expect(result.dishes).toEqual([])
    expect(result.uncosted[0].reason).toBe('no_recipe')
  })

  it('collapses an exact duplicate row within a page', async () => {
    const result = await analyzeMenu(
      { pages: [PAGE] },
      portsWith({
        vision: fakeVision([
          { pageId: 'p1', nameRaw: 'Pork Rice', menuPrice: 100 },
          { pageId: 'p1', nameRaw: 'pork rice', menuPrice: 100 },
        ]),
        data: fakeData({
          findCommonDish: async () => ({
            nameNormalized: 'pork_rice',
            recipe: RICE_AND_PORK,
            matchConfidence: 'high',
          }),
        }),
      }),
    )

    expect(result.dishes).toHaveLength(1)
  })

  it('keeps the same dish twice when the prices differ', async () => {
    const result = await analyzeMenu(
      { pages: [PAGE] },
      portsWith({
        vision: fakeVision([
          { pageId: 'p1', nameRaw: 'Pork Rice', menuPrice: 100 },
          { pageId: 'p1', nameRaw: 'Pork Rice', menuPrice: 140 },
        ]),
        data: fakeData({
          findCommonDish: async () => ({
            nameNormalized: 'pork_rice',
            recipe: RICE_AND_PORK,
            matchConfidence: 'high',
          }),
        }),
      }),
    )

    expect(result.dishes).toHaveLength(2)
  })

  it('caps confidence at the weakest input', async () => {
    const result = await analyzeMenu(
      { pages: [PAGE] },
      portsWith({
        vision: fakeVision([{ pageId: 'p1', nameRaw: 'Noodles', menuPrice: 100 }]),
        recipes: {
          inferRecipes: async () => ({
            recipes: [{ nameNormalized: 'noodles', recipe: RICE_AND_PORK, confidence: 'low' }],
            usage: [],
          }),
        },
      }),
    )

    // The band itself is tight (26–40% of 100), so 'low' can only come from
    // the recipe the model guessed.
    expect(result.dishes[0].confidence).toBe('low')
  })

  it('flags a band that straddles a traffic-light threshold', async () => {
    const result = await analyzeMenu(
      { pages: [PAGE] },
      portsWith({
        // 26–40 of 90 = 28.9%–44.4%: green at one end, red at the other.
        vision: fakeVision([{ pageId: 'p1', nameRaw: 'Pork Rice', menuPrice: 90 }]),
        data: fakeData({
          findCommonDish: async () => ({
            nameNormalized: 'pork_rice',
            recipe: RICE_AND_PORK,
            matchConfidence: 'high',
          }),
        }),
      }),
    )

    expect(result.dishes[0].bandCertain).toBe(false)
    expect(result.dishes[0].trafficLight).toBe('amber')
  })

  it('records one usage row per model call, with cache hits on the pass-2 row', async () => {
    const record = vi.fn<UsageRecorder['record']>(async () => {})

    await analyzeMenu(
      { pages: [PAGE] },
      portsWith({
        vision: {
          readPage: async () => ({
            dishes: [
              { pageId: 'p1', nameRaw: 'Pork Rice', menuPrice: 100 },
              { pageId: 'p1', nameRaw: 'Noodles', menuPrice: 90 },
            ],
            usage: [{ model: 'vision-model', inputTokens: 900, outputTokens: 120 }],
          }),
        },
        data: fakeData({
          findCommonDish: async (nameRaw) =>
            nameRaw === 'Pork Rice'
              ? { nameNormalized: 'pork_rice', recipe: RICE_AND_PORK, matchConfidence: 'high' }
              : null,
        }),
        recipes: {
          inferRecipes: async () => ({
            recipes: [],
            usage: [{ model: 'recipe-model', inputTokens: 400, outputTokens: 200 }],
          }),
        },
        usage: { record },
      }),
    )

    expect(record.mock.calls.map(([row]) => row)).toEqual([
      { model: 'vision-model', inputTokens: 900, outputTokens: 120, cacheHits: 0 },
      { model: 'recipe-model', inputTokens: 400, outputTokens: 200, cacheHits: 1 },
    ])
  })

  it('does not lose the analysis when the usage recorder throws', async () => {
    const result = await analyzeMenu(
      { pages: [PAGE] },
      portsWith({
        vision: {
          readPage: async () => ({
            dishes: [{ pageId: 'p1', nameRaw: 'Pork Rice', menuPrice: 100 }],
            usage: [{ model: 'vision-model', inputTokens: 10, outputTokens: 10 }],
          }),
        },
        data: fakeData({
          findCommonDish: async () => ({
            nameNormalized: 'pork_rice',
            recipe: RICE_AND_PORK,
            matchConfidence: 'high',
          }),
        }),
        usage: {
          record: async () => {
            throw new Error('accounting is down')
          },
        },
      }),
    )

    expect(result.dishes).toHaveLength(1)
  })

  it('returns an empty result rather than throwing on an empty menu', async () => {
    const result = await analyzeMenu({ pages: [] }, portsWith({}))

    expect(result).toMatchObject({
      dishes: [],
      uncosted: [],
      unreadablePages: [],
      currencyCode: 'XXX',
    })
  })
})
