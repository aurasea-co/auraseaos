'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { LocaleSwitcher } from '@/components/locale-switcher'

// /owner-setup is the landing page from the owner invitation email.
// It walks the new owner through four steps:
//   1. Create account (supabase.auth.signUp)
//   2. Company info → /api/owner-setup/create-org
//   3. First branch → /api/owner-setup/create-branch
//   4. Done — summary + go-to-dashboard CTA
//
// State carries the resolved invitation, the freshly-created org id,
// and trial_ends_at so the final summary can render without an extra
// fetch.

interface Invitation {
  email: string
  organizationName: string
  businessType: 'accommodation' | 'fnb' | 'mixed'
  trialDays: number
  plan: 'starter' | 'growth' | 'pro'
  discountPct: number
  promoCode: string | null
  expiresAt: string
  acceptedAt: string | null
}

type Step = 1 | 2 | 3 | 4
type LoadStatus = 'loading' | 'invalid' | 'expired' | 'accepted' | 'ready'

const PURPLE = '#534AB7'

function OwnerSetupInner() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token') || ''
  const supabase = createClient()

  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading')
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [step, setStep] = useState<Step>(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>('')

  // Step 1
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Step 2
  const [orgName, setOrgName] = useState('')
  const [bizType, setBizType] = useState<'accommodation' | 'fnb' | 'mixed'>('mixed')
  // branchCount is captured but not used to create extra rows in this
  // wizard — the owner adds branches 2+ later from Settings. We still
  // collect it so we know how to size their plan recommendations.
  const [branchCount, setBranchCount] = useState<'1' | '2' | '3+'>('1')

  // Step 3
  const [branchName, setBranchName] = useState('')
  const [branchBizType, setBranchBizType] = useState<'accommodation' | 'fnb'>('accommodation')
  const [totalRooms, setTotalRooms] = useState<string>('')
  const [totalSeats, setTotalSeats] = useState<string>('')

  // Result of step 2 — held in state for step 4 summary
  const [orgId, setOrgId] = useState<string>('')
  const [trialEndsAt, setTrialEndsAt] = useState<string>('')

  useEffect(() => {
    async function load() {
      if (!token) {
        setLoadStatus('invalid')
        return
      }
      const res = await fetch(`/api/owner-setup/lookup?token=${encodeURIComponent(token)}`)
      if (!res.ok) {
        setLoadStatus('invalid')
        return
      }
      const data = await res.json()
      const inv: Invitation = {
        email: data.email,
        organizationName: data.organizationName || '',
        businessType: data.businessType,
        trialDays: data.trialDays,
        plan: data.plan,
        discountPct: data.discountPct,
        promoCode: data.promoCode,
        expiresAt: data.expiresAt,
        acceptedAt: data.acceptedAt,
      }
      setInvitation(inv)
      setOrgName(inv.organizationName)
      setBizType(inv.businessType)
      setBranchBizType(inv.businessType === 'fnb' ? 'fnb' : 'accommodation')

      if (inv.acceptedAt) setLoadStatus('accepted')
      else if (new Date(inv.expiresAt).getTime() < Date.now()) setLoadStatus('expired')
      else setLoadStatus('ready')
    }
    load()
  }, [token])

  // ---- handlers ----------------------------------------------------------

  async function handleStep1(e: React.FormEvent) {
    e.preventDefault()
    if (!invitation || submitting) return
    setError('')
    if (!displayName.trim()) return setError('กรุณากรอกชื่อ-นามสกุล')
    if (password.length < 8) return setError('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')
    if (password !== confirmPassword) return setError('รหัสผ่านไม่ตรงกัน')

    setSubmitting(true)
    try {
      const { data, error: signUpErr } = await supabase.auth.signUp({
        email: invitation.email,
        password,
        options: { data: { display_name: displayName.trim() } },
      })
      if (signUpErr) {
        const msg = signUpErr.message.toLowerCase()
        if (msg.includes('already registered') || msg.includes('already exists')) {
          // Existing account — sign in instead, then continue.
          const { error: signInErr } = await supabase.auth.signInWithPassword({
            email: invitation.email,
            password,
          })
          if (signInErr) {
            return setError('อีเมลนี้มีบัญชีอยู่แล้ว และรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบรหัสผ่าน')
          }
        } else {
          return setError(signUpErr.message)
        }
      } else if (!data.session) {
        return setError('บัญชีถูกสร้างแล้ว แต่ Supabase ต้องการการยืนยันอีเมล กรุณาปิด Confirm email ใน Supabase')
      }
      setStep(2)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleStep2(e: React.FormEvent) {
    e.preventDefault()
    if (!invitation || submitting) return
    setError('')
    if (!orgName.trim()) return setError('กรุณากรอกชื่อบริษัท/ร้าน')
    setSubmitting(true)
    try {
      const res = await fetch('/api/owner-setup/create-org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          organizationName: orgName.trim(),
          businessType: bizType,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) {
        return setError(json.error || 'สร้างบริษัทไม่สำเร็จ')
      }
      setOrgId(json.organizationId)
      setTrialEndsAt(json.trialEndsAt)
      setStep(3)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleStep3(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId || submitting) return
    setError('')
    if (!branchName.trim()) return setError('กรุณากรอกชื่อสาขา')
    setSubmitting(true)
    try {
      const res = await fetch('/api/owner-setup/create-branch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: orgId,
          branchName: branchName.trim(),
          businessType: branchBizType,
          totalRooms: totalRooms ? parseInt(totalRooms, 10) : null,
          totalSeats: totalSeats ? parseInt(totalSeats, 10) : null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) {
        return setError(json.error || 'สร้างสาขาไม่สำเร็จ')
      }
      setStep(4)
    } finally {
      setSubmitting(false)
    }
  }

  function handleGoHome() {
    router.push('/home')
  }

  // ---- render ------------------------------------------------------------

  if (loadStatus === 'loading') {
    return <Centered><p style={muted}>กำลังตรวจสอบลิงก์...</p></Centered>
  }
  if (loadStatus === 'invalid') {
    return (
      <Centered>
        <h1 style={heading}>ลิงก์นี้ไม่ถูกต้อง</h1>
        <p style={muted}>กรุณาติดต่อทีม Aurasea เพื่อขอลิงก์ใหม่</p>
      </Centered>
    )
  }
  if (loadStatus === 'expired') {
    return (
      <Centered>
        <h1 style={heading}>ลิงก์คำเชิญหมดอายุแล้ว</h1>
        <p style={muted}>กรุณาติดต่อทีม Aurasea เพื่อขอลิงก์ใหม่</p>
      </Centered>
    )
  }
  if (loadStatus === 'accepted') {
    return (
      <Centered>
        <h1 style={heading}>คำเชิญนี้ถูกใช้งานไปแล้ว</h1>
        <p style={muted}>กรุณาเข้าสู่ระบบเพื่อเริ่มใช้งาน</p>
        <div style={{ marginTop: 16 }}>
          <Link href="/login" style={{ color: PURPLE, fontSize: 14 }}>ไปหน้าเข้าสู่ระบบ →</Link>
        </div>
      </Centered>
    )
  }

  if (!invitation) return null

  return (
    <Centered>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <LocaleSwitcher />
      </div>
      <ProgressBar step={step} />

      {step === 1 && (
        <form onSubmit={handleStep1} style={formStyle}>
          <InviteSummary invitation={invitation} />
          <h2 style={stepHeading}>1. สร้างบัญชี</h2>
          <Field label="ชื่อ-นามสกุล">
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus required style={inputStyle} />
          </Field>
          <Field label="อีเมล">
            <input type="email" value={invitation.email} disabled style={{ ...inputStyle, color: '#9b9b9b', background: '#f7f7f5' }} />
          </Field>
          <Field label="รหัสผ่าน (อย่างน้อย 8 ตัวอักษร)">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required autoComplete="new-password" style={inputStyle} />
          </Field>
          <Field label="ยืนยันรหัสผ่าน">
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} required autoComplete="new-password" style={inputStyle} />
          </Field>
          {error && <ErrorBox text={error} />}
          <PrimaryButton type="submit" disabled={submitting}>{submitting ? 'กำลังสร้าง...' : 'สร้างบัญชี →'}</PrimaryButton>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleStep2} style={formStyle}>
          <h2 style={stepHeading}>2. ข้อมูลบริษัท</h2>
          <Field label="ชื่อบริษัท / ร้าน">
            <input type="text" value={orgName} onChange={(e) => setOrgName(e.target.value)} autoFocus required style={inputStyle} />
          </Field>
          <Field label="ประเภทธุรกิจ">
            <select value={bizType} onChange={(e) => setBizType(e.target.value as typeof bizType)} style={inputStyle}>
              <option value="accommodation">โรงแรม / รีสอร์ท</option>
              <option value="fnb">คาเฟ่ / ร้านอาหาร</option>
              <option value="mixed">ทั้งสองประเภท</option>
            </select>
          </Field>
          <Field label="จำนวนสาขา">
            <select value={branchCount} onChange={(e) => setBranchCount(e.target.value as typeof branchCount)} style={inputStyle}>
              <option value="1">1 สาขา</option>
              <option value="2">2 สาขา</option>
              <option value="3+">3 สาขาขึ้นไป</option>
            </select>
          </Field>
          {error && <ErrorBox text={error} />}
          <PrimaryButton type="submit" disabled={submitting}>{submitting ? 'กำลังบันทึก...' : 'ต่อไป →'}</PrimaryButton>
        </form>
      )}

      {step === 3 && (
        <form onSubmit={handleStep3} style={formStyle}>
          <h2 style={stepHeading}>3. ตั้งค่าสาขาแรก</h2>
          <Field label="ชื่อสาขา">
            <input type="text" value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="เช่น Crystal Resort Korat" autoFocus required style={inputStyle} />
          </Field>
          <Field label="ประเภทสาขา">
            <select value={branchBizType} onChange={(e) => setBranchBizType(e.target.value as typeof branchBizType)} style={inputStyle}>
              <option value="accommodation">โรงแรม / รีสอร์ท</option>
              <option value="fnb">คาเฟ่ / ร้านอาหาร / เบเกอรี่</option>
            </select>
          </Field>
          {branchBizType === 'accommodation' ? (
            <Field label="จำนวนห้องทั้งหมด">
              <input type="number" inputMode="numeric" value={totalRooms} onChange={(e) => setTotalRooms(e.target.value)} required style={inputStyle} />
            </Field>
          ) : (
            <Field label="จำนวนที่นั่ง (ไม่บังคับ)">
              <input type="number" inputMode="numeric" value={totalSeats} onChange={(e) => setTotalSeats(e.target.value)} style={inputStyle} />
            </Field>
          )}
          {error && <ErrorBox text={error} />}
          <PrimaryButton type="submit" disabled={submitting}>{submitting ? 'กำลังบันทึก...' : 'ต่อไป →'}</PrimaryButton>
        </form>
      )}

      {step === 4 && (
        <div style={{ ...formStyle, textAlign: 'center' }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: '#E6F4EE',
            color: '#0F5132',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto',
          }}>
            <Check size={32} />
          </div>
          <h2 style={{ ...stepHeading, marginTop: 16, textAlign: 'center' }}>เสร็จสิ้น 🎉</h2>
          <div style={{ background: '#f7f7f5', padding: '14px 16px', borderRadius: 8, fontSize: 13, color: '#1a1a1a', lineHeight: 1.7, textAlign: 'left' }}>
            <div>บริษัท: <strong>{orgName}</strong></div>
            <div>สาขา: <strong>{branchName}</strong></div>
            <div>แผน: <strong>{invitation.plan[0].toUpperCase() + invitation.plan.slice(1)}</strong></div>
            <div>ทดลองใช้: <strong>{invitation.trialDays} วัน</strong>{trialEndsAt && ` (สิ้นสุด ${formatDate(trialEndsAt)})`}</div>
            {invitation.discountPct > 0 && (
              <div style={{ marginTop: 6, color: '#8A5A00' }}>
                ลด {invitation.discountPct}% เดือนแรก หากต่ออายุภายใน 7 วันหลังหมดทดลอง
              </div>
            )}
          </div>
          <PrimaryButton onClick={handleGoHome}>ไปที่ Dashboard →</PrimaryButton>
        </div>
      )}
    </Centered>
  )
}

