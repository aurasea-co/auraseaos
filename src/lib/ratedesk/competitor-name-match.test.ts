import { describe, it, expect } from 'vitest'
import { matchCompetitorName, MATCH_THRESHOLD } from './competitor-name-match'

// Realistic Crystal Resort (Nakhon Ratchasima) comp set — same names
// used in the engine's real-data test fixtures elsewhere in this repo.
const KNOWN_NAMES = ['Sima Thani', 'Asiana', 'The Finn', 'De v Loft', 'B2 Korat Premium']

describe('matchCompetitorName — exact and case-insensitive', () => {
  it('matches an exact spelling at full confidence', () => {
    const m = matchCompetitorName('Sima Thani', KNOWN_NAMES)
    expect(m).toEqual({ matchedName: 'Sima Thani', confidence: 1 })
  })

  it('matches regardless of case', () => {
    const m = matchCompetitorName('SIMA THANI', KNOWN_NAMES)
    expect(m?.matchedName).toBe('Sima Thani')
    expect(m?.confidence).toBeGreaterThanOrEqual(MATCH_THRESHOLD)
  })
})

describe('matchCompetitorName — common suffix / reordering variations', () => {
  it('matches "Sima Thani Hotel" (extracted with a suffix the stored name lacks)', () => {
    const m = matchCompetitorName('Sima Thani Hotel', KNOWN_NAMES)
    expect(m?.matchedName).toBe('Sima Thani')
    expect(m?.confidence).toBeGreaterThanOrEqual(0.8)
  })

  it('matches "Hotel Sima Thani" (reordered + prefixed)', () => {
    const m = matchCompetitorName('Hotel Sima Thani', KNOWN_NAMES)
    expect(m?.matchedName).toBe('Sima Thani')
    expect(m?.confidence).toBeGreaterThanOrEqual(0.8)
  })

  it('matches "The Finn Hotel" against stored "The Finn"', () => {
    const m = matchCompetitorName('The Finn Hotel', KNOWN_NAMES)
    expect(m?.matchedName).toBe('The Finn')
  })
})

describe('matchCompetitorName — OCR/vision near-misses', () => {
  it('matches a one-character slip ("Sima Thanl" — l/i confusion)', () => {
    const m = matchCompetitorName('Sima Thanl', KNOWN_NAMES)
    expect(m?.matchedName).toBe('Sima Thani')
    expect(m?.confidence).toBeGreaterThanOrEqual(MATCH_THRESHOLD)
  })

  it('matches a missing-space slip ("DevLoft" for "De v Loft")', () => {
    const m = matchCompetitorName('DevLoft', KNOWN_NAMES)
    expect(m?.matchedName).toBe('De v Loft')
  })
})

describe('matchCompetitorName — genuinely unmatched names', () => {
  it('returns null for a hotel with no real similarity to any known name', () => {
    const m = matchCompetitorName('Grand Mercure Bangkok Sathorn', KNOWN_NAMES)
    expect(m).toBeNull()
  })

  it('returns null against an empty comp set', () => {
    const m = matchCompetitorName('Sima Thani', [])
    expect(m).toBeNull()
  })

  it('never returns the extracted string itself as matchedName — only a known name', () => {
    const m = matchCompetitorName('Completely Different Property Name', KNOWN_NAMES)
    if (m) expect(KNOWN_NAMES).toContain(m.matchedName)
    else expect(m).toBeNull()
  })
})

describe('matchCompetitorName — picks the single best match, not just the first over threshold', () => {
  it('prefers the closer of two plausible candidates', () => {
    const names = ['Asiana', 'Asiana Airport Hotel']
    const m = matchCompetitorName('Asiana', names)
    expect(m?.matchedName).toBe('Asiana')
    expect(m?.confidence).toBe(1)
  })
})
