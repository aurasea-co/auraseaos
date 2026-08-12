// Vision-based competitor-rate extraction from an OTA search-results
// screenshot. Uses Claude Haiku 4.5 (cheapest current Claude vision
// model) via forced tool-use so the response is always the structured
// shape below, never free-form prose to re-parse.
//
// Split into three layers so the two that matter for correctness are
// unit-testable without a network call or a real API key:
//   - buildExtractionRequest — pure, builds the messages.create() params
//   - parseExtractionResponse — pure, validates/sanitizes whatever the
//     model returned (never trust a "structured" response blindly —
//     the model can still emit a string where a number belongs, an
//     out-of-range confidence, etc)
//   - extractCompetitorRatesFromImage — the actual network call,
//     orchestrating the two pure functions above
//
// The caller is expected to have already CROPPED the screenshot to the
// relevant results region client-side — smaller image, cheaper call,
// less irrelevant page chrome for the model to sift through.

import Anthropic from '@anthropic-ai/sdk'
import { getAnthropicClient } from '@/lib/ai/anthropic-client'
import { RATE_CHANNELS, isRateChannel, type RateChannel } from '@/lib/types/competitor-rates'

export const VISION_MODEL = 'claude-haiku-4-5-20251001'

export interface ExtractedCompetitorRow {
  hotelName: string
  /** Null when no room type is visible/legible in the screenshot. */
  roomType: string | null
  rateThb: number
  /** YYYY-MM-DD. Null when the screenshot doesn't show a stay date. */
  stayDate: string | null
  /** 0..1 — the model's own confidence in this row's extraction. */
  confidence: number
  /** e.g. "used the member/discounted price, ignored the struck-
   *  through original" — surfaced to the operator during review, not
   *  hidden. Null when there's nothing notable about the row. */
  priceNote: string | null
}

export type OtaHint = 'Agoda' | 'Booking.com' | 'Traveloka' | 'Other'

export interface ExtractCompetitorRatesInput {
  /** Raw base64 image data (no data: URI prefix). */
  imageBase64: string
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp'
  channel: RateChannel
  /** Which OTA the screenshot is from, if the operator specified one —
   *  each platform's strikethrough/member-price styling and layout
   *  differs, so naming it helps the model interpret the page rather
   *  than guessing from a generic "some OTA" prompt. Optional because
   *  channel alone (always 'ota' for this flow) is still enough to
   *  attempt extraction. */
  otaHint?: OtaHint
}

// Forces the model into this exact shape — see parseExtractionResponse
// for why every field still gets re-validated rather than trusted.
const EXTRACTION_TOOL = {
  name: 'extract_competitor_rates',
  description: 'Extract every competitor hotel listing visible in an OTA search-results screenshot.',
  input_schema: {
    type: 'object' as const,
    properties: {
      rows: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            hotelName: {
              type: 'string',
              description:
                'The HOTEL/PROPERTY name only, exactly as shown, Thai or English (e.g. "Sima Thani Hotel"). ' +
                'NEVER a room type, rate-plan, or meal-plan label (NOT "Deluxe Twin", NOT "Breakfast included", ' +
                'NOT "ไม่รวมอาหารเช้า"). If the property name is not visible anywhere in this image (e.g. the ' +
                'screenshot is cropped to just a room-rate panel with no visible property name), DO NOT invent ' +
                'one or substitute nearby text — omit that row from the rows array entirely instead.',
            },
            roomType: { type: ['string', 'null'], description: 'Room type name if visible, else null.' },
            rateThb: {
              type: 'number',
              description:
                'The ACTUAL BOOKABLE price in Thai baht (numeric, no currency symbol or commas). ' +
                'If the listing shows a struck-through original price next to a discounted/member ' +
                'price, use the discounted/member price — that is what a guest actually pays.',
            },
            stayDate: {
              type: ['string', 'null'],
              description: 'The check-in date this rate applies to, YYYY-MM-DD, if shown on the page (e.g. in a search-dates header). Null if not visible.',
            },
            confidence: {
              type: 'number',
              description: '0 to 1 — how confident you are this row was read correctly (name, room type, and price).',
            },
            priceNote: {
              type: ['string', 'null'],
              description: 'Note anything unusual, e.g. "used member price, ignored strikethrough" or "price partially obscured". Null if nothing notable.',
            },
          },
          required: ['hotelName', 'rateThb', 'confidence'],
        },
      },
    },
    required: ['rows'],
  },
}

