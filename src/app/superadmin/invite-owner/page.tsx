'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

interface RecentInvite {
  id: string
  email: string
  organization_name: string | null
  plan: string
  trial_days: number
  discount_pct: number
  accepted_at: string | null
  created_at: string
  expires_at: string
}

const TRIAL_OPTIONS = [14, 30, 60, 90]
const PLAN_OPTIONS: Array<'starter' | 'growth' | 'pro'> = ['starter', 'growth', 'pro']
const DISCOUNT_OPTIONS = [0, 20, 30, 50]
const BUSINESS_OPTIONS: Array<{ value: 'accommodation' | 'fnb' | 'mixed'; label: string }> = [
  { value: 'accommodation', label: 'Hotel / Resort' },
  { value: 'fnb', label: 'Cafe / Restaurant / Bakery' },
  { value: 'mixed', label: 'Both' },
]

type Tier = 'founding' | 'early_adopter' | 'standard' | 'custom'

// Tier presets drive trial / discount / promo prefix when an admin picks
// one. The admin appends the member number (e.g. "FOUNDING-12") in the
// promo label field — that number ends up in the email badge.
const TIER_PRESETS: Record<Exclude<Tier, 'custom'>, { trialDays: number; discountPct: number; promoPrefix: string; label: string }> = {
  founding: { trialDays: 90, discountPct: 50, promoPrefix: 'FOUNDING-', label: 'Founding Partner · 90d · 50% off' },
  early_adopter: { trialDays: 60, discountPct: 30, promoPrefix: 'EARLY-', label: 'Early Adopter · 60d · 30% off' },
  standard: { trialDays: 30, discountPct: 0, promoPrefix: '', label: 'Standard Trial · 30d · no discount' },
}

