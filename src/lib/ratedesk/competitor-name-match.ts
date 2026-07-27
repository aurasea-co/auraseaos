// Fuzzy-matches a hotel name extracted from an OTA screenshot against
// the branch's existing competitor roster (competitor_rates' distinct
// competitor_name values — see the discovery notes: there's no
// separate competitors registry table, so "the comp set" IS this
// distinct-name list). Screenshot extraction and OCR-adjacent vision
// output routinely differ from the exact stored spelling — a trailing
// "Hotel"/"Resort", word reordering, or a one-character slip — so an
// exact string match alone would surface almost every real competitor
// as "unmatched." Never auto-creates a competitor: below the
// threshold, the caller must show the name for manual mapping (map to
// an existing one, or explicitly add as new) — see the review-step
// requirement this exists for.

// Words common enough across hotel names that they shouldn't drive a
// match/mismatch on their own (a name differing only by "Hotel" vs
// "Resort" should still read as the same property).
const COMMON_SUFFIX_WORDS = new Set(['hotel', 'resort', 'the', 'and', 'spa', 'inn', 'suites', 'residence'])

// ASCII alphanumerics + Thai script range (U+0E00-U+0E7F, single UTF-16
// code unit — no surrogate pairs, so this works without the `u` flag)
// + whitespace are kept; everything else (punctuation, other scripts)
// becomes a space. No \p{...}/u-flag here — this project's tsconfig
// has no explicit `target`, which defaults tsc to ES3 for syntax-level
// checks like unicode regex flags.
function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^a-z0-9฀-๿\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
    .trim()
}

function tokenSet(name: string): Set<string> {
  return new Set(
    normalize(name)
      .split(' ')
      .filter((w) => w.length > 0 && !COMMON_SUFFIX_WORDS.has(w)),
  )
}

// Array.from(set) rather than for-of over the Set directly — this
// project's tsconfig has no explicit `target` (defaults tsc to ES3),
// which rejects direct Set iteration without --downlevelIteration.
function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  return Array.from(a).every((v) => b.has(v))
}

function isNonEmptySubset(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0) return false
  return Array.from(a).every((v) => b.has(v))
}

// Standard Levenshtein edit distance (insert/delete/substitute), DP
// over two rows — no need for the full matrix at this string length
// (hotel names, not documents).
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let prevRow = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const curRow = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curRow.push(Math.min(prevRow[j] + 1, curRow[j - 1] + 1, prevRow[j - 1] + cost))
    }
    prevRow = curRow
  }
  return prevRow[b.length]
}

function levenshteinRatio(a: string, b: string): number {
  if (a === b) return 1
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshtein(a, b) / maxLen
}

export interface CompetitorNameMatch {
  /** The EXISTING stored name this extracted name matched to — always
   *  one of `knownNames`, never the extracted string itself. */
  matchedName: string
  /** 0..1. Callers should still let the operator confirm/override —
   *  this is a suggestion, not an auto-commit decision (see the
   *  review-step requirement). */
  confidence: number
}

// Below this, treat as genuinely unmatched rather than guessing — a
// wrong auto-suggestion the operator doesn't notice is worse than an
// honest "map this yourself" prompt.
export const MATCH_THRESHOLD = 0.6

/** Pure — no I/O. Returns the best-matching known competitor name for
 *  `extractedName`, or null when nothing clears MATCH_THRESHOLD. */
export function matchCompetitorName(
  extractedName: string,
  knownNames: ReadonlyArray<string>,
): CompetitorNameMatch | null {
  const normExtracted = normalize(extractedName)
  const tokensExtracted = tokenSet(extractedName)
  let best: CompetitorNameMatch | null = null

  for (const known of knownNames) {
    const normKnown = normalize(known)
    const tokensKnown = tokenSet(known)
    let score = levenshteinRatio(normExtracted, normKnown)
    // Token-set comparison (order-independent, common-word-stripped)
    // catches cases plain edit-distance penalizes too harshly — e.g.
    // "Hotel Sima Thani" vs "Sima Thani Resort" differ a lot
    // character-by-character but are clearly the same property once
    // "Hotel"/"Resort" are stripped and word order ignored.
    if (setsEqual(tokensExtracted, tokensKnown) && tokensExtracted.size > 0) {
      score = Math.max(score, 0.97)
    } else if (isNonEmptySubset(tokensExtracted, tokensKnown) || isNonEmptySubset(tokensKnown, tokensExtracted)) {
      score = Math.max(score, 0.85)
    }
    if (!best || score > best.confidence) {
      best = { matchedName: known, confidence: score }
    }
  }

  if (!best || best.confidence < MATCH_THRESHOLD) return null
  return best
}
