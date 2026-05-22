'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useUser } from '@/providers/user-context'
import { Button } from '@/components/ui/Button'
import { ArrowLeft, UserPlus, Trash2, X, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { SEAT_LIMITS } from '@/lib/config/pricing'

interface Member {
  membership_id: string
  user_id: string
  source: 'org' | 'branch'
  role: string
  branch_id: string | null
  branch_name: string | null
  display_name: string | null
  email: string | null
  is_active: boolean
  last_seen: string | null
}

interface Pending {
  id: string
  invitee_email: string
  role: 'manager' | 'staff'
  branch_id: string | null
  branch_name: string | null
  created_at: string
  expires_at: string
}

const seatLimits: Record<string, { manager: number; staff: number }> = {
  starter: { manager: SEAT_LIMITS.starter.managers, staff: SEAT_LIMITS.starter.staff },
  growth: { manager: SEAT_LIMITS.growth.managers, staff: SEAT_LIMITS.growth.staff },
  pro: {
    manager: SEAT_LIMITS.pro.managers === Infinity ? 999 : SEAT_LIMITS.pro.managers,
    staff: SEAT_LIMITS.pro.staff === Infinity ? 999 : SEAT_LIMITS.pro.staff,
  },
}

export default function TeamPage() {
  const { organization, branches, plan, role, user } = useUser()
  const t = useTranslations('settingsTeam')
  const tCommon = useTranslations('common')

  const [members, setMembers] = useState<Member[]>([])
  const [pending, setPending] = useState<Pending[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'manager' | 'staff'>('manager')
  const [inviteBranch, setInviteBranch] = useState(branches[0]?.id || '')
  const [inviting, setInviting] = useState(false)
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [ownerDisplayName, setOwnerDisplayName] = useState<string>('')

  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const [removeId, setRemoveId] = useState<string | null>(null)

  const orgId = organization?.id

  const reload = useCallback(async () => {
    if (!orgId) return
    setLoadError(null)
    try {
      const res = await fetch(`/api/team/members?organizationId=${encodeURIComponent(orgId)}`)
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setLoadError(json.error || t('loadError'))
        return
      }
      const json = await res.json()
      setMembers(json.members || [])
      setPending(json.pending || [])

      // pluck owner's display name for the invite email
      const me = (json.members || []).find((m: Member) => m.user_id === user.id)
      if (me?.display_name) setOwnerDisplayName(me.display_name)
      else if (me?.email) setOwnerDisplayName(me.email)
      else setOwnerDisplayName(user.email || '')
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : t('loadError'))
    } finally {
      setLoading(false)
    }
  }, [orgId, t, user.id, user.email])

  useEffect(() => {
    if (role !== 'owner' || !orgId) return
    reload()
  }, [reload, role, orgId])

  if (role !== 'owner' || !organization) return null

  // Resolve seat limits with a starter fallback. Inside seatLimits the
  // Pro plan's Infinity is encoded as 999 — the UI renders 999 as ∞ and
  // the limit checks treat 999 as "no cap" (matches Infinity behaviour).
  const limits = seatLimits[plan] || seatLimits.starter
  const isManagerUnlimited = limits.manager === 999
  const isStaffUnlimited = limits.staff === 999
  // Count only active members against seats — inactive members don't
  // consume a seat (matches the server-side check in /api/invite/send).
  const activeMembers = members.filter((m) => m.is_active !== false)
  const managerCount = activeMembers.filter(
    (m) => m.role === 'manager' || m.role === 'branch_manager',
  ).length
  const staffCount = activeMembers.filter(
    (m) => m.role === 'branch_user' || m.role === 'staff' || m.role === 'viewer',
  ).length
  const atManagerLimit = !isManagerUnlimited && managerCount >= limits.manager
  const atStaffLimit = !isStaffUnlimited && staffCount >= limits.staff
  const atBothLimits = atManagerLimit && atStaffLimit

  async function handleInvite() {
    if (!inviteEmail || !organization) return
    setInviteError(null)
    setInviteSuccess(null)

    // Client-side seat check — short-circuit before hitting the API
    // so the owner sees an instant, role-specific reason. The server
    // still enforces the same rule.
    if (inviteRole === 'manager' && atManagerLimit) {
      setInviteError(t('managerLimitReached'))
      return
    }
    if (inviteRole === 'staff' && atStaffLimit) {
      setInviteError(t('staffLimitReached'))
      return
    }

    setInviting(true)
    const branchName = branches.find((b) => b.id === inviteBranch)?.name || ''
    try {
      const res = await fetch('/api/invite/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteeEmail: inviteEmail,
          role: inviteRole,
          branchId: inviteBranch || null,
          organizationId: organization.id,
          invitedBy: user.id,
          organizationName: organization.name,
          branchName,
          inviterName: ownerDisplayName || user.email,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setInviteError(json.error || 'ส่งคำเชิญไม่สำเร็จ')
      } else {
        setInviteSuccess(`ส่งคำเชิญไปที่ ${inviteEmail} แล้ว ✓`)
        setInviteEmail('')
        await reload()
      }
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'ส่งคำเชิญไม่สำเร็จ')
    } finally {
      setInviting(false)
    }
  }

  async function handleToggleActive(member: Member) {
    if (!organization) return
    setBusyId(member.membership_id)
    setActionError(null)
    setActionNotice(null)
    try {
      const res = await fetch('/api/team/member-active', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: organization.id,
          membershipId: member.membership_id,
          source: member.source,
          isActive: !member.is_active,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setActionError(json.error || t('updateError'))
        return
      }
      setMembers((prev) =>
        prev.map((m) =>
          m.membership_id === member.membership_id ? { ...m, is_active: !m.is_active } : m,
        ),
      )
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('updateError'))
    } finally {
      setBusyId(null)
    }
  }

  async function handleRemove(member: Member) {
    if (!organization || member.user_id === user.id || member.role === 'owner') return
    setBusyId(member.membership_id)
    setActionError(null)
    try {
      // We keep the legacy delete behaviour for full removal — call DB
      // directly via the team-list endpoint isn't exposed yet, so we
      // delete via the existing pattern (toggle then delete by id).
      // For now: directly hit Supabase via service through the toggle API
      // is not available; do a soft-remove by setting inactive.
      const res = await fetch('/api/team/member-active', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: organization.id,
          membershipId: member.membership_id,
          source: member.source,
          isActive: false,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setActionError(json.error || t('updateError'))
        return
      }
      setMembers((prev) =>
        prev.map((m) =>
          m.membership_id === member.membership_id ? { ...m, is_active: false } : m,
        ),
      )
      setRemoveId(null)
    } finally {
      setBusyId(null)
    }
  }

  async function handleResend(p: Pending) {
    if (!organization) return
    setBusyId(p.id)
    setActionError(null)
    setActionNotice(null)
    try {
      const res = await fetch('/api/team/resend-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: organization.id, invitationId: p.id }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setActionError(json.error || t('updateError'))
        return
      }
      setActionNotice(t('resendSuccess'))
      await reload()
    } finally {
      setBusyId(null)
    }
  }

  async function handleCancel(p: Pending) {
    if (!organization) return
    setBusyId(p.id)
    setActionError(null)
    setActionNotice(null)
    try {
      const res = await fetch('/api/team/cancel-invite', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: organization.id, invitationId: p.id }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setActionError(json.error || t('updateError'))
        return
      }
      setPending((prev) => prev.filter((x) => x.id !== p.id))
      setActionNotice(t('cancelSuccess'))
    } finally {
      setBusyId(null)
    }
  }

  function displayName(m: Member): string {
    if (m.display_name) return m.display_name
    if (m.email) return m.email
    return m.user_id.slice(0, 8) + '...'
  }

  function ago(iso: string | null): string {
    if (!iso) return t('noLastSeen')
    const diffMs = Date.now() - new Date(iso).getTime()
    if (diffMs < 0) return t('justNow')
    const mins = Math.floor(diffMs / 60000)
    if (mins < 1) return t('justNow')
    if (mins < 60) return t('minutesAgo', { n: mins })
    const hours = Math.floor(mins / 60)
    if (hours < 24) return t('hoursAgo', { n: hours })
    const days = Math.floor(hours / 24)
    return t('daysAgo', { n: days })
  }

  function roleColor(roleStr: string): { bg: string; fg: string } {
    if (roleStr === 'owner') return { bg: 'var(--color-accent-light, #EEEBFF)', fg: 'var(--color-accent-text, #534AB7)' }
    if (roleStr === 'manager' || roleStr === 'branch_manager')
      return { bg: 'var(--color-amber-light, #FFF4E0)', fg: 'var(--color-amber-text, #8A5A00)' }
    return { bg: 'var(--color-bg-surface, #F4F4F2)', fg: 'var(--color-text-secondary, #6b6b6b)' }
  }

  function roleLabel(roleStr: string): string {
    if (roleStr === 'owner') return t('roleOwner')
    if (roleStr === 'manager' || roleStr === 'branch_manager') return t('roleManager')
    return t('roleStaff')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="flex items-center gap-2 lg:hidden" style={{ marginBottom: 4 }}>
        <Link href="/settings" className="touch-target" style={{ padding: 4, color: 'var(--color-text-tertiary)' }}>
          <ArrowLeft size={20} />
        </Link>
        <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 500, color: 'var(--color-text-primary)' }}>{t('title')}</h2>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="hidden lg:block" style={{ fontSize: 'var(--font-size-lg)', fontWeight: 500, color: 'var(--color-text-primary)' }}>{t('title')}</h2>
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
          <span style={{ marginRight: 12 }}>Manager: {managerCount}/{limits.manager === 999 ? '∞' : limits.manager}</span>
          <span>Staff: {staffCount}/{limits.staff === 999 ? '∞' : limits.staff}</span>
        </div>
      </div>

      {actionError && (
        <div style={{ background: 'var(--color-red-light, #FBEAEA)', color: 'var(--color-red-text, #A32D2D)', borderRadius: 'var(--radius-md)', padding: '8px 12px', fontSize: 'var(--font-size-sm)' }}>
          {actionError}
        </div>
      )}
      {actionNotice && (
        <div style={{ background: 'var(--color-green-light, #E6F4EE)', color: 'var(--color-green-text, #0F5132)', borderRadius: 'var(--radius-md)', padding: '8px 12px', fontSize: 'var(--font-size-sm)' }}>
          {actionNotice}
        </div>
      )}
      {loadError && (
        <div style={{ background: 'var(--color-red-light, #FBEAEA)', color: 'var(--color-red-text, #A32D2D)', borderRadius: 'var(--radius-md)', padding: '8px 12px', fontSize: 'var(--font-size-sm)' }}>
          {loadError}
        </div>
      )}

      {/* Active members */}
      <SectionLabel>{t('activeMembers')}</SectionLabel>
      {loading ? (
        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)', padding: 'var(--space-4) 0' }}>{tCommon('loading')}</div>
      ) : (
        <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          {members.map((member, i) => {
            const rc = roleColor(member.role)
            const isMe = member.user_id === user.id
            const isOwner = member.role === 'owner'
            return (
              <div
                key={member.membership_id}
                style={{
                  padding: '12px 14px',
                  borderTop: i > 0 ? '1px solid var(--color-border)' : 'none',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                    <span
                      aria-hidden
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: member.is_active ? 'var(--color-green, #1D9E75)' : 'var(--color-text-tertiary, #9b9b9b)',
                        flexShrink: 0,
                      }}
                    />
                    <p style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {displayName(member)}
                    </p>
                    {isMe && (
                      <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>(you)</span>
                    )}
                  </div>
                  {member.email && member.email !== displayName(member) && (
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {member.email}
                    </div>
                  )}
                  <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 10, fontWeight: 500, padding: '1px 8px', borderRadius: 'var(--radius-pill)',
                      background: rc.bg, color: rc.fg,
                    }}>
                      {roleLabel(member.role)}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 500, padding: '1px 8px', borderRadius: 'var(--radius-pill)',
                      background: member.is_active ? 'var(--color-green-light, #E6F4EE)' : 'var(--color-bg-surface, #F4F4F2)',
                      color: member.is_active ? 'var(--color-green-text, #0F5132)' : 'var(--color-text-tertiary, #9b9b9b)',
                    }}>
                      {member.is_active ? t('statusActive') : t('statusInactive')}
                    </span>
                    {member.branch_name && (
                      <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{member.branch_name}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 6 }}>
                    {member.last_seen ? t('lastSeen', { when: ago(member.last_seen) }) : t('noLastSeen')}
                  </div>
                </div>

                {!isOwner && !isMe && (
                  <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                    <Toggle
                      checked={member.is_active}
                      disabled={busyId === member.membership_id}
                      onChange={() => handleToggleActive(member)}
                      label={t('toggleActive')}
                    />
                    <button
                      onClick={() => setRemoveId(removeId === member.membership_id ? null : member.membership_id)}
                      aria-label="remove"
                      className="touch-target flex items-center justify-center"
                      style={{ color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
          {members.length === 0 && (
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)', padding: 14 }}>
              {tCommon('noData')}
            </div>
          )}
        </div>
      )}

      {/* Inline remove confirmation */}
      {removeId && (
        <div style={{ background: 'var(--color-red-light)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '12px 14px' }} className="flex items-center justify-between">
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-red-text)' }}>{t('confirmRemove')}</span>
          <div className="flex gap-2">
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                const m = members.find((m) => m.membership_id === removeId)
                if (m) handleRemove(m)
              }}
            >
              {tCommon('confirm')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setRemoveId(null)}>
              {tCommon('cancel')}
            </Button>
          </div>
        </div>
      )}

      {/* Pending invitations */}
      <SectionLabel>{t('pendingInvites')}</SectionLabel>
      {!loading && (
        <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          {pending.length === 0 ? (
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)', padding: 14 }}>
              {t('noPending')}
            </div>
          ) : (
            pending.map((p, i) => (
              <div
                key={p.id}
                style={{
                  padding: '12px 14px',
                  borderTop: i > 0 ? '1px solid var(--color-border)' : 'none',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text-primary)', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.invitee_email}
                  </p>
                  <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 10, fontWeight: 500, padding: '1px 8px', borderRadius: 'var(--radius-pill)',
                      background: roleColor(p.role).bg, color: roleColor(p.role).fg,
                    }}>
                      {roleLabel(p.role)}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 500, padding: '1px 8px', borderRadius: 'var(--radius-pill)',
                      background: 'var(--color-amber-light, #FFF4E0)',
                      color: 'var(--color-amber-text, #8A5A00)',
                    }}>
                      {t('statusPending')}
                    </span>
                    {p.branch_name && (
                      <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{p.branch_name}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 6 }}>
                    {t('invitedAgo', { when: ago(p.created_at) })}
                  </div>
                </div>
                <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                  <button
                    onClick={() => handleResend(p)}
                    disabled={busyId === p.id}
                    aria-label={t('resend')}
                    className="touch-target flex items-center justify-center"
                    style={{
                      fontSize: 12,
                      color: 'var(--color-accent-text, #534AB7)',
                      background: 'none',
                      border: '1px solid var(--color-border-strong)',
                      borderRadius: 'var(--radius-md)',
                      padding: '6px 10px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      gap: 4,
                      alignItems: 'center',
                    }}
                  >
                    <RefreshCw size={12} />
                    {t('resend')}
                  </button>
                  <button
                    onClick={() => handleCancel(p)}
                    disabled={busyId === p.id}
                    aria-label={t('cancelInvite')}
                    className="touch-target flex items-center justify-center"
                    style={{
                      color: 'var(--color-text-tertiary)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Invite button — disabled when BOTH manager and staff seats are
          maxed. If only one role is at the limit the button stays
          enabled; the limit-specific message surfaces inside the form
          when the owner picks the maxed-out role. */}
      <Button
        variant="secondary"
        fullWidth
        disabled={atBothLimits}
        onClick={() => setShowInvite(true)}
      >
        <UserPlus size={14} />
        {t('invite')}
      </Button>
      {atBothLimits && (
        <div style={{
          background: 'var(--color-amber-light, #FFF4E0)',
          color: 'var(--color-amber-text, #8A5A00)',
          borderRadius: 'var(--radius-md)',
          padding: '10px 12px',
          fontSize: 'var(--font-size-sm)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}>
          <span>{t('bothLimitsReached')}</span>
          <Link href="/settings/billing" style={{ color: 'var(--color-amber-text, #8A5A00)', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            {t('viewPricing')}
          </Link>
        </div>
      )}

      {/* Invite form */}
      {showInvite && (
        <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 16 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
            <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500, color: 'var(--color-text-primary)' }}>{t('inviteTitle')}</h3>
            <button onClick={() => setShowInvite(false)} className="touch-target" style={{ color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}>
              <X size={16} />
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              style={{ width: '100%', padding: '7px 12px', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)', background: 'var(--color-bg)' }}
              placeholder={t('emailPlaceholder')}
            />
            <div className="flex gap-2">
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'manager' | 'staff')} style={{ flex: 1, padding: '7px 12px', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}>
                <option value="manager">Manager</option>
                <option value="staff">Staff</option>
              </select>
              <select value={inviteBranch} onChange={(e) => setInviteBranch(e.target.value)} style={{ flex: 1, padding: '7px 12px', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}>
                {branches.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
              </select>
            </div>
            <Button variant="primary" fullWidth disabled={inviting || !inviteEmail} onClick={handleInvite}>
              {inviting ? tCommon('saving') : t('sendInvite')}
            </Button>
            {inviteSuccess && (
              <div style={{
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-green-text, #1D9E75)',
                background: 'var(--color-green-light, #E6F4EE)',
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
              }}>
                {inviteSuccess}
              </div>
            )}
            {inviteError && (() => {
              // Limit-reached messages are styled as amber warnings, not
              // red errors, and carry a link to the billing page. We
              // detect them by checking for the Thai "อัปเกรด" or English
              // "upgrade" hint that both server and client errors include.
              const isLimitWarning = /อัปเกรด|upgrade/i.test(inviteError)
              if (isLimitWarning) {
                return (
                  <div style={{
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-amber-text, #8A5A00)',
                    background: 'var(--color-amber-light, #FFF4E0)',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}>
                    <span>{inviteError}</span>
                    <Link href="/settings/billing" style={{ color: 'var(--color-amber-text, #8A5A00)', fontWeight: 600, textDecoration: 'none' }}>
                      {t('viewPricing')}
                    </Link>
                  </div>
                )
              }
              return (
                <div style={{
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--color-red-text, #A32D2D)',
                  background: 'var(--color-red-light, #FBEAEA)',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                }}>
                  {inviteError}
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11,
      fontWeight: 500,
      color: 'var(--color-text-tertiary)',
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      marginBottom: -4,
    }}>
      {children}
    </div>
  )
}

function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean
  disabled: boolean
  onChange: () => void
  label: string
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      style={{
        width: 36,
        height: 20,
        borderRadius: 999,
        border: 'none',
        background: checked ? 'var(--color-green, #1D9E75)' : 'var(--color-border-strong, #d4d4d4)',
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'background 0.15s',
        padding: 0,
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.15s',
          boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
        }}
      />
    </button>
  )
}
