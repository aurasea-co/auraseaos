'use client'

import { useUser } from '@/providers/user-context'
import type { AppRole } from '@/lib/supabase/types'

interface RoleGateProps {
  allowedRoles: AppRole[]
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function RoleGate({ allowedRoles, children, fallback = null }: RoleGateProps) {
  const { role } = useUser()

  if (allowedRoles.includes(role)) {
    return <>{children}</>
  }

  return <>{fallback}</>
}
