// Trimming dead space from around a photographed menu.
//
// A menu shot on a table is often 30–40% table. Those pixels cost real money:
// Anthropic prices an image by its dimensions, so background is billed at the
// same rate as the dishes, on every page, for every scan.
//
// The obvious version of this feature — detect the page and crop to it — is the
// wrong one to build. Page-boundary detection fails on dark wood, on laminated
// menus with glare, on a page held at an angle, and its failure mode is
// silently amputating a column of dishes. A menu the owner can see on screen
// but that we never analysed is exactly the "เจ้าของคนแรกที่จับได้ว่าเรามั่ว"
// problem from Bible §12, and it would be invisible to us.
//
// So this trims only what it can prove is empty: whole rows and columns at the
// frame edge that are uniform. It stops at the first line containing any
// structure and never cuts into content. It gives up most of the theoretical
// saving to be safe, which is the right trade when the downside is an unseen
// missing dish.

import type { LumaPlane } from './quality'

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Per-line variance below which a row or column counts as empty. Real menu
 * text, rules and borders all produce far more than this; sensor noise and a
 * gentle lighting gradient across a tablecloth produce less.
 */
export const UNIFORM_LINE_VARIANCE_MAX = 12

/**
 * Never trim more than this share off any single side.
 *
 * A hard stop against the pathological cases — a photo that is mostly sky, a
 * near-blank page, a lighting gradient that reads as uniform for hundreds of
 * rows. Without it a single bad frame could crop down to a sliver and we would
 * confidently analyse three dishes out of forty.
 */
export const MAX_TRIM_FRACTION = 0.25

function lineVariance(
  plane: LumaPlane,
  index: number,
  horizontal: boolean,
): number {
  const { data, width, height } = plane
  const length = horizontal ? width : height

  let mean = 0
  for (let i = 0; i < length; i++) {
    mean += horizontal ? data[index * width + i] : data[i * width + index]
  }
  mean /= length

  let sum = 0
  for (let i = 0; i < length; i++) {
    const v = horizontal ? data[index * width + i] : data[i * width + index]
    sum += (v - mean) * (v - mean)
  }
  return sum / length
}

/**
 * The content rectangle, as a fraction-safe pixel rect in the plane's own
 * coordinates. Callers scale it to the full-resolution image.
 *
 * Returns the whole frame when there is nothing safe to trim, which is the
 * common case for a tightly framed photo and is not a failure.
 */
export function contentRect(plane: LumaPlane): CropRect {
  const { width, height } = plane

  const maxTrimX = Math.floor(width * MAX_TRIM_FRACTION)
  const maxTrimY = Math.floor(height * MAX_TRIM_FRACTION)

  let top = 0
  while (
    top < maxTrimY &&
    lineVariance(plane, top, true) <= UNIFORM_LINE_VARIANCE_MAX
  ) {
    top++
  }

  let bottom = height - 1
  while (
    bottom > height - 1 - maxTrimY &&
    lineVariance(plane, bottom, true) <= UNIFORM_LINE_VARIANCE_MAX
  ) {
    bottom--
  }

  let left = 0
  while (
    left < maxTrimX &&
    lineVariance(plane, left, false) <= UNIFORM_LINE_VARIANCE_MAX
  ) {
    left++
  }

  let right = width - 1
  while (
    right > width - 1 - maxTrimX &&
    lineVariance(plane, right, false) <= UNIFORM_LINE_VARIANCE_MAX
  ) {
    right--
  }

  // Degenerate result — a near-blank frame where the scans crossed. Keep the
  // whole image and let the quality checks call it blank; cropping a blank page
  // to nothing helps nobody.
  if (right <= left || bottom <= top) {
    return { x: 0, y: 0, width, height }
  }

  return {
    x: left,
    y: top,
    width: right - left + 1,
    height: bottom - top + 1,
  }
}

/** Scale a rect measured on the analysis plane up to full-resolution pixels. */
export function scaleRect(rect: CropRect, factor: number, maxWidth: number, maxHeight: number): CropRect {
  const x = Math.max(0, Math.floor(rect.x * factor))
  const y = Math.max(0, Math.floor(rect.y * factor))
  return {
    x,
    y,
    width: Math.min(Math.ceil(rect.width * factor), maxWidth - x),
    height: Math.min(Math.ceil(rect.height * factor), maxHeight - y),
  }
}
