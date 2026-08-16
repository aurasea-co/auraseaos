import { describe, expect, it } from 'vitest'
import { MAX_TRIM_FRACTION, contentRect, scaleRect } from './crop'
import type { LumaPlane } from './quality'

const W = 200
const H = 200

/**
 * A page with `margin` px of uniform background on every side and textured
 * content in the middle — a menu photographed on a plain table.
 *
 * Every row and column of the content block carries some ink. Real text has
 * blank leading between lines, but that only ever appears in the interior,
 * where it is harmless: trimming works inward from each edge and halts at the
 * first line with structure. A fixture whose content block *opens* on a blank
 * row would assert the cropper must keep a row it can prove is empty, which is
 * the opposite of what it is for.
 */
function pageWithMargin(margin: number, { paper = 210, ink = 60 } = {}): LumaPlane {
  const data = new Float32Array(W * H).fill(paper)
  for (let y = margin; y < H - margin; y++) {
    for (let x = margin; x < W - margin; x++) {
      // Irregular marks, so no row or column is accidentally uniform.
      if ((x * 7 + y * 13) % 5 !== 0) data[y * W + x] = ink
    }
  }
  return { data, width: W, height: H }
}

describe('contentRect', () => {
  it('trims uniform margin down to the content', () => {
    const rect = contentRect(pageWithMargin(20))

    expect(rect.x).toBeGreaterThan(0)
    expect(rect.y).toBeGreaterThan(0)
    expect(rect.x + rect.width).toBeLessThanOrEqual(W)
    expect(rect.y + rect.height).toBeLessThanOrEqual(H)
    // Close to the true margin, and never inside it.
    expect(rect.x).toBeLessThanOrEqual(20)
    expect(rect.y).toBeLessThanOrEqual(20)
  })

  it('never cuts into content', () => {
    // The invariant that matters: a trimmed dish is an invisible failure.
    const margin = 15
    const rect = contentRect(pageWithMargin(margin))

    expect(rect.x).toBeLessThanOrEqual(margin)
    expect(rect.y).toBeLessThanOrEqual(margin)
    expect(rect.x + rect.width).toBeGreaterThanOrEqual(W - margin)
    expect(rect.y + rect.height).toBeGreaterThanOrEqual(H - margin)
  })

  it('returns the full frame for a tightly cropped photo', () => {
    const rect = contentRect(pageWithMargin(0))
    expect(rect).toEqual({ x: 0, y: 0, width: W, height: H })
  })

  it('respects MAX_TRIM_FRACTION on a mostly empty frame', () => {
    // Content occupies a small centre patch. Without the cap this would crop
    // to a sliver and we would analyse a fraction of the menu with confidence.
    const rect = contentRect(pageWithMargin(80))

    const maxTrim = Math.floor(W * MAX_TRIM_FRACTION)
    expect(rect.x).toBeLessThanOrEqual(maxTrim)
    expect(rect.y).toBeLessThanOrEqual(maxTrim)
    expect(rect.width).toBeGreaterThanOrEqual(W - 2 * maxTrim)
  })

  it('keeps the whole frame when the image is entirely uniform', () => {
    const blank: LumaPlane = { data: new Float32Array(W * H).fill(180), width: W, height: H }
    const rect = contentRect(blank)

    // A blank page is the quality checks' problem ('blank'), not the cropper's.
    expect(rect.width).toBeGreaterThan(0)
    expect(rect.height).toBeGreaterThan(0)
  })

  it('trims a dim photo the same as a bright one', () => {
    // Low-contrast kitchen light must not change what counts as margin.
    const bright = contentRect(pageWithMargin(20, { paper: 210, ink: 60 }))
    const dim = contentRect(pageWithMargin(20, { paper: 165, ink: 115 }))

    expect(dim).toEqual(bright)
  })
})

describe('scaleRect', () => {
  it('scales a rect to full-resolution pixels', () => {
    const scaled = scaleRect({ x: 10, y: 20, width: 100, height: 50 }, 4, 4000, 4000)
    expect(scaled).toEqual({ x: 40, y: 80, width: 400, height: 200 })
  })

  it('never runs past the source bounds', () => {
    // Rounding at the far edge must not produce an out-of-bounds draw.
    const scaled = scaleRect({ x: 90, y: 90, width: 20, height: 20 }, 10, 1000, 1000)
    expect(scaled.x + scaled.width).toBeLessThanOrEqual(1000)
    expect(scaled.y + scaled.height).toBeLessThanOrEqual(1000)
  })
})
