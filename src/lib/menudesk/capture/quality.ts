// Deciding whether a menu photograph is worth paying to read.
//
// Bible §05 is blunt about it: "กันรูปเสียก่อน call" — screen the photo on the
// device so we never spend a model call on an image nobody could read. Every
// function here is pure and operates on raw pixel buffers, so the thresholds
// can be tested against fixtures instead of eyeballed against a phone.
//
// The bias is deliberately toward ACCEPTING marginal photos. The two failure
// modes are not symmetric: a false reject sends an owner back to retake a photo
// that would have worked, and §04 is built on stripping friction before the
// wow moment — some of them just close the tab. A false accept costs one Haiku
// call, a fraction of a US cent. Users are worth more than the cent, so when
// the metric is ambiguous, let the photo through.
//
// Thresholds below are starting points from printed-menu test images, not
// calibrated field data. They want re-tuning once real kitchen photographs come
// back from the concierge restaurants (Bible §15 phase 1).

/** Greyscale luminance plane, one byte per pixel, row-major. */
export interface LumaPlane {
  data: Float32Array
  width: number
  height: number
}

/**
 * ITU-R BT.601 luma from RGBA.
 *
 * Note this greyscale conversion is for ANALYSIS ONLY — the image uploaded to
 * the model keeps its colour. Greyscaling the upload would not save a single
 * token (image cost is a function of dimensions, not channels), and menus use
 * colour to mark price columns, specials, and section headings, so discarding
 * it makes the page harder to read for no saving.
 */
export function toLuma(rgba: Uint8ClampedArray, width: number, height: number): LumaPlane {
  const data = new Float32Array(width * height)
  for (let i = 0, p = 0; i < data.length; i++, p += 4) {
    data[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]
  }
  return { data, width, height }
}

/** Population variance of a sample. */
function variance(values: Float32Array | number[]): number {
  const length = 'length' in values ? values.length : 0
  if (length === 0) return 0

  let mean = 0
  for (let i = 0; i < length; i++) mean += values[i]
  mean /= length

  let sum = 0
  for (let i = 0; i < length; i++) {
    const d = values[i] - mean
    sum += d * d
  }
  return sum / length
}

/**
 * Variance of the Laplacian — the standard sharpness proxy.
 *
 * The Laplacian is a second-derivative edge filter: a crisp photo of printed
 * text is nearly all edges and produces a wide spread of responses, while a
 * blurred one smears them toward zero. The VARIANCE of that response is
 * therefore high for sharp images and low for soft ones.
 *
 * Scale-sensitive, so callers must measure at a fixed size (see
 * BLUR_METRIC_EDGE_PX) or the number means nothing across devices.
 *
 * On its own this is NOT the number to threshold on — see sharpness().
 */
export function laplacianVariance(plane: LumaPlane): number {
  const { data, width, height } = plane
  if (width < 3 || height < 3) return 0

  const responses: number[] = []
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      // 4-neighbour Laplacian kernel: [0 1 0; 1 -4 1; 0 1 0]
      responses.push(
        data[i - width] + data[i + width] + data[i - 1] + data[i + 1] - 4 * data[i],
      )
    }
  }

  return variance(responses)
}

export interface Sharpness {
  /** Raw Laplacian variance. Diagnostic; confounded by contrast. */
  laplacian: number
  /** Variance of the luma plane itself — how much tonal content exists. */
  luma: number
  /** laplacian ÷ luma. The lighting-invariant figure to threshold on. */
  normalized: number
}

/**
 * Sharpness, separated from lighting.
 *
 * Raw Laplacian variance conflates two different things: how sharp a photo is,
 * and how contrasty it is. Measured on the same synthetic menu page, an equally
 * soft image scores 270 under bright light and 34 under dim light — an 8×
 * spread caused purely by illumination. Thresholding the raw number therefore
 * rejects photographs for being badly lit, and Bible §15's user is holding a
 * mid-range Android in a working kitchen: dim is the normal case, not the edge
 * case. That would put the false rejects exactly where the users are.
 *
 * Dividing by the luma plane's own variance cancels the contrast term. Across
 * bright, dim, and very dim renderings of the same page the normalized figure
 * came out identical to three decimal places (8.391 sharp, 0.486 / 0.286 /
 * 0.161 at increasing blur), while raw variance ranged from 28,272 down to 735.
 */
export function sharpness(plane: LumaPlane): Sharpness {
  const laplacian = laplacianVariance(plane)
  const luma = variance(plane.data)

  return {
    laplacian,
    luma,
    normalized: luma > 0 ? laplacian / luma : 0,
  }
}

/**
 * 64-bit average hash, for spotting the same page photographed twice.
 *
 * Reduces the image to 8×8 by box-averaging, then sets one bit per cell for
 * "brighter than the mean". Robust to the things that differ between two shots
 * of one page — exposure, small shifts, JPEG noise — and sensitive to layout,
 * which is exactly what distinguishes two different menu pages.
 */
