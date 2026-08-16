// Run one uploaded scan through the engine and persist the result.
//
// SERVER ONLY. This module reaches for the service-role client and the
// Anthropic SDK; importing it from anything that reaches a browser bundle
// breaks the build (see scripts/check-boundaries.mjs).
//
//
// ── Why the service role, when CLAUDE.md restricts it ─────────────────────
//
// Migration 043 denies clients any write to dish_analyses, uncosted_dishes and
// ai_usage — "a client that could insert its own dish_analyses row could paint
// its menu green". That is a deliberate integrity property, and it means the
// engine's output can only be written by a role that bypasses RLS. There is no
// third option: the alternative is opening those tables to the scanner, which
// destroys the property the migration exists to protect.
//
// So this is a genuine third exception to the supabaseAdmin rule, alongside
// /app/superadmin and the LINE approve endpoint, and CLAUDE.md records it.
// It is kept narrow on purpose:
//
//   - Ownership is proven with the RLS USER client first. The service client
//     is never used to decide who may see or touch a scan, only to write rows
//     RLS forbids the user to forge.
//   - It writes engine output and nothing else.
//   - Every row it writes is derived from the analysis, never from the request.

import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import {
  createAnthropicRecipePort,
  createAnthropicVisionPort,
  createInMemoryUsageRecorder,
} from '@/lib/menudesk/ai'
import { getCountryDataProvider } from '@/lib/menudesk/data'
import { analyzeMenu, type AnalyzeMenuResult, type MenuPageImage } from '@/lib/menudesk/engine'
import { SCAN_BUCKET } from '@/lib/menudesk/scan-client'
import type { ScanStatus } from './summary'

/**
 * Hard ceiling on pages per scan.
 *
 * The scan endpoint is free and anonymous, so the only thing between a bored
 * visitor and an unbounded model bill is a number like this one. Bible §05
 * budgets a whole restaurant at 15–20 US cents; ten pages is a generous menu
 * and still an order of magnitude inside that.
 */
export const MAX_PAGES_PER_SCAN = 10

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedClient = any

export type RunScanOutcome =
  | { ok: true; status: ScanStatus; dishCount: number }
  | { ok: false; reason: 'not_found' | 'already_running' | 'no_pages' | 'failed' }

/** Round to whole units for an integer column, never below zero. */
function toInt(value: number): number {
  return Math.max(0, Math.round(value))
}

