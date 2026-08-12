// Persistence for the resolved "Today's action" line (LLM output or the
// deterministic template fallback), so it's generated at most once per
// (branch, night) per morning — not once per recipient the branch has —
// and is inspectable after the fact via branch_daily_actions.
//
// Soft-fail throughout, matching upsertBranchRateRecommendations's
// posture in persistence.ts: a missing table (before the migration in
// supabase/migrations/042_branch_daily_actions.sql is pasted into the
// Supabase SQL editor) or any read/write error must never break the
// brief — it just means no cross-recipient caching or transparency for
// that run, not a failure.

import type { DailyAction } from './engine'

export interface DailyActionRow {
  dailyAction: DailyAction
  source: 'llm' | 'template'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

export async function readDailyAction(
  supabase: SupabaseLike,
  branchId: string,
  metricDate: string,
): Promise<DailyActionRow | null> {
  try {
    const { data, error } = await supabase
      .from('branch_daily_actions')
      .select('message_th, message_en, source')
      .eq('branch_id', branchId)
      .eq('metric_date', metricDate)
      .maybeSingle()
    if (error || !data) return null
    const row = data as { message_th: string; message_en: string; source: string }
    if (row.source !== 'llm' && row.source !== 'template') return null
    return {
      dailyAction: { messageTh: row.message_th, messageEn: row.message_en },
      source: row.source,
    }
  } catch (err) {
    console.warn('[action-persistence] read failed — proceeding without cache:', err)
    return null
  }
}

export async function writeDailyAction(
  supabase: SupabaseLike,
  params: {
    branchId: string
    metricDate: string
    action: DailyAction
    source: 'llm' | 'template'
    model: string | null
    latencyMs: number | null
  },
): Promise<void> {
  try {
    const { error } = await supabase
      .from('branch_daily_actions')
      .upsert(
        {
          branch_id: params.branchId,
          metric_date: params.metricDate,
          message_th: params.action.messageTh,
          message_en: params.action.messageEn,
          source: params.source,
          model: params.model,
          latency_ms: params.latencyMs,
        },
        { onConflict: 'branch_id,metric_date' },
      )
    if (error) {
      console.warn(`[action-persistence] write failed for branch=${params.branchId}:`, error)
    }
  } catch (err) {
    console.warn(`[action-persistence] write threw for branch=${params.branchId}:`, err)
  }
}
