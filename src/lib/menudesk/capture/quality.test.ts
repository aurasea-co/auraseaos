import { describe, expect, it } from 'vitest'
import {
  DUPLICATE_HAMMING_MAX,
  LUMA_VARIANCE_MIN,
  type LumaPlane,
  SHARPNESS_MIN,
  averageHash,
  hammingDistance,
  judgePage,
  laplacianVariance,
  sharpness,
  toLuma,
} from './quality'

// ── Fixtures ───────────────────────────────────────────────────────────────
// Synthetic planes rather than photographs: the thresholds are the thing under
// test, and a checked-in JPEG would leave it unclear whether a failure came
// from the metric or from the fixture.
//
// Two properties of the fixture are load-bearing, both learned by calibrating
// against it and getting misleading numbers first:
//
//  1. It is rendered at 512px, matching BLUR_METRIC_EDGE_PX. The metric is
//     scale-sensitive, so a fixture at another size measures a threshold the
//     product never applies.
//  2. Word widths, gaps and glyph heights are irregular, giving a broadband
//     spectrum like real text. An earlier fixture used fixed-period stripes,
//     whose single dominant frequency interacts with a box blur to produce
//     ringing — heavy blur scored *sharper* than mild blur (0.30 at r6 vs
//     0.29 at r2), an artifact of the fixture rather than a property of the
//     metric. On broadband content the tail flattens to ~0.09–0.11.

const W = 512
const H = 512

/** Deterministic PRNG — fixtures must be identical run to run. */
function makeRandom(seed: number): () => number {
  let state = seed
  return () => ((state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
}

function textPage({ ink = 70, paper = 225 } = {}): LumaPlane {
  const data = new Float32Array(W * H).fill(paper)
  const random = makeRandom(12345)

  for (let lineTop = 0; lineTop < H; lineTop += 16) {
    let x = 10 + Math.floor(random() * 8)
    while (x < W - 14) {
      const wordLength = 3 + Math.floor(random() * 10)
      for (let g = 0; g < wordLength && x < W - 10; g++, x++) {
        const glyphHeight = 5 + Math.floor(random() * 3)
        for (let y = lineTop; y < Math.min(lineTop + glyphHeight, H); y++) {
          if (random() > 0.18) data[y * W + x] = ink
        }
      }
      x += 2 + Math.floor(random() * 4) // word gap
    }
  }
  return { data, width: W, height: H }
}

/**
 * Box blur, standing in for a photo taken without holding still.
 *
 * Separable — a horizontal pass then a vertical one — which is mathematically
 * identical to the 2D box but O(n·r) instead of O(n·r²). At 512² the naive form
 * took long enough to blow the test timeout.
 */
function blur(plane: LumaPlane, radius: number): LumaPlane {
  const { width, height } = plane

  const pass = (src: Float32Array, horizontal: boolean): Float32Array => {
    const out = new Float32Array(src.length)
    const outer = horizontal ? height : width
    const inner = horizontal ? width : height

    for (let o = 0; o < outer; o++) {
      for (let i = 0; i < inner; i++) {
        let sum = 0
        let count = 0
        for (let d = -radius; d <= radius; d++) {
          const j = i + d
          if (j < 0 || j >= inner) continue
          sum += horizontal ? src[o * width + j] : src[j * width + o]
          count++
        }
        const value = sum / count
        if (horizontal) out[o * width + i] = value
        else out[i * width + o] = value
      }
    }
    return out
  }

  return { data: pass(pass(plane.data, true), false), width, height }
}

// Fixtures are pure and rebuilt identically every call, so build each shape
// once. Recomputing a 512² blur per assertion is what made this suite crawl.
function memo<T>(build: () => T): () => T {
  let cached: T | undefined
  return () => (cached === undefined ? (cached = build()) : cached)
}

const brightPage = memo(() => textPage())
const dimPage = memo(() => textPage({ ink: 110, paper: 165 }))
const brightBlur2 = memo(() => blur(brightPage(), 2))
const dimBlur2 = memo(() => blur(dimPage(), 2))
const brightBlur3 = memo(() => blur(brightPage(), 3))

function flat(value = 128): LumaPlane {
  return { data: new Float32Array(W * H).fill(value), width: W, height: H }
}

describe('toLuma', () => {
  it('weights green most, per BT.601', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255])
    const { data } = toLuma(rgba, 3, 1)

    expect(data[0]).toBeCloseTo(76.2, 0) // red
    expect(data[1]).toBeCloseTo(149.7, 0) // green
    expect(data[2]).toBeCloseTo(29.1, 0) // blue
  })

  it('ignores the alpha channel', () => {
    const opaque = new Uint8ClampedArray([100, 100, 100, 255])
    const transparent = new Uint8ClampedArray([100, 100, 100, 0])
    expect(toLuma(opaque, 1, 1).data[0]).toBe(toLuma(transparent, 1, 1).data[0])
  })
})

describe('laplacianVariance', () => {
  it('is zero for a flat image', () => {
    expect(laplacianVariance(flat())).toBe(0)
  })

  it('falls as blur increases', () => {
    expect(laplacianVariance(brightPage())).toBeGreaterThan(
      laplacianVariance(brightBlur2()),
    )
    expect(laplacianVariance(brightBlur2())).toBeGreaterThan(
      laplacianVariance(brightBlur3()),
    )
  })

  it('returns 0 rather than throwing on a degenerate size', () => {
    expect(laplacianVariance({ data: new Float32Array(1), width: 1, height: 1 })).toBe(0)
    expect(laplacianVariance({ data: new Float32Array(4), width: 2, height: 2 })).toBe(0)
  })
})

