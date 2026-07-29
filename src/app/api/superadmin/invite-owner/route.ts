import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendEmail, EMAIL_SENDERS } from '@/lib/email/resend'
import OwnerInvitationEmail, { type OwnerInvitationTier } from '@/lib/email/templates/ownerInvitationEmail'
import { PRICING } from '@/lib/config/pricing'
import { authenticateSuperAdmin } from '../_lib'
import { TRIAL_OPTIONS } from '@/lib/superadmin/invite-trial-options'

// POST /api/superadmin/invite-owner
//   { email, organizationName, businessType, trialDays, plan,
//     discountPct, promoCode, notes }
//
// Creates an owner_invitations row (token + 7d expiry) and sends the
// owner an email with the /owner-setup link. Super-admin only.

interface Body {
  email?: string
  organizationName?: string
  businessType?: 'accommodation' | 'fnb' | 'mixed'
  trialDays?: number
  plan?: 'starter' | 'growth' | 'pro'
  discountPct?: number
  promoCode?: string
  notes?: string
}

const VALID_BUSINESS = new Set(['accommodation', 'fnb', 'mixed'])
const VALID_PLANS = new Set(['starter', 'growth', 'pro'])
// Same list the invite-owner page's dropdown offers — imported from
// one shared constant so the UI can never offer (and this route can
// never accept) a trial length the other side doesn't also allow. See
// invite-trial-options.ts's header for why this used to be two
// independently hardcoded lists that had already drifted.
const VALID_TRIAL = new Set<number>(TRIAL_OPTIONS)

export async function POST(req: NextRequest) {
  const auth = await authenticateSuperAdmin()
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  let body: Body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const email = body.email?.trim().toLowerCase()
  const organizationName = body.organizationName?.trim() || ''
  const businessType = body.businessType || 'mixed'
  const trialDays = body.trialDays ?? 30
  const plan = body.plan || 'growth'
  const discountPct = Math.max(0, Math.min(100, body.discountPct ?? 0))
  const promoCode = body.promoCode?.trim() || null
  const notes = body.notes?.trim() || null

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
  }
  if (!VALID_BUSINESS.has(businessType)) {
    return NextResponse.json({ error: 'Invalid business type' }, { status: 400 })
  }
  if (!VALID_TRIAL.has(trialDays)) {
    return NextResponse.json({ error: 'Invalid trial period' }, { status: 400 })
  }
  if (!VALID_PLANS.has(plan)) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  }

  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: invitation, error: insertErr } = await db
    .from('owner_invitations')
    .insert({
      email,
      organization_name: organizationName || null,
      business_type: businessType,
      trial_days: trialDays,
      plan,
      discount_pct: discountPct,
      promo_code: promoCode,
      notes,
      invited_by: auth.userId,
      token,
      expires_at: expiresAt,
    })
    .select('id, token')
    .single()

  if (insertErr || !invitation) {
    return NextResponse.json(
      { error: insertErr?.message || 'Failed to create invitation' },
      { status: 500 },
    )
  }

  // Tier-aware subject + badge. Inferred from promo code prefix so the
  // /superadmin/invite-owner form stays the single source of truth — the
  // admin picks a tier preset and the prefix carries through to here.
  const codeUpper = (promoCode || '').toUpperCase()
  const tier: OwnerInvitationTier = codeUpper.startsWith('FOUNDING')
    ? 'founding'
    : codeUpper.startsWith('EARLY')
      ? 'early_adopter'
      : 'standard'

  const subject = tier === 'founding'
    ? 'คุณได้รับเชิญเป็น Founding Partner ของ Aurasea OS'
    : tier === 'early_adopter'
      ? `คุณได้รับเชิญให้ลองใช้ Aurasea OS ก่อนใคร — ฟรี ${trialDays} วัน`
      : 'คุณได้รับเชิญให้ลองใช้ Aurasea OS'

  // Pull a monthly price for the trial offer box. Mixed only has 'pro',
  // so for any other plan on mixed we fall back to accommodation pricing.
  const priceSource = businessType === 'mixed'
    ? (plan === 'pro' ? PRICING.mixed.pro : PRICING.accommodation[plan])
    : PRICING[businessType][plan]
  const planPrice = priceSource?.monthly

  const result = await sendEmail({
    to: email,
    from: EMAIL_SENDERS.notifications,
    subject,
    react: OwnerInvitationEmail({
      ownerEmail: email,
      organizationName,
      businessType,
      trialDays,
      planName: plan,
      planPrice,
      discountPct,
      promoCode: promoCode || undefined,
      tier,
      token: invitation.token,
    }),
    // notification_log requires an organization_id, but at this point
    // the org doesn't exist yet. We use a sentinel UUID so the row is
    // logged for audit without violating FK constraints — the column
    // is nullable, so null works too.
    organizationId: '00000000-0000-0000-0000-000000000000',
    userId: auth.userId,
    notificationType: 'owner_invitation',
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error || 'Email send failed' }, { status: 500 })
  }

  return NextResponse.json({ success: true, invitationId: invitation.id })
}
