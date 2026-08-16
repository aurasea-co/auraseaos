// On-device screening for menu photographs.
//
// quality.ts and crop.ts are pure and unit-tested; process.ts is the browser
// glue that drives them with canvas. Import from here rather than reaching into
// a file.

export { contentRect, scaleRect, MAX_TRIM_FRACTION, UNIFORM_LINE_VARIANCE_MAX } from './crop'
export type { CropRect } from './crop'

export {
  BLUR_METRIC_EDGE_PX,
  DUPLICATE_HAMMING_MAX,
  LUMA_VARIANCE_MIN,
  MIN_SOURCE_EDGE_PX,
  SHARPNESS_MIN,
  averageHash,
  hammingDistance,
  judgePage,
  laplacianVariance,
  sharpness,
  toLuma,
} from './quality'

export type { LumaPlane, QualityVerdict, RejectReason, Sharpness } from './quality'

export { preparePage } from './process'
export type { PreparedPage } from './process'