/** Round to 2dp for a numeric(_,2) column. */
function to2dp(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Claim the scan for analysis.
 *
 * A conditional update is the lock: two tabs, a double-tapped button, or a
 * retry after a slow response all race here, and exactly one wins. Without it
 * the second caller re-runs the model over the same photographs and doubles
 * the cost of a free scan for nothing.
 */
async function claimScan(db: UntypedClient, scanId: string): Promise<boolean> {
  const { data, error } = await db
    .from('menu_scans')
    .update({ status: 'costing', updated_at: new Date().toISOString() })
    .eq('id', scanId)
    .in('status', ['uploading', 'reading'])
    .select('id')

  if (error) throw error
  return Array.isArray(data) && data.length === 1
}

async function setStatus(
  db: UntypedClient,
  scanId: string,
  status: ScanStatus,
): Promise<void> {
  await db
    .from('menu_scans')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', scanId)
}

/**
 * Fetch the uploaded photographs as engine input.
 *
 * Downloads go through the USER client, so the storage policies in 043 do the
 * authorising: a caller who does not own the scan cannot read its images, and
 * we never have to re-implement that check here.
 *
 * `pageId` is the menu_scan_pages row id, which is what lets every dish the
 * model reads be attributed back to a real page row on the way out.
 */
async function loadPages(
  userClient: SupabaseClient,
  scanId: string,
): Promise<MenuPageImage[]> {
  const db = userClient as UntypedClient

  const { data: pages, error } = await db
    .from('menu_scan_pages')
    .select('id, storage_path, page_index')
    .eq('scan_id', scanId)
    .order('page_index', { ascending: true })
    .limit(MAX_PAGES_PER_SCAN)

  if (error) throw error
  if (!pages || pages.length === 0) return []

  const images: MenuPageImage[] = []

  for (const page of pages as { id: string; storage_path: string }[]) {
    const { data: blob, error: downloadError } = await userClient.storage
      .from(SCAN_BUCKET)
      .download(page.storage_path)

    // A page whose object is missing is skipped rather than fatal — the rest
    // of the menu is still worth analysing, and the engine already reports
    // pages it could not read.
    if (downloadError || !blob) continue

    const buffer = Buffer.from(await blob.arrayBuffer())
    images.push({
      pageId: page.id,
      base64: buffer.toString('base64'),
      mediaType: blob.type || 'image/jpeg',
    })
  }

  return images
}

/**
 * Write the engine's output.
 *
 * Ids are generated here rather than read back from the insert, because
 * PostgREST does not promise that a bulk insert returns rows in the order they
 * were sent — and correlating an analysis to the wrong dish would be silent.
 */
async function persist(
  service: UntypedClient,
  scanId: string,
  result: AnalyzeMenuResult,
  usageRows: { model: string; inputTokens: number; outputTokens: number; cacheHits: number; costUsd: number | null }[],
): Promise<void> {
  const dishRows: Record<string, unknown>[] = []
  const analysisRows: Record<string, unknown>[] = []
  const uncostedRows: Record<string, unknown>[] = []

  for (const dish of result.dishes) {
    const dishId = randomUUID()
    dishRows.push({
      id: dishId,
      scan_id: scanId,
      scan_page_id: dish.pageId,
      name_raw: dish.nameRaw,
      name_normalized: dish.nameNormalized,
      menu_price_thb: toInt(dish.menuPrice),
    })
    analysisRows.push({
      dish_id: dishId,
      cost_low: to2dp(dish.cost.low),
      cost_high: to2dp(dish.cost.high),
      food_cost_pct_low: to2dp(dish.foodCostPct.low),
      food_cost_pct_high: to2dp(dish.foodCostPct.high),
      confidence: dish.confidence,
      traffic_light: dish.trafficLight,
      band_certain: dish.bandCertain,
      recipe_source: dish.recipeSource,
      basis: dish.basis,
      recipe_json: dish.recipe,
    })
  }

  for (const dish of result.uncosted) {
    const dishId = randomUUID()
    dishRows.push({
      id: dishId,
      scan_id: scanId,
      scan_page_id: dish.pageId,
      name_raw: dish.nameRaw,
      name_normalized: null,
      menu_price_thb: dish.menuPrice === null ? null : toInt(dish.menuPrice),
    })
    uncostedRows.push({ dish_id: dishId, reason: dish.reason })
  }

  if (dishRows.length > 0) {
    const { error } = await service.from('scanned_dishes').insert(dishRows)
    if (error) throw error
  }
  if (analysisRows.length > 0) {
    const { error } = await service.from('dish_analyses').insert(analysisRows)
    if (error) throw error
  }
  if (uncostedRows.length > 0) {
    const { error } = await service.from('uncosted_dishes').insert(uncostedRows)
    if (error) throw error
  }

  if (usageRows.length > 0) {
    // Accounting must never cost anyone their analysis, so this is the one
    // write allowed to fail quietly.
    await service.from('ai_usage').insert(
      usageRows.map((row) => ({
        scan_id: scanId,
        model: row.model,
        input_tokens: row.inputTokens,
        output_tokens: row.outputTokens,
        cost_usd: row.costUsd,
        cache_hits: row.cacheHits,
      })),
    )
  }
}

/**
 * Analyse a scan the caller owns.
 *
 * Returns a reason rather than throwing for the ordinary refusals — not yours,
 * already running, nothing uploaded — because those are all normal states of a
 * funnel a stranger is walking through, not errors worth an alert.
 */
export async function runScan(
  userClient: SupabaseClient,
  scanId: string,
): Promise<RunScanOutcome> {
  const userDb = userClient as UntypedClient

  // Ownership check via RLS: a scan belonging to someone else simply is not
  // visible here, so this doubles as the authorisation.
  const { data: scan } = await userDb
    .from('menu_scans')
    .select('id, status, country_code')
    .eq('id', scanId)
    .maybeSingle()

  if (!scan) return { ok: false, reason: 'not_found' }

  const claimed = await claimScan(userDb, scanId)
  if (!claimed) return { ok: false, reason: 'already_running' }

  const service = createServiceClient() as UntypedClient

  try {
    const pages = await loadPages(userClient, scanId)
    if (pages.length === 0) {
      await setStatus(userDb, scanId, 'failed')
      return { ok: false, reason: 'no_pages' }
    }

    const data = getCountryDataProvider(scan.country_code ?? 'TH')
    const usage = createInMemoryUsageRecorder()

    const result = await analyzeMenu(
      { pages },
      {
        data,
        vision: createAnthropicVisionPort(),
        recipes: createAnthropicRecipePort({ data }),
        usage,
      },
    )

    await persist(service, scanId, result, usage.rows())

    // Mark the pages the vision pass could not read, so a retry prompt can
    // name them instead of asking for the whole menu again.
    if (result.unreadablePages.length > 0) {
      await service
        .from('menu_scan_pages')
        .update({ status: 'unreadable' })
        .in(
          'id',
          result.unreadablePages.map((page) => page.pageId),
        )
    }

    const dishCount = result.dishes.length + result.uncosted.length

    // `partial` is honest about a menu we only half read; `failed` is for a
    // scan that produced nothing at all, which is a retake, not a result.
    const status: ScanStatus =
      dishCount === 0 ? 'failed' : result.unreadablePages.length > 0 ? 'partial' : 'complete'

    await setStatus(userDb, scanId, status)
    return { ok: true, status, dishCount }
  } catch (error) {
    await setStatus(userDb, scanId, 'failed')
    console.error('[menudesk] scan analysis failed', { scanId, error })
    return { ok: false, reason: 'failed' }
  }
}
