'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { OnboardingProgress } from '@/components/onboarding/OnboardingProgress'

export default function OnboardingTeam() {
  const [managerEmail, setManagerEmail] = useState('')
  const [staffEmail, setStaffEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  async function handleNext() {
    setError(null)
    const manager = managerEmail.trim()
    const staff = staffEmail.trim()

    // No emails — just continue
    if (!manager && !staff) {
      router.push('/onboarding/complete')
      return
    }

    setSending(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any

      const { data: membership } = await db
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .limit(1)
        .single()
      if (!membership) throw new Error('No organization found')

      const { data: org } = await db
        .from('organizations')
        .select('id, name')
        .eq('id', membership.organization_id)
        .single()
      const { data: branch } = await db
        .from('branches')
        .select('id, name')
        .eq('organization_id', membership.organization_id)
        .order('created_at', { ascending: true })
        .limit(1)
        .single()
      const { data: profile } = await db
        .from('profiles')
        .select('display_name')
        .eq('user_id', user.id)
        .maybeSingle()

      const inviterName = profile?.display_name || user.email || ''
      const organizationName = org?.name || ''
      const branchName = branch?.name || ''
      const branchId = branch?.id || null

      const invites: Array<{ email: string; role: 'manager' | 'staff' }> = []
      if (manager) invites.push({ email: manager, role: 'manager' })
      if (staff) invites.push({ email: staff, role: 'staff' })

      for (const inv of invites) {
        const res = await fetch('/api/invite/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inviteeEmail: inv.email,
            role: inv.role,
            branchId,
            organizationId: membership.organization_id,
            invitedBy: user.id,
            organizationName,
            branchName,
            inviterName,
          }),
        })
        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          throw new Error(json.error || `ส่งคำเชิญถึง ${inv.email} ไม่สำเร็จ`)
        }
      }

      router.push('/onboarding/complete')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ส่งคำเชิญไม่สำเร็จ')
      setSending(false)
    }
  }

  return (
    <div>
      <OnboardingProgress currentStep={4} />
      <h2 style={{ fontSize: 18, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 8 }}>เชิญทีมงาน</h2>
      <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 20 }}>เชิญ Manager และ Staff เพื่อช่วยกรอกข้อมูล (ข้ามได้)</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>อีเมล Manager (ไม่บังคับ)</label>
          <input type="email" value={managerEmail} onChange={(e) => setManagerEmail(e.target.value)} placeholder="manager@example.com" style={{ width: '100%', padding: '9px 14px', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-base)' }} />
        </div>
        <div>
          <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>อีเมล Staff (ไม่บังคับ)</label>
          <input type="email" value={staffEmail} onChange={(e) => setStaffEmail(e.target.value)} placeholder="staff@example.com" style={{ width: '100%', padding: '9px 14px', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-base)' }} />
        </div>

        {error && (
          <div style={{ fontSize: 'var(--font-size-sm)', color: '#A32D2D', background: '#FBEAEA', padding: '8px 12px', borderRadius: 'var(--radius-md)' }}>
            {error}
          </div>
        )}

        <Button variant="primary" fullWidth disabled={sending} onClick={handleNext}>
          {sending ? 'กำลังส่งคำเชิญ...' : 'ต่อไป →'}
        </Button>
        <button onClick={() => router.push('/onboarding/complete')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)', textAlign: 'center', padding: 8 }}>
          ข้าม — เชิญทีหลัง
        </button>
      </div>
    </div>
  )
}
