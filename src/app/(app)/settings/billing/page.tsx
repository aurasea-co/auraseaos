'use client'

import { useTranslations, useLocale } from 'next-intl'
import { useUser } from '@/providers/user-context'
import { formatDate } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { ArrowLeft, Crown, Check } from 'lucide-react'
import Link from 'next/link'
import { PRICING, SEAT_LIMITS, formatPrice } from '@/lib/config/pricing'
import type { Plan, BranchType } from '@/lib/config/pricing'

export default function BillingPage() {
  const { organization, branches, plan, activeBranch } = useUser()
  const t = useTranslations('settingsBilling')
  const locale = useLocale()

  if (!organization) return null

  const bt: BranchType = activeBranch?.business_type === 'fnb' ? 'fnb' : 'accommodation'
  const pricing = PRICING[bt]
  const featureNs = bt === 'fnb' ? 'featuresFnb' : 'featuresAccommodation'

  const planBranchLimits = { starter: SEAT_LIMITS.starter.branches, growth: SEAT_LIMITS.growth.branches, pro: SEAT_LIMITS.pro.branches }
  const trialDaysLeft = organization.plan_expires_at
    ? Math.max(0, Math.ceil((new Date(organization.plan_expires_at).getTime() - Date.now()) / 86400000))
    : null

  const plans: Plan[] = ['starter', 'growth', 'pro']
  const planLabel = (p: Plan) => p.charAt(0).toUpperCase() + p.slice(1)

  const upgradeTarget = plan === 'starter' ? 'growth' : 'pro'
  const upgradeSubjectKey = upgradeTarget === 'growth' ? 'contactEmailSubjectGrowth' : 'contactEmailSubjectPro'

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 lg:hidden mb-2">
        <Link href="/settings" className="p-1 text-slate-400 hover:text-slate-600 touch-target">
          <ArrowLeft size={20} />
        </Link>
        <h2 className="text-lg font-medium text-slate-900 leading-heading">{t('title')}</h2>
      </div>
      <h2 className="text-lg font-medium text-slate-900 leading-heading hidden lg:block">{t('title')}</h2>

      {/* Current plan status */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Crown size={18} className="text-amber-500" />
            <span className="text-lg font-medium text-slate-900">
              {t('planDisplayFormat', { plan: planLabel(plan) })}
            </span>
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 500, padding: '2px 10px', borderRadius: 'var(--radius-pill)', background: 'var(--color-green-light)', color: 'var(--color-green-text)' }}>
            {t('statusActive')}
          </span>
        </div>

        {trialDaysLeft !== null && trialDaysLeft > 0 && (
          <div style={{ marginBottom: 12, padding: '6px 14px', background: 'var(--color-accent-light)', color: 'var(--color-accent-text)', fontSize: 'var(--font-size-sm)', borderRadius: 'var(--radius-md)' }}>
            {t('trialRemaining', { days: trialDaysLeft })}
          </div>
        )}

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">{t('price')}</span>
            <span className="font-medium">{formatPrice(pricing[plan].monthly)}{t('perMonth')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">{t('branches')}</span>
            <span className="font-medium">{branches.length}/{planBranchLimits[plan]}</span>
          </div>
          {organization.plan_expires_at && (
            <div className="flex justify-between">
              <span className="text-slate-500">{t('expiresAt')}</span>
              <span className="font-medium">{formatDate(organization.plan_expires_at, locale)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Plan comparison cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {plans.map((p) => {
          const isCurrent = plan === p
          const isPopular = p === 'growth'
          const features = t.raw(`${featureNs}.${p}`) as string[]
          return (
            <div
              key={p}
              style={{
                background: 'var(--color-bg)',
                border: isCurrent ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                padding: 16,
                position: 'relative',
              }}
            >
              {isPopular && (
                <span style={{ position: 'absolute', top: -10, right: 12, fontSize: 10, fontWeight: 600, padding: '2px 10px', borderRadius: 'var(--radius-pill)', background: 'var(--color-accent)', color: 'white' }}>
                  {t('mostPopular')}
                </span>
              )}
              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                  {planLabel(p)}
                </span>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {formatPrice(pricing[p].monthly)}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{t('perMonth')}</span>
                </div>
              </div>
              <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>
                {t('annualSavingLine', { annualPrice: formatPrice(pricing[p].annual) })}
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {features.map((f, i) => (
                  <li key={i} className="flex items-start gap-1.5" style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 3 }}>
                    <Check size={12} style={{ color: 'var(--color-positive)', marginTop: 2, flexShrink: 0 }} />
                    {f}
                  </li>
                ))}
              </ul>
              {isCurrent && (
                <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-accent)', marginTop: 8 }}>{t('currentPlan')}</p>
              )}
            </div>
          )
        })}
      </div>

      {/* Mixed portfolio note */}
      <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '12px 16px' }}>
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
          {t('mixedHeadline')} <strong>{t('mixedLabel')} {t('mixedPriceNote', { price: formatPrice(PRICING.mixed.pro.monthly) })}</strong>
        </p>
      </div>

      {/* Upgrade CTA */}
      {plan !== 'pro' && (
        <div style={{ background: 'var(--color-accent-light)', borderRadius: 'var(--radius-lg)', padding: 16 }}>
          <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 4 }}>{t('upgradeTitle')}</h3>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: 12 }}>{t('upgradeDescription')}</p>
          <a
            href={`mailto:hello@auraseaos.com?subject=${encodeURIComponent(`${t(upgradeSubjectKey)} — ${organization.name}`)}`}
            style={{ textDecoration: 'none' }}
          >
            <Button variant="primary" size="sm">{t('contactTeam')}</Button>
          </a>
          <p style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 8 }}>
            {t('contactDetail')}
          </p>
        </div>
      )}
    </div>
  )
}
