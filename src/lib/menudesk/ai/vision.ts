// Pass 1 — read one menu page into [dish name, printed price].
//
// Implements MenuVisionPort. Split into three layers, so the two that decide
// correctness are unit-testable with no network and no API key:
//
//   buildReadPageRequest  — pure; builds the messages.create() params
//   parseReadPageResponse — pure; validates whatever came back
//   createAnthropicVisionPort — the network call around those two
//
// This mirrors src/lib/ratedesk/vision-extract.ts, which reads OTA screenshots
// the same way. The difference is the response mechanism: RateDesk forces a
// tool call, this uses structured outputs (`output_config.format`), which
// removes the JSON-repair loop entirely on Haiku 4.5.
//
// The output is still re-validated field by field. A structured output
// guarantees the SHAPE, not the truth — the model can still return a price of
// 0, a blank name, or a dish it hallucinated onto the page.

import type { MenuPageImage, MenuVisionPort, ModelCallUsage, ReadDish } from '@/lib/menudesk/engine'
import { getAnthropicClient } from '@/lib/ai/anthropic-client'
import { DEFAULT_MODEL, ESCALATION_MODEL } from './models'

/**
 * Output ceiling for one page. A dense menu of ~60 dishes lands near 1.5k
 * tokens at this schema's verbosity, so this leaves generous headroom while
 * still capping a runaway generation.
 */
const MAX_OUTPUT_TOKENS = 4096

/**
 * The shape the model must return. `additionalProperties: false` and a full
 * `required` list are mandatory for structured outputs; the nullable price is
 * expressed with `anyOf` because JSON-Schema type arrays are not supported.
 */
const READ_PAGE_SCHEMA = {
  type: 'object',
  properties: {
    dishes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nameRaw: {
            type: 'string',
            description:
              'The dish name exactly as printed, in the menu\'s own script and spelling. ' +
              'Do not translate, transliterate, or tidy it. Exclude the price, portion ' +
              'suffixes printed in a separate column, and any section heading.',
          },
          menuPrice: {
            anyOf: [{ type: 'number' }, { type: 'null' }],
            description:
              'The printed selling price as a plain number — no currency symbol, no ' +
              'thousands separator. When a dish shows several prices (sizes, hot/iced), ' +
              'use the LOWEST printed price. Use null if no price is legible for this ' +
              'dish; never estimate one.',
          },
        },
        required: ['nameRaw', 'menuPrice'],
        additionalProperties: false,
      },
    },
  },
  required: ['dishes'],
  additionalProperties: false,
} as const

const SYSTEM_PROMPT =
  'You transcribe photographed restaurant menus into structured data. Rules:\n' +
  '- Transcribe every dish visible on the page, in the order printed.\n' +
  '- Copy names EXACTLY as printed, in the original script. Never translate or ' +
  'correct spelling — the spelling is how the same dish is recognised across menus.\n' +
  '- Section headings ("Noodles", "Drinks") are not dishes. Do not emit them.\n' +
  '- Read the price that is printed. Never infer a price from a similar dish, a ' +
  'neighbouring row, or your own knowledge of what such a dish costs. If no price ' +
  'is legible, return null for that dish.\n' +
  '- Where one dish lists several prices, take the lowest printed one.\n' +
  '- A dish you cannot see is worse than a dish you skip: never invent a row.'

/** Pure — the exact request for one page. Exported so tests can inspect it. */
export function buildReadPageRequest(page: MenuPageImage, model: string) {
  return {
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: SYSTEM_PROMPT,
    output_config: {
      format: { type: 'json_schema' as const, schema: READ_PAGE_SCHEMA as unknown as Record<string, unknown> },
    },
    messages: [
      {
        role: 'user' as const,
        content: [
          {
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: page.mediaType as 'image/jpeg' | 'image/png' | 'image/webp',
              data: page.base64,
            },
          },
          {
            type: 'text' as const,
            text: 'Transcribe every dish and its printed price from this menu page.',
          },
        ],
      },
    ],
  }
}

/**
 * Pure — turn the model's JSON into ReadDish rows.
 *
 * A row with no usable name is DROPPED (there is nothing to report about it).
 * A row with an unusable price is KEPT with `menuPrice: null`, because a dish
 * we found but could not price is a fact the owner should see.
 */
export function parseReadPageResponse(raw: unknown, pageId: string): ReadDish[] {
  if (!raw || typeof raw !== 'object') return []
  const dishes = (raw as { dishes?: unknown }).dishes
  if (!Array.isArray(dishes)) return []

  const out: ReadDish[] = []
  for (const entry of dishes) {
    if (!entry || typeof entry !== 'object') continue
    const row = entry as Record<string, unknown>

    const nameRaw = typeof row.nameRaw === 'string' ? row.nameRaw.trim() : ''
    if (!nameRaw) continue

    const rawPrice = typeof row.menuPrice === 'number' ? row.menuPrice : Number(row.menuPrice)
    const menuPrice = Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : null

    out.push({ pageId, nameRaw, menuPrice })
  }
  return out
}

/** Pull the JSON text out of a structured-output response. */
function extractJsonText(content: { type: string; text?: string }[]): string | null {
  const block = content.find((b) => b.type === 'text')
  return block?.text ?? null
}

export interface AnthropicVisionPortOptions {
  /** Cheap workhorse for the first attempt. */
  model?: string
  /**
   * Model to retry a page that came back with nothing. Set to null to disable
   * escalation entirely — it is 5× the input rate, so it must stay a retry.
   */
  escalationModel?: string | null
}

/**
 * MenuVisionPort backed by Anthropic.
 *
 * Escalates ONCE, and only when the cheap model returned no dishes at all — a
 * dense, handwritten, or badly lit page. Routing every page to the escalation
 * model would blow Bible §05's per-scan budget several times over.
 *
 * Throws when the page cannot be read even after escalation. The engine turns
 * that into an UnreadablePage and keeps going with the rest of the scan.
 */
export function createAnthropicVisionPort(
  options: AnthropicVisionPortOptions = {},
): MenuVisionPort {
  const model = options.model ?? DEFAULT_MODEL
  const escalationModel =
    options.escalationModel === undefined ? ESCALATION_MODEL : options.escalationModel

  return {
    async readPage(page: MenuPageImage) {
      const client = getAnthropicClient()
      const usage: ModelCallUsage[] = []

      const attempt = async (attemptModel: string): Promise<ReadDish[]> => {
        const response = await client.messages.create(buildReadPageRequest(page, attemptModel))
        usage.push({
          model: attemptModel,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheReadTokens: response.usage.cache_read_input_tokens ?? undefined,
        })

        const text = extractJsonText(response.content)
        if (!text) return []

        let parsed: unknown
        try {
          parsed = JSON.parse(text)
        } catch {
          // Structured outputs make this near-impossible, but a truncated
          // response (max_tokens) still yields invalid JSON.
          return []
        }
        return parseReadPageResponse(parsed, page.pageId)
      }

      const dishes = await attempt(model)
      if (dishes.length > 0) return { dishes, usage }

      if (escalationModel) {
        const escalated = await attempt(escalationModel)
        if (escalated.length > 0) return { dishes: escalated, usage }
      }

      throw new Error(`[menudesk] no dishes readable on page '${page.pageId}'`)
    },
  }
}
