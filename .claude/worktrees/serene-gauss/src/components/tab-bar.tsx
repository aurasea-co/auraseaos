'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import {
  Home,
  PenLine,
  TrendingUp,
  Settings,
  DollarSign,
  PieChart,
  Briefcase,
  BarChart3,
  MoreHorizontal,
} from 'lucide-react'
import { useUser } from '@/providers/user-context'
import { MobileMoreDrawer, type MobileNavItem } from '@/components/mobile-more-drawer'
import type { AppRole } from '@/lib/supabase/types'
import { PLAN_LEVEL } from '@/lib/config/pricing'

type MobileTab = MobileNavItem

// Build the full set of tabs available to this user in the order they
// should appear on mobile. The tab-bar then splits this into the first
// 3 that show as buttons and any remainder that live in the "More"
// drawer. Kept in sync with the desktop sidebar's gating logic
// (src/components/sidebar.tsx).
function getMobileTabs(
  role: AppRole,
  plan: string,
  branchType: string,
): MobileTab[] {
  const planLevel = PLAN_LEVEL[plan as keyof typeof PLAN_LEVEL] ?? 0
  const hasGrowth = planLevel >= PLAN_LEVEL.growth
  const hasPro = planLevel >= PLAN_LEVEL.pro
  const isHotel = branchType !== 'fnb'

  if (role === 'staff') {
    return [
      { href: '/home', icon: Home, labelKey: 'home' },
      { href: '/entry', icon: PenLine, labelKey: 'entry' },
    ]
  }

  if (role === 'manager') {
    return [
      { href: '/home', icon: Home, labelKey: 'home' },
      { href: '/entry', icon: PenLine, labelKey: 'entry' },
      { href: '/trends', icon: TrendingUp, labelKey: 'trends' },
    ]
  }

  // Owner / superadmin — primary tabs first, then gated analytics in
  // plan order so they land in the "More" drawer in a sensible order.
  const tabs: MobileTab[] = [
    { href: '/home', icon: Home, labelKey: 'home' },
    { href: '/entry', icon: PenLine, labelKey: 'entry' },
  ]
  if (hasGrowth) tabs.push({ href: '/trends', icon: TrendingUp, labelKey: 'trends' })
  if (hasGrowth) {
    tabs.push(
      isHotel
        ? { href: '/pricing', icon: DollarSign, labelKey: 'pricing' }
        : { href: '/cost', icon: PieChart, labelKey: 'cost' },
    )
  }
  if (hasPro) {
    tabs.push({ href: '/labour', icon: Briefcase, labelKey: 'labour' })
    tabs.push({ href: '/portfolio', icon: BarChart3, labelKey: 'portfolio' })
  }
  tabs.push({ href: '/settings', icon: Settings, labelKey: 'settings' })
  return tabs
}

export function TabBar() {
  const pathname = usePathname()
  const { role, plan, activeBranch } = useUser()
  const t = useTranslations('nav')
  const [drawerOpen, setDrawerOpen] = useState(false)

  const allTabs = getMobileTabs(role, plan, activeBranch?.business_type || 'accommodation')

  // Up to 4 buttons in the bar. If the user has more than 4, the last
  // slot becomes "More" and the overflow tabs move into the drawer.
  const needsMore = allTabs.length > 4
  const primaryTabs = needsMore ? allTabs.slice(0, 3) : allTabs
  const drawerTabs = needsMore ? allTabs.slice(3) : []

  // Highlight the More button when the current page lives inside the
  // drawer, so the user has a visual anchor.
  const drawerActive = drawerTabs.some(
    (item) => pathname === item.href || pathname.startsWith(item.href + '/'),
  )

  const slotCount = primaryTabs.length + (needsMore ? 1 : 0)

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden pb-safe"
        style={{
          height: 'var(--bottomnav-height)',
          background: 'var(--color-bg)',
          borderTop: '1px solid var(--color-border)',
        }}
      >
        <div
          className="h-full"
          style={{ display: 'grid', gridTemplateColumns: `repeat(${slotCount}, 1fr)` }}
        >
          {primaryTabs.map((tab) => {
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
                  <span
                    style={{
                      position: 'absolute',
                      top: 0,
                      width: 20,
                      height: 2,
                      background: 'var(--color-brand-teal)',
                      borderRadius: '0 0 2px 2px',
                    }}
                  />
                )}
                <Icon
                  size={20}
                  strokeWidth={1.5}
                  style={{ color: isActive ? 'var(--color-brand-teal)' : 'var(--color-text-tertiary)' }}
                />
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: isActive ? 500 : 400,
                    color: isActive ? 'var(--color-brand-teal)' : 'var(--color-text-tertiary)',
                  }}
                >
                  {t(tab.labelKey)}
                </span>
              </Link>
            )
          })}
          {needsMore && (
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="relative flex flex-col items-center justify-center touch-target"
              style={{
                gap: 2,
                cursor: 'pointer',
                background: 'none',
                border: 'none',
                padding: 0,
              }}
            >
              {drawerActive && (
                <span
                  style={{
                    position: 'absolute',
                    top: 0,
                    width: 20,
                    height: 2,
                    background: 'var(--color-brand-teal)',
                    borderRadius: '0 0 2px 2px',
                  }}
                />
              )}
              <MoreHorizontal
                size={20}
                strokeWidth={1.5}
                style={{ color: drawerActive ? 'var(--color-brand-teal)' : 'var(--color-text-tertiary)' }}
              />
              <span
                style={{
                  fontSize: 10,
                  fontWeight: drawerActive ? 500 : 400,
                  color: drawerActive ? 'var(--color-brand-teal)' : 'var(--color-text-tertiary)',
                }}
              >
                {t('more')}
              </span>
            </button>
          )}
        </div>
      </nav>

      {needsMore && (
        <MobileMoreDrawer
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          tabs={drawerTabs}
          currentPath={pathname}
        />
      )}
    </>
  )
}
