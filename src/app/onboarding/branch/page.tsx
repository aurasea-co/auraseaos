'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { OnboardingProgress } from '@/components/onboarding/OnboardingProgress'

export default function OnboardingBranch() {
  const [branchName, setBranchName] = useState('')
  const [branchType, setBranchType] = useState<'accommodation' | 'fnb'>('accommodation')
  const [rooms, setRooms] = useState('')
  const [seats, setSeats] = useState('')
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleNext() {
    if (!branchName.trim()) return
    setSaving(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: membership } = await db.from('organization_members').select('organization_id').eq('user_id', user.id).limit(1).single()
    if (!membership) return

    await db.from('branches').insert({
      id: crypto.randomUUID(),
      organization_id: membership.organization_id,
      name: branchName.trim(),
      business_type: branchType,
      module_type: branchType,
      total_rooms: branchType === 'accommodation' ? parseInt(rooms) || null : null,
      total_seats: branchType === 'fnb' ? parseInt(seats) || null : null,
      // SME-friendly defaults: hotels file morning/afternoon; late-night
      // F&B venues cash out between 02:00 and 04:30 local.
      business_day_cutoff_time: branchType === 'accommodation' ? '14:00:00' : '05:00:00',
    })
    router.push('/onboarding/targets')
  }

  return (
    <div>
      <OnboardingProgress currentStep={2} />
      <h2 style={{ fontSize: 18, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 8 }}>สาขาแรกของคุณ</h2>
      <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 20 }}>เพิ่มสาขาแรกเพื่อเริ่มกรอกข้อมูล</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <input
          value={branchName}
          onChange={(e) => setBranchName(e.target.value)}
          placeholder="ชื่อสาขา เช่น Crystal Resort"
          style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-base)' }}
        />

        <div className="flex gap-3">
          {(['accommodation', 'fnb'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setBranchType(type)}
              style={{
                flex: 1, padding: '16px 12px', borderRadius: 'var(--radius-lg)', cursor: 'pointer', textAlign: 'center',
                border: branchType === type ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                background: branchType === type ? 'var(--color-accent-light)' : 'var(--color-bg)',
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 4 }}>{type === 'accommodation' ? '🏨' : '☕'}</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{type === 'accommodation' ? 'ที่พัก / โรงแรม' : 'ร้านอาหาร / คาเฟ่'}</div>
            </button>
          ))}
        </div>

        {branchType === 'accommodation' ? (
          <input type="number" inputMode="numeric" value={rooms} onChange={(e) => setRooms(e.target.value)} placeholder="จำนวนห้องทั้งหมด" style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-base)' }} />
        ) : (
          <input type="number" inputMode="numeric" value={seats} onChange={(e) => setSeats(e.target.value)} placeholder="จำนวนที่นั่งทั้งหมด" style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-base)' }} />
        )}

        <Button variant="primary" fullWidth disabled={!branchName.trim() || saving} onClick={handleNext}>
          {saving ? 'กำลังบันทึก...' : 'ต่อไป →'}
        </Button>

        <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '12px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            ทดลองใช้ฟรี 14 วัน ไม่ต้องใส่บัตรเครดิต
          </p>
          <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
            หลังจากนั้นติดต่อทีมเพื่อเปิดใช้งาน
          </p>
        </div>
      </div>
    </div>
  )
}
