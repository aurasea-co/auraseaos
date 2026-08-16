// Turning a phone photograph into something worth uploading.
//
// Runs entirely on the device, before a byte leaves it (Bible §05, "กันรูปเสีย
// ก่อน call"). The order is decode → trim dead space → downscale → judge, and
// the judging happens LAST, on the exact image the model will see — screening
// the original and then transforming it would be measuring the wrong picture.
//
// Browser-only: canvas and ImageBitmap. The pure analysis it depends on lives
// in quality.ts and crop.ts, which is where the logic worth unit-testing sits.

import { DEFAULT_MODEL, maxImageEdgeFor } from '@/lib/menudesk/ai'
import { contentRect, scaleRect } from './crop'
import {
  BLUR_METRIC_EDGE_PX,
  type LumaPlane,
  type QualityVerdict,
  judgePage,
  toLuma,
} from './quality'

/**
 * JPEG quality for the upload. 0.82 keeps small text legible while roughly
 * halving the bytes against 0.95 — and upload time on a kitchen's wifi is part
 * of the friction budget, not just a cost line.
 */
const JPEG_QUALITY = 0.82

export interface PreparedPage {
  /** The bytes to upload. */
  blob: Blob
  width: number
  height: number
  /** Longest edge of the ORIGINAL photo, before any downscaling. */
  sourceLongEdgePx: number
  verdict: QualityVerdict
  /** Object URL for the thumbnail. Callers must revokeObjectURL it. */
  previewUrl: string
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/** Read a canvas back as a luma plane at a fixed long edge, for the metrics. */
function lumaAt(source: CanvasImageSource, sw: number, sh: number, longEdge: number): LumaPlane {
  const scale = Math.min(1, longEdge / Math.max(sw, sh))
  const width = Math.max(1, Math.round(sw * scale))
  const height = Math.max(1, Math.round(sh * scale))

  const canvas = makeCanvas(width, height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('[menudesk] 2D canvas context unavailable')

  ctx.drawImage(source, 0, 0, width, height)
  const { data } = ctx.getImageData(0, 0, width, height)
  return toLuma(data, width, height)
}

async function decode(file: File): Promise<ImageBitmap> {
  // `from-image` applies the EXIF orientation tag. Phones very commonly record
  // a rotation rather than rotating the pixels, so without this a portrait
  // menu arrives sideways — and a sideways menu reads as gibberish.
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // Older Safari lacks the option and throws on the unknown key rather than
    // ignoring it. Orientation may be wrong on those devices; readable beats
    // nothing, and the vision pass copes with rotation better than with a
    // failed upload.
    return await createImageBitmap(file)
  }
}

/**
 * Prepare one page and judge it against the pages already accepted.
 *
 * Rejected pages still come back fully prepared, with `verdict.accepted` false
 * and a preview — the UI shows the owner the photo it is complaining about, so
 * "this one is blurred" is a statement they can check rather than take on
 * trust.
 */
export async function preparePage(
  file: File,
  acceptedHashes: readonly bigint[],
): Promise<PreparedPage> {
  const bitmap = await decode(file)

  try {
    const sourceLongEdgePx = Math.max(bitmap.width, bitmap.height)

    // 1. Find the content, on a small copy — line variance over a 4000px photo
    //    would be needless work on a mid-range phone.
    const surveyPlane = lumaAt(bitmap, bitmap.width, bitmap.height, BLUR_METRIC_EDGE_PX)
    const surveyScale = bitmap.width / surveyPlane.width
    const crop = scaleRect(
      contentRect(surveyPlane),
      surveyScale,
      bitmap.width,
      bitmap.height,
    )

    // 2. Downscale the cropped region to the model's ceiling. Beyond this the
    //    pixels are discarded server-side after we have paid to send them —
    //    and for Haiku that ceiling is 1568px, not the 2576px of the
    //    high-resolution tier.
    const maxEdge = maxImageEdgeFor(DEFAULT_MODEL)
    const scale = Math.min(1, maxEdge / Math.max(crop.width, crop.height))
    const width = Math.max(1, Math.round(crop.width * scale))
    const height = Math.max(1, Math.round(crop.height * scale))

    const canvas = makeCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('[menudesk] 2D canvas context unavailable')

    // White ground: a JPEG has no alpha, and an unpainted canvas encodes as
    // black, which would wreck both the luma metrics and the model's read.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(
      bitmap,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      width,
      height,
    )

    // 3. Judge the finished image — the one the model actually receives.
    const verdict = judgePage(
      lumaAt(canvas, width, height, BLUR_METRIC_EDGE_PX),
      sourceLongEdgePx,
      acceptedHashes,
    )

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result
            ? resolve(result)
            : reject(new Error('[menudesk] canvas.toBlob produced nothing')),
        'image/jpeg',
        JPEG_QUALITY,
      )
    })

    return {
      blob,
      width,
      height,
      sourceLongEdgePx,
      verdict,
      previewUrl: URL.createObjectURL(blob),
    }
  } finally {
    // Decoded bitmaps hold real memory. On a mid-range Android photographing a
    // ten-page menu, leaking them is how the tab dies mid-scan.
    bitmap.close()
  }
}
