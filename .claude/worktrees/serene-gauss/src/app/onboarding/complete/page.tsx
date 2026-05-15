'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { OnboardingProgress } from '@/components/onboarding/OnboardingProgress'
import { Check } from 'lucide-react'
import Link from 'next/link'

export default function OnboardingComplete() {
  const supabase = createClient()

  useEffect(() => {
    async function markComplete() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any
      const { data: mem } = await db.from('organization_members').select('organization_id').eq('user_id', user.id).limit(1).single()
      if (mem) {
        await db.from('organizations').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', mem.organization_id)
      }
    }
    markComplete()
  }, [supabase])

  return (
    <div style={{ textAlign: 'center' }}>
      <OnboardingProgress currentStep={5} />

      <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--color-green-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
        <Check size={40} style={{ color: 'var(--color-green)' }} />
      </div>

      <h2 style={{ fontSize: 20, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 8 }}>พร้อมใช้งานแล้ว!</h2>
      <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 24 }}>กรอกข้อมูลวันแรกเลย — ใช้เวลาแค่ 2 นาที</p>

      <Link href="/entry">
        <Button variant="primary" fullWidth>เริ่มกรอกข้อมูล →</Button>
      </Link>

      <Link href="/home" style={{ display: 'block', marginTop: 12, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)', textDecoration: 'none' }}>
        ไปหน้าหลัก
      </Link>
    </div>
  )
}
