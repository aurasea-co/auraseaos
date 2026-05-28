export const PRICING = {
  accommodation: {
    starter: { monthly: 199, annual: 1990, annualMonthly: 166 },
    growth:  { monthly: 399, annual: 3990, annualMonthly: 333 },
    pro:     { monthly: 699, annual: 6990, annualMonthly: 583 },
  },
  fnb: {
    starter: { monthly: 199, annual: 1990, annualMonthly: 166 },
    growth:  { monthly: 399, annual: 3990, annualMonthly: 333 },
    pro:     { monthly: 699, annual: 6990, annualMonthly: 583 },
  },
  mixed: {
    pro: { monthly: 699, annual: 6990, annualMonthly: 583 },
  },
  // RateDesk (revenue management for hotels) and MenuDesk (operations
  // analytics for F&B) are paid add-ons. Each bundles Aurasea OS for
  // free — see /settings/billing for the in-app explainer. `base` is
  // the recurring add-on subscription; `autoPush` / `autoOrder` are
  // optional automation tiers layered on top.
  ratedesk: {
    base:     { monthly: 590, annual: 5900, annualMonthly: 492 },
    autoPush: { monthly: 290, annual: 2900, annualMonthly: 242 },
  },
  menudesk: {
    base:      { monthly: 390, annual: 3900, annualMonthly: 325 },
    autoOrder: { monthly: 190, annual: 1900, annualMonthly: 158 },
  },
} as const

export const SEAT_LIMITS = {
  starter: { managers: 1, staff: 2, branches: 1 },
  growth:  { managers: 2, staff: 5, branches: 3 },
  pro:     { managers: Infinity, staff: Infinity, branches: 5 },
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
