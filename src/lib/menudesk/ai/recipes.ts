// Pass 2 — infer a standard recipe for each dish the CommonDish cache missed.
//
// Implements RecipeInferencePort. Same three-layer split as ./vision.ts:
// buildInferRecipesRequest and parseInferRecipesResponse are pure and testable;
// createAnthropicRecipePort wraps them in the network call and the chunking.
//
// Two decisions carry most of the cost and most of the accuracy:
//
//   The batch. One call covers up to RECIPE_BATCH_SIZE dishes. The prompt is
//   fixed overhead — mostly the ingredient vocabulary — so per-dish calls would
//   pay it once per dish. That is the same 20–40× mistake Bible §05 warns about
//   for pass 1, arriving through a different door.
//
//   The vocabulary. The model is given the country's ingredient keys and told
//   to write recipes only in those terms. Without it, it invents plausible keys
//   ('minced_pork', 'thai_basil') that nothing can price, and every inferred
//   dish comes back uncostable. The keys come from the CountryDataProvider, so
//   a second country changes the data set and not this file.

import type {
  CountryDataProvider,
  InferredRecipe,
  ModelCallUsage,
  RecipeInferencePort,
  RecipeInferenceRequest,
  RecipeLine,
} from '@/lib/menudesk/engine'
import { getAnthropicClient } from '@/lib/ai/anthropic-client'
import { DEFAULT_MODEL } from './models'

/**
 * Dishes per model call. Large enough that the vocabulary prompt is amortised,
 * small enough that one malformed response loses a chunk rather than the menu,
 * and that the output stays clear of MAX_OUTPUT_TOKENS.
 */
export const RECIPE_BATCH_SIZE = 20

/** ~8 lines per recipe × 20 recipes, with headroom. */
const MAX_OUTPUT_TOKENS = 8192

const INFER_RECIPES_SCHEMA = {
  type: 'object',
  properties: {
    recipes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: {
            type: 'integer',
            description: 'The id of the dish this recipe is for, copied from the request.',
          },
          yieldServings: {
            type: 'integer',
            description: 'Portions this recipe yields. Use 1 unless the dish is sold to share.',
          },
          lines: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                ingredientKey: {
                  type: 'string',
                  description: 'An ingredient key from the supplied list. Never invent one.',
                },
                quantity: {
                  type: 'number',
                  description: 'Amount per the whole recipe (not per serving), in `unit`.',
                },
                unit: {
                  type: 'string',
                  description: "The unit listed for that ingredient key. Must match exactly.",
                },
              },
              required: ['ingredientKey', 'quantity', 'unit'],
              additionalProperties: false,
            },
          },
          confidence: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
            description:
              'high = a standard dish you can specify confidently. medium = the dish is ' +
              'clear but portions vary widely by shop. low = you are guessing at what the ' +
              'dish even is.',
          },
        },
        required: ['id', 'yieldServings', 'lines', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['recipes'],
  additionalProperties: false,
} as const

function systemPromptFor(countryCode: string, vocabulary: { ingredientKey: string; unit: string }[]): string {
  const list = vocabulary.map((v) => `${v.ingredientKey} (${v.unit})`).join(', ')

  return (
    `You estimate the standard recipe for restaurant dishes as they are cooked in ${countryCode}, ` +
    'so their ingredient cost can be calculated. Rules:\n' +
    '- Give the recipe a typical independent restaurant would use for one order of the dish — ' +
    'ordinary portions, not fine-dining and not a home kitchen.\n' +
    '- Quantities are for the WHOLE recipe. If the recipe yields more than one portion, say so ' +
    'in yieldServings and the cost will be divided.\n' +
    '- Include only ingredients that materially affect cost. Salt, pepper, and water are noise.\n' +
    '- Use ONLY these ingredient keys, with exactly the unit shown for each: ' +
    `${list}.\n` +
    '- If a dish needs a main ingredient that is not on that list, OMIT THE DISH ENTIRELY — ' +
    'return no recipe for it. Substituting a different protein or base produces a confident ' +
    'wrong cost, which is far worse than reporting that we could not cost the dish.\n' +
    '- Do not adjust a recipe to make its cost look reasonable against the menu price. The ' +
    'gap between the two is the entire point of the analysis.\n' +
    '- Set confidence honestly per dish. A name you do not recognise scores low.'
  )
}

export interface RecipeBatchItem {
  id: number
  nameRaw: string
  menuPrice: number
}

/** Pure — the exact request for one batch. */
export function buildInferRecipesRequest(
  batch: RecipeBatchItem[],
  countryCode: string,
  vocabulary: { ingredientKey: string; unit: string }[],
  model: string,
) {
  const lines = batch
    .map((item) => `${item.id}. ${item.nameRaw} — menu price ${item.menuPrice}`)
    .join('\n')

  return {
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: systemPromptFor(countryCode, vocabulary),
    output_config: {
      format: {
        type: 'json_schema' as const,
        schema: INFER_RECIPES_SCHEMA as unknown as Record<string, unknown>,
      },
    },
    messages: [
      {
        role: 'user' as const,
        content:
          'Estimate the recipe for each dish below. Return one entry per dish you can cost, ' +
          'echoing its id. Omit any dish whose main ingredient is not in the allowed list.\n\n' +
          lines,
      },
    ],
  }
}