export default function OwnerSetupPage() {
  return (
    <Suspense fallback={<Centered><p style={muted}>กำลังโหลด...</p></Centered>}>
      <OwnerSetupInner />
    </Suspense>
  )
}

// ---- presentational helpers ---------------------------------------------

function ProgressBar({ step }: { step: Step }) {
  const labels = ['บัญชี', 'บริษัท', 'สาขา', 'เสร็จสิ้น']
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
      {labels.map((label, i) => {
        const n = (i + 1) as Step
        const done = step > n
        const active = step === n
        return (
          <div key={i} style={{ textAlign: 'center' }}>
            <div style={{
              width: '100%',
              height: 4,
              background: done || active ? '#1D9E75' : '#f0f0ee',
              borderRadius: 999,
              marginBottom: 6,
              transition: 'background 220ms ease',
            }} />
            <div style={{
              fontSize: 11,
              fontWeight: active ? 600 : 400,
              color: active ? '#1a1a1a' : '#9b9b9b',
            }}>
              {label}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function InviteSummary({ invitation }: { invitation: Invitation }) {
  return (
    <div style={{ background: '#f7f7f5', padding: '12px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13, color: '#1a1a1a', lineHeight: 1.55 }}>
      <div>บริษัท: <strong>{invitation.organizationName || '—'}</strong></div>
      <div>ทดลองใช้: <strong>{invitation.trialDays} วัน</strong> · แผน <strong>{invitation.plan[0].toUpperCase() + invitation.plan.slice(1)}</strong></div>
      {invitation.discountPct > 0 && (
        <div style={{ marginTop: 4, color: '#8A5A00', fontSize: 12 }}>
          ลด {invitation.discountPct}% เดือนแรกหากต่ออายุภายใน 7 วันหลังหมดทดลอง
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, color: '#6b6b6b' }}>{label}</span>
      {children}
    </label>
  )
}

function PrimaryButton({ onClick, type = 'button', disabled, children }: { onClick?: () => void; type?: 'button' | 'submit'; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '12px 18px',
        background: disabled ? '#bbb' : PURPLE,
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        minHeight: 44,
        marginTop: 4,
      }}
    >
      {children}
    </button>
  )
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 13, color: '#A32D2D', background: '#FBEAEA', padding: '8px 12px', borderRadius: 6 }}>
      {text}
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 460, background: '#ffffff', borderRadius: 12, padding: 28, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        {children}
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

const heading: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 600,
  color: '#1a1a1a',
  margin: 0,
  letterSpacing: '-0.01em',
}

const stepHeading: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: '#1a1a1a',
  margin: '0 0 4px',
}

const muted: React.CSSProperties = {
  fontSize: 14,
  color: '#6b6b6b',
  margin: 0,
  lineHeight: 1.5,
}

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 12px',
  border: '1px solid #d4d4d4',
  borderRadius: 8,
  fontSize: 15,
  color: '#1a1a1a',
  minHeight: 44,
  boxSizing: 'border-box',
  background: '#fff',
}
