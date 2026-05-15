'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LayoutDashboard, Building2, Users, ScrollText, LogOut } from 'lucide-react'

const navItems = [
  { href: '/superadmin', icon: LayoutDashboard, label: 'ภาพรวม' },
  { href: '/superadmin/companies', icon: Building2, label: 'บริษัทและสาขา' },
  { href: '/superadmin/users', icon: Users, label: 'ผู้ใช้งาน' },
  { href: '/superadmin/audit', icon: ScrollText, label: 'Audit log' },
]

export function SuperadminShell({ email, children }: { email: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--color-bg)' }}>
      {/* Sidebar */}
      <aside style={{ width: 200, background: 'var(--color-bg-surface)', borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border)' }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: '#A32D2D' }}>aurasea superadmin</span>
        </div>

        <nav style={{ flex: 1, padding: '8px 0' }}>
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/superadmin' && pathname.startsWith(item.href))
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className="relative flex items-center"
                style={{
                  padding: '7px 16px', gap: 8, fontSize: 13,
                  fontWeight: isActive ? 500 : 400,
                  color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  background: isActive ? 'var(--color-bg-active)' : 'transparent',
                  textDecoration: 'none',
                }}
              >
                {isActive && <span style={{ position: 'absolute', left: 0, top: 4, bottom: 4, width: 2.5, background: '#A32D2D', borderRadius: '0 2px 2px 0' }} />}
                <Icon size={15} style={{ opacity: isActive ? 1 : 0.55 }} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--color-border)' }}>
          <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>{email}</p>
          <button onClick={handleLogout} className="flex items-center gap-2" style={{ fontSize: 12, color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <LogOut size={14} /> ออกจากระบบ
          </button>
        </div>
      </aside>

      {/* Content */}
      <main style={{ flex: 1, padding: 24, maxWidth: 960, overflow: 'auto' }}>
        {children}
      </main>
    </div>
  )
}
