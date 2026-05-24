'use client'

import Link from 'next/link'
import { X, Check } from 'lucide-react'
import { useTranslations } from 'next-intl'

// Shared visual shell for the role-specific Getting Started cards.
// Each step is { title, body, ctaLabel?, ctaHref?, done }. Completed
// steps collapse to a single line with a Done badge to reduce
// clutter; pending steps render in full with a small CTA button.
// Top border accent + filled CTA button = "this is an action card",
// distinct from the rest of the page chrome.

export interface OnboardingStep {
  title: string
  body: string
  ctaLabel?: string
  ctaHref?: string
  done: boolean
}

const TEAL = '#1D9E75'
const TEAL_DARK = '#0F5132'
const PURPLE = '#534AB7'
const MUTED = '#9b9b9b'

export function GettingStartedCard({
  title,
  subtitle,
  steps,
  onDismiss,
  showBadge = true,
}: {
  title: string
  subtitle?: string
  steps: OnboardingStep[]
  onDismiss: () => void
  showBadge?: boolean
}) {
  const t = useTranslations('onboarding')
  const total = steps.length
  const done = steps.filter((s) => s.done).length
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <section
      style={{
        background: '#ffffff',
        border: '1px solid var(--color-border, #e5e5e5)',
        borderTop: `3px solid ${TEAL}`,
        borderRadius: 10,
        padding: '16px 18px',
        marginBottom: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a', margin: 0, letterSpacing: '-0.01em' }}>
              {title}
            </h2>
            {showBadge && (
              <span style={{
                fontSize: 11,
                fontWeight: 500,
                padding: '1px 8px',
                borderRadius: 999,
                background: 'var(--color-accent-light, #EEEBFF)',
                color: 'var(--color-accent-text, #534AB7)',
              }}>
                {t('stepsCount', { n: total })}
              </span>
            )}
          </div>
          {subtitle && (
            <p style={{ fontSize: 13, color: '#6b6b6b', margin: '4px 0 0', lineHeight: 1.5 }}>
              {subtitle}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label={t('dismiss')}
          onClick={onDismiss}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 4,
            cursor: 'pointer',
            color: MUTED,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Progress */}
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>
          {t('progressLabelPct', { done, total, pct: progressPct })}
        </div>
        <div style={{ width: '100%', height: 4, background: '#f0f0ee', borderRadius: 999, overflow: 'hidden' }}>
          <div
            style={{
              width: `${progressPct}%`,
              height: '100%',
              background: TEAL,
              transition: 'width 280ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        </div>
      </div>

      {/* Steps */}
      <ol style={{ listStyle: 'none', padding: 0, margin: '16px 0 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {steps.map((step, idx) => (
          <li
            key={idx}
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
              // Slightly fade completed rows; the title remains readable
              // but they recede so the eye lands on the next action.
              opacity: step.done ? 0.6 : 1,
              transition: 'opacity 220ms ease',
            }}
          >
            <div
              aria-hidden
              style={{
                flexShrink: 0,
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: step.done ? TEAL : '#f0f0ee',
                color: step.done ? '#ffffff' : '#6b6b6b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 600,
                transition: 'background 220ms ease',
              }}
            >
              {step.done ? <Check size={14} /> : idx + 1}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: step.done ? MUTED : '#1a1a1a',
                  textDecoration: step.done ? 'line-through' : 'none',
                  lineHeight: 1.4,
                }}>
                  {step.title}
                </span>
                {step.done && (
                  <span style={{
                    fontSize: 10,
                    fontWeight: 500,
                    padding: '1px 8px',
                    borderRadius: 999,
                    background: 'var(--color-green-light, #E6F4EE)',
                    color: TEAL_DARK,
                  }}>
                    {t('doneBadge')}
                  </span>
                )}
              </div>

              {/* Completed steps collapse — body + CTA hidden to reduce
                  visual clutter. The strike-through title + Done badge
                  is enough acknowledgement. */}
              {!step.done && (
                <>
                  <p style={{ fontSize: 13, color: '#6b6b6b', lineHeight: 1.55, margin: '4px 0 0' }}>
                    {step.body}
                  </p>
                  {step.ctaLabel && step.ctaHref && (
                    <Link
                      href={step.ctaHref}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        marginTop: 10,
                        fontSize: 13,
                        fontWeight: 500,
                        color: '#ffffff',
                        background: PURPLE,
                        padding: '7px 14px',
                        borderRadius: 6,
                        textDecoration: 'none',
                        gap: 4,
                      }}
                    >
                      {step.ctaLabel}
                    </Link>
                  )}
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
