'use client'

import { createContext, useContext, useState, useCallback } from 'react'
import type { UserContext, Branch } from '@/lib/supabase/types'

interface UserContextValue extends UserContext {
  setActiveBranch: (branch: Branch) => void
}

const UserCtx = createContext<UserContextValue | null>(null)

export function UserProvider({
  children,
  initialContext,
}: {
  children: React.ReactNode
  initialContext: UserContext
}) {
  const [ctx, setCtx] = useState<UserContext>(initialContext)

  const setActiveBranch = useCallback((branch: Branch) => {
    setCtx((prev) => ({ ...prev, activeBranch: branch }))
  }, [])

  return (
    <UserCtx.Provider value={{ ...ctx, setActiveBranch }}>
      {children}
    </UserCtx.Provider>
  )
}

export function useUser() {
  const ctx = useContext(UserCtx)
  if (!ctx) throw new Error('useUser must be used within UserProvider')
  return ctx
}
