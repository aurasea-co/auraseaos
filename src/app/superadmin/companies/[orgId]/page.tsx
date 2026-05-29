'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Check, Minus, Calendar, ArrowRightLeft, XCircle } from 'lucide-react'
import { BranchTypeBadge } from '@/components/ui/BranchTypeBadge'
import type { SubscriptionStatus, SubscriptionPhase } from '@/lib/subscription/status'

// Super-admin company detail page. Renders off
// /api/superadmin/companies/[orgId] (service-role behind the wire so
// RLS isn't in the way). The page itself is RLS-agnostic.
//
// Sections:
//   A. Header — name, owner email/display name/LINE status, back link
//   B. Subscription status banner (phase-coloured) + admin action form
//   C. Branches list with entry counts
//   D. Internal notes (amber, super-admin only, never reaches owner)

interface DetailResponse {
  org: {
    id: string
    name: string
    plan: string
    status: string | null
    trial_ends_at: string | null
    trial_days: number | null
    discount_pct: number | null
    promo_code: string | null
    grace_period_days: number | null
    created_at: string
  }
  owner: {
    userId: string | null
    email: string | null
    displayName: string | null
    lineConnected: boolean
  }
  branches: Array<{
    id: string
    name: string
    business_type: string
    total_rooms: number | null
    total_seats: number | null
    created_at: string
    entryCount: number
  }>
  invitation: {
    notes: string | null
    promoCode: string | null
    invitedBy: string | null
  } | null
  subscription: SubscriptionStatus
}

type ActionMode = 'extend_trial' | 'change_plan' | 'cancel'

