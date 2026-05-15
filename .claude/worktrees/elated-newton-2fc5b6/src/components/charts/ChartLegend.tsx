/**
 * Shared HTML legend for all Chart.js-rendered charts in the app.
 *
 * The previous implementation had three inline copies (in LabourView,
 * FnbTrendsView, HotelTrendsView) that used CSS `border-top: 2px dashed`
 * to signal a dashed series. Browsers render that at 2px thickness as
 * 2-3 tiny dashes that are visually indistinguishable from solid —
 * so Labour's "Labour cost (fixed)" and the cost tab's "Actual cost"
 * line showed up as dashed in the chart but solid in the legend.
 *
 * This component renders each swatch as an inline SVG with an explicit
 * `stroke-dasharray="4 3"` matching the canvas `borderDash: [4, 3]` used
 * in LineChart — so the legend dash pattern is byte-for-byte the same as
 * the line pattern.
 */

export interface ChartLegendItem {
  color: string
  label: string
  /** Dashed line in the chart → dashed swatch in the legend. */
  dashed?: boolean
  /** Shape: 'line' (default — for line series) or 'bar' (for categorical
   *  bar colors like "above target" / "below target"). `dashed` always
   *  wins and renders a line, since "dashed bar" has no visual meaning. */
  shape?: 'line' | 'bar'
  /** e.g. "left axis" — rendered in parentheses after the label. */
  axisHint?: string
}

interface Props {
  items: ChartLegendItem[]
  /** Space above the legend (px). Use when the legend sits BELOW a chart
   *  canvas — matches the prior Hotel ADR spacing. Default 0. */
  marginTop?: number
  /** Space below the legend (px). Use when the legend sits ABOVE a chart
   *  canvas — matches the prior Labour/FnbTrends spacing. Default 10. */
  marginBottom?: number
}

// Matches Chart.js LineChart's `borderDash: [4, 3]` so the legend swatch
// renders the exact same dash pattern as the canvas line.
const DASH_PATTERN = '4 3'

export function ChartLegend({ items, marginTop = 0, marginBottom = 10 }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 14,
        flexWrap: 'wrap',
        marginTop,
        marginBottom,
        fontSize: 12,
      }}
    >
      {items.map((item) => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <LegendSwatch item={item} />
          <span style={{ color: 'var(--color-text-secondary)' }}>{item.label}</span>
          {item.axisHint && (
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>({item.axisHint})</span>
          )}
        </div>
      ))}
    </div>
  )
}

/** Exported for snapshot tests — keeps the SVG rendering pure and
 *  reachable without going through the full layout. */
export function LegendSwatch({ item }: { item: ChartLegendItem }) {
  const { color, dashed, shape = 'line' } = item

  // Dashed always renders as a line — bars are never drawn dashed.
  if (dashed || shape === 'line') {
    return (
      <svg
        width={24}
        height={8}
        viewBox="0 0 24 8"
        aria-hidden="true"
        style={{ flexShrink: 0, display: 'inline-block' }}
      >
        <line
          x1={0}
          y1={4}
          x2={24}
          y2={4}
          stroke={color}
          strokeWidth={2}
          strokeDasharray={dashed ? DASH_PATTERN : undefined}
          strokeLinecap="butt"
        />
      </svg>
    )
  }

  // Solid filled swatch for categorical bar colors.
  return (
    <span
      aria-hidden="true"
      style={{
        width: 10,
        height: 10,
        borderRadius: 2,
        background: color,
        display: 'inline-block',
        flexShrink: 0,
      }}
    />
  )
}
