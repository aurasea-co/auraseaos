'use client'

// RateDesk section shell — a slim segment bar above the dashboard and
// the Competitor rates page so the two live under one roof and the
// owner can flip between them in a single click. Competitor rates used
// to sit in Settings (Settings → Competitor rates, two clicks); moving
// it here makes the daily 2-minute rate check reachable straight from
// the RateDesk nav item.
//
// Tabs are filtered through canAccessRateDesk so the bar mirrors the
// per-page guards (staff have no RateDesk surface and are redirected by
// the pages themselves; managers see both tabs). When the active branch
// is F&B the pages render their own "hotel only" notice — the bar is
// harmless there, but we still hide it to avoid implying RateDesk is a
// surface for that branch.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useUser } from '@/providers/user-context'
import {
  canAccessRateDesk,
  type RateDeskRole,
  type RateDeskPage,
} from '@/lib/auth/ratedesk-permissions'

const TABS: { href: string; labelKey: 'tabDashboard' | 'tabCompetitors'; page: RateDeskPage }[] = [
  { href: '/ratedesk', labelKey: 'tabDashboard', page: 'ratedesk_dashboard' },
  { href: '/ratedesk/competitors', labelKey: 'tabCompetitors', page: 'ratedesk_competitors' },
]

export default function RateDeskLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { role, activeBranch } = useUser()
  const t = useTranslations('ratedesk')

  const tabs = TABS.filter((tab) => canAccessRateDesk(role as RateDeskRole, tab.page))
  // Only an accommodation branch gets the section chrome; the pages
  // themselves still render a "hotel only" notice for direct hits.
  const showTabs = tabs.length > 1 && activeBranch?.business_type === 'accommodation'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {showTabs && (
        <nav
          style={{
            display: 'flex',
            gap: 4,
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          {tabs.map((tab) => {
            const isActive = pathname === tab.href
            return (
              <Link
                key={tab.href}
                href={tab.href}
                style={{
                  position: 'relative',
                  padding: '8px 4px',
                  marginRight: 16,
                  fontSize: 14,
                  fontWeight: isActive ? 500 : 400,
                  color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  textDecoration: 'none',
                  transition: 'color 0.1s',
                }}
              >
                {t(tab.labelKey)}
                {isActive && (
                  <span
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: -1,
                      height: 2,
                      background: 'var(--color-accent)',
                      borderRadius: '2px 2px 0 0',
                    }}
                  />
                )}
              </Link>
            )
          })}
        </nav>
      )}
      {children}
    </div>
  )
}
