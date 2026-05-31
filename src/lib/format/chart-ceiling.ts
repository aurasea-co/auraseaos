// Outlier-resistant ceiling for sparkline / bar charts. A single bad
// data point (e.g. a day where someone entered ฿28,640 revenue with
// rooms_sold=8 → ADR ฿3,580 when normal nightly rates max at ฿1,200)
// would otherwise crush every other bar against the X-axis when the
// chart auto-scales to data max.
//
// Strategy: compute the 95th percentile of positive values, add 30%
// headroom, round up to the nearest 100. Returns undefined when there
// isn't enough data to make a stable estimate (< 4 positive samples),
// letting the chart fall back to its default data-range scaling.
//
// Note: 95th percentile means values OVER the cap get clipped at the
// chart's top edge. Acceptable trade-off — the alternative (scaling
// to outlier) makes the bulk of the data unreadable. The KPI cards
// above the chart show the raw value, so nothing is hidden from the
// owner who wants the exact number.

export function p95CeilingThb(values: ReadonlyArray<number>): number | undefined {
  const positive = values.filter((v) => Number.isFinite(v) && v > 0).slice().sort((a, b) => a - b)
  // Need at least 4 samples to compute a stable p95 — fewer and any
  // single bad value still dominates. Sparkline auto-scales below
  // this threshold (caller passes undefined → chart uses dataMax).
  if (positive.length < 4) return undefined
  // Standard definition: the value at or below which 95% of the data
  // falls. floor(n * 0.95) covers the edge case of small samples.
  const idx = Math.min(positive.length - 1, Math.floor(positive.length * 0.95))
  const p95 = positive[idx]
  // 30% headroom + round up to nearest 100 — keeps the Y-axis
  // numbers humane (฿1,500 not ฿1,547).
  return Math.ceil((p95 * 1.3) / 100) * 100
}