export function averageHash(plane: LumaPlane): bigint {
  const cells = new Float32Array(64)
  const { data, width, height } = plane

  for (let cy = 0; cy < 8; cy++) {
    for (let cx = 0; cx < 8; cx++) {
      const x0 = Math.floor((cx * width) / 8)
      const x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * width) / 8))
      const y0 = Math.floor((cy * height) / 8)
      const y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * height) / 8))

      let sum = 0
      let count = 0
      for (let y = y0; y < y1 && y < height; y++) {
        for (let x = x0; x < x1 && x < width; x++) {
          sum += data[y * width + x]
          count++
        }
      }
      cells[cy * 8 + cx] = count > 0 ? sum / count : 0
    }
  }

  const mean = cells.reduce((a, b) => a + b, 0) / cells.length

  let hash = 0n
  for (let i = 0; i < 64; i++) {
    if (cells[i] > mean) hash |= 1n << BigInt(i)
  }
  return hash
}

/** Number of differing bits between two hashes — 0 identical, 64 opposite. */
export function hammingDistance(a: bigint, b: bigint): number {
  let diff = a ^ b
  let count = 0
  while (diff > 0n) {
    count += Number(diff & 1n)
    diff >>= 1n
  }
  return count
}

// ── Thresholds ─────────────────────────────────────────────────────────────

/**
 * Sharpness is measured at a fixed long edge so the number is comparable
 * between a cheap Android and a flagship. Laplacian variance scales with
 * resolution, so measuring at native size would reject phones for being
 * low-resolution rather than for being out of focus.
 */
export const BLUR_METRIC_EDGE_PX = 512

/**
 * Minimum normalized sharpness (see sharpness()). Below this, reject as blurred.
 *
 * Set low on purpose — the file header explains why a false reject costs more
 * than a false accept. Measured on a broadband synthetic menu page at 512px,
 * against progressively wider box blurs:
 *
 *   sharp 6.84 · r1 0.452 · r2 0.180 │ r3 0.106 · r4 0.089 · r8 0.110 · r12 0.044
 *                            accept  ┆  reject
 *
 * So 0.15 keeps everything down to a mildly soft photo and rejects from clearly
 * blurred onward, with ~36% clearance above the blurred tail.
 *
 * That tail is flat rather than falling, and mildly non-monotonic: past a point
 * the luma variance in the denominator collapses alongside the numerator, so
 * more blur stops reading as less sharp. It cannot be fixed by lowering the
 * threshold — 0.11 at r8 would sit under any threshold that still accepts r2.
 * Accepting that ceiling is why the check is paired with LUMA_VARIANCE_MIN.
 */
export const SHARPNESS_MIN = 0.15

/**
 * Minimum variance of the luma plane — does the photo contain anything at all?
 *
 * Catches the accidental shutter: a palm over the lens, a worktop, a ceiling.
 * These have almost no tonal range, which both makes them unreadable and makes
 * the normalized sharpness ratio meaningless. A genuinely low-contrast but
 * sharp menu measured ~88 here, so this sits well clear of a real photograph.
 */
export const LUMA_VARIANCE_MIN = 25

/**
 * Hamming distance at or below which two pages are "the same photo again".
 * 64-bit hash, so 5 bits is ~8% disagreement — tolerant of exposure and hand
 * shake, intolerant of a genuinely different page.
 */
export const DUPLICATE_HAMMING_MAX = 5

/**
 * Long edge below which a photo cannot hold legible menu text, whatever its
 * focus. Rejected before the blur check because "your photo is too small"
 * is a different instruction to the owner than "hold still".
 */
export const MIN_SOURCE_EDGE_PX = 640

export type RejectReason = 'too_small' | 'blank' | 'blurred' | 'duplicate'

export interface QualityVerdict {
  accepted: boolean
  reason?: RejectReason
  /** Diagnostics — surface in logs, never to the owner. */
  sharpness: Sharpness
  hash: bigint
}

/**
 * Judge one prepared page against the pages already accepted.
 *
 * Order matters, because each message tells the owner to do something different
 * and only one of them can be right. Size first (retake closer / better phone),
 * then emptiness (you photographed the worktop), then focus (hold still), then
 * duplication (you already have this page). Telling someone to hold the phone
 * steady when the real problem is that they photographed their hand sends them
 * round a loop they cannot exit.
 */
export function judgePage(
  plane: LumaPlane,
  sourceLongEdgePx: number,
  acceptedHashes: readonly bigint[],
): QualityVerdict {
  const hash = averageHash(plane)
  const measured = sharpness(plane)

  if (sourceLongEdgePx < MIN_SOURCE_EDGE_PX) {
    return { accepted: false, reason: 'too_small', sharpness: measured, hash }
  }

  if (measured.luma < LUMA_VARIANCE_MIN) {
    return { accepted: false, reason: 'blank', sharpness: measured, hash }
  }

  if (measured.normalized < SHARPNESS_MIN) {
    return { accepted: false, reason: 'blurred', sharpness: measured, hash }
  }

  for (const existing of acceptedHashes) {
    if (hammingDistance(hash, existing) <= DUPLICATE_HAMMING_MAX) {
      return { accepted: false, reason: 'duplicate', sharpness: measured, hash }
    }
  }

  return { accepted: true, sharpness: measured, hash }
}
