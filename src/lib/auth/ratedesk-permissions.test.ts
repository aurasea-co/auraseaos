import { describe, it, expect } from 'vitest'
import {
  canAccessRateDesk,
  canSeeElement,
  canSeeRevenue,
  type RateDeskPage,
  type RateDeskElement,
} from './ratedesk-permissions'

// Page-level page identifiers used by canAccessRateDesk callers.
const ALL_PAGES: RateDeskPage[] = [
  'ratedesk_dashboard',
  'ratedesk_recommendations',
  'ratedesk_competitors',
  'ratedesk_import',
  'ratedesk_auto_push',
  'ratedesk_room_settings',
]

// Element-level identifiers used by canSeeElement.
const ALL_ELEMENTS: RateDeskElement[] = [
  'total_revenue',
  'rate_approval',
  'room_settings_link',
  'billing_link',
]

describe('RateDesk role access — page level', () => {
  it('manager CAN access the dashboard page (was previously blocked)', () => {
    expect(canAccessRateDesk('manager', 'ratedesk_dashboard')).toBe(true)
  })

  it('manager CAN access auto_push (approve rates)', () => {
    expect(canAccessRateDesk('manager', 'ratedesk_auto_push')).toBe(true)
  })

  it('manager CAN access import, competitors, recommendations', () => {
    expect(canAccessRateDesk('manager', 'ratedesk_import')).toBe(true)
    expect(canAccessRateDesk('manager', 'ratedesk_competitors')).toBe(true)
    expect(canAccessRateDesk('manager', 'ratedesk_recommendations')).toBe(true)
  })

  it('manager CANNOT access room settings (structural config — owner only)', () => {
    expect(canAccessRateDesk('manager', 'ratedesk_room_settings')).toBe(false)
  })

  it('owner can access every RateDesk page', () => {
    for (const page of ALL_PAGES) {
      expect(canAccessRateDesk('owner', page)).toBe(true)
    }
  })

  it('superadmin mirrors owner page access', () => {
    for (const page of ALL_PAGES) {
      expect(canAccessRateDesk('superadmin', page)).toBe(true)
    }
  })

  it('staff cannot access any RateDesk page', () => {
    for (const page of ALL_PAGES) {
      expect(canAccessRateDesk('staff', page)).toBe(false)
    }
  })
})

describe('RateDesk role access — element level', () => {
  it('owner sees total revenue', () => {
    expect(canSeeElement('owner', 'total_revenue')).toBe(true)
  })

  it('manager does NOT see total revenue (P&L-sensitive)', () => {
    expect(canSeeElement('manager', 'total_revenue')).toBe(false)
  })

  it('manager sees the rate-approval control', () => {
    expect(canSeeElement('manager', 'rate_approval')).toBe(true)
  })

  it('owner sees the rate-approval control', () => {
    expect(canSeeElement('owner', 'rate_approval')).toBe(true)
  })

  it('manager does not see the room settings link', () => {
    expect(canSeeElement('manager', 'room_settings_link')).toBe(false)
  })

  it('owner sees the room settings + billing links', () => {
    expect(canSeeElement('owner', 'room_settings_link')).toBe(true)
    expect(canSeeElement('owner', 'billing_link')).toBe(true)
  })

  it('manager sees neither billing nor room settings', () => {
    expect(canSeeElement('manager', 'billing_link')).toBe(false)
    expect(canSeeElement('manager', 'room_settings_link')).toBe(false)
  })

  it('staff sees no RateDesk elements', () => {
    for (const el of ALL_ELEMENTS) {
      expect(canSeeElement('staff', el)).toBe(false)
    }
  })
})

describe('canSeeRevenue — cross-cutting wrapper', () => {
  // Tied to canSeeElement(role, 'total_revenue'); these tests pin the
  // contract so the wrapper can't silently diverge from the source
  // of truth. Used by F&B home, /ratedesk, exports, charts.
  it('owner sees revenue', () => {
    expect(canSeeRevenue('owner')).toBe(true)
  })

  it('superadmin sees revenue (platform staff mirror owner)', () => {
    expect(canSeeRevenue('superadmin')).toBe(true)
  })

  it('manager does NOT see revenue (P&L-sensitive)', () => {
    expect(canSeeRevenue('manager')).toBe(false)
  })

  it('staff does NOT see revenue', () => {
    expect(canSeeRevenue('staff')).toBe(false)
  })

  it('unknown roles fail closed (defensive against new role additions)', () => {
    expect(canSeeRevenue('viewer')).toBe(false)
    expect(canSeeRevenue('auditor')).toBe(false)
    expect(canSeeRevenue('')).toBe(false)
  })

  it('matches canSeeElement(role, "total_revenue") for every known role', () => {
    // Contract guarantee: the wrapper must NEVER report different
    // visibility than the source of truth. If this fails, someone
    // changed the wrapper logic without updating ELEMENT_ACCESS.
    for (const role of ['owner', 'manager', 'staff', 'superadmin'] as const) {
      expect(canSeeRevenue(role)).toBe(canSeeElement(role, 'total_revenue'))
    }
  })
})
