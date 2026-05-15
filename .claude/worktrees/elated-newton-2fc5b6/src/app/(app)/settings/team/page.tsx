'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useUser } from '@/providers/user-context'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { ArrowLeft, UserPlus, Trash2, X } from 'lucide-react'
import Link from 'next/link'

interface Member {
  id: string
  user_id: string
  role: string
  email: string | null
  display_name: string | null
  source: 'org' | 'branch'
  branch_name?: string
}

import { SEAT_LIMITS } from '@/lib/config/pricing'

const seatLimits: Record<string, { manager: number; staff: number }> = {
  starter: { manager: SEAT_LIMITS.starter.managers, staff: SEAT_LIMITS.starter.staff },
  growth: { manager: SEAT_LIMITS.growth.managers, staff: SEAT_LIMITS.growth.staff },
  pro: { manager: SEAT_LIMITS.pro.managers === Infinity ? 999 : SEAT_LIMITS.pro.managers, staff: SEAT_LIMITS.pro.staff === Infinity ? 999 : SEAT_LIMITS.pro.staff },
}

export default function TeamPage() {
  const { organization, branches, plan, role, user } = useUser()
  const t = useTranslations('settingsTeam')
  const tCommon = useTranslations('common')
  const supabase = createClient()

  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'manager' | 'staff'>('manager')
  const [inviteBranch, setInviteBranch] = useState(branches[0]?.id || '')
  const [inviting, setInviting] = useState(false)
  const [removeId, setRemoveId] = useState<string | null>(null)

  if (role !== 'owner' || !organization) return null

  const limits = seatLimits[plan]

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    async function load() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any

      // Get org members
      const { data: orgMembers } = await db
        .from('organization_members')
        .select('id, user_id, role')
        .eq('organization_id', organization!.id)

      // Get branch members
      const { data: branchMembers } = await db
        .from('branch_members')
        .select('id, user_id, role, branch_id')
        .in('branch_id', branches.map((b) => b.id))

      // Collect all unique user IDs
      const allRaw = [
        ...(orgMembers || []).map((m: { id: string; user_id: string; role: string }) => ({
          id: m.id, user_id: m.user_id, role: m.role, source: 'org' as const,
        })),
        ...(branchMembers || []).map((m: { id: string; user_id: string; role: string; branch_id: string }) => ({
          id: m.id, user_id: m.user_id, role: m.role, source: 'branch' as const,
          branch_name: branches.find((b) => b.id === m.branch_id)?.name,
        })),
      ]

      // Deduplicate
      const unique = new Map<string, typeof allRaw[0]>()
      allRaw.forEach((m) => {
        if (!unique.has(m.user_id) || m.source === 'org') unique.set(m.user_id, m)
      })

      // Fetch profiles for emails
      const userIds = Array.from(unique.keys())
      const { data: profiles } = await db
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', userIds)

      const profileMap = new Map<string, { display_name: string | null }>()
      ;(profiles || []).forEach((p: { user_id: string; display_name: string | null }) => {
        profileMap.set(p.user_id, p)
      })

      // Build final member list with email from profile or user_id fallback
      const final: Member[] = Array.from(unique.values()).map((m) => {
        const profile = profileMap.get(m.user_id)
        return {
          ...m,
          email: null, // Will be populated below
          display_name: profile?.display_name || null,
        }
      })

      // For the current user, we know their email
      final.forEach((m) => {
        if (m.user_id === user.id) {
          m.email = user.email
        }
      })

      setMembers(final)
      setLoading(false)
    }
    load()
  }, [organization, branches, supabase, user])

  async function handleInvite() {
    if (!inviteEmail || !organization) return
    setInviting(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    await db.from('invitations').insert({
      organization_id: organization.id,
      branch_id: inviteBranch || null,
      invitee_email: inviteEmail,
      role: inviteRole,
      invited_by: user.id,
    })
    setInviting(false)
    setShowInvite(false)
    setInviteEmail('')
  }

  async function handleRemove(memberId: string, memberUserId: string) {
    if (memberUserId === user.id) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    await db.from('organization_members').delete().eq('id', memberId)
    await db.from('branch_members').delete().eq('user_id', memberUserId).in('branch_id', branches.map((b) => b.id))
    setMembers((prev) => prev.filter((m) => m.user_id !== memberUserId))
    setRemoveId(null)
  }

  const managerCount = members.filter((m) => m.role === 'manager' || m.role === 'branch_manager').length
  const staffCount = members.filter((m) => m.role === 'branch_user' || m.role === 'staff' || m.role === 'viewer').length

  function displayName(m: Member): string {
    if (m.display_name) return m.display_name
    if (m.email) return m.email
    // Truncate UUID as last resort
    return m.user_id.slice(0, 8) + '...'
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

      {loading ? (
        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)', padding: 'var(--space-4) 0' }}>{tCommon('loading')}</div>
      ) : (
        <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          {members.map((member, i) => (
            <div
              key={member.id}
              className="flex items-center justify-between"
              style={{ padding: '10px 14px', borderTop: i > 0 ? '1px solid var(--color-border)' : 'none' }}
            >
              <div>
                <p style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text-primary)' }}>
                  {displayName(member)}
                </p>
                <div className="flex items-center gap-2" style={{ marginTop: 2 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 500, padding: '1px 8px', borderRadius: 'var(--radius-pill)',
                    background: member.role === 'owner' ? 'var(--color-accent-light)' : member.role === 'manager' || member.role === 'branch_manager' ? 'var(--color-amber-light)' : 'var(--color-bg-surface)',
                    color: member.role === 'owner' ? 'var(--color-accent-text)' : member.role === 'manager' || member.role === 'branch_manager' ? 'var(--color-amber-text)' : 'var(--color-text-secondary)',
                  }}>
                    {member.role}
                  </span>
                  {member.branch_name && (
                    <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{member.branch_name}</span>
                  )}
                </div>
              </div>
              {member.role !== 'owner' && member.user_id !== user.id && (
                <button
                  onClick={() => setRemoveId(member.id === removeId ? null : member.id)}
                  className="touch-target flex items-center justify-center"
                  style={{ color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Remove confirmation */}
      {removeId && (
        <div style={{ background: 'var(--color-red-light)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '12px 14px' }} className="flex items-center justify-between">
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-red-text)' }}>{t('confirmRemove')}</span>
          <div className="flex gap-2">
            <Button variant="danger" size="sm" onClick={() => { const m = members.find((m) => m.id === removeId); if (m) handleRemove(m.id, m.user_id) }}>
              {tCommon('confirm')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setRemoveId(null)}>
              {tCommon('cancel')}
            </Button>
          </div>
        </div>
      )}

      {/* Invite button */}
      <Button variant="secondary" fullWidth onClick={() => setShowInvite(true)}>
        <UserPlus size={14} />
        {t('invite')}
      </Button>

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
          </div>
        </div>
      )}
    </div>
  )
}
