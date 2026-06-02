// Auto Push gating — single source of truth for "should the live
// approve button appear in this branch's morning LINE brief?"
//
// Two independent gates, BOTH required for a live approve button:
//   (a) plan: the branch's organisation is on a plan that includes
//       the `auto_push` feature (Pro / Enterprise today).
//   (b) adapter: the branch has a connected, active PMS adapter
//       whose supports_write_back capability is true. This lives on
//       branch_pms_config and is set at config-create time from the
//       PmsProvider.supportsWriteBack flag.
//
// If (a) is true but (b) is false the brief shows a subtle
// "Auto Push activates once a supported PMS is connected" note next
// to the review link — the owner paid for the feature, the platform
// just doesn't have a live target yet (e.g. Crystal Resort: Pro plan,
// but no Cloudbeds adapter live until Phase R3).
//
// If neither is true we show only the "Review in RateDesk" link.
//
// Pure functions, no I/O — the caller passes already-fetched plan +
// pms config rows. Keeps this 100% testable.

import { hasFeature } from '@/lib/auth/plan-features'

/** Minimal branch_pms_config shape the gating helpers need. */
export interface BranchPmsConfigForGating {
  is_active: boolean
  supports_write_back: boolean
}

export interface AutoPushGateInput {
  /** Org plan string from `organizations.plan`. Null/unknown defaults to "no". */
  plan: string | null | undefined
  /** Branch's active PMS config row, or null when none is connected. */
  pmsConfig: BranchPmsConfigForGating | null
}

/** True when both gates pass and a LIVE approve button should render. */
export function canShowLiveApproveButton(input: AutoPushGateInput): boolean {
  const planOk = hasFeature(input.plan, 'auto_push')
  const adapterOk =
    input.pmsConfig != null &&
    input.pmsConfig.is_active === true &&
    input.pmsConfig.supports_write_back === true
  return planOk && adapterOk
}

/** True when the plan has Auto Push but no write-back-capable adapter is
 *  connected — we show a subtle "activates once PMS connected" note
 *  instead of a live button. False otherwise (either plan doesn't pay
 *  for it OR the live button is already showing). */
export function shouldShowAwaitingPmsNote(input: AutoPushGateInput): boolean {
  const planOk = hasFeature(input.plan, 'auto_push')
  if (!planOk) return false
  const adapterOk =
    input.pmsConfig != null &&
    input.pmsConfig.is_active === true &&
    input.pmsConfig.supports_write_back === true
  return !adapterOk
}