export default function InviteOwnerPage() {
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [orgName, setOrgName] = useState('')
  const [businessType, setBusinessType] = useState<'accommodation' | 'fnb' | 'mixed'>('mixed')
  const [tier, setTier] = useState<Tier>('early_adopter')
  const [trialDays, setTrialDays] = useState(60)
  const [plan, setPlan] = useState<'starter' | 'growth' | 'pro'>('growth')
  const [discountPct, setDiscountPct] = useState(30)
  const [promoCode, setPromoCode] = useState('EARLY-')
  const [notes, setNotes] = useState('')

  function applyTier(next: Tier) {
    setTier(next)
    if (next === 'custom') return
    const preset = TIER_PRESETS[next]
    setTrialDays(preset.trialDays)
    setDiscountPct(preset.discountPct)
    setPromoCode(preset.promoPrefix)
  }

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [recent, setRecent] = useState<RecentInvite[]>([])

  const loadRecent = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { data } = await db
      .from('owner_invitations')
      .select('id, email, organization_name, plan, trial_days, discount_pct, accepted_at, created_at, expires_at')
      .order('created_at', { ascending: false })
      .limit(20)
    setRecent((data || []) as RecentInvite[])
  }, [supabase])

  useEffect(() => { loadRecent() }, [loadRecent])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    if (!email.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/superadmin/invite-owner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          organizationName: orgName.trim(),
          businessType,
          trialDays,
          plan,
          discountPct,
          promoCode: promoCode.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) {
        setError(json.error || 'Failed to send invitation')
        return
      }
      setSuccess(`คำเชิญส่งไปที่ ${email.trim()} แล้ว ✓`)
      setEmail('')
      setOrgName('')
      setPromoCode(tier === 'custom' ? '' : TIER_PRESETS[tier].promoPrefix)
      setNotes('')
      await loadRecent()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="flex items-center gap-2">
        <Link href="/superadmin" style={{ padding: 4, color: '#6b6b6b' }}>
          <ArrowLeft size={18} />
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 500, color: '#1a1a1a', margin: 0 }}>
          Invite Owner
        </h1>
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          background: '#ffffff',
          border: '1px solid #e5e5e5',
          borderRadius: 12,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <Field label="Owner email" required>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} placeholder="owner@example.com" />
        </Field>

        <Field label="Company name" required>
          <input type="text" value={orgName} onChange={(e) => setOrgName(e.target.value)} required style={inputStyle} placeholder="Crystal Group" />
        </Field>

        <Field label="Business type" required>
          <select value={businessType} onChange={(e) => setBusinessType(e.target.value as typeof businessType)} style={inputStyle}>
            {BUSINESS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Tier">
          <select value={tier} onChange={(e) => applyTier(e.target.value as Tier)} style={inputStyle}>
            <option value="founding">{TIER_PRESETS.founding.label}</option>
            <option value="early_adopter">{TIER_PRESETS.early_adopter.label}</option>
            <option value="standard">{TIER_PRESETS.standard.label}</option>
            <option value="custom">Custom (set fields manually)</option>
          </select>
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Trial period">
            <select
              value={trialDays}
              onChange={(e) => { setTrialDays(Number(e.target.value)); setTier('custom') }}
              style={inputStyle}
            >
              {TRIAL_OPTIONS.map((d) => (
                <option key={d} value={d}>{d} days</option>
              ))}
            </select>
          </Field>
          <Field label="Starting plan">
            <select value={plan} onChange={(e) => setPlan(e.target.value as typeof plan)} style={inputStyle}>
              {PLAN_OPTIONS.map((p) => (
                <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="First month discount">
          <select
            value={discountPct}
            onChange={(e) => { setDiscountPct(Number(e.target.value)); setTier('custom') }}
            style={inputStyle}
          >
            {DISCOUNT_OPTIONS.map((d) => (
              <option key={d} value={d}>{d === 0 ? 'No discount' : `${d}% off`}</option>
            ))}
          </select>
        </Field>

        <Field label="Promo label">
          <input
            type="text"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value)}
            style={inputStyle}
            placeholder={tier === 'founding' ? 'FOUNDING-12' : tier === 'early_adopter' ? 'EARLY-47' : 'Optional label'}
          />
          <span style={{ fontSize: 11, color: '#9b9b9b', marginTop: 2, display: 'block' }}>
            Append the member number — e.g. <code>FOUNDING-12</code> or <code>EARLY-47</code>. Used for the email badge.
          </span>
        </Field>

        <Field label="Internal notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }} placeholder="Met at SETT 2026; wants F&B insights for 3 cafes." />
        </Field>

        {error && (
          <div style={{ fontSize: 13, color: '#A32D2D', background: '#FBEAEA', padding: '8px 12px', borderRadius: 6 }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ fontSize: 13, color: '#0F5132', background: '#E6F4EE', padding: '8px 12px', borderRadius: 6 }}>
            {success}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !email.trim()}
          style={{
            padding: '11px 18px',
            background: submitting ? '#999' : '#534AB7',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: submitting ? 'not-allowed' : 'pointer',
            fontSize: 14,
            fontWeight: 500,
            minHeight: 44,
          }}
        >
          {submitting ? 'Sending...' : 'Send Invitation →'}
        </button>
      </form>

      <section
        style={{
          background: '#ffffff',
          border: '1px solid #e5e5e5',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        <h2 style={{
          fontSize: 13,
          fontWeight: 600,
          color: '#1a1a1a',
          margin: 0,
          padding: '12px 16px',
          borderBottom: '1px solid #e5e5e5',
          background: '#fafafa',
        }}>
          Recent invitations
        </h2>
        {recent.length === 0 ? (
          <div style={{ padding: 16, fontSize: 13, color: '#9b9b9b' }}>No invitations yet</div>
        ) : (
          recent.map((r, i) => {
            const accepted = !!r.accepted_at
            const expired = !accepted && new Date(r.expires_at).getTime() < Date.now()
            const statusLabel = accepted ? 'Accepted' : expired ? 'Expired' : 'Pending'
            const statusBg = accepted ? '#E6F4EE' : expired ? '#F4F4F2' : '#FFF4E0'
            const statusFg = accepted ? '#0F5132' : expired ? '#9b9b9b' : '#8A5A00'
            return (
              <div
                key={r.id}
                style={{
                  padding: '10px 16px',
                  borderTop: i > 0 ? '1px solid #f0f0ee' : 'none',
                  fontSize: 13,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <strong style={{ color: '#1a1a1a' }}>{r.email}</strong>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 500,
                    padding: '1px 8px',
                    borderRadius: 999,
                    background: statusBg,
                    color: statusFg,
                  }}>{statusLabel}</span>
                </div>
                <div style={{ color: '#6b6b6b', fontSize: 12 }}>
                  {r.organization_name || '—'} · {r.plan} · {r.trial_days}d trial{r.discount_pct ? ` · ${r.discount_pct}% off` : ''}
                </div>
              </div>
            )
          })
        )}
      </section>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, color: '#6b6b6b' }}>
        {label}{required && <span style={{ color: '#A32D2D' }}> *</span>}
      </span>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #d4d4d4',
  borderRadius: 8,
  fontSize: 14,
  color: '#1a1a1a',
  minHeight: 44,
  boxSizing: 'border-box',
  background: '#fff',
}
