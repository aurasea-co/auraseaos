import { describe, it, expect } from 'vitest'
import { buildExtractionRequest, parseExtractionResponse, VISION_MODEL } from './vision-extract'

// These tests cover the two PURE layers — request construction and
// response validation. The actual network call (extractCompetitorRatesFromImage)
// needs a real ANTHROPIC_API_KEY and hits a paid API, so it isn't
// exercised here; these tests instead prove the adapter handles
// whatever the model comes back with defensively, since a "structured
// output" schema is a strong hint to the model, not a guarantee.

describe('buildExtractionRequest', () => {
  it('uses the cheap Haiku vision model', () => {
    const req = buildExtractionRequest({ imageBase64: 'AAAA', mediaType: 'image/png', channel: 'ota' })
    expect(req.model).toBe(VISION_MODEL)
    expect(VISION_MODEL).toContain('haiku')
  })

  it('forces tool_choice to the extraction tool (never free-form prose)', () => {
    const req = buildExtractionRequest({ imageBase64: 'AAAA', mediaType: 'image/png', channel: 'ota' })
    expect(req.tool_choice).toEqual({ type: 'tool', name: 'extract_competitor_rates' })
    expect(req.tools).toHaveLength(1)
    expect(req.tools[0].name).toBe('extract_competitor_rates')
  })

  it('embeds the image as a base64 content block', () => {
    const req = buildExtractionRequest({ imageBase64: 'SGVsbG8=', mediaType: 'image/jpeg', channel: 'ota' })
    const imageBlock = req.messages[0].content.find((c) => c.type === 'image')
    expect(imageBlock).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: 'SGVsbG8=' },
    })
  })

  it('names the correct channel in the system prompt', () => {
    const req = buildExtractionRequest({ imageBase64: 'AAAA', mediaType: 'image/png', channel: 'walk_in' })
    expect(req.system).toContain('walk_in listings')
  })

  it('instructs the model to prefer the bookable (discounted/member) price over a strikethrough one', () => {
    const req = buildExtractionRequest({ imageBase64: 'AAAA', mediaType: 'image/png', channel: 'ota' })
    expect(req.system.toLowerCase()).toContain('struck-through')
    expect(req.system.toLowerCase()).toContain('member')
  })

  it('mentions the specific OTA platform when a hint is given', () => {
    const req = buildExtractionRequest({ imageBase64: 'AAAA', mediaType: 'image/png', channel: 'ota', otaHint: 'Agoda' })
    expect(req.system).toContain('specifically from Agoda')
  })

  it('omits platform-specific guidance when no hint or "Other" is given', () => {
    const withoutHint = buildExtractionRequest({ imageBase64: 'AAAA', mediaType: 'image/png', channel: 'ota' })
    const withOther = buildExtractionRequest({ imageBase64: 'AAAA', mediaType: 'image/png', channel: 'ota', otaHint: 'Other' })
    expect(withoutHint.system).not.toContain('specifically from')
    expect(withOther.system).not.toContain('specifically from')
  })
})

describe('parseExtractionResponse — happy path', () => {
  it('parses a well-formed multi-row response', () => {
    const rows = parseExtractionResponse({
      rows: [
        { hotelName: 'Sima Thani', roomType: 'Deluxe', rateThb: 1250, stayDate: '2026-07-28', confidence: 0.95, priceNote: null },
        { hotelName: 'Asiana', roomType: null, rateThb: 890, stayDate: '2026-07-28', confidence: 0.8, priceNote: null },
      ],
    })
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      hotelName: 'Sima Thani',
      roomType: 'Deluxe',
      rateThb: 1250,
      stayDate: '2026-07-28',
      confidence: 0.95,
      priceNote: null,
    })
  })

  it('preserves a priceNote explaining a strikethrough/member-price resolution', () => {
    const rows = parseExtractionResponse({
      rows: [
        { hotelName: 'The Finn', rateThb: 600, confidence: 0.9, priceNote: 'Used member price ฿600, ignored strikethrough ฿750' },
      ],
    })
    expect(rows[0].priceNote).toContain('member price')
  })
})

describe('parseExtractionResponse — defensive against malformed model output', () => {
  it('returns [] for a non-object / missing rows array', () => {
    expect(parseExtractionResponse(null)).toEqual([])
    expect(parseExtractionResponse(undefined)).toEqual([])
    expect(parseExtractionResponse('not json')).toEqual([])
    expect(parseExtractionResponse({})).toEqual([])
  })

  it('drops a row with no hotel name', () => {
    const rows = parseExtractionResponse({ rows: [{ hotelName: '', rateThb: 1000, confidence: 0.9 }] })
    expect(rows).toHaveLength(0)
  })

  it('drops a row with a zero, negative, or non-numeric rate rather than coercing it', () => {
    const rows = parseExtractionResponse({
      rows: [
        { hotelName: 'A', rateThb: 0, confidence: 0.9 },
        { hotelName: 'B', rateThb: -500, confidence: 0.9 },
        { hotelName: 'C', rateThb: 'not a number', confidence: 0.9 },
        { hotelName: 'D', rateThb: 1200, confidence: 0.9 },
      ],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].hotelName).toBe('D')
  })

  it('coerces a numeric-string rate (model returned "1200" despite the number schema)', () => {
    const rows = parseExtractionResponse({ rows: [{ hotelName: 'A', rateThb: '1200', confidence: 0.9 }] })
    expect(rows[0].rateThb).toBe(1200)
  })

  it('clamps an out-of-range confidence into [0, 1]', () => {
    const rows = parseExtractionResponse({
      rows: [
        { hotelName: 'A', rateThb: 1000, confidence: 1.5 },
        { hotelName: 'B', rateThb: 1000, confidence: -0.3 },
      ],
    })
    expect(rows[0].confidence).toBe(1)
    expect(rows[1].confidence).toBe(0)
  })

  it('defaults confidence to 0 (never silently high) when missing/non-numeric', () => {
    const rows = parseExtractionResponse({ rows: [{ hotelName: 'A', rateThb: 1000 }] })
    expect(rows[0].confidence).toBe(0)
  })

  it('rejects a stayDate not in YYYY-MM-DD form rather than passing through garbage', () => {
    const rows = parseExtractionResponse({
      rows: [{ hotelName: 'A', rateThb: 1000, confidence: 0.9, stayDate: '28 July 2026' }],
    })
    expect(rows[0].stayDate).toBeNull()
  })

  it('skips non-object entries inside the rows array without throwing', () => {
    const rows = parseExtractionResponse({ rows: [null, 'garbage', 42, { hotelName: 'A', rateThb: 1000, confidence: 0.9 }] })
    expect(rows).toHaveLength(1)
  })

  it('rounds a fractional rate to the nearest baht', () => {
    const rows = parseExtractionResponse({ rows: [{ hotelName: 'A', rateThb: 1199.6, confidence: 0.9 }] })
    expect(rows[0].rateThb).toBe(1200)
  })
})
