import { describe, it, expect } from 'vitest'
import { TRIAL_OPTIONS, MAX_TRIAL_DAYS } from './invite-trial-options'

// Pins the trial-length policy at its single source — both the
// invite-owner page's dropdown and the API route's server-side
// validation import TRIAL_OPTIONS from here, so this test is the one
// place a future edit that silently reintroduces a >60-day option
// (the exact bug that motivated extracting this constant — see this
// file's header) would get caught.
describe('invite-trial-options — 60-day cap', () => {
  it('MAX_TRIAL_DAYS is 60, matching the public trial-length policy', () => {
    expect(MAX_TRIAL_DAYS).toBe(60)
  })

  it('no option in TRIAL_OPTIONS exceeds MAX_TRIAL_DAYS', () => {
    for (const days of TRIAL_OPTIONS) {
      expect(days).toBeLessThanOrEqual(MAX_TRIAL_DAYS)
    }
  })

  it('does not offer 90 days', () => {
    expect(TRIAL_OPTIONS).not.toContain(90)
  })

  it('includes the 60-day option itself', () => {
    expect(TRIAL_OPTIONS).toContain(60)
  })
})
