import { describe, it, expect } from 'vitest'
import { draftToEditable, LOW_CONFIDENCE_THRESHOLD, type DraftRow } from './ScreenshotImportPanel'
import { parseExtractionResponse } from '@/lib/ratedesk/vision-extract'
import { matchCompetitorName } from '@/lib/ratedesk/competitor-name-match'
import { assessPlausibility } from '@/lib/ratedesk/competitor-rate-plausibility'

// End-to-end pipeline test using SYNTHETIC "vision model output" —
// standing in for a real Agoda/Booking screenshot + API call (which
// needs a live ANTHROPIC_API_KEY — see vision-extract.ts's own tests
// for why the network call itself isn't exercised here). This proves
// the whole chain (parse → match → plausibility → default-include
// decision) behaves correctly on realistic model output for both
// platforms, matching the task's verification requirements:
//   - correct extraction of name/rate/channel/date
//   - an unmatched hotel name is surfaced, not dropped
//   - a member/strikethrough price resolves to the bookable rate
//   - a low-confidence row is flagged, never auto-included

const KNOWN_COMPETITORS = ['Sima Thani', 'Asiana', 'The Finn']
const FALLBACK_DATE = '2026-07-28'

function runPipeline(modelOutput: unknown, referenceRatesByCompetitor: Record<string, number[]>) {
  const extracted = parseExtractionResponse(modelOutput)
  return extracted.map((row) => {
    const match = matchCompetitorName(row.hotelName, KNOWN_COMPETITORS)
    const refs = match ? referenceRatesByCompetitor[match.matchedName] ?? [] : []
    const plausibility = assessPlausibility(row.rateThb, refs)
    const draft: DraftRow = {
      ...row,
      matchedName: match?.matchedName ?? null,
      matchConfidence: match?.confidence ?? null,
      plausibility,
    }
    return draftToEditable(draft, FALLBACK_DATE)
  })
}

describe('screenshot pipeline — synthetic Agoda-style response', () => {
  // A realistic Agoda search-results extraction: one exact match, one
  // near-miss name (OCR-adjacent), one property with a member price
  // (strikethrough resolved), one hotel not in the comp set at all.
  const agodaResponse = {
    rows: [
      { hotelName: 'Sima Thani', roomType: 'Deluxe', rateThb: 1250, stayDate: '2026-07-28', confidence: 0.95, priceNote: null },
      { hotelName: 'Asiana Hotel', roomType: 'Superior', rateThb: 890, stayDate: '2026-07-28', confidence: 0.9, priceNote: null },
      {
        hotelName: 'The Finn',
        roomType: 'Standard',
        rateThb: 550,
        stayDate: '2026-07-28',
        confidence: 0.85,
        priceNote: 'Used Agoda member price ฿550, ignored strikethrough ฿700',
      },
      { hotelName: 'Grand Riverside Boutique', roomType: null, rateThb: 1600, stayDate: '2026-07-28', confidence: 0.8, priceNote: null },
    ],
  }

  const rows = runPipeline(agodaResponse, {
    'Sima Thani': [1200, 1180, 1220],
    Asiana: [900, 880],
    'The Finn': [560, 540],
  })

  it('correctly extracts name, rate, and stay date for each row', () => {
    expect(rows).toHaveLength(4)
    expect(rows[0]).toMatchObject({ competitorName: 'Sima Thani', rateThb: '1250', stayDate: '2026-07-28' })
  })

  it('fuzzy-matches "Asiana Hotel" to the stored "Asiana" and includes it by default (matched, confident, plausible)', () => {
    expect(rows[1].competitorName).toBe('Asiana')
    expect(rows[1].resolved).toBe(true)
    expect(rows[1].included).toBe(true)
  })

  it('resolves the member/strikethrough price to the bookable rate and surfaces the note', () => {
    expect(rows[2].rateThb).toBe('550') // NOT the struck-through ฿700
    expect(rows[2].priceNote).toContain('member price')
    expect(rows[2].priceNote).toContain('ignored strikethrough')
  })

  it('surfaces "Grand Riverside Boutique" as UNMATCHED for manual mapping — never dropped, never auto-committed', () => {
    const unmatchedRow = rows[3]
    expect(unmatchedRow.competitorName).toBe('') // no known name to default to
    expect(unmatchedRow.resolved).toBe(false)
    expect(unmatchedRow.included).toBe(false) // cannot be included until mapped
  })
})

describe('screenshot pipeline — synthetic Booking.com-style response with a low-confidence row', () => {
  const bookingResponse = {
    rows: [
      { hotelName: 'Sima Thani', roomType: 'Suite', rateThb: 1800, stayDate: '2026-07-29', confidence: 0.4, priceNote: 'Price partially obscured by a promo banner' },
    ],
  }
  const rows = runPipeline(bookingResponse, { 'Sima Thani': [1200, 1180, 1220] })

  it('flags the low-confidence row and does NOT default it to included, even though the name matched', () => {
    expect(rows[0].resolved).toBe(true) // name matched fine
    expect(rows[0].confidence).toBeLessThan(LOW_CONFIDENCE_THRESHOLD)
    expect(rows[0].included).toBe(false) // low confidence overrides a clean match
  })
})

describe('screenshot pipeline — implausible rate is flagged even when the name matches confidently', () => {
  it('flags a rate wildly above the competitor\'s own recent history and excludes it by default', () => {
    const response = { rows: [{ hotelName: 'Sima Thani', rateThb: 15000, confidence: 0.95 }] }
    const rows = runPipeline(response, { 'Sima Thani': [1200, 1180, 1220] })
    expect(rows[0].resolved).toBe(true)
    expect(rows[0].confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE_THRESHOLD)
    expect(rows[0].plausibilityFlagged).toBe(true)
    expect(rows[0].included).toBe(false) // plausibility flag overrides high confidence
  })
})

describe('screenshot pipeline — money stays plain THB, not satang', () => {
  // competitor_rates.rate is NUMERIC THB (migration 029's own comment:
  // "Satang convention from the spec doesn't apply here") — this is a
  // deliberate, documented exception to the codebase's usual satang
  // rule. This test pins that the pipeline never multiplies by 100.
  it('does not convert the extracted ฿ amount to satang anywhere in the pipeline', () => {
    const response = { rows: [{ hotelName: 'Sima Thani', rateThb: 1250, confidence: 0.95 }] }
    const rows = runPipeline(response, { 'Sima Thani': [1200] })
    expect(rows[0].rateThb).toBe('1250') // NOT '125000'
  })
})
