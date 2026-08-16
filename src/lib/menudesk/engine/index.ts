// Public surface of the MenuDesk analysis engine.
//
// Import from '@/lib/menudesk/engine' rather than reaching into a file — the
// barrel is what lets the internals move without touching call sites.
//
// The two-pass pipeline itself (analyzeMenu) arrives in W2 and will be exported
// from here; W0 ships the value types, the ports, and the traffic-light maths
// it will be built on.

export type {
  AnalysisBasis,
  AnalyzeMenuInput,
  AnalyzeMenuResult,
  CommonDishMatch,
  Confidence,
  DishAnalysis,
  EstimateRange,
  IngredientPrice,
  MenuPageImage,
  PercentRange,
  ReadDish,
  Recipe,
  RecipeLine,
  RecipeSource,
  TrafficLight,
  UncostedDish,
} from './types'

export type {
  CountryDataProvider,
  EnginePorts,
  MenuVisionPort,
  RecipeInferencePort,
  UsageRecorder,
} from './ports'

export {
  DEFAULT_THRESHOLDS,
  classifyBand,
  classifyPct,
  computeFoodCostPct,
  relativeBandWidth,
  weakestConfidence,
} from './traffic-light'

export type { BandVerdict, TrafficLightThresholds } from './traffic-light'
