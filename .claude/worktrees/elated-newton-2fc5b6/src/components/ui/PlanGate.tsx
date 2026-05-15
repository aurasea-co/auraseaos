'use client'

import { Lock } from 'lucide-react'
import { useUser } from '@/providers/user-context'
import Link from 'next/link'
import { PLAN_LEVEL, PRICING, formatPrice } from '@/lib/config/pricing'
import type { BranchType } from '@/lib/config/pricing'

interface PlanGateProps {
  requiredPlan: 'growth' | 'pro'
  featureName: string
  children: React.ReactNode
  branchType?: BranchType
}

export function PlanGate({ requiredPlan, featureName, children, branchType }: PlanGateProps) {
  const { plan, activeBranch } = useUser()

  if (PLAN_LEVEL[plan] >= PLAN_LEVEL[requiredPlan]) {
    return <>{children}</>
  }

  const bt: BranchType = branchType || (activeBranch?.business_type === 'fnb' ? 'fnb' : 'accommodation')

  // Build upgrade text based on current plan and required plan
  let upgradeLabel: string
  if (requiredPlan === 'growth') {
    const price = PRICING[bt].growth.monthly
    upgradeLabel = `อัปเกรด Growth — ${formatPrice(price)}/เดือน`
  } else if (plan === 'starter') {
    // Starter user seeing Pro feature — show stepping stone
    const growthPrice = PRICING[bt].growth.monthly
    const proPrice = PRICING[bt].pro.monthly
    upgradeLabel = `เริ่มที่ Growth ${formatPrice(growthPrice)}/เดือน หรือ Pro ${formatPrice(proPrice)}/เดือน`
  } else {
    const price = PRICING[bt].pro.monthly
    upgradeLabel = `อัปเกรด Pro — ${formatPrice(price)}/เดือน`
  }

  const buttonLabel = requiredPlan === 'growth' ? 'ดูแพลน Growth →' : 'ดูแพลน Pro →'

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 opacity-75">
      <div className="flex items-center gap-2 mb-2">
        <Lock size={16} className="text-slate-400" />
        <span className="text-sm font-medium text-slate-600">{featureName}</span>
        <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium uppercase">
          {requiredPlan}+
        </span>
      </div>
      <p className="text-xs text-slate-500 mb-3 leading-body">
        {upgradeLabel}
      </p>
      <Link
        href="/settings/billing"
        className="text-xs text-blue-600 hover:text-blue-700 font-medium"
      >
        {buttonLabel}
      </Link>
    </div>
  )
}
