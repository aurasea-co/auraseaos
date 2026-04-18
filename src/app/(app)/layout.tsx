import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserContext } from '@/lib/auth/get-user-context'
import { UserProvider } from '@/providers/user-context'
import { TabBar } from '@/components/tab-bar'
import { Sidebar } from '@/components/sidebar'
import { ResponsiveHeader } from '@/components/responsive-header'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const userContext = await getUserContext(
    supabase,
    user.id,
    user.email || ''
  )

  // Authenticated but not connected to any org or branch — send to account-setup
  // (prevents redirect loop / stuck "no org" screen)
  if (!userContext.organization && !userContext.isSuperAdmin) {
    redirect('/account-setup')
  }

  return (
    <UserProvider initialContext={userContext}>
      {/* Desktop/Tablet: Sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div
        className="min-h-screen"
        style={{
          marginLeft: 0,
          paddingBottom: 'calc(var(--bottomnav-height) + 16px)',
        }}
      >
        {/* Responsive margin for sidebar */}
        <style>{`
          @media (min-width: 768px) { .app-content-area { margin-left: var(--sidebar-collapsed) !important; padding-bottom: 0 !important; } }
          @media (min-width: 1280px) { .app-content-area { margin-left: var(--sidebar-width) !important; } }
        `}</style>
        <div className="app-content-area" style={{ marginLeft: 0, paddingBottom: 'calc(var(--bottomnav-height) + 16px)' }}>
          <ResponsiveHeader />
          <main
            style={{
              maxWidth: 'var(--content-max-width)',
              margin: '0 auto',
              padding: '20px var(--page-padding-mobile)',
            }}
          >
            <style>{`@media (min-width: 1280px) { main { padding: 24px var(--page-padding-desktop) !important; } }`}</style>
            {children}
          </main>
        </div>
      </div>

      {/* Mobile: Bottom tab bar */}
      <TabBar />
    </UserProvider>
  )
}
