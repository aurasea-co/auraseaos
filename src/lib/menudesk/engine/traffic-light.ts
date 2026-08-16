// Turning a food-cost band into the one signal the owner actually reads.
//
// Pure arithmetic, no country in it: the thresholds are parameters with a
// documented default, because "30% food cost is healthy" is an industry rule
// of thumb that shifts by market and by format, and baking it in as a constant
// would be a hidden country assumption of exactly the kind §13 warns about.

import type {
  Confidence,
  EstimateRange,
  PercentRange,
  TrafficLight,
} from './types'

export interface TrafficLightThresholds {
  /** Food cost % at or below this is green. */
  greenMaxPct: number
  /** Above greenMaxPct and at or below this is amber; anything higher is red. */
  amberMaxPct: number
}

/**
 * Conventional full-service defaults: comfortable below 30%, watch to 40%,
 * bleeding above. Callers may override per country or per restaurant format.
 */
export const DEFAULT_THRESHOLDS: TrafficLightThresholds = {
  greenMaxPct: 30,
  amberMaxPct: 40,
}

/**
 * Food cost as a percentage band.
 *
 * Monotonic, so the cheap end of the cost band is the cheap end of the
 * percentage band. Returns null when the menu price is missing or zero:
 * dividing by it would produce Infinity, and an Infinity rendered as a
 * percentage is how a nonsense number reaches an owner's screen.
 */
export function computeFoodCostPct(
  cost: EstimateRange,
  menuPrice: number,
): PercentRange | null {
  if (!Number.isFinite(menuPrice) || menuPrice <= 0) return null
  if (!Number.isFinite(cost.low) || !Number.isFinite(cost.high)) return null

  return {
    low: (cost.low / menuPrice) * 100,
    high: (cost.high / menuPrice) * 100,
  }
}

/** Which band a single percentage falls in. */
export function classifyPct(
  pct: number,
  thresholds: TrafficLightThresholds = DEFAULT_THRESHOLDS,
): TrafficLight {
  if (pct <= thresholds.greenMaxPct) return 'green'
  if (pct <= thresholds.amberMaxPct) return 'amber'
  return 'red'
}

export interface BandVerdict {
  trafficLight: TrafficLight
  /**
   * True when the whole band sits in one colour. False when the band straddles
   * a threshold — the verdict is then the midpoint's colour, but the caller
   * should present it as leaning rather than settled.
   */
  bandCertain: boolean
}

/**
 * Classify a percentage band.
 *
 * The colour comes from the MIDPOINT, not from the worst end. Taking the worst
 * end would paint red on any dish whose band happens to reach past 40%, and a
 * wall of false red is the same trust failure as a wrong number — §12 rates
 * being caught guessing as the risk that ends the product. So the midpoint
 * decides the colour and `bandCertain` carries the doubt honestly.
 */
export function classifyBand(
  pct: PercentRange,
  thresholds: TrafficLightThresholds = DEFAULT_THRESHOLDS,
): BandVerdict {
  const lowLight = classifyPct(pct.low, thresholds)
  const highLight = classifyPct(pct.high, thresholds)
  const midpoint = (pct.low + pct.high) / 2

  return {
    trafficLight: classifyPct(midpoint, thresholds),
    bandCertain: lowLight === highLight,
  }
}

const CONFIDENCE_RANK: Record<Confidence, number> = {
  low: 0,
  medium: 1,
  high: 2,
}

/**
 * Combine the confidences an analysis depends on, taking the weakest.
 *
 * A dish is only as trustworthy as its shakiest input: a perfect ingredient
 * price applied to a guessed recipe is a guess. Empty input yields 'low' —
 * knowing nothing is not the same as being sure.
 */
export function weakestConfidence(...confidences: Confidence[]): Confidence {
  if (confidences.length === 0) return 'low'
  return confidences.reduce((weakest, c) =>
    CONFIDENCE_RANK[c] < CONFIDENCE_RANK[weakest] ? c : weakest,
  )
}

/**
 * How wide a band is, relative to its midpoint — a band of 20–60% is not a
 * useful answer even though its midpoint looks decisive. Callers use this to
 * cap confidence and to decide when to stop showing a number at all.
 * Returns null for a non-positive midpoint, where the ratio is meaningless.
 */
export function relativeBandWidth(range: PercentRange): number | null {
  const midpoint = (range.low + range.high) / 2
  if (!Number.isFinite(midpoint) || midpoint <= 0) return null
  return (range.high - range.low) / midpoint
}
