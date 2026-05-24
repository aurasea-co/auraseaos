'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useUser } from '@/providers/user-context'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { ArrowLeft, Crown, Check, ChevronDown, X } from 'lucide-react'
import Link from 'next/link'
import { PRICING, SEAT_LIMITS, formatPrice } from '@/lib/config/pricing'
import type { Plan, BranchType } from '@/lib/config/pricing'

// Phase 1 billing page — covers everything we can do without a payment
// processor: shows current plan, trial progress, monthly/annual price
// comparison, and a guided upgrade flow that drops the user into LINE
// or email pre-filled with their org details. The actual payment is
// handled by the Aurasea team manually for now.
//
// PHASE 2 placeholder (see bottom of file): when Omise contract is
// signed, replace the LINE/email contact step with the credit-card
// form + automatic plan activation.

// LINE OA shortlink — same one the LINE webhook uses for inbound
// invitations. Lives here as a constant so the upgrade modal can deep-link.
const LINE_CONTACT_URL = 'https://line.me/R/ti/p/@270cokmy'

interface TrialInfo {
  status: 'trial' | 'active' | 'expired' | 'cancelled' | string
  trialEndsAt: string | null
  trialDays: number
  discountPct: number
}

export default function BillingPage() {
  const { user, organization, branches, plan, activeBranch } = useUser()
  const t = useTranslations('settingsBilling')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const supabase = createClient()

  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly')
  const [upgradeTargetPlan, setUpgradeTargetPlan] = useState<Plan | null>(null)
  const [expandedFaqs, setExpandedFaqs] = useState<Set<string>>(new Set())
  const [trialInfo, setTrialInfo] = useState<TrialInfo | null>(null)

  // Fetch trial fields from organizations (added in migration 025).
  // UserContext doesn't carry these yet so we do a small extra read.
  useEffect(() => {
    if (!organization) return
    let cancelled = false
    async function load() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any
      const { data } = await db
        .from('organizations')
        .select('status, trial_ends_at, trial_days, discount_pct')
        .eq('id', organization!.id)
        .maybeSingle()
      if (cancelled || !data) return
      setTrialInfo({
        status: data.status || 'active',
        trialEndsAt: data.trial_ends_at,
        trialDays: data.trial_days || 30,
        discountPct: data.discount_pct || 0,
      })
    }
    load()
    return () => { cancelled = true }
  }, [organization, supabase])

  // Derived trial numbers — clamped to non-negative.
  const trialNumbers = useMemo(() => {
    if (!trialInfo?.trialEndsAt || trialInfo.status !== 'trial') return null
    const endTs = new Date(trialInfo.trialEndsAt).getTime()
    const msRemaining = endTs - Date.now()
    const daysRemaining = Math.max(0, Math.ceil(msRemaining / 86400000))
    const daysUsed = Math.max(0, Math.min(trialInfo.trialDays, trialInfo.trialDays - daysRemaining))
    return { daysRemaining, daysUsed, total: trialInfo.trialDays }
  }, [trialInfo])

  if (!organization) return null

  const bt: BranchType = activeBranch?.business_type === 'fnb' ? 'fnb' : 'accommodation'
  const pricing = PRICING[bt]
  const featureNs = bt === 'fnb' ? 'featuresFnb' : 'featuresAccommodation'

  const planBranchLimits = {
    starter: SEAT_LIMITS.starter.branches,
    growth: SEAT_LIMITS.growth.branches,
    pro: SEAT_LIMITS.pro.branches,
  }

  const plans: Plan[] = ['starter', 'growth', 'pro']
  const planLabel = (p: Plan) => p.charAt(0).toUpperCase() + p.slice(1)
  const planLevel: Record<Plan, number> = { starter: 0, growth: 1, pro: 2 }
  const recommendedUpgrade: Plan | null =
    plan === 'starter' ? 'growth' : plan === 'growth' ? 'pro' : null

  const priceFor = (p: Plan) =>
    billingCycle === 'annual' ? pricing[p].annual : pricing[p].monthly

  const showTrialEndingBanner =
    trialInfo?.status === 'trial' &&
    trialNumbers !== null &&
    trialNumbers.daysRemaining <= 10

  // 7-day discount window after trial ends. Used by the urgent banner +
  // discount-available copy when the owner is in the renew zone.
  const discountDeadlineIso = trialInfo?.trialEndsAt
    ? new Date(new Date(trialInfo.trialEndsAt).getTime() + 7 * 86400000).toISOString()
    : null

  function buildEmailHref(targetPlan: Plan): string {
    const subjectKey = targetPlan === 'growth' ? 'contactEmailSubjectGrowth' : 'contactEmailSubjectPro'
    const subject = `${t(subjectKey)} — ${organization!.name}`
    const body = t('emailBodyTemplate', {
      targetPlan: planLabel(targetPlan),
      org: organization!.name,
      email: user.email,
      currentPlan: planLabel(plan),
    })
    return `mailto:hello@auraseaos.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  function toggleFaq(id: string) {
    setExpandedFaqs((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const upgradePriceMonthly = upgradeTargetPlan ? pricing[upgradeTargetPlan].monthly : 0
  const discountedFirstMonth =
    upgradePriceMonthly && trialInfo?.discountPct
      ? Math.round(upgradePriceMonthly * (1 - trialInfo.discountPct / 100))
      : null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 lg:hidden mb-2">
        <Link href="/settings" className="p-1 text-slate-400 hover:text-slate-600 touch-target">
          <ArrowLeft size={20} />
        </Link>
        <h2 className="text-lg font-medium text-slate-900 leading-heading">{t('title')}</h2>
      </div>
      <h2 className="text-lg font-medium text-slate-900 leading-heading hidden lg:block">{t('title')}</h2>

      {/* Trial-ending-soon banner (urgent path only) */}
      {showTrialEndingBanner && trialNumbers && (
        <div
          role="status"
          style={{
            background: 'var(--color-amber-light, #FFF4E0)',
            border: '1px solid var(--color-amber-border, #FCD9A0)',
            color: 'var(--color-amber-text, #8A5A00)',
            borderRadius: 'var(--radius-lg)',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <strong style={{ fontSize: 14 }}>
              {trialNumbers.daysRemaining === 0
                ? `⚠️ ${t('trialEndsToday')}`
                : `⚠️ ${t('trialEndingSoon', { days: trialNumbers.daysRemaining })}`}
            </strong>
            {recommendedUpgrade && (
              <button
                type="button"
                onClick={() => setUpgradeTargetPlan(recommendedUpgrade)}
                style={{
                  background: 'var(--color-amber-text, #8A5A00)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {t('renewNow')} →
              </button>
            )}
          </div>
          {trialInfo!.discountPct > 0 && discountDeadlineIso && (
            <p style={{ fontSize: 12, margin: 0, lineHeight: 1.45 }}>
              {t('discountAvailable', {
                pct: trialInfo!.discountPct,
                date: formatDate(discountDeadlineIso, locale),
              })}
            </p>
          )}
        </div>
      )}

      {/* Current plan card */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Crown size={18} className="text-amber-500" />
            <span className="text-lg font-medium text-slate-900">
              {t('planDisplayFormat', { plan: planLabel(plan) })}
            </span>
          </div>
          <span style={{
            fontSize: 'var(--font-size-xs)',
            fontWeight: 500,
            padding: '2px 10px',
            borderRadius: 'var(--radius-pill)',
            background: trialInfo?.status === 'trial' ? 'var(--color-amber-light)' : 'var(--color-green-light)',
            color: trialInfo?.status === 'trial' ? 'var(--color-amber-text)' : 'var(--color-green-text)',
          }}>
            {trialInfo?.status === 'trial' ? t('statusTrial') : t('statusActive')}
          </span>
        </div>

        {/* Trial progress bar */}
        {trialInfo?.status === 'trial' && trialNumbers && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>
              <span>{t('trialProgressLabel', { used: trialNumbers.daysUsed, total: trialNumbers.total })}</span>
              {trialInfo.trialEndsAt && (
                <span>{t('trialEndsOn', { date: formatDate(trialInfo.trialEndsAt, locale) })}</span>
              )}
            </div>
            <div style={{ width: '100%', height: 6, background: '#f0f0ee', borderRadius: 999, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${trialNumbers.total > 0 ? Math.round((trialNumbers.daysUsed / trialNumbers.total) * 100) : 0}%`,
                  height: '100%',
                  background: trialNumbers.daysRemaining <= 5 ? 'var(--color-amber-text, #D97706)' : 'var(--color-accent, #534AB7)',
                  transition: 'width 280ms ease',
                }}
              />
            </div>
          </div>
        )}

        {trialInfo && trialInfo.discountPct > 0 && (
          <div style={{
            marginBottom: 12,
            padding: '6px 12px',
            background: 'var(--color-amber-light, #FFF4E0)',
            color: 'var(--color-amber-text, #8A5A00)',
            fontSize: 'var(--font-size-sm)',
            borderRadius: 'var(--radius-md)',
            display: 'inline-block',
            fontWeight: 500,
          }}>
            💎 {t('discountBadge', { pct: trialInfo.discountPct })}
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
        </div>
      </div>

      {/* Monthly / Annual toggle */}
      <div style={{
        display: 'inline-flex',
        background: 'var(--color-bg-surface, #f4f4f2)',
        borderRadius: 999,
        padding: 3,
        gap: 2,
        alignSelf: 'flex-start',
      }}>
        {(['monthly', 'annual'] as const).map((cycle) => {
          const active = billingCycle === cycle
          return (
            <button
              key={cycle}
              type="button"
              onClick={() => setBillingCycle(cycle)}
              style={{
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                padding: '6px 14px',
                borderRadius: 999,
                border: 'none',
                background: active ? '#ffffff' : 'transparent',
                color: active ? '#1a1a1a' : '#6b6b6b',
                cursor: 'pointer',
                boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {cycle === 'monthly' ? t('monthlyToggle') : t('annualToggle')}
              {cycle === 'annual' && (
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  background: 'var(--color-green-light, #E6F4EE)',
                  color: 'var(--color-green-text, #0F5132)',
                  padding: '1px 6px',
                  borderRadius: 999,
                }}>
                  {t('annualSaving')}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Plan comparison cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {plans.map((p) => {
          const isCurrent = plan === p
          const isRecommended = recommendedUpgrade === p
          const features = t.raw(`${featureNs}.${p}`) as string[]
          const isDowngrade = planLevel[p] < planLevel[plan]
          const borderColor = isCurrent
            ? 'var(--color-accent)'
            : isRecommended
              ? 'var(--color-accent)'
              : 'var(--color-border)'

          return (
            <div
              key={p}
              style={{
                background: 'var(--color-bg)',
                border: (isCurrent || isRecommended) ? `2px solid ${borderColor}` : `1px solid ${borderColor}`,
                borderRadius: 'var(--radius-lg)',
                padding: 16,
                position: 'relative',
              }}
            >
              {isCurrent && (
                <span style={{
                  position: 'absolute',
                  top: -10,
                  right: 12,
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '2px 10px',
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--color-green-light, #E6F4EE)',
                  color: 'var(--color-green-text, #0F5132)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}>
                  <Check size={10} /> {t('currentPlanBadge')}
                </span>
              )}
              {!isCurrent && isRecommended && (
                <span style={{
                  position: 'absolute',
                  top: -10,
                  right: 12,
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '2px 10px',
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--color-accent)',
                  color: 'white',
                }}>
                  {t('mostPopular')}
                </span>
              )}

              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                  {planLabel(p)}
                </span>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {formatPrice(priceFor(p))}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                    {billingCycle === 'annual' ? t('perYear') : t('perMonth')}
                  </span>
                </div>
              </div>
              {billingCycle === 'annual' && (
                <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>
                  {t('annualSavingLine', { annualPrice: formatPrice(pricing[p].annual) })}
                </p>
              )}

              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 10px' }}>
                {features.map((f, i) => (
                  <li key={i} className="flex items-start gap-1.5" style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 3 }}>
                    <Check size={12} style={{ color: 'var(--color-positive)', marginTop: 2, flexShrink: 0 }} />
                    {f}
                  </li>
                ))}
              </ul>

              {!isCurrent && !isDowngrade && (
                <Button variant="primary" size="sm" fullWidth onClick={() => setUpgradeTargetPlan(p)}>
                  {t('upgradeCta', { plan: planLabel(p) })}
                </Button>
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

      {/* FAQ */}
      <section style={{
        background: '#ffffff',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        marginTop: 4,
      }}>
        <h3 style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          margin: 0,
          padding: '12px 16px',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-bg-surface)',
        }}>
          {t('faqTitle')}
        </h3>
        {(['payment', 'cancel', 'data', 'annual'] as const).map((key, i) => {
          const expanded = expandedFaqs.has(key)
          return (
            <div key={key} style={{ borderTop: i > 0 ? '1px solid var(--color-border)' : 'none' }}>
              <button
                type="button"
                onClick={() => toggleFaq(key)}
                aria-expanded={expanded}
                className="touch-target"
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  padding: '12px 16px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 48,
                }}
              >
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                  {t(`faq.${key}_q`)}
                </span>
                <ChevronDown
                  size={16}
                  style={{
                    color: '#9b9b9b',
                    transition: 'transform 200ms ease',
                    transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}
                />
              </button>
              <div
                style={{
                  display: 'grid',
                  gridTemplateRows: expanded ? '1fr' : '0fr',
                  transition: 'grid-template-rows 200ms ease',
                }}
              >
                <div style={{ overflow: 'hidden' }}>
                  <p style={{
                    fontSize: 13,
                    color: 'var(--color-text-secondary)',
                    lineHeight: 1.6,
                    margin: 0,
                    padding: '0 16px 14px',
                  }}>
                    {t(`faq.${key}_a`)}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </section>

      {/* Credit-card placeholder — Phase 2 (Omise) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 12,
        color: 'var(--color-text-tertiary)',
        padding: '8px 12px',
        background: 'var(--color-bg-surface)',
        border: '1px dashed var(--color-border)',
        borderRadius: 'var(--radius-md)',
      }}>
        <span style={{ opacity: 0.6 }}>💳</span>
        <span>{t('creditCardComingSoon')}</span>
      </div>

      {/* Upgrade confirmation modal */}
      {upgradeTargetPlan && (
        <UpgradeModal
          targetPlan={upgradeTargetPlan}
          targetPlanLabel={planLabel(upgradeTargetPlan)}
          priceMonthly={upgradePriceMonthly}
          discountPct={trialInfo?.discountPct || 0}
          discountedFirstMonth={discountedFirstMonth}
          lineUrl={LINE_CONTACT_URL}
          emailHref={buildEmailHref(upgradeTargetPlan)}
          onClose={() => setUpgradeTargetPlan(null)}
          t={t}
          tCommon={tCommon}
        />
      )}

      {/*
        PHASE 2: Omise payment integration
        When Omise contract is signed, replace the LINE/email CTA inside
        UpgradeModal with:
          - Credit card input form using Omise.js
          - Automatic plan activation after successful payment
          - Invoice generation and email
          - Subscription management (cancel, change plan)
        Until then the modal routes users to LINE / email so the Aurasea
        team can finalize payment manually.
      */}
    </div>
  )
}

function UpgradeModal({
  targetPlan,
  targetPlanLabel,
  priceMonthly,
  discountPct,
  discountedFirstMonth,
  lineUrl,
  emailHref,
  onClose,
  t,
  tCommon,
}: {
  targetPlan: Plan
  targetPlanLabel: string
  priceMonthly: number
  discountPct: number
  discountedFirstMonth: number | null
  lineUrl: string
  emailHref: string
  onClose: () => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tCommon: any
}) {
  // Suppress the unused-param warning while keeping the prop available
  // for future use (e.g. plan-specific copy when Omise lands).
  void targetPlan
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#ffffff',
          borderRadius: 12,
          padding: 24,
          maxWidth: 440,
          width: '100%',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>
            {t('upgradeModalTitle')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('cancel')}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 4,
              cursor: 'pointer',
              color: '#9b9b9b',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ background: '#f7f7f5', borderRadius: 8, padding: '12px 14px', fontSize: 13, lineHeight: 1.7, color: '#1a1a1a', marginBottom: 14 }}>
          <div>
            {t('upgradeModalPlan')}: <strong>{targetPlanLabel}</strong>
          </div>
          <div>
            {t('upgradeModalPrice')}: <strong>{formatPrice(priceMonthly)}{t('perMonth')}</strong>
          </div>
          {discountPct > 0 && discountedFirstMonth !== null && (
            <div style={{ marginTop: 6, color: 'var(--color-amber-text, #8A5A00)' }}>
              {t('upgradeModalDiscountedPrice', { pct: discountPct, price: formatPrice(discountedFirstMonth) })}
            </div>
          )}
        </div>

        <p style={{ fontSize: 12, color: '#6b6b6b', lineHeight: 1.55, margin: '0 0 16px' }}>
          {t('upgradeModalPaymentNote')}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <a
            href={lineUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '11px 12px',
              background: '#06C755',
              color: '#fff',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              minHeight: 44,
              boxSizing: 'border-box',
            }}
          >
            {t('contactViaLine')} →
          </a>
          <a
            href={emailHref}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '11px 12px',
              background: '#ffffff',
              color: '#534AB7',
              border: '1px solid #534AB7',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              minHeight: 44,
              boxSizing: 'border-box',
            }}
          >
            {t('contactViaEmail')} →
          </a>
        </div>

        <p style={{ fontSize: 11, color: '#9b9b9b', textAlign: 'center', margin: '12px 0 0' }}>
          {t('teamWillContact')}
        </p>

        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: 14,
            width: '100%',
            padding: '10px 12px',
            background: 'transparent',
            color: '#6b6b6b',
            border: '1px solid #d4d4d4',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            minHeight: 44,
          }}
        >
          {tCommon('cancel')}
        </button>
      </div>
    </div>
  )
}
