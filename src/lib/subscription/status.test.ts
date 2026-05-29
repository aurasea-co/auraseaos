import { describe, it, expect } from 'vitest'
import { computeSubscriptionPhase } from './status'

const NOW = new Date('2026-05-29T12:00:00Z')
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString()

describe('computeSubscriptionPhase', () => {
  it('returns active for status=active regardless of trial_ends_at', () => {
    const s = computeSubscriptionPhase(
      { status: 'active', trial_ends_at: days(-30), grace_period_days: 7 },
      NOW,
    )
    expect(s.phase).toBe('active')
    expect(s.isOnTrialPath).toBe(false)
    expect(s.trialDaysLeft).toBe(0)
    expect(s.graceDaysLeft).toBe(0)
  })

  it('returns cancelled for status=cancelled', () => {
    const s = computeSubscriptionPhase(
      { status: 'cancelled', trial_ends_at: days(10), grace_period_days: 7 },
      NOW,
    )
    expect(s.phase).toBe('cancelled')
    expect(s.isOnTrialPath).toBe(false)
  })

  it('returns trial with days-left for an active trial', () => {
    const s = computeSubscriptionPhase(
      { status: 'trial', trial_ends_at: days(15), grace_period_days: 7 },
      NOW,
    )
    expect(s.phase).toBe('trial')
    expect(s.trialDaysLeft).toBe(15)
    // Grace days = trial days + grace_period_days
    expect(s.graceDaysLeft).toBe(22)
    expect(s.isOnTrialPath).toBe(true)
  })

  it('flips trial → grace exactly at trial_ends_at', () => {
    const s = computeSubscriptionPhase(
      { status: 'trial', trial_ends_at: days(-0.5), grace_period_days: 7 },
      NOW,
    )
    expect(s.phase).toBe('grace')
    expect(s.trialDaysLeft).toBe(0)
    expect(s.graceDaysLeft).toBe(7)
  })

  it('reports grace days correctly mid-grace', () => {
    const s = computeSubscriptionPhase(
      { status: 'trial', trial_ends_at: days(-3), grace_period_days: 7 },
      NOW,
    )
    expect(s.phase).toBe('grace')
    expect(s.graceDaysLeft).toBe(4)
  })

  it('expires past trial_ends_at + grace_period_days', () => {
    const s = computeSubscriptionPhase(
      { status: 'trial', trial_ends_at: days(-10), grace_period_days: 7 },
      NOW,
    )
    expect(s.phase).toBe('expired')
    expect(s.trialDaysLeft).toBe(0)
    expect(s.graceDaysLeft).toBe(0)
  })

  it('uses 7 days as default grace when grace_period_days is null', () => {
    const s = computeSubscriptionPhase(
      { status: 'trial', trial_ends_at: days(-3), grace_period_days: null },
      NOW,
    )
    expect(s.phase).toBe('grace')
    expect(s.graceDaysLeft).toBe(4)
  })

  it('respects a custom grace_period_days', () => {
    // A 14-day grace means 10 days past expiry is still grace.
    const s = computeSubscriptionPhase(
      { status: 'trial', trial_ends_at: days(-10), grace_period_days: 14 },
      NOW,
    )
    expect(s.phase).toBe('grace')
    expect(s.graceDaysLeft).toBe(4)
  })

  it('falls back to expired when status=trial but trial_ends_at is null', () => {
    const s = computeSubscriptionPhase(
      { status: 'trial', trial_ends_at: null, grace_period_days: 7 },
      NOW,
    )
    expect(s.phase).toBe('expired')
    expect(s.isOnTrialPath).toBe(true)
  })
})