describe('sharpness', () => {
  // The property the whole metric exists for. Raw Laplacian variance conflates
  // sharpness with contrast, which would make dim kitchen light look like blur
  // — and dim kitchen light is the target environment, not an edge case.
  it('is invariant to lighting, where raw variance is not', () => {
    // Same page, same focus, different illumination.
    expect(sharpness(brightPage()).normalized).toBeCloseTo(
      sharpness(dimPage()).normalized,
      2,
    )

    // ...and this is what we would have been thresholding on instead.
    expect(sharpness(brightPage()).laplacian).toBeGreaterThan(
      sharpness(dimPage()).laplacian * 4,
    )
  })

  it('holds that invariance under blur too', () => {
    expect(sharpness(brightBlur2()).normalized).toBeCloseTo(
      sharpness(dimBlur2()).normalized,
      2,
    )
  })

  it('separates a sharp page from a blurred one across the shipped threshold', () => {
    expect(sharpness(brightPage()).normalized).toBeGreaterThan(SHARPNESS_MIN)
    expect(sharpness(brightBlur3()).normalized).toBeLessThan(SHARPNESS_MIN)
  })

  it('rejects a dim page for blur only when it is actually blurred', () => {
    // The regression this design prevents: a sharp photo in bad light passing,
    // where a raw-variance threshold would have failed it.
    expect(sharpness(dimPage()).normalized).toBeGreaterThan(SHARPNESS_MIN)
  })

  it('returns 0 normalized for a flat plane instead of dividing by zero', () => {
    expect(sharpness(flat()).normalized).toBe(0)
    expect(Number.isFinite(sharpness(flat()).normalized)).toBe(true)
  })
})

describe('averageHash / hammingDistance', () => {
  it('is stable for identical input', () => {
    expect(averageHash(textPage())).toBe(averageHash(textPage()))
    expect(averageHash(brightPage())).toBe(averageHash(textPage()))
  })

  it('counts differing bits', () => {
    expect(hammingDistance(0b1011n, 0b1011n)).toBe(0)
    expect(hammingDistance(0b1011n, 0b1010n)).toBe(1)
    expect(hammingDistance(0b0000n, 0b1111n)).toBe(4)
  })

  it('survives an exposure shift — the same page shot twice', () => {
    const original = brightPage()
    const brighter: LumaPlane = {
      ...original,
      data: original.data.map((v) => Math.min(255, v + 20)),
    }

    expect(
      hammingDistance(averageHash(original), averageHash(brighter)),
    ).toBeLessThanOrEqual(DUPLICATE_HAMMING_MAX)
  })

  it('separates genuinely different layouts', () => {
    const horizontal = brightPage()
    const vertical: LumaPlane = { data: new Float32Array(W * H).fill(225), width: W, height: H }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (x % 14 < 6) vertical.data[y * W + x] = 70
      }
    }

    expect(
      hammingDistance(averageHash(horizontal), averageHash(vertical)),
    ).toBeGreaterThan(DUPLICATE_HAMMING_MAX)
  })
})

describe('judgePage', () => {
  const page = brightPage()

  it('accepts a sharp, large, novel page', () => {
    expect(judgePage(page, 1600, [])).toMatchObject({ accepted: true })
  })

  it('accepts a sharp page shot in dim light', () => {
    expect(judgePage(dimPage(), 1600, [])).toMatchObject({ accepted: true })
  })

  it('rejects a source too low-resolution to hold legible text', () => {
    expect(judgePage(page, 320, [])).toMatchObject({ accepted: false, reason: 'too_small' })
  })

  it('rejects an accidental shutter — a palm or a worktop', () => {
    expect(judgePage(flat(), 1600, [])).toMatchObject({ accepted: false, reason: 'blank' })
    expect(sharpness(flat()).luma).toBeLessThan(LUMA_VARIANCE_MIN)
  })

  it('rejects a blurred page', () => {
    expect(judgePage(brightBlur3(), 1600, [])).toMatchObject({
      accepted: false,
      reason: 'blurred',
    })
  })

  it('rejects a page already captured', () => {
    const first = judgePage(page, 1600, [])
    expect(judgePage(page, 1600, [first.hash])).toMatchObject({
      accepted: false,
      reason: 'duplicate',
    })
  })

  it('checks size before content, so the owner gets the actionable message', () => {
    // Both wrong at once. Only one instruction can be right.
    expect(judgePage(flat(), 320, [])).toMatchObject({ reason: 'too_small' })
  })

  it('checks emptiness before focus', () => {
    // A flat frame is technically "unsharp" too, but "hold still" is the wrong
    // thing to tell someone who photographed their hand.
    expect(judgePage(flat(), 1600, [])).toMatchObject({ reason: 'blank' })
  })

  it('always reports diagnostics, including on rejection', () => {
    const verdict = judgePage(brightBlur3(), 1600, [])
    expect(verdict.sharpness.normalized).toBeGreaterThanOrEqual(0)
    expect(typeof verdict.hash).toBe('bigint')
  })
})
