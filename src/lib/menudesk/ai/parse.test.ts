// The pure halves of both port implementations: what we accept from a model
// and what we refuse. A structured output guarantees the shape, not the truth,
// so every one of these is a case the schema would happily let through.

import { describe, expect, it } from 'vitest'
import { parseReadPageResponse } from './vision'
import { parseInferRecipesResponse } from './recipes'

describe('parseReadPageResponse', () => {
  it('reads dishes and stamps the page id', () => {
    const rows = parseReadPageResponse(
      { dishes: [{ nameRaw: '  Pad Thai  ', menuPrice: 80 }] },
      'p1',
    )

    expect(rows).toEqual([{ pageId: 'p1', nameRaw: 'Pad Thai', menuPrice: 80 }])
  })

  it('keeps a dish whose price is null, so it can be reported as unpriced', () => {
    const rows = parseReadPageResponse({ dishes: [{ nameRaw: 'Soup', menuPrice: null }] }, 'p1')

    expect(rows).toEqual([{ pageId: 'p1', nameRaw: 'Soup', menuPrice: null }])
  })

  it('nulls a nonsensical price rather than trusting it', () => {
    const rows = parseReadPageResponse(
      { dishes: [{ nameRaw: 'Free Water', menuPrice: 0 }, { nameRaw: 'Odd', menuPrice: -5 }] },
      'p1',
    )

    expect(rows.map((r) => r.menuPrice)).toEqual([null, null])
  })

  it('drops a row with no name — there is nothing to report about it', () => {
    const rows = parseReadPageResponse(
      { dishes: [{ nameRaw: '   ', menuPrice: 50 }, { menuPrice: 60 }] },
      'p1',
    )

    expect(rows).toEqual([])
  })

  it('returns nothing for a malformed payload', () => {
    expect(parseReadPageResponse(null, 'p1')).toEqual([])
    expect(parseReadPageResponse({}, 'p1')).toEqual([])
    expect(parseReadPageResponse({ dishes: 'nope' }, 'p1')).toEqual([])
  })
})

describe('parseInferRecipesResponse', () => {
  const byId = new Map([
    [0, 'pad_thai'],
    [1, 'green_curry'],
  ])

  const goodLines = [{ ingredientKey: 'rice', quantity: 200, unit: 'g' }]

  it('maps an echoed id back to the engine lookup key', () => {
    const recipes = parseInferRecipesResponse(
      { recipes: [{ id: 0, yieldServings: 1, lines: goodLines, confidence: 'high' }] },
      byId,
    )

    expect(recipes).toEqual([
      {
        nameNormalized: 'pad_thai',
        recipe: { yieldServings: 1, lines: goodLines },
        confidence: 'high',
      },
    ])
  })

  it('discards an id it was never asked about', () => {
    const recipes = parseInferRecipesResponse(
      { recipes: [{ id: 99, yieldServings: 1, lines: goodLines, confidence: 'high' }] },
      byId,
    )

    expect(recipes).toEqual([])
  })

  it('keeps only the first recipe for a repeated id', () => {
    const recipes = parseInferRecipesResponse(
      {
        recipes: [
          { id: 0, yieldServings: 1, lines: goodLines, confidence: 'high' },
          { id: 0, yieldServings: 4, lines: goodLines, confidence: 'low' },
        ],
      },
      byId,
    )

    expect(recipes).toHaveLength(1)
    expect(recipes[0].recipe.yieldServings).toBe(1)
  })

  it('drops recipe lines with an unusable quantity, and the recipe if none survive', () => {
    const recipes = parseInferRecipesResponse(
      {
        recipes: [
          {
            id: 0,
            yieldServings: 1,
            lines: [
              { ingredientKey: 'rice', quantity: 0, unit: 'g' },
              { ingredientKey: 'pork', quantity: 'lots', unit: 'g' },
              { ingredientKey: '', quantity: 10, unit: 'g' },
            ],
            confidence: 'high',
          },
        ],
      },
      byId,
    )

    expect(recipes).toEqual([])
  })

  it('falls back to one serving for an implausible yield', () => {
    const recipes = parseInferRecipesResponse(
      { recipes: [{ id: 0, yieldServings: 0, lines: goodLines, confidence: 'high' }] },
      byId,
    )

    expect(recipes[0].recipe.yieldServings).toBe(1)
  })

  it('treats an unrecognised confidence as low', () => {
    const recipes = parseInferRecipesResponse(
      { recipes: [{ id: 0, yieldServings: 1, lines: goodLines, confidence: 'very sure' }] },
      byId,
    )

    expect(recipes[0].confidence).toBe('low')
  })

  it('returns nothing for a malformed payload', () => {
    expect(parseInferRecipesResponse(null, byId)).toEqual([])
    expect(parseInferRecipesResponse({ recipes: {} }, byId)).toEqual([])
  })
})
