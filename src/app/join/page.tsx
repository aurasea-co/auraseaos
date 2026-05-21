'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'

interface InvitationDetails {
  organization_name: string
  branch_name: string | null
  role: 'manager' | 'staff'
  invitee_email: string
  accepted_at: string | null
  expires_at: string
}

type Status =
  | 'loading'
  | 'invalid'
  | 'expired'
  | 'accepted'
  | 'signup'      // new user — show signUp form (default)
  | 'login'       // existing user — show signIn form
  | 'authedReady' // already logged-in, just need to accept

const PURPLE = '#534AB7'

function JoinPageInner() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token') || ''
  const supabase = createClient()

  const [status, setStatus] = useState<Status>('loading')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null)

  // signUp form
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // login form
  const [loginPassword, setLoginPassword] = useState('')

  useEffect(() => {
    async function load() {
      if (!token) {
        setStatus('invalid')
        return
      }

      const res = await fetch(`/api/invite/lookup?token=${encodeURIComponent(token)}`)
      if (!res.ok) {
        setStatus('invalid')
        return
      }
      const data = await res.json()

      const inv: InvitationDetails = {
        organization_name: data.organizationName || '',
        branch_name: data.branchName || null,
        role: data.role,
        invitee_email: data.inviteeEmail,
        accepted_at: data.acceptedAt,
        expires_at: data.expiresAt,
      }
      setInvitation(inv)

      if (inv.accepted_at) {
        setStatus('accepted')
        return
      }
      if (new Date(inv.expires_at).getTime() < Date.now()) {
        setStatus('expired')
        return
      }

      const { data: userRes } = await supabase.auth.getUser()
      setStatus(userRes?.user ? 'authedReady' : 'signup')
    }
    load()
  }, [token, supabase])

  async function acceptInvitation(): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch('/api/invite/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        displayName: displayName.trim() || undefined,
      }),
    })
    const json = await res.json()
    if (!res.ok || !json.success) {
      return { ok: false, error: json.error || 'เข้าร่วมไม่สำเร็จ' }
    }
    return { ok: true }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    if (!invitation || submitting) return
    setErrorMessage('')

    if (!displayName.trim()) {
      setErrorMessage('กรุณากรอกชื่อที่ใช้แสดง')
      return
    }
    if (password.length < 8) {
      setErrorMessage('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')
      return
    }
    if (password !== confirmPassword) {
      setErrorMessage('รหัสผ่านไม่ตรงกัน')
      return
    }

    setSubmitting(true)
    try {
      const { data, error } = await supabase.auth.signUp({
        email: invitation.invitee_email,
        password,
        options: {
          data: { display_name: displayName.trim() },
        },
      })

      if (error) {
        const msg = error.message.toLowerCase()
        if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('user already')) {
          setErrorMessage('อีเมลนี้มีบัญชีอยู่แล้ว — กรุณาเข้าสู่ระบบ')
          setStatus('login')
          return
        }
        setErrorMessage(error.message)
        return
      }

      // Supabase returns a user with empty identities[] when the email already
      // exists (this avoids leaking existence). Detect and bounce to login.
      if (data.user && (data.user.identities?.length ?? 0) === 0) {
        setErrorMessage('อีเมลนี้มีบัญชีอยู่แล้ว — กรุณาเข้าสู่ระบบ')
        setStatus('login')
        return
      }

      // If "Confirm email" is enabled in Supabase, signUp returns a user but
      // no session. We can't call /api/invite/accept without a session.
      if (!data.session) {
        setErrorMessage(
          'บัญชีถูกสร้างแล้ว แต่ Supabase ต้องการการยืนยันอีเมล กรุณาปิด Confirm email ใน Supabase หรือยืนยันอีเมลก่อนกลับมา',
        )
        return
      }

      const result = await acceptInvitation()
      if (!result.ok) {
        setErrorMessage(result.error || 'เข้าร่วมไม่สำเร็จ')
        return
      }
      router.push('/welcome')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!invitation || submitting) return
    setErrorMessage('')

    if (!loginPassword) {
      setErrorMessage('กรุณากรอกรหัสผ่าน')
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: invitation.invitee_email,
        password: loginPassword,
      })

      if (error) {
        setErrorMessage('อีเมลหรือรหัสผ่านไม่ถูกต้อง')
        return
      }

      const result = await acceptInvitation()
      if (!result.ok) {
        setErrorMessage(result.error || 'เข้าร่วมไม่สำเร็จ')
        return
      }
      router.push('/welcome')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAuthedAccept() {
    if (submitting) return
    setErrorMessage('')
    setSubmitting(true)
    try {
      const result = await acceptInvitation()
      if (!result.ok) {
        setErrorMessage(result.error || 'เข้าร่วมไม่สำเร็จ')
        return
      }
      router.push('/welcome')
    } finally {
      setSubmitting(false)
    }
  }

  if (status === 'loading') {
    return <CenteredCard><p style={muted}>กำลังตรวจสอบลิงก์...</p></CenteredCard>
  }

  if (status === 'invalid' || status === 'expired') {
    return (
      <CenteredCard>
        <h1 style={heading}>ลิงก์หมดอายุหรือไม่ถูกต้อง</h1>
        <p style={muted}>กรุณาติดต่อ Owner เพื่อขอคำเชิญใหม่</p>
        <Link href="/login" style={linkStyle}>กลับไปหน้าเข้าสู่ระบบ →</Link>
      </CenteredCard>
    )
  }

  if (status === 'accepted') {
    return (
      <CenteredCard>
        <h1 style={heading}>คุณเข้าร่วมแล้ว</h1>
        <p style={muted}>คุณได้รับสิทธิ์เข้าใช้งานแล้ว เข้าสู่ระบบเพื่อเริ่มใช้งาน</p>
        <div style={{ marginTop: 16 }}>
          <Link href="/login">
            <Button variant="primary" fullWidth>เข้าสู่ระบบ →</Button>
          </Link>
        </div>
      </CenteredCard>
    )
  }

  if (!invitation) return null

  const roleLabel = invitation.role === 'manager' ? 'Manager' : 'Staff'
  const orgLabel = invitation.organization_name

  return (
    <CenteredCard>
      <p style={{ fontSize: 13, color: '#9b9b9b', margin: '0 0 6px', letterSpacing: '0.04em' }}>คำเชิญเข้าร่วม</p>
      <h1 style={heading}>{orgLabel}</h1>

      {/* Invitation info box */}
      <div style={{ marginTop: 14, background: '#f7f7f5', padding: '14px 16px', borderRadius: 8 }}>
        {invitation.branch_name && (
          <div style={{ fontSize: 14, color: '#1a1a1a', marginBottom: 4 }}>
            สาขา: <strong>{invitation.branch_name}</strong>
          </div>
        )}
        <div style={{ fontSize: 14, color: '#1a1a1a' }}>
          ตำแหน่ง: <strong>{roleLabel}</strong>
        </div>
        <div style={{ fontSize: 12, color: '#9b9b9b', marginTop: 6 }}>
          อีเมล: {invitation.invitee_email}
        </div>
      </div>

      {errorMessage && (
        <div style={{ marginTop: 16, fontSize: 13, color: '#A32D2D', background: '#FBEAEA', padding: '8px 12px', borderRadius: 6 }}>
          {errorMessage}
        </div>
      )}

      {/* Already authed — one click to accept */}
      {status === 'authedReady' && (
        <div style={{ marginTop: 20 }}>
          <Button variant="primary" fullWidth onClick={handleAuthedAccept} disabled={submitting}>
            {submitting ? 'กำลังเข้าร่วม...' : 'ยอมรับและเข้าร่วม →'}
          </Button>
        </div>
      )}

      {/* SIGN-UP form */}
      {status === 'signup' && (
        <form onSubmit={handleSignUp} style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="ชื่อที่ใช้แสดง">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="ชื่อของคุณ"
              required
              autoFocus
              style={inputStyle}
            />
          </Field>
          <Field label="รหัสผ่าน (อย่างน้อย 8 ตัวอักษร)">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              autoComplete="new-password"
              style={inputStyle}
            />
          </Field>
          <Field label="ยืนยันรหัสผ่าน">
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              required
              autoComplete="new-password"
              style={inputStyle}
            />
          </Field>
          <div style={{ marginTop: 4 }}>
            <Button variant="primary" fullWidth type="submit" disabled={submitting}>
              {submitting ? 'กำลังสร้างบัญชี...' : `สร้างบัญชีและเข้าร่วม ${orgLabel} →`}
            </Button>
          </div>
          <button
            type="button"
            onClick={() => { setErrorMessage(''); setStatus('login') }}
            style={textButton}
          >
            มีบัญชีอยู่แล้ว — เข้าสู่ระบบ
          </button>
        </form>
      )}

      {/* LOGIN form */}
      {status === 'login' && (
        <form onSubmit={handleLogin} style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="อีเมล">
            <input
              type="email"
              value={invitation.invitee_email}
              disabled
              style={{ ...inputStyle, color: '#9b9b9b', background: '#f7f7f5' }}
            />
          </Field>
          <Field label="รหัสผ่าน">
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              required
              autoFocus
              autoComplete="current-password"
              style={inputStyle}
            />
          </Field>
          <div style={{ marginTop: 4 }}>
            <Button variant="primary" fullWidth type="submit" disabled={submitting}>
              {submitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบและเข้าร่วม →'}
            </Button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
            <button
              type="button"
              onClick={() => { setErrorMessage(''); setStatus('signup') }}
              style={textButton}
            >
              ยังไม่มีบัญชี — สร้างบัญชีใหม่
            </button>
            <Link href="/forgot-password" style={{ fontSize: 13, color: PURPLE, textDecoration: 'none' }}>
              ลืมรหัสผ่าน?
            </Link>
          </div>
        </form>
      )}
    </CenteredCard>
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

export default function JoinPage() {
  return (
    <Suspense fallback={<CenteredCard><p style={muted}>กำลังโหลด...</p></CenteredCard>}>
      <JoinPageInner />
    </Suspense>
  )
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 420, background: '#ffffff', borderRadius: 12, padding: 28, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        {children}
      </div>
    </div>
  )
}

const heading: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 600,
  color: '#1a1a1a',
  margin: '0 0 6px',
  letterSpacing: '-0.01em',
}

const muted: React.CSSProperties = {
  fontSize: 14,
  color: '#6b6b6b',
  margin: 0,
  lineHeight: 1.5,
}

const linkStyle: React.CSSProperties = {
  display: 'inline-block',
  marginTop: 16,
  fontSize: 14,
  color: PURPLE,
  textDecoration: 'none',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 12px',
  border: '1px solid #d4d4d4',
  borderRadius: 8,
  fontSize: 15,
  color: '#1a1a1a',
  // touch-friendly height
  minHeight: 44,
  boxSizing: 'border-box',
}

const textButton: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 13,
  color: PURPLE,
  padding: 6,
  textAlign: 'left',
  textDecoration: 'underline',
}
