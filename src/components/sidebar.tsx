'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Home, PenLine, Settings, LogOut, TrendingUp, DollarSign, PieChart, Lock, Briefcase, BarChart3 } from 'lucide-react'
import { useUser } from '@/providers/user-context'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { LocaleSwitcher } from './locale-switcher'
import { AuraSeaLogo } from './aurasea-logo'
import { CompassMark } from './compass-mark'
import type { AppRole } from '@/lib/supabase/types'
import { PLAN_LEVEL, PRICING, formatPrice } from '@/lib/config/pricing'
import type { BranchType } from '@/lib/config/pricing'

interface NavItem {
  href: string
  icon: typeof Home
  labelKey: string
  roles: AppRole[]
  plans?: ('starter' | 'growth' | 'pro')[]
  branchTypes?: string[]
  locked?: boolean
  requiredPlan?: 'growth' | 'pro'
}

function getLockedTitle(requiredPlan: 'growth' | 'pro', bt: BranchType): string {
  const price = PRICING[bt][requiredPlan].monthly
  const label = requiredPlan === 'growth' ? 'Growth' : 'Pro'
  return `${label} ${formatPrice(price)}/เดือน`
}

function getNavItems(role: AppRole, plan: string, branchType: string): (NavItem & { isLocked: boolean; lockedTitle?: string })[] {
  const bt: BranchType = branchType === 'fnb' ? 'fnb' : 'accommodation'
  const allItems: NavItem[] = [
    { href: '/home', icon: Home, labelKey: 'home', roles: ['owner', 'manager', 'staff', 'superadmin'] },
    { href: '/entry', icon: PenLine, labelKey: 'entry', roles: ['owner', 'manager', 'staff', 'superadmin'] },
    { href: '/trends', icon: TrendingUp, labelKey: 'trends', roles: ['owner', 'manager', 'superadmin'], plans: ['growth', 'pro'], requiredPlan: 'growth' },
    { href: '/pricing', icon: DollarSign, labelKey: 'pricing', roles: ['owner', 'superadmin'], plans: ['growth', 'pro'], branchTypes: ['accommodation'], requiredPlan: 'growth' },
    { href: '/cost', icon: PieChart, labelKey: 'cost', roles: ['owner', 'superadmin'], plans: ['growth', 'pro'], branchTypes: ['fnb'], requiredPlan: 'growth' },
    { href: '/labour', icon: Briefcase, labelKey: 'labour', roles: ['owner', 'superadmin'], plans: ['pro'], requiredPlan: 'pro' },
    { href: '/portfolio', icon: BarChart3, labelKey: 'portfolio', roles: ['owner', 'superadmin'], plans: ['pro'], requiredPlan: 'pro' },
    { href: '/settings', icon: Settings, labelKey: 'settings', roles: ['owner', 'superadmin'] },
  ]

  return allItems
    .filter((item) => {
      if (!item.roles.includes(role)) return false
      if (item.branchTypes && !item.branchTypes.includes(branchType)) return false
      return true
    })
    .map((item) => {
      const isLocked = item.plans ? !item.plans.some((p) => PLAN_LEVEL[plan as keyof typeof PLAN_LEVEL] >= PLAN_LEVEL[p]) : false
      return {
        ...item,
        isLocked,
        lockedTitle: isLocked && item.requiredPlan ? getLockedTitle(item.requiredPlan, bt) : undefined,
      }
    })
}

export function Sidebar() {
  const pathname = usePathname()
  const { role, organization, user, plan, activeBranch } = useUser()
  const t = useTranslations('nav')
  const router = useRouter()
  const supabase = createClient()

  const branchType = activeBranch?.business_type || 'accommodation'
  const navItems = getNavItems(role, plan, branchType)

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside
      className="hidden md:flex flex-col fixed left-0 top-0 h-screen z-50 sidebar-root"
      style={{
        background: 'var(--color-bg-surface)',
        borderRight: '1px solid var(--color-border)',
        width: 'var(--sidebar-collapsed)',
        transition: 'width 200ms ease',
      }}
    >
      <style>{`
        @media (min-width: 1280px) {
          .sidebar-root { width: var(--sidebar-width) !important; }
          .sidebar-expanded-only { display: block !important; }
          .sidebar-collapsed-only { display: none !important; }
          .sidebar-nav-item { justify-content: flex-start !important; }
        }
        @media (max-width: 1279px) {
          .sidebar-expanded-only { display: none !important; }
          .sidebar-collapsed-only { display: flex !important; }
          .sidebar-nav-item { justify-content: center !important; padding-left: 0 !important; padding-right: 0 !important; }
        }
      `}</style>

      {/* Logo section */}
      <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--color-border)' }}>
        <div className="sidebar-expanded-only" style={{ display: 'none' }}>
          <AuraSeaLogo variant="light" size={28} />
          <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 6 }}>{organization?.name}</p>
        </div>
        <div className="sidebar-collapsed-only items-center justify-center" style={{ display: 'none' }}>
          <CompassMark size={28} variant="light" />
        </div>
      </div>

      {/* Section label */}
      <div className="sidebar-expanded-only overline" style={{ display: 'none', padding: '14px 14px 4px' }}>Menu</div>

      {/* Navigation */}
      <nav className="flex-1 py-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.isLocked ? '/settings/billing' : item.href}
              title={item.isLocked && item.lockedTitle ? item.lockedTitle : t(item.labelKey)}
              className="relative flex items-center touch-target sidebar-nav-item"
              style={{
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: isActive ? 500 : 400,
                color: item.isLocked ? 'var(--color-text-tertiary)' : isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                gap: 8,
                background: isActive && !item.isLocked ? 'var(--color-bg-active)' : 'transparent',
                borderRadius: 0,
                opacity: item.isLocked ? 0.5 : 1,
                cursor: item.isLocked ? 'not-allowed' : 'pointer',
                transition: 'background 0.1s',
                textDecoration: 'none',
              }}
              onMouseEnter={(e) => { if (!isActive && !item.isLocked) e.currentTarget.style.background = 'var(--color-bg-hover)' }}
              onMouseLeave={(e) => { if (!isActive && !item.isLocked) e.currentTarget.style.background = 'transparent' }}
            >
              {isActive && !item.isLocked && (
                <span style={{ position: 'absolute', left: 0, top: 4, bottom: 4, width: 2.5, background: 'var(--color-brand-teal)', borderRadius: '0 2px 2px 0' }} />
              )}
              <Icon size={20} style={{ opacity: isActive ? 1 : 0.55, flexShrink: 0 }} />
              <span className="sidebar-expanded-only" style={{ display: 'none', flex: 1 }}>{t(item.labelKey)}</span>
              {item.isLocked && <Lock size={12} className="sidebar-expanded-only" style={{ display: 'none', color: 'var(--color-text-tertiary)' }} />}
            </Link>
          )
        })}
      </nav>

      {/* Locale */}
      <div className="sidebar-expanded-only" style={{ display: 'none', padding: '8px 14px', borderTop: '1px solid var(--color-border)' }}>
        <LocaleSwitcher />
      </div>

      {/* User footer */}
      <div className="flex items-center gap-2 sidebar-nav-item" style={{ padding: '10px 14px', borderTop: '1px solid var(--color-border)' }}>
        <button onClick={handleLogout} className="touch-target flex items-center justify-center" style={{ color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }} title="Sign out">
          <LogOut size={18} style={{ opacity: 0.55 }} />
        </button>
        <div className="sidebar-expanded-only flex-1 min-w-0" style={{ display: 'none' }}>
          <p className="truncate" style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{user.email}</p>
        </div>
      </div>
    </aside>
  )
}
