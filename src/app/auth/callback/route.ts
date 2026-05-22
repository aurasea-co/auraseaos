import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Supabase appends ?type=... to the email-link confirmation URLs. We
// branch on it so password-recovery flows land on /reset-password
// instead of dropping the user on /home with an authenticated session
// but no obvious "set your password" affordance.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const type = searchParams.get('type')
  const next = searchParams.get('next') ?? '/home'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Password recovery — send to reset password page
      if (type === 'recovery') {
        return NextResponse.redirect(`${origin}/reset-password`)
      }
      // Invitation accept — send to home (the membership wiring
      // happens via /api/invite/accept, not via this callback).
      if (type === 'invite') {
        return NextResponse.redirect(`${origin}/home`)
      }
      // Default — use next param or home
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
