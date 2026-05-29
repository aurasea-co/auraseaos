// Pure status logic for an org's plan / trial / grace lifecycle.
// The spec proposed this as a Postgres `subscription_status_view` —
// we keep it in TS instead so the API route and the client (banner,
// detail page) share one implementation. The DB writes only carry
// the raw state (`status`, `trial_ends_at`, `grace_period_days`); the
// derived phase + day counts come from here.
//
// Phases:
//   active   — paid (status='active')
//   trial    — within trial window (trial_ends_at in the future)
//   grace    — trial expired but within grace_period_days after
//   expired  — past grace window, no admin action yet
//   cancelled — owner or admin explicitly cancelled
//
// Read access stays open in every phase. Write-side enforcement
// (block daily entry past grace) lives in the entry route, which
// calls computeSubscriptionPhase() to decide.

export type SubscriptionPhase = 'active' | 'trial' | 'grace' | 'expired' | 'cancelled'

export interface SubscriptionInput {
  status: string | null
  trial_ends_at: string | null
  grace_period_days: number | null
}

export interface SubscriptionStatus {
  phase: SubscriptionPhase
  /** Calendar days remaining in the trial window. 0 once expired. */
  trialDaysLeft: number
  /** Days remaining in the grace window after trial expiry. 0 once
   *  the org is fully expired. */
  graceDaysLeft: number
  /** ISO date when the trial window ends (== trial_ends_at). */
  trialEndsAt: string | null
  /** ISO date when grace ends — trial_ends_at + grace_period_days. */
  graceEndsAt: string | null
  /** True for `trial | grace | expired` — i.e. anything that isn't
   *  active / cancelled. The UI uses this to decide whether to
   *  surface the trial banner at all. */
  isOnTrialPath: boolean
}

const MS_PER_DAY = 86_400_000

export function computeSubscriptionPhase(
  org: SubscriptionInput,
  now: Date = new Date(),
): SubscriptionStatus {
  const status = (org.status || '').toLowerCase()
  const trialEndsAtIso = org.trial_ends_at
  const gracePeriodDays = org.grace_period_days ?? 7

  if (status === 'cancelled') {
    return {
      phase: 'cancelled',
      trialDaysLeft: 0,
      graceDaysLeft: 0,
      trialEndsAt: trialEndsAtIso,
      graceEndsAt: null,
      isOnTrialPath: false,
    }
  }

  if (status === 'active') {
    return {
      phase: 'active',
      trialDaysLeft: 0,
      graceDaysLeft: 0,
      trialEndsAt: trialEndsAtIso,
      graceEndsAt: null,
      isOnTrialPath: false,
    }
  }

  // Trial path — derive day counts from trial_ends_at. Missing
  // trial_ends_at while status='trial' is treated as expired
  // (defensive: an admin manually flipped status to 'trial' without
  // setting the end date).
  if (!trialEndsAtIso) {
    return {
      phase: 'expired',
      trialDaysLeft: 0,
      graceDaysLeft: 0,
      trialEndsAt: null,
      graceEndsAt: null,
      isOnTrialPath: true,
    }
  }

  const trialEndMs = new Date(trialEndsAtIso).getTime()
  const graceEndMs = trialEndMs + gracePeriodDays * MS_PER_DAY
  const nowMs = now.getTime()

  const trialDaysLeft = Math.max(0, Math.ceil((trialEndMs - nowMs) / MS_PER_DAY))
  const graceDaysLeft = Math.max(0, Math.ceil((graceEndMs - nowMs) / MS_PER_DAY))

  let phase: SubscriptionPhase
  if (nowMs < trialEndMs) phase = 'trial'
  else if (nowMs < graceEndMs) phase = 'grace'
  else phase = 'expired'

  return {
    phase,
    trialDaysLeft,
    graceDaysLeft,
    trialEndsAt: trialEndsAtIso,
    graceEndsAt: new Date(graceEndMs).toISOString(),
    isOnTrialPath: true,
  }
}
