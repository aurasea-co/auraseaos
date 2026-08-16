// Public surface of the MenuDesk analysis engine.
//
// Import from '@/lib/menudesk/engine' rather than reaching into a file — the
// barrel is what lets the internals move without touching call sites.
//
// analyzeMenu is the whole surface most callers need: hand it pages and a set
// of ports, get dishes, uncosted dishes, and unreadable pages back.

export { analyzeMenu } from './analyze'
export type { AnalyzeMenuOptions } from './analyze'

export type {
  AnalysisBasis,
  AnalyzeMenuInput,
  AnalyzeMenuResult,
  AnalyzeMenuStats,
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
  UnreadablePage,
} from './types'

export type {
  CountryDataProvider,
  EnginePorts,
  IngredientVocabularyEntry,
  InferredRecipe,
  MenuVisionPort,
  ModelCallUsage,
  RecipeInferencePort,
  RecipeInferenceRequest,
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
