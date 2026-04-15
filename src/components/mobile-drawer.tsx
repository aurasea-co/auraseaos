'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Home, PenLine, Settings, X, LogOut } from 'lucide-react'
import { useUser } from '@/providers/user-context'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { LocaleSwitcher } from './locale-switcher'
import { BranchSwitcher } from './branch-switcher'
import { AuraSeaLogo } from './aurasea-logo'

const navItems = [
  { href: '/home', icon: Home, labelKey: 'home' as const },
  { href: '/entry', icon: PenLine, labelKey: 'entry' as const },
  { href: '/settings', icon: Settings, labelKey: 'settings' as const },
]

export function MobileDrawer({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const pathname = usePathname()
  const { role, organization, user } = useUser()
  const t = useTranslations('nav')
  const tRoles = useTranslations('roles')
  const router = useRouter()
  const supabase = createClient()

  // Close on route change
  useEffect(() => {
    onClose()
  }, [pathname, onClose])

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  const visibleItems = navItems.filter((item) => {
    if (role === 'staff') return item.href === '/entry'
    if (role === 'manager') return item.href !== '/settings'
    return true
  })

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  if (!open) return null

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 drawer-overlay md:hidden"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-xl md:hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div>
            <AuraSeaLogo variant="light" size={26} />
            <p className="text-xs text-slate-400 mt-1">{organization?.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 touch-target"
          >
            <X size={20} />
          </button>
        </div>

        {/* Branch Switcher */}
        <div className="px-4 py-3 border-b border-slate-100">
          <BranchSwitcher />
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2">
          {visibleItems.map((item) => {
            const isActive = pathname === item.href
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 mx-2 rounded-lg transition-colors touch-target ${
                  isActive
                    ? 'bg-brand-teal-mist text-brand-teal'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Icon size={20} />
                <span className="text-sm font-medium">{t(item.labelKey)}</span>
              </Link>
            )
          })}
        </nav>

        {/* Locale */}
        <div className="px-4 py-3 border-t border-slate-100">
          <LocaleSwitcher />
        </div>

        {/* User */}
        <div className="p-4 border-t border-slate-100">
          <p className="text-xs text-slate-500 truncate">{user.email}</p>
          <p className="text-[10px] text-slate-400 mb-2">{tRoles(role)}</p>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-600 touch-target"
          >
            <LogOut size={16} />
            <span className="text-xs">Sign out</span>
          </button>
        </div>
      </div>
    </>
  )
}
