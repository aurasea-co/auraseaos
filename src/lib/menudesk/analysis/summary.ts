// What the blurred result is allowed to know.
//
// Bible §04 step 2 is a curiosity gap: the visitor sees that three dishes are
// bleeding and cannot see WHICH. The obvious way to build that — send the real
// ranking and put a CSS blur over it — is not a gap at all. It is the whole
// answer, sitting in the DOM, one devtools panel away, and the moment anyone
// notices, every claim this product makes about being honest is worth nothing.
// §12 rates exactly that as the risk that ends the product.
//
// So the redaction happens HERE, on the server, and the type is the guard:
// there is no field on BlurredScanSummary that can carry a dish name, a price,
// or a percentage, and there must never be one. The blur in the UI is a visual
// treatment applied to placeholder blocks — it is not what keeps the secret.

import type { TrafficLight } from '@/lib/menudesk/engine'

export type ScanStatus =
  | 'uploading'
  | 'reading'
  | 'costing'
  | 'complete'
  | 'partial'
  | 'failed'

/** Terminal states — nothing further will happen without a new scan. */
export const TERMINAL_STATUSES: ScanStatus[] = ['complete', 'partial', 'failed']

export function isTerminal(status: ScanStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

export interface TrafficLightCounts {
  red: number
  amber: number
  green: number
}

/**
 * The pre-unlock view of a finished scan.
 *
 * `rows` is one traffic light per costed dish, worst first — enough to render a
 * ranking of the right LENGTH and the right COLOURS, which is what makes the
 * gap feel real, and not one byte more. It is deliberately a bare array of
 * colours rather than an array of objects: an object grows a `name` field the
 * first time someone is in a hurry.
 */
export interface BlurredScanSummary {
  status: ScanStatus
  /** Dishes read off the menu, costed or not. */
  dishCount: number
  costedCount: number
  /** Read but not costable — reported as a number, never as a list. */
  uncostedCount: number
  counts: TrafficLightCounts
  rows: TrafficLight[]
}

export function emptyCounts(): TrafficLightCounts {
  return { red: 0, amber: 0, green: 0 }
}

/**
 * Fold traffic lights into counts and a worst-first row list.
 *
 * Pure, so the redaction guarantee is testable without a database: given
 * anything at all, the output can only ever be colours and integers.
 */
export function summarize(
  status: ScanStatus,
  lights: TrafficLight[],
  dishCount: number,
): BlurredScanSummary {
  const counts = emptyCounts()
  for (const light of lights) counts[light] += 1

  // Worst first. The blurred list should have the same shape as the real one,
  // so the reveal in W6 does not visibly rearrange itself.
  const ORDER: Record<TrafficLight, number> = { red: 0, amber: 1, green: 2 }
  const rows = [...lights].sort((a, b) => ORDER[a] - ORDER[b])

  return {
    status,
    dishCount,
    costedCount: lights.length,
    uncostedCount: Math.max(0, dishCount - lights.length),
    counts,
    rows,
  }
}

/**
 * The headline number: dishes worth worrying about.
 *
 * Red plus amber, because "3 dishes are losing you money" is the sentence that
 * makes someone hand over a phone number, and amber dishes are genuinely part
 * of that story. The UI never claims more precision than the band supports.
 */
export function concernCount(counts: TrafficLightCounts): number {
  return counts.red + counts.amber
}
