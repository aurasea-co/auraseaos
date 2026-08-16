import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // An anonymous session counts as logged out here.
  //
  // MenuDesk's scan funnel moved to its own app (platform/menudesk) in Aug
  // 2026, so this repo no longer serves /scan or /r/ and the route exemptions
  // that used to sit here are gone with them. This line stays because it is
  // not about those routes: anonymous sign-in creates a real auth.users row
  // with no organization membership, and without this check such a session
  // would satisfy the `!user` gate below and land in the app shell with an
  // empty branch list.
  const appUser = user?.is_anonymous ? null : user

  // Public routes that don't require auth
  const publicPaths = [
    '/login',
    '/auth/callback',
    '/api/',
    '/forgot-password',
    '/reset-password',
    '/join',
    '/welcome',
    '/register',
    '/suspended',
    '/owner-setup',
  ]
  const isPublicPath = publicPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  )

  if (!appUser && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Redirect logged-in users away from login page — honour returnTo
  // when present (used by /api/line/link and the /join wrongAccount
  // re-login path) so the deep-link completes instead of dumping the
  // user on /home.
  if (appUser && request.nextUrl.pathname === '/login') {
    const returnTo = request.nextUrl.searchParams.get('returnTo')
    const url = request.nextUrl.clone()
    // Same-origin only — anything not starting with a single '/' is
    // ignored to avoid being used as an open-redirect helper.
    if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')) {
      url.pathname = returnTo.split('?')[0]
      const qs = returnTo.includes('?') ? returnTo.slice(returnTo.indexOf('?') + 1) : ''
      url.search = qs ? `?${qs}` : ''
    } else {
      url.pathname = '/home'
      url.search = ''
    }
    return NextResponse.redirect(url)
  }

  // Suspension check — if the user has memberships but ALL of them
  // have is_active = false, send them to /suspended. We allow a few
  // escape hatches so they can still see their status and log out.
  if (appUser) {
    const allowedWhileSuspended = (path: string) =>
      path === '/suspended' ||
      path === '/login' ||
      path.startsWith('/auth/') ||
      path === '/settings/profile' ||
      path.startsWith('/api/')

    if (!allowedWhileSuspended(request.nextUrl.pathname)) {
      const { createClient } = await import('@supabase/supabase-js')
      const serviceClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      const [orgResult, branchResult] = await Promise.all([
        serviceClient
          .from('organization_members')
          .select('is_active')
          .eq('user_id', appUser.id),
        serviceClient
          .from('branch_members')
          .select('is_active')
          .eq('user_id', appUser.id),
      ])

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orgRows = (orgResult.data || []) as any[]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const branchRows = (branchResult.data || []) as any[]
      const allRows = [...orgRows, ...branchRows]

      const hasMemberships = allRows.length > 0
      const hasActiveMembership = allRows.some((r) => r.is_active !== false)

      if (hasMemberships && !hasActiveMembership) {
        const url = request.nextUrl.clone()
        url.pathname = '/suspended'
        return NextResponse.redirect(url)
      }
    }
  }

  // Superadmin route guard — silent redirect to /login if not super_admin
  if (request.nextUrl.pathname.startsWith('/superadmin')) {
    if (!appUser) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    const { createClient } = await import('@supabase/supabase-js')
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data } = await serviceClient
      .from('platform_admins')
      .select('role')
      .eq('user_id', appUser.id)
      .single()

    if (!data || data.role !== 'super_admin') {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    return supabaseResponse
  }

  return supabaseResponse
}
