// Flags an extracted (or manually entered) competitor rate that's
// wildly outside a plausible range for that competitor/room type,
// rather than silently accepting whatever a vision model — or a
// mistyped manual entry — produced. This is a coarse sanity check, not
// a validity proof: it compares against whatever reference rates the
// caller already has (the competitor's own recent history, and/or the
// branch's own current rate), so it degrades to "can't assess" rather
// than a false positive when no reference data exists yet (e.g. a
// brand-new competitor).

export interface PlausibilityConfig {
  /** Below this fraction of the reference median, flag as
   *  implausibly low (e.g. 0.2 = under 20% of the reference). */
  minRatio: number
  /** Above this multiple of the reference median, flag as
   *  implausibly high (e.g. 5 = over 5x the reference). */
  maxRatio: number
}

// Conservative defaults — wide enough that genuine promo/off-season
// swings don't trip it, tight enough to catch an obvious extraction
// error (e.g. a vision model reading "1,200" as "12,000", or a stray
// zero in a manual entry).
export const DEFAULT_PLAUSIBILITY_CONFIG: PlausibilityConfig = { minRatio: 0.2, maxRatio: 5 }

export interface PlausibilityResult {
  flagged: boolean
  reasonTh: string | null
  reasonEn: string | null
}

function median(values: ReadonlyArray<number>): number {
  const s = values.slice().sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Pure — no I/O. `referenceRates` should be whatever the caller has
 *  on hand (the same competitor+room type's recent rates, the
 *  branch's own current rate, or both pooled) — the more relevant
 *  references, the better the median holds up. Empty/all-invalid
 *  references → never flagged (nothing to compare against; the
 *  low-confidence signal from extraction itself still applies
 *  separately). */
export function assessPlausibility(
  rateThb: number,
  referenceRates: ReadonlyArray<number>,
  config: PlausibilityConfig = DEFAULT_PLAUSIBILITY_CONFIG,
): PlausibilityResult {
  if (!Number.isFinite(rateThb) || rateThb <= 0) {
    return {
      flagged: true,
      reasonTh: 'ราคาไม่ถูกต้อง (ศูนย์หรือติดลบ)',
      reasonEn: 'Rate is zero, negative, or not a number',
    }
  }

  const validRefs = referenceRates.filter((r) => Number.isFinite(r) && r > 0)
  if (validRefs.length === 0) {
    return { flagged: false, reasonTh: null, reasonEn: null }
  }

  const ref = median(validRefs)
  const ratio = rateThb / ref
  const refStr = Math.round(ref).toLocaleString('th-TH')
  const pctStr = Math.round(ratio * 100)

  if (ratio < config.minRatio) {
    return {
      flagged: true,
      reasonTh: `ราคาต่ำผิดปกติ — ${pctStr}% ของราคาอ้างอิง ฿${refStr}`,
      reasonEn: `Unusually low — ${pctStr}% of the reference rate ฿${refStr}`,
    }
  }
  if (ratio > config.maxRatio) {
    return {
      flagged: true,
      reasonTh: `ราคาสูงผิดปกติ — ${pctStr}% ของราคาอ้างอิง ฿${refStr}`,
      reasonEn: `Unusually high — ${pctStr}% of the reference rate ฿${refStr}`,
    }
  }
  return { flagged: false, reasonTh: null, reasonEn: null }
}
