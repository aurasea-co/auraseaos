import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// Public lookup for the /owner-setup wizard. Returns only the safe
// fields needed to render the first screen — token holders see their
// own invitation, no other rows leak. RLS on owner_invitations is
// super_admin-only, so the client can't read it directly.

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data } = await db
    .from('owner_invitations')
    .select(`
      email,
      organization_name,
      business_type,
      trial_days,
      plan,
      discount_pct,
      promo_code,
      expires_at,
      accepted_at
    `)
    .eq('token', token)
    .maybeSingle()

  if (!data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  return NextResponse.json({
    email: data.email,
    organizationName: data.organization_name || '',
    businessType: data.business_type,
    trialDays: data.trial_days,
    plan: data.plan,
    discountPct: data.discount_pct,
    promoCode: data.promo_code,
    expiresAt: data.expires_at,
    acceptedAt: data.accepted_at,
  })
}
