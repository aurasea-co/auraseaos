'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Home, PenLine, TrendingUp, Menu } from 'lucide-react'
import { useUser } from '@/providers/user-context'

export function TabBar() {
  const pathname = usePathname()
  const { role } = useUser()
  const t = useTranslations('nav')

  // Mobile bottom nav: max 4 tabs
  // Staff: entry only
  // Manager: home, entry, trends
  // Owner: home, entry, trends, more (hamburger handled by drawer)
  const tabs = (() => {
    if (role === 'staff') {
      return [
        { href: '/home', icon: Home, labelKey: 'home' as const },
        { href: '/entry', icon: PenLine, labelKey: 'entry' as const },
      ]
    }
    if (role === 'manager') {
      return [
        { href: '/home', icon: Home, labelKey: 'home' as const },
        { href: '/entry', icon: PenLine, labelKey: 'entry' as const },
        { href: '/trends', icon: TrendingUp, labelKey: 'trends' as const },
      ]
    }
    // Owner + superadmin
    return [
      { href: '/home', icon: Home, labelKey: 'home' as const },
      { href: '/entry', icon: PenLine, labelKey: 'entry' as const },
      { href: '/trends', icon: TrendingUp, labelKey: 'trends' as const },
      { href: '/settings', icon: Menu, labelKey: 'settings' as const },
    ]
  })()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden pb-safe"
      style={{ height: 'var(--bottomnav-height)', background: 'var(--color-bg)', borderTop: '1px solid var(--color-border)' }}
    >
      <div className="h-full" style={{ display: 'grid', gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/')
          const Icon = tab.icon
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="relative flex flex-col items-center justify-center touch-target"
              style={{ gap: 2, cursor: 'pointer', textDecoration: 'none' }}
            >
              {isActive && (
                <span style={{ position: 'absolute', top: 0, width: 20, height: 2, background: 'var(--color-brand-teal)', borderRadius: '0 0 2px 2px' }} />
              )}
              <Icon size={20} strokeWidth={1.5} style={{ color: isActive ? 'var(--color-brand-teal)' : 'var(--color-text-tertiary)' }} />
              <span style={{ fontSize: 10, fontWeight: isActive ? 500 : 400, color: isActive ? 'var(--color-brand-teal)' : 'var(--color-text-tertiary)' }}>
                {t(tab.labelKey)}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
