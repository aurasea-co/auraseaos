'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { OnboardingProgress } from '@/components/onboarding/OnboardingProgress'

export default function OnboardingTeam() {
  const [managerEmail, setManagerEmail] = useState('')
  const [staffEmail, setStaffEmail] = useState('')
  const router = useRouter()

  function handleNext() {
    // Invitations are optional — just proceed
    // TODO: Create invitation rows if emails are filled
    router.push('/onboarding/complete')
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

        <Button variant="primary" fullWidth onClick={handleNext}>ต่อไป →</Button>
        <button onClick={() => router.push('/onboarding/complete')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)', textAlign: 'center', padding: 8 }}>
          ข้าม — เชิญทีหลัง
        </button>
      </div>
    </div>
  )
}
