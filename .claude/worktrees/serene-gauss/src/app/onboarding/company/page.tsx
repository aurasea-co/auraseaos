'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { OnboardingProgress } from '@/components/onboarding/OnboardingProgress'

export default function OnboardingCompany() {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleNext() {
    if (!name.trim()) return
    setSaving(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    // Get user's org (should have one from signup)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: membership } = await db.from('organization_members').select('organization_id').eq('user_id', user.id).limit(1).single()
    if (membership) {
      await db.from('organizations').update({ name: name.trim() }).eq('id', membership.organization_id)
    }
    router.push('/onboarding/branch')
  }

  return (
    <div>
      <OnboardingProgress currentStep={1} />
      <h2 style={{ fontSize: 18, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 8 }}>ชื่อบริษัท / กลุ่มธุรกิจ</h2>
      <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 20 }}>ใส่ชื่อบริษัทหรือกลุ่มธุรกิจของคุณ</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="เช่น Crystal Group"
        style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-base)', marginBottom: 20 }}
      />
      <Button variant="primary" fullWidth disabled={!name.trim() || saving} onClick={handleNext}>
        {saving ? 'กำลังบันทึก...' : 'ต่อไป →'}
      </Button>
    </div>
  )
}