function systemPromptFor(channel: RateChannel, otaHint?: OtaHint): string {
  return (
    'You read OTA (Agoda/Booking.com/Traveloka) hotel search-results screenshots and extract ' +
    'every competitor listing as structured data via the extract_competitor_rates tool. Rules:\n' +
    '- Extract the ACTUAL BOOKABLE price a guest would pay right now. When a listing shows a ' +
    'struck-through/crossed-out original price next to a lower discounted or member price, use ' +
    'the LOWER price — that is the bookable one — and say so in priceNote.\n' +
    '- Handle ฿ formatting: strip currency symbols, thousands separators, and "THB"/"per night" ' +
    'suffixes; rateThb must be a plain number.\n' +
    '- Hotel names may be in Thai, English, or both — extract the name as displayed.\n' +
    '- hotelName must be the actual PROPERTY name — never a room type, rate-plan, or meal-plan ' +
    'label. If a screenshot is cropped to just a room/rate panel with no property name visible ' +
    'anywhere in it, do NOT substitute the room type or meal-plan text as the hotel name — omit ' +
    'that row entirely rather than mislabeling it.\n' +
    '- If a search-dates header is visible (e.g. "Jul 27 - Jul 28"), use the CHECK-IN date as ' +
    'stayDate in YYYY-MM-DD form. If no date is visible anywhere, use null — never guess a date.\n' +
    `- These are ${channel} listings.\n` +
    (otaHint && otaHint !== 'Other'
      ? `- This screenshot is specifically from ${otaHint} — use your knowledge of that platform's ` +
        'layout and pricing-display conventions to read it accurately.\n'
      : '') +
    '- Set confidence honestly per row — a partially obscured or ambiguous price should score low, ' +
    'not be silently guessed at.\n' +
    '- Never fabricate a row for a property you cannot actually see in the image.'
  )
}

/** Pure — builds the exact messages.create() request. Exported so the
 *  system prompt / schema can be inspected in tests without a network
 *  call. */
export function buildExtractionRequest(input: ExtractCompetitorRatesInput) {
  return {
    model: VISION_MODEL,
    max_tokens: 2048,
    system: systemPromptFor(input.channel, input.otaHint),
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: 'tool' as const, name: EXTRACTION_TOOL.name },
    messages: [
      {
        role: 'user' as const,
        content: [
          {
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: input.mediaType,
              data: input.imageBase64,
            },
          },
          {
            type: 'text' as const,
            text: 'Extract every competitor hotel listing in this screenshot using the extract_competitor_rates tool.',
          },
        ],
      },
    ],
  }
}

/** Pure — validates/sanitizes the model's tool_use input into rows we
 *  actually trust the SHAPE of (not the accuracy — that's what
 *  confidence + the review step + plausibility flagging are for).
 *  A row missing a required field, or with a non-numeric/negative
 *  rate, is DROPPED rather than coerced into something misleading —
 *  better to under-extract than to invent a plausible-looking row. */
export function parseExtractionResponse(raw: unknown): ExtractedCompetitorRow[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { rows?: unknown }).rows)) {
    return []
  }
  const rawRows = (raw as { rows: unknown[] }).rows
  const out: ExtractedCompetitorRow[] = []
  for (const r of rawRows) {
    if (!r || typeof r !== 'object') continue
    const row = r as Record<string, unknown>
    const hotelName = typeof row.hotelName === 'string' ? row.hotelName.trim() : ''
    if (!hotelName) continue
    const rateThb = typeof row.rateThb === 'number' ? row.rateThb : Number(row.rateThb)
    if (!Number.isFinite(rateThb) || rateThb <= 0) continue
    const confidenceRaw = typeof row.confidence === 'number' ? row.confidence : Number(row.confidence)
    const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0
    const roomType = typeof row.roomType === 'string' && row.roomType.trim() ? row.roomType.trim() : null
    const stayDate =
      typeof row.stayDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.stayDate) ? row.stayDate : null
    const priceNote = typeof row.priceNote === 'string' && row.priceNote.trim() ? row.priceNote.trim() : null
    out.push({ hotelName, roomType, rateThb: Math.round(rateThb), stayDate, confidence, priceNote })
  }
  return out
}

/** The actual network call. Throws (doesn't swallow) on a missing API
 *  key or an API error — the caller's route is responsible for turning
 *  that into a clean HTTP error response, never a silently-empty
 *  extraction that reads as "no competitors found on this page". */
export async function extractCompetitorRatesFromImage(
  input: ExtractCompetitorRatesInput,
): Promise<ExtractedCompetitorRow[]> {
  if (!isRateChannel(input.channel)) {
    throw new Error(`[vision-extract] invalid channel "${input.channel}" — must be one of ${RATE_CHANNELS.join(', ')}`)
  }
  const client = getAnthropicClient()
  const request = buildExtractionRequest(input)
  const response = await client.messages.create(request)
  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  )
  if (!toolUse) return []
  return parseExtractionResponse(toolUse.input)
}
