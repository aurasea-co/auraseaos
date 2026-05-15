'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import type { LucideIcon } from 'lucide-react'

export interface MobileNavItem {
  href: string
  icon: LucideIcon
  labelKey: string
}

interface MobileMoreDrawerProps {
  isOpen: boolean
  onClose: () => void
  tabs: MobileNavItem[]
  currentPath: string
}

export function MobileMoreDrawer({ isOpen, onClose, tabs, currentPath }: MobileMoreDrawerProps) {
  const t = useTranslations('nav')

  // Lock page scroll while the drawer is open — prevents background
  // content from panning underneath the sheet on iOS.
  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      className="md:hidden"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
      }}
      role="dialog"
      aria-modal="true"
    >
      {/* Overlay */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
        }}
      />

      {/* Sheet */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          background: 'var(--color-bg)',
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          borderTop: '1px solid var(--color-border)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          boxShadow: '0 -4px 24px rgba(0, 0, 0, 0.08)',
          animation: 'slideUp 180ms ease-out',
        }}
      >
        <style>{`
          @keyframes slideUp {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }
        `}</style>

        {/* Drag handle */}
        <div
          style={{
            width: 32,
            height: 4,
            background: 'var(--color-border)',
            borderRadius: 2,
            margin: '10px auto 16px',
          }}
        />

        {/* Items */}
        <nav>
          {tabs.map((tab, i) => {
            const isActive = currentPath === tab.href || currentPath.startsWith(tab.href + '/')
            const Icon = tab.icon
            return (
              <Link
                key={tab.href}
                href={tab.href}
                onClick={onClose}
                className="touch-target"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '0 20px',
                  height: 52,
                  textDecoration: 'none',
                  borderBottom: i < tabs.length - 1 ? '1px solid var(--color-border)' : 'none',
                  background: isActive ? 'var(--color-bg-surface)' : 'transparent',
                  color: 'var(--color-text-primary)',
                }}
              >
                <Icon
                  size={20}
                  strokeWidth={1.5}
                  style={{ color: isActive ? 'var(--color-brand-teal)' : 'var(--color-text-secondary)', flexShrink: 0 }}
                />
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: isActive ? 500 : 400,
                    color: isActive ? 'var(--color-brand-teal)' : 'var(--color-text-primary)',
                  }}
                >
                  {t(tab.labelKey)}
                </span>
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