export default function CompanyDetailPage() {
  const { orgId } = useParams<{ orgId: string }>()
  const [data, setData] = useState<DetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionMode, setActionMode] = useState<ActionMode>('extend_trial')
  const [newTrialEnd, setNewTrialEnd] = useState('')
  const [newPlan, setNewPlan] = useState<'starter' | 'growth' | 'pro'>('growth')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const res = await fetch(`/api/superadmin/companies/${orgId}`, { cache: 'no-store' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body?.error || res.statusText)
      return
    }
    const json: DetailResponse = await res.json()
    setData(json)
    setNewPlan(json.org.plan as 'starter' | 'growth' | 'pro')
    setNewTrialEnd((curr) => {
      if (curr) return curr
      const defaultEnd = new Date(Date.now() + 30 * 86_400_000)
      return defaultEnd.toISOString().slice(0, 10)
    })
  }, [orgId])

  useEffect(() => {
    async function load() {
      try {
        await reload()
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [reload])

  async function submitAction() {
    if (!data || submitting) return
    setError(null)
    setSubmitting(true)
    try {
      let body: Record<string, unknown>
      if (actionMode === 'extend_trial') {
        if (!newTrialEnd) return
        if (!reason.trim()) {
          setError('กรุณากรอกเหตุผล')
          return
        }
        body = { type: 'extend_trial', newTrialEnd: new Date(newTrialEnd).toISOString(), reason: reason.trim() }
      } else if (actionMode === 'change_plan') {
        body = { type: 'change_plan', plan: newPlan, reason: reason.trim() || undefined }
      } else {
        if (!reason.trim()) {
          setError('กรุณากรอกเหตุผล')
          return
        }
        body = { type: 'cancel', reason: reason.trim() }
      }
      const res = await fetch(`/api/superadmin/companies/${orgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) {
        setError(json.error || 'failed')
        return
      }
      setReason('')
      setToast('บันทึกการเปลี่ยนแปลงเรียบร้อยแล้ว')
      window.setTimeout(() => setToast(null), 3500)
      await reload()
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--color-text-tertiary)' }}>Loading...</div>
  if (error && !data) return <div style={{ padding: 40, color: 'var(--color-negative)' }}>Error: {error}</div>
  if (!data) return null

  const { org, owner, branches, invitation, subscription } = data

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Link
        href="/superadmin"
        className="flex items-center gap-2"
        style={{ fontSize: 13, color: 'var(--color-text-secondary)', textDecoration: 'none' }}
      >
        <ArrowLeft size={16} /> ภาพรวมระบบ
      </Link>

      {/* SECTION A — header */}
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 500, color: 'var(--color-text-primary)', margin: 0 }}>
          {org.name}
        </h1>
        <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
          สร้างเมื่อ {new Date(org.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--color-text-secondary)' }}>{owner.displayName || '—'}</span>
          <span style={{ color: 'var(--color-text-tertiary)' }}>·</span>
          <span style={{ color: 'var(--color-text-tertiary)' }}>{owner.email || '—'}</span>
          <span style={{ color: 'var(--color-text-tertiary)' }}>·</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-text-tertiary)' }}>
            LINE {owner.lineConnected
              ? <Check size={14} style={{ color: '#1D9E75' }} />
              : <Minus size={14} style={{ color: 'var(--color-text-tertiary)' }} />}
          </span>
        </div>
      </div>

      {/* SECTION B — subscription status + admin actions */}
      <SubscriptionCard status={subscription} org={org} />

      <div style={{
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 16,
      }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px', color: 'var(--color-text-primary)' }}>
          จัดการ Subscription
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {(
            [
              { id: 'extend_trial', label: 'ต่ออายุ Trial', icon: Calendar },
              { id: 'change_plan', label: 'เปลี่ยนแผน', icon: ArrowRightLeft },
              { id: 'cancel', label: 'ยกเลิก', icon: XCircle },
            ] as const
          ).map(({ id, label, icon: Icon }) => {
            const active = actionMode === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActionMode(id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  fontSize: 13,
                  fontWeight: 500,
                  border: `1px solid ${active ? 'var(--color-accent, #534AB7)' : 'var(--color-border)'}`,
                  borderRadius: 8,
                  background: active ? 'var(--color-accent, #534AB7)' : 'var(--color-bg)',
                  color: active ? '#ffffff' : 'var(--color-text-primary)',
                  cursor: 'pointer',
                }}
              >
                <Icon size={14} />
                {label}
              </button>
            )
          })}
        </div>

        {actionMode === 'extend_trial' && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: '#6b6b6b' }}>วันสิ้นสุด Trial ใหม่</span>
            <input
              type="date"
              value={newTrialEnd}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setNewTrialEnd(e.target.value)}
              style={inputStyle}
            />
          </label>
        )}
        {actionMode === 'change_plan' && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: '#6b6b6b' }}>แผนใหม่</span>
            <select
              value={newPlan}
              onChange={(e) => setNewPlan(e.target.value as 'starter' | 'growth' | 'pro')}
              style={inputStyle}
            >
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="pro">Pro</option>
            </select>
          </label>
        )}

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
          <span style={{ fontSize: 12, color: '#6b6b6b' }}>
            เหตุผล{actionMode === 'change_plan' ? ' (ไม่บังคับ)' : ' (บันทึกใน audit log)'}
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder={actionMode === 'extend_trial'
              ? 'เช่น Owner ยังประเมินเครื่องอยู่ ต่อให้อีก 14 วัน'
              : actionMode === 'cancel'
                ? 'เช่น Owner แจ้งปิดกิจการ'
                : 'เช่น Owner ขอลด/อัปเกรดแผน'}
            style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
          />
        </label>

        {error && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#A32D2D', background: '#FBEAEA', padding: '6px 10px', borderRadius: 6 }}>
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={submitAction}
          disabled={submitting}
          style={{
            marginTop: 12,
            padding: '10px 16px',
            background: submitting ? '#9b9b9b' : 'var(--color-accent, #534AB7)',
            color: '#ffffff',
            fontSize: 13,
            fontWeight: 500,
            border: 'none',
            borderRadius: 8,
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}
        </button>
      </div>

      {/* SECTION C — branches */}
      <div>
        <h2 style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)', margin: '0 0 10px' }}>
          สาขา ({branches.length})
        </h2>
        <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          {branches.map((b, i) => (
            <div
              key={b.id}
              style={{
                padding: '12px 16px',
                borderTop: i > 0 ? '1px solid var(--color-border)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <BranchTypeBadge type={b.business_type} />
              <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{b.name}</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                {b.business_type === 'accommodation'
                  ? `${b.total_rooms || 0} rooms`
                  : `${b.total_seats || 0} seats`}
              </span>
              <span style={{
                marginLeft: 'auto',
                fontSize: 11,
                color: 'var(--color-text-tertiary)',
              }}>
                {b.entryCount.toLocaleString()} entries · created {new Date(b.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
              </span>
            </div>
          ))}
          {branches.length === 0 && (
            <div style={{ padding: 16, fontSize: 13, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
              ยังไม่มีสาขา
            </div>
          )}
        </div>
      </div>

      {/* SECTION D — internal notes (amber, super-admin-only) */}
      <div style={{
        background: '#FFFBEB',
        border: '1px solid #FCD34D',
        borderRadius: 8,
        padding: '12px 14px',
      }}>
        <div style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#8A5A00',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          marginBottom: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          📋 บันทึกภายใน · Internal notes (super admin only)
        </div>
        <div style={{
          fontSize: 13,
          color: invitation?.notes ? '#3a3a3a' : '#9b9b9b',
          whiteSpace: 'pre-wrap',
          lineHeight: 1.55,
          fontStyle: invitation?.notes ? 'normal' : 'italic',
        }}>
          {invitation?.notes || 'ไม่มีบันทึกภายในสำหรับคำเชิญนี้ · No internal notes for this invitation'}
        </div>
      </div>

      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            background: '#0F5132',
            color: '#ffffff',
            padding: '10px 16px',
            borderRadius: 8,
            fontSize: 13,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 200,
          }}
        >
          ✓ {toast}
        </div>
      )}
    </div>
  )
}

function SubscriptionCard({
  status,
  org,
}: {
  status: SubscriptionStatus
  org: DetailResponse['org']
}) {
  const palette = PHASE_PALETTE[status.phase]
  const trialEndDisplay = status.trialEndsAt
    ? new Date(status.trialEndsAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'
  const graceEndDisplay = status.graceEndsAt
    ? new Date(status.graceEndsAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
    : null
  return (
    <div style={{
      background: palette.bg,
      border: `1px solid ${palette.border}`,
      color: palette.fg,
      borderRadius: 10,
      padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>{PHASE_LABEL[status.phase]}</strong>
        <span style={{ fontSize: 13, fontWeight: 500 }}>
          {status.phase === 'trial' && `Trial · เหลืออีก ${status.trialDaysLeft} วัน`}
          {status.phase === 'grace' && `Grace · เหลืออีก ${status.graceDaysLeft} วัน`}
          {status.phase === 'expired' && 'หมดอายุ'}
          {status.phase === 'active' && 'Active'}
          {status.phase === 'cancelled' && 'Cancelled'}
        </span>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.6 }}>
        <div>แผน: <strong>{org.plan[0].toUpperCase() + org.plan.slice(1)}</strong></div>
        <div>Trial ends: <strong>{trialEndDisplay}</strong></div>
        {graceEndDisplay && status.phase !== 'expired' && (
          <div>Grace ends: <strong>{graceEndDisplay}</strong></div>
        )}
        {org.discount_pct ? <div>ส่วนลดเดือนแรก: <strong>{org.discount_pct}%</strong></div> : null}
        {org.promo_code ? <div>โปรโมชัน: <strong>{org.promo_code}</strong></div> : null}
      </div>
    </div>
  )
}

const PHASE_LABEL: Record<SubscriptionPhase, string> = {
  active: '✅ Active',
  trial: '🟢 Trial',
  grace: '⚠️ Grace period',
  expired: '🔴 Expired',
  cancelled: '⛔ Cancelled',
}

const PHASE_PALETTE: Record<SubscriptionPhase, { bg: string; border: string; fg: string }> = {
  active:    { bg: '#E6F4EE', border: '#BBE0D0', fg: '#0F5132' },
  trial:     { bg: '#E6F4EE', border: '#BBE0D0', fg: '#0F5132' },
  grace:     { bg: '#FFF4E0', border: '#FCD9A0', fg: '#8A5A00' },
  expired:   { bg: '#FBEAEA', border: '#F5C6C6', fg: '#A32D2D' },
  cancelled: { bg: '#F4F4F2', border: '#e5e5e5', fg: '#6b6b6b' },
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #d4d4d4',
  borderRadius: 8,
  fontSize: 13,
  color: '#1a1a1a',
  background: '#fff',
  boxSizing: 'border-box',
  minHeight: 40,
}