/**
 * Pure — validate the model's JSON back into InferredRecipe rows.
 *
 * `byId` maps the request ids to the engine's lookup keys. An entry with an
 * unknown id, no usable lines, or a bad quantity is DROPPED: the engine then
 * reports that dish as uncosted, which is the honest outcome. Repairing a
 * malformed recipe here would be inventing one.
 */
export function parseInferRecipesResponse(
  raw: unknown,
  byId: Map<number, string>,
): InferredRecipe[] {
  if (!raw || typeof raw !== 'object') return []
  const recipes = (raw as { recipes?: unknown }).recipes
  if (!Array.isArray(recipes)) return []

  const seen = new Set<number>()
  const out: InferredRecipe[] = []

  for (const entry of recipes) {
    if (!entry || typeof entry !== 'object') continue
    const row = entry as Record<string, unknown>

    const id = typeof row.id === 'number' ? row.id : Number(row.id)
    if (!Number.isInteger(id) || seen.has(id)) continue
    const nameNormalized = byId.get(id)
    if (!nameNormalized) continue

    const rawServings =
      typeof row.yieldServings === 'number' ? row.yieldServings : Number(row.yieldServings)
    const yieldServings =
      Number.isFinite(rawServings) && rawServings >= 1 ? Math.round(rawServings) : 1

    if (!Array.isArray(row.lines)) continue
    const lines: RecipeLine[] = []
    for (const lineEntry of row.lines) {
      if (!lineEntry || typeof lineEntry !== 'object') continue
      const line = lineEntry as Record<string, unknown>

      const ingredientKey =
        typeof line.ingredientKey === 'string' ? line.ingredientKey.trim() : ''
      const unit = typeof line.unit === 'string' ? line.unit.trim() : ''
      const quantity = typeof line.quantity === 'number' ? line.quantity : Number(line.quantity)

      if (!ingredientKey || !unit) continue
      if (!Number.isFinite(quantity) || quantity <= 0) continue

      lines.push({ ingredientKey, quantity, unit })
    }
    if (lines.length === 0) continue

    const confidence =
      row.confidence === 'high' || row.confidence === 'medium' || row.confidence === 'low'
        ? row.confidence
        : 'low'

    seen.add(id)
    out.push({ nameNormalized, recipe: { yieldServings, lines }, confidence })
  }

  return out
}

function extractJsonText(content: { type: string; text?: string }[]): string | null {
  return content.find((b) => b.type === 'text')?.text ?? null
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export interface AnthropicRecipePortOptions {
  /** Supplies the ingredient vocabulary the recipes must be written in. */
  data: Pick<CountryDataProvider, 'listIngredients'>
  model?: string
  batchSize?: number
}

/**
 * RecipeInferencePort backed by Anthropic.
 *
 * Never throws for a bad batch. A failed chunk yields no recipes for its
 * dishes, and the engine reports those dishes as uncosted — one unlucky chunk
 * must not cost the owner the rest of the menu.
 *
 * There is no escalation model here, unlike pass 1: a page that will not read
 * is a photograph problem a better model can solve, whereas a dish whose recipe
 * Haiku cannot write is usually one the ingredient table cannot express.
 */
export function createAnthropicRecipePort(
  options: AnthropicRecipePortOptions,
): RecipeInferencePort {
  const model = options.model ?? DEFAULT_MODEL
  const batchSize = options.batchSize ?? RECIPE_BATCH_SIZE

  return {
    async inferRecipes({ dishes, countryCode }) {
      const usage: ModelCallUsage[] = []
      const recipes: InferredRecipe[] = []
      if (dishes.length === 0) return { recipes, usage }

      const client = getAnthropicClient()
      const vocabulary = await options.data.listIngredients()

      // Integer ids rather than the normalized names: the names are in the
      // menu's own script, and asking a model to echo a long non-Latin string
      // back byte-for-byte is a re-matching failure waiting to happen.
      const indexed: (RecipeInferenceRequest & { id: number })[] = dishes.map((dish, id) => ({
        ...dish,
        id,
      }))

      for (const batch of chunk(indexed, batchSize)) {
        const byId = new Map(batch.map((item) => [item.id, item.nameNormalized]))

        try {
          const response = await client.messages.create(
            buildInferRecipesRequest(
              batch.map(({ id, nameRaw, menuPrice }) => ({ id, nameRaw, menuPrice })),
              countryCode,
              vocabulary,
              model,
            ),
          )
          usage.push({
            model,
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            cacheReadTokens: response.usage.cache_read_input_tokens ?? undefined,
          })

          const text = extractJsonText(response.content)
          if (!text) continue

          recipes.push(...parseInferRecipesResponse(JSON.parse(text), byId))
        } catch {
          // Leave this chunk's dishes unresolved; the engine reports them as
          // uncosted rather than the whole analysis failing.
        }
      }

      return { recipes, usage }
    },
  }
}
