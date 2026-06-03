// Satang ↔ THB conversion helpers.
//
// The rate-recommendation surface (branch_rate_recommendations,
// rate_approvals.suggested_rate_satang) stores money as integer satang
// — 1 THB = 100 satang. The rest of the codebase still works in integer
// THB (per AURASEA_HOUSE_STYLE.md). These helpers are the SINGLE
// boundary where the two units meet. Conversions everywhere else are
// banned — call these so a future precision change happens in one
// place.
//
// Both functions are pure. Both round the OUTPUT half-up — never
// truncate — so a baht display always reflects the closest whole
// integer to the underlying satang value.

/** Convert THB (number; integer expected but tolerant of decimals)
 *  to satang (integer). Examples:
 *    thbToSatang(100)    → 10000
 *    thbToSatang(99.5)   → 9950
 *    thbToSatang(0)      → 0
 *    thbToSatang(-5)     → 0   (negative inputs clamp at 0; rate
 *                                math should never produce <0 here
 *                                but we clamp defensively rather than
 *                                surface the bug downstream) */
export function thbToSatang(thb: number): number {
  if (!Number.isFinite(thb) || thb <= 0) return 0
  return Math.round(thb * 100)
}

/** Convert satang (integer expected; tolerant of float drift from
 *  arithmetic) to THB (integer; rounded half-up). Examples:
 *    satangToThb(10000) → 100
 *    satangToThb(9950)  → 100   (rounded half-up)
 *    satangToThb(9949)  → 99
 *    satangToThb(0)     → 0
 *    satangToThb(-1)    → 0     (negative clamps to 0) */
export function satangToThb(satang: number): number {
  if (!Number.isFinite(satang) || satang <= 0) return 0
  return Math.round(satang / 100)
}
