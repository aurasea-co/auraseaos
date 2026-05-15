import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ChartLegend, LegendSwatch } from './ChartLegend'

// Guards against the bug we just fixed: the legend must propagate the
// dashed line-style to the swatch, using the exact dash pattern
// (4 3) that matches Chart.js's `borderDash: [4, 3]`. Prior CSS
// `border-top: 2px dashed` rendered a visually-solid-looking swatch.

describe('ChartLegend swatch style propagation', () => {
  it('renders a solid line stroke when dashed is undefined', () => {
    const html = renderToStaticMarkup(
      <LegendSwatch item={{ color: '#1D9E75', label: 'Revenue' }} />,
    )
    expect(html).toContain('<svg')
    expect(html).toContain('stroke="#1D9E75"')
    expect(html).not.toContain('stroke-dasharray')
  })

  it('renders a dashed stroke with 4 3 pattern when dashed is true', () => {
    const html = renderToStaticMarkup(
      <LegendSwatch item={{ color: '#A32D2D', label: 'Labour cost (fixed)', dashed: true }} />,
    )
    expect(html).toContain('stroke="#A32D2D"')
    // react-dom serialises as `stroke-dasharray="4 3"`.
    expect(html).toContain('stroke-dasharray="4 3"')
  })

  it('renders a solid bar swatch (no svg) when shape="bar"', () => {
    const html = renderToStaticMarkup(
      <LegendSwatch item={{ color: '#534AB7', label: 'Below target', shape: 'bar' }} />,
    )
    expect(html).not.toContain('<svg')
    expect(html).toContain('background:#534AB7')
  })

  it('dashed always renders as a line even when shape="bar"', () => {
    // A "dashed bar" has no visual meaning — force a line.
    const html = renderToStaticMarkup(
      <LegendSwatch item={{ color: '#BA7517', label: 'Target', shape: 'bar', dashed: true }} />,
    )
    expect(html).toContain('<svg')
    expect(html).toContain('stroke-dasharray="4 3"')
  })

  it('full legend renders every item with matching swatch styles', () => {
    // Simulates the Labour "Revenue vs Labour cost" legend: solid green
    // revenue, dashed red labour cost, dashed orange breakeven — the
    // scenario that exposed the original bug.
    const html = renderToStaticMarkup(
      <ChartLegend
        items={[
          { color: '#1D9E75', label: 'Actual revenue' },
          { color: '#A32D2D', label: 'Labour cost (fixed)', dashed: true },
          { color: '#BA7517', label: 'Breakeven', dashed: true },
        ]}
      />,
    )
    // Two dashed swatches, one solid — exactly matching the chart lines.
    const dashedCount = (html.match(/stroke-dasharray="4 3"/g) || []).length
    expect(dashedCount).toBe(2)
    expect(html).toContain('Actual revenue')
    expect(html).toContain('Labour cost (fixed)')
    expect(html).toContain('Breakeven')
  })
})
