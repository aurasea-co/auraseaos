import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import OwnerInvitationEmail from './ownerInvitationEmail'

// Pins the field-flow contract for the owner invitation email.
// Three bugs were called out in a spec audit:
//   1. promo label not appearing → REAL when tier is 'standard'
//      (FOUNDING/EARLY produced a tier badge, anything else
//      rendered nothing). The fix lands a neutral "Promo · …"
//      pill for the standard-tier case.
//   2. discount not shown → NOT a bug; covered by tests below.
//   3. trial_days hardcoded → NOT a bug; covered by tests below.
//
// We also assert the invariant the spec asks for: internal notes
// can never appear in the email because the field is not part of
// the template's prop surface at all. The test renders with a
// distinctive note string and confirms it doesn't leak.

const BASE_PROPS = {
  ownerEmail: 'owner@example.com',
  organizationName: 'Cafe B',
  businessType: 'fnb' as const,
  trialDays: 30,
  planName: 'growth',
  planPrice: 399,
  discountPct: 0,
  token: 'token-xyz',
}

describe('OwnerInvitationEmail', () => {
  describe('promo badge (Bug 1)', () => {
    it('renders Founding Partner #N for FOUNDING-N codes', () => {
      const html = renderToStaticMarkup(
        OwnerInvitationEmail({ ...BASE_PROPS, promoCode: 'FOUNDING-12' }),
      )
      expect(html).toContain('Founding Partner')
      expect(html).toContain('#12')
    })

    it('renders Early Adopter #N for EARLY-N codes', () => {
      const html = renderToStaticMarkup(
        OwnerInvitationEmail({ ...BASE_PROPS, promoCode: 'EARLY-7' }),
      )
      expect(html).toContain('Early Adopter')
      expect(html).toContain('#7')
    })

    it('renders a generic Promo · {code} pill for non-tiered codes (the fixed bug)', () => {
      const html = renderToStaticMarkup(
        OwnerInvitationEmail({ ...BASE_PROPS, promoCode: 'SETT2026' }),
      )
      expect(html).toContain('SETT2026')
    })

    it('renders no badge when promoCode is omitted', () => {
      const html = renderToStaticMarkup(
        OwnerInvitationEmail({ ...BASE_PROPS }),
      )
      expect(html).not.toContain('Founding Partner')
      expect(html).not.toContain('Early Adopter')
      expect(html).not.toContain('Promo ·')
    })
  })

  describe('first-month discount (Bug 2 — spec claim is wrong)', () => {
    it('renders the discount line inside the offer box when > 0', () => {
      const html = renderToStaticMarkup(
        OwnerInvitationEmail({ ...BASE_PROPS, discountPct: 50 }),
      )
      expect(html).toContain('50%')
    })

    it('also renders the amber urgency footer when discount > 0', () => {
      const html = renderToStaticMarkup(
        OwnerInvitationEmail({ ...BASE_PROPS, discountPct: 30 }),
      )
      // The footer copy includes "7 วัน" and the percent value.
      expect(html).toMatch(/30%[^]*7 วัน/)
    })

    it('does not mention "ส่วนลด" when discount is 0', () => {
      // We can't assert "% never appears" — CSS uses %-units
      // (width:100%, etc.) all over the rendered HTML. The Thai
      // word "ส่วนลด" (discount) only appears inside the discount
      // copy, so it's a clean signal.
      const html = renderToStaticMarkup(
        OwnerInvitationEmail({ ...BASE_PROPS, discountPct: 0 }),
      )
      expect(html).not.toContain('ส่วนลด')
      expect(html).not.toContain('เดือนแรก')
    })
  })

  describe('trial days (Bug 3 — spec claim is wrong)', () => {
    it('shows the exact trialDays value, not a hardcoded fallback', () => {
      const html = renderToStaticMarkup(
        OwnerInvitationEmail({ ...BASE_PROPS, trialDays: 45 }),
      )
      // Used in both the offer box bullet and the CTA button.
      expect(html).toContain('45 วัน')
      expect(html).not.toContain('30 วัน')
      expect(html).not.toContain('60 วัน')
    })

    it('correctly renders 90-day Founding trials', () => {
      const html = renderToStaticMarkup(
        OwnerInvitationEmail({
          ...BASE_PROPS,
          trialDays: 90,
          promoCode: 'FOUNDING-1',
          discountPct: 50,
        }),
      )
      expect(html).toContain('90 วัน')
    })
  })

  describe('internal notes never leak', () => {
    it('does not render anything from notes — the prop surface omits it', () => {
      // The template type doesn't accept `notes`; we pass it via
      // unknown to model what would happen if a future refactor
      // accidentally spread server-side state into the props.
      const props = { ...BASE_PROPS, notes: 'CONFIDENTIAL_OPS_NOTE_42' } as unknown as Parameters<typeof OwnerInvitationEmail>[0]
      const html = renderToStaticMarkup(OwnerInvitationEmail(props))
      expect(html).not.toContain('CONFIDENTIAL_OPS_NOTE_42')
    })
  })
})
