// Run a real menu photograph through the MenuDesk engine, from the terminal.
//
//   npm run analyze -- photo1.jpg photo2.jpg
//   npm run analyze -- --country TH --json menu.png
//
// This exists for the W2 gate: point it at a real café menu and check whether
// the ranking is believable before any of it reaches a restaurant owner. It is
// the same composition root the scan route will use in W4 — data provider, the
// two Anthropic ports, a usage recorder — so what passes here is what ships.
//
// Costs real money: one vision call per page plus one batched recipe call per
// 20 uncached dishes. The summary at the bottom prints what the run spent.

import { readFileSync } from 'node:fs'
import { basename, extname } from 'node:path'
import {
  createAnthropicRecipePort,
  createAnthropicVisionPort,
  createInMemoryUsageRecorder,
} from '@/lib/menudesk/ai'
import { DEFAULT_COUNTRY_CODE, getCountryDataProvider } from '@/lib/menudesk/data'
import { analyzeMenu, type DishAnalysis, type MenuPageImage } from '@/lib/menudesk/engine'

const MEDIA_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

const USAGE = `Usage: npm run analyze -- [--country TH] [--json] <image> [image...]

  --country <code>  ISO 3166-1 alpha-2 country whose prices to cost against
                    (default ${DEFAULT_COUNTRY_CODE})
  --json            Emit the raw AnalyzeMenuResult instead of a table`

interface Args {
  files: string[]
  countryCode: string
  json: boolean
}

function parseArgs(argv: string[]): Args {
  const files: string[] = []
  let countryCode = DEFAULT_COUNTRY_CODE
  let json = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--json') json = true
    else if (arg === '--country') countryCode = argv[++i] ?? countryCode
    else if (arg.startsWith('--')) throw new Error(`unknown option '${arg}'`)
    else files.push(arg)
  }

  return { files, countryCode, json }
}

function loadPage(path: string, index: number): MenuPageImage {
  const mediaType = MEDIA_TYPES[extname(path).toLowerCase()]
  if (!mediaType) {
    throw new Error(
      `unsupported image type '${extname(path)}' for ${path} — use ${Object.keys(MEDIA_TYPES).join(', ')}`,
    )
  }
  return {
    // The file name, not an index: when the ranking says a dish came from
    // 'lunch-2.jpg' you know which photograph to go and re-check.
    pageId: basename(path),
    base64: readFileSync(path).toString('base64'),
    mediaType,
  }
}

const LIGHT_LABEL: Record<DishAnalysis['trafficLight'], string> = {
  red: 'RED  ',
  amber: 'AMBER',
  green: 'GREEN',
}

function money(value: number): string {
  return value.toFixed(1)
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length)
}

function padStart(value: string, width: number): string {
  return value.length >= width ? value : ' '.repeat(width - value.length) + value
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.files.length === 0) {
    console.error(USAGE)
    process.exitCode = 1
    return
  }

  const data = getCountryDataProvider(args.countryCode)
  const usage = createInMemoryUsageRecorder()
  const pages = args.files.map(loadPage)

  console.error(`Reading ${pages.length} page(s) against ${data.countryCode} prices…`)

  const result = await analyzeMenu(
    { pages },
    {
      data,
      vision: createAnthropicVisionPort(),
      recipes: createAnthropicRecipePort({ data }),
      usage,
    },
  )

  if (args.json) {
    console.log(JSON.stringify({ ...result, usage: usage.rows() }, null, 2))
    return
  }

  // Worst first. The dish bleeding the most margin is the one the owner needs
  // to see, and burying it under an alphabetical list is how a finding is lost.
  const ranked = [...result.dishes].sort(
    (a, b) => (b.foodCostPct.low + b.foodCostPct.high) / 2 - (a.foodCostPct.low + a.foodCostPct.high) / 2,
  )

  const nameWidth = Math.min(34, Math.max(12, ...ranked.map((d) => d.nameRaw.length)))

  console.log()
  console.log(
    `${pad('DISH', nameWidth)}  ${padStart('PRICE', 7)}  ${padStart('COST', 13)}  ${padStart('FOOD COST', 15)}  LIGHT  CONF    RECIPE`,
  )
  console.log('-'.repeat(nameWidth + 66))

  for (const dish of ranked) {
    const name = dish.nameRaw.length > nameWidth ? `${dish.nameRaw.slice(0, nameWidth - 1)}…` : dish.nameRaw
    const cost = `${money(dish.cost.low)}–${money(dish.cost.high)}`
    const pct = `${money(dish.foodCostPct.low)}–${money(dish.foodCostPct.high)}%`
    const light = `${LIGHT_LABEL[dish.trafficLight]}${dish.bandCertain ? ' ' : '?'}`
    console.log(
      `${pad(name, nameWidth)}  ${padStart(String(dish.menuPrice), 7)}  ${padStart(cost, 13)}  ${padStart(pct, 15)}  ${light}  ${pad(dish.confidence, 6)}  ${dish.recipeSource}`,
    )
  }

  console.log()
  console.log(
    `${ranked.length} dish(es) costed in ${result.currencyCode}. ` +
      'A "?" beside the light means the band straddles a threshold — leaning, not settled.',
  )

  if (result.uncosted.length > 0) {
    console.log()
    console.log(`Could not cost ${result.uncosted.length} dish(es):`)
    for (const dish of result.uncosted) {
      console.log(`  ${dish.nameRaw} — ${dish.reason}`)
    }
  }

  if (result.unreadablePages.length > 0) {
    console.log()
    console.log(`Could not read ${result.unreadablePages.length} page(s):`)
    for (const page of result.unreadablePages) {
      console.log(`  ${page.pageId} — ${page.reason}`)
    }
  }

  const spend = usage.summary()
  console.log()
  console.log(
    `${spend.calls} model call(s) · ${spend.inputTokens} in / ${spend.outputTokens} out · ` +
      `${result.stats.cacheHits} cache hit(s), ${result.stats.inferredRecipes} inferred · ` +
      `$${spend.costUsd.toFixed(4)}${spend.unpricedCalls > 0 ? ` (+${spend.unpricedCalls} unpriced call(s))` : ''}`,
  )
}

main().catch((error: unknown) => {
  console.error(`\nanalyze-menu failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
