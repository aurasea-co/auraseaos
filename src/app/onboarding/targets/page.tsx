'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { OnboardingProgress } from '@/components/onboarding/OnboardingProgress'

export default function OnboardingTargets() {
  const [branchType, setBranchType] = useState<string>('accommodation')
  const [branchId, setBranchId] = useState<string>('')
  const [orgId, setOrgId] = useState<string>('')
  const [adrTarget, setAdrTarget] = useState('')
  const [occTarget, setOccTarget] = useState('80')
  const [coversTarget, setCoversTarget] = useState('')
  const [cogsTarget, setCogsTarget] = useState('32')
  const [labourTarget, setLabourTarget] = useState('30')
  const [salary, setSalary] = useState('')
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any
      const { data: mem } = await db.from('organization_members').select('organization_id').eq('user_id', user.id).limit(1).single()
      if (!mem) return
      setOrgId(mem.organization_id)
      const { data: branches } = await db.from('branches').select('id, business_type').eq('organization_id', mem.organization_id).limit(1)
      if (branches?.[0]) {
        setBranchId(branches[0].id)
        setBranchType(branches[0].business_type)
      }
    }
    load()
  }, [supabase])

  async function handleNext() {
    if (!branchId) return
    setSaving(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    await db.from('targets').upsert({
      branch_id: branchId,
      organization_id: orgId,
      adr_target: branchType === 'accommodation' ? parseFloat(adrTarget) || null : null,
      occupancy_target: branchType === 'accommodation' ? parseFloat(occTarget) || null : null,
      covers_target: branchType !== 'accommodation' ? parseInt(coversTarget) || null : null,
      cogs_target: branchType !== 'accommodation' ? parseFloat(cogsTarget) || null : null,
      labour_target: parseFloat(labourTarget) || 30,
      monthly_salary: parseFloat(salary) || 0,
      operating_days: 30,
    }, { onConflict: 'branch_id' })
    router.push('/onboarding/team')
  }

  const isHotel = branchType === 'accommodation'

  return (
    <div>
      <OnboardingProgress currentStep={3} />
      <h2 style={{ fontSize: 18, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 8 }}>ตั้งเป้าหมาย</h2>
      <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 20 }}>กำหนดเป้าหมายเพื่อให้ Aurasea แนะนำได้ตรงจุด</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {isHotel ? (
          <>
            <Field label="ADR เป้า (฿ / คืน)" value={adrTarget} onChange={setAdrTarget} placeholder="เช่น 2025" />
            <Field label="Occupancy เป้า (%)" value={occTarget} onChange={setOccTarget} placeholder="เช่น 80" />
          </>
        ) : (
          <>
            <Field label="Covers เป้า / วัน" value={coversTarget} onChange={setCoversTarget} placeholder="เช่น 75" />
            <Field label="COGS % เป้า" value={cogsTarget} onChange={setCogsTarget} placeholder="เช่น 32" />
          </>
        )}
        <Field label="Labour % เป้า" value={labourTarget} onChange={setLabourTarget} placeholder="เช่น 30" />
        <Field label="เงินเดือนรวม / เดือน (฿)" value={salary} onChange={setSalary} placeholder="เช่น 130000" hint="ไม่บังคับ — เพิ่มทีหลังได้" />

        <Button variant="primary" fullWidth disabled={saving} onClick={handleNext}>
          {saving ? 'กำลังบันทึก...' : 'ต่อไป →'}
        </Button>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, hint }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; hint?: string }) {
  return (
    <div>
      <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>{label}</label>
      <input type="number" inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ width: '100%', padding: '9px 14px', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-base)' }} />
      {hint && <p style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{hint}</p>}
    </div>
  )
}
