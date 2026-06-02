import { describe, it, expect } from 'vitest'
import {
  canShowLiveApproveButton,
  shouldShowAwaitingPmsNote,
} from './auto-push-gating'

describe('canShowLiveApproveButton — both gates required', () => {
  it('returns true when plan has auto_push AND adapter supports write-back', () => {
    expect(
      canShowLiveApproveButton({
        plan: 'pro',
        pmsConfig: { is_active: true, supports_write_back: true },
      }),
    ).toBe(true)
  })

  it('returns true for enterprise plan + write-back adapter', () => {
    expect(
      canShowLiveApproveButton({
        plan: 'enterprise',
        pmsConfig: { is_active: true, supports_write_back: true },
      }),
    ).toBe(true)
  })

  it('returns false when plan lacks auto_push (Crystal Resort + future Cloudbeds)', () => {
    expect(
      canShowLiveApproveButton({
        plan: 'growth',
        pmsConfig: { is_active: true, supports_write_back: true },
      }),
    ).toBe(false)
  })

  it('returns false when adapter is not write-back capable (Crystal Resort today: Pro, no live PMS)', () => {
    expect(
      canShowLiveApproveButton({
        plan: 'pro',
        pmsConfig: { is_active: true, supports_write_back: false },
      }),
    ).toBe(false)
  })

  it('returns false when adapter is inactive (owner disabled integration)', () => {
    expect(
      canShowLiveApproveButton({
        plan: 'pro',
        pmsConfig: { is_active: false, supports_write_back: true },
      }),
    ).toBe(false)
  })

  it('returns false when no adapter is configured at all', () => {
    expect(
      canShowLiveApproveButton({ plan: 'pro', pmsConfig: null }),
    ).toBe(false)
  })

  it('returns false when plan is null/unknown', () => {
    expect(
      canShowLiveApproveButton({
        plan: null,
        pmsConfig: { is_active: true, supports_write_back: true },
      }),
    ).toBe(false)
    expect(
      canShowLiveApproveButton({
        plan: 'unknown-plan',
        pmsConfig: { is_active: true, supports_write_back: true },
      }),
    ).toBe(false)
  })

  it('returns false on starter plan (no auto_push)', () => {
    expect(
      canShowLiveApproveButton({
        plan: 'starter',
        pmsConfig: { is_active: true, supports_write_back: true },
      }),
    ).toBe(false)
  })
})

describe('shouldShowAwaitingPmsNote', () => {
  it('returns true when plan has auto_push but no write-back adapter — Crystal Resort case', () => {
    expect(
      shouldShowAwaitingPmsNote({
        plan: 'pro',
        pmsConfig: { is_active: true, supports_write_back: false },
      }),
    ).toBe(true)
  })

  it('returns true when plan has auto_push but no adapter at all', () => {
    expect(
      shouldShowAwaitingPmsNote({ plan: 'pro', pmsConfig: null }),
    ).toBe(true)
  })

  it('returns true when plan has auto_push but adapter is disabled', () => {
    expect(
      shouldShowAwaitingPmsNote({
        plan: 'pro',
        pmsConfig: { is_active: false, supports_write_back: true },
      }),
    ).toBe(true)
  })

  it('returns false when the live button is already showing (both gates pass)', () => {
    expect(
      shouldShowAwaitingPmsNote({
        plan: 'pro',
        pmsConfig: { is_active: true, supports_write_back: true },
      }),
    ).toBe(false)
  })

  it('returns false when plan does not include auto_push — nothing to await', () => {
    expect(
      shouldShowAwaitingPmsNote({
        plan: 'growth',
        pmsConfig: { is_active: true, supports_write_back: false },
      }),
    ).toBe(false)
    expect(
      shouldShowAwaitingPmsNote({ plan: 'starter', pmsConfig: null }),
    ).toBe(false)
  })
})
