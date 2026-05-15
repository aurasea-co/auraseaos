'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useUser } from '@/providers/user-context'
import {
  User,
  Bell,
  Building2,
  MapPin,
  Target,
  Users,
  CreditCard,
  Download,
  ChevronRight,
} from 'lucide-react'

const allSections = [
  { href: '/settings/profile', icon: User, labelKey: 'profile' as const, roles: ['owner', 'manager', 'staff', 'superadmin'] },
  { href: '/settings/notifications', icon: Bell, labelKey: 'notifications' as const, roles: ['owner', 'manager'] },
  { href: '/settings/company', icon: Building2, labelKey: 'company' as const, roles: ['owner'] },
  { href: '/settings/branches', icon: MapPin, labelKey: 'branches' as const, roles: ['owner'] },
  { href: '/settings/targets', icon: Target, labelKey: 'targets' as const, roles: ['owner'] },
  { href: '/settings/team', icon: Users, labelKey: 'team' as const, roles: ['owner'] },
  { href: '/settings/billing', icon: CreditCard, labelKey: 'billing' as const, roles: ['owner'] },
  { href: '/settings/export', icon: Download, labelKey: 'exportData' as const, roles: ['owner'] },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { role } = useUser()
  const t = useTranslations('settingsNav')

  const sections = allSections.filter((s) => s.roles.includes(role))
  const isSubPage = pathname !== '/settings'

  return (
    <div className="flex gap-0">
      {/* Desktop sub-nav — Notion-style secondary sidebar */}
      {isSubPage && (
        <nav
          className="hidden lg:block flex-shrink-0"
          style={{
            width: 200,
            background: 'var(--color-bg-surface)',
            borderRight: '1px solid var(--color-border)',
            marginLeft: -24, /* pull into page padding */
            marginTop: -24,
            marginBottom: -24,
            paddingTop: 14,
            minHeight: 'calc(100vh - var(--topbar-height))',
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 500,
              color: 'var(--color-text-tertiary)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase' as const,
              padding: '0 14px 8px',
            }}
          >
            {t('title')}
          </div>
          {sections.map((section) => {
            const isActive = pathname === section.href
            const Icon = section.icon
            return (
              <Link
                key={section.href}
                href={section.href}
                className="relative flex items-center touch-target"
                style={{
                  padding: '6px 14px',
                  fontSize: 13,
                  fontWeight: isActive ? 500 : 400,
                  color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  gap: 8,
                  background: isActive ? 'var(--color-bg-active)' : 'transparent',
                  borderRadius: 0,
                  textDecoration: 'none',
                  transition: 'background 0.1s',
                }}
              >
                {isActive && (
                  <span style={{ position: 'absolute', left: 0, top: 4, bottom: 4, width: 2.5, background: 'var(--color-accent)', borderRadius: '0 2px 2px 0' }} />
                )}
                <Icon size={15} style={{ opacity: isActive ? 1 : 0.55, flexShrink: 0 }} />
                <span>{t(section.labelKey)}</span>
              </Link>
            )
          })}
        </nav>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0" style={isSubPage ? { paddingLeft: 24 } : undefined}>
        {/* Mobile: show section list when at /settings root */}
        {!isSubPage && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 12 }}>
              {t('title')}
            </h2>
            {sections.map((section) => {
              const Icon = section.icon
              return (
                <Link
                  key={section.href}
                  href={section.href}
                  className="flex items-center justify-between touch-target"
                  style={{
                    padding: '10px 14px',
                    background: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-lg)',
                    textDecoration: 'none',
                    transition: 'background 0.1s',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <Icon size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                    <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                      {t(section.labelKey)}
                    </span>
                  </div>
                  <ChevronRight size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                </Link>
              )
            })}
          </div>
        )}

        {isSubPage && children}
      </div>
    </div>
  )
}
