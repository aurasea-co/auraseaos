export const PRICING = {
  accommodation: {
    starter: { monthly: 390, annual: 3900, annualMonthly: 325 },
    growth:  { monthly: 790, annual: 7900, annualMonthly: 658 },
    pro:     { monthly: 1490, annual: 14900, annualMonthly: 1242 },
  },
  fnb: {
    starter: { monthly: 290, annual: 2900, annualMonthly: 242 },
    growth:  { monthly: 490, annual: 4900, annualMonthly: 408 },
    pro:     { monthly: 790, annual: 7900, annualMonthly: 658 },
  },
  mixed: {
    pro: { monthly: 1990, annual: 19900, annualMonthly: 1658 },
  },
} as const

export const SEAT_LIMITS = {
  starter: { managers: 1, staff: 2, branches: 1 },
  growth:  { managers: 2, staff: 5, branches: 2 },
  pro:     { managers: Infinity, staff: Infinity, branches: 3 },
} as const

export const PLAN_LEVEL = { starter: 0, growth: 1, pro: 2 } as const

export type Plan = 'starter' | 'growth' | 'pro'
export type BranchType = 'accommodation' | 'fnb'

export function getPrice(
  branchType: BranchType,
  plan: Plan,
  billing: 'monthly' | 'annual' = 'monthly'
): number {
  if (billing === 'annual') {
    return PRICING[branchType][plan].annual
  }
  return PRICING[branchType][plan].monthly
}

export function formatPrice(amount: number): string {
  return '฿' + amount.toLocaleString('th-TH')
}

export function getUpgradeText(
  targetPlan: 'growth' | 'pro',
  branchType: BranchType
): string {
  const price = PRICING[branchType][targetPlan].monthly
  const planLabel = targetPlan === 'growth' ? 'Growth' : 'Pro'
  return `${planLabel} ${formatPrice(price)}/เดือน`
}
