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

type Status = 'loading' | 'invalid' | 'expired' | 'accepted' | 'ready' | 'joining' | 'joinError'

function JoinPageInner() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token') || ''
  const supabase = createClient()

  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null)
  const [isAuthed, setIsAuthed] = useState(false)

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
      setIsAuthed(!!userRes?.user)
      setStatus('ready')
    }
    load()
  }, [token, supabase])

  async function handleAcceptAfterAuth() {
    setStatus('joining')
    try {
      const res = await fetch('/api/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setErrorMessage(json.error || 'เข้าร่วมไม่สำเร็จ')
        setStatus('joinError')
        return
      }
      router.push('/welcome')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'เข้าร่วมไม่สำเร็จ')
      setStatus('joinError')
    }
  }

  if (status === 'loading') {
    return <CenteredCard><p style={muted}>กำลังตรวจสอบลิงก์...</p></CenteredCard>
  }

  if (status === 'invalid' || status === 'expired') {
    return (
      <CenteredCard>
        <h1 style={heading}>ลิงก์หมดอายุหรือไม่ถูกต้อง</h1>
        <p style={muted}>กรุณาติดต่อเจ้าของบัญชีเพื่อขอลิงก์ใหม่</p>
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

  // ready or joining or joinError
  if (!invitation) return null

  const roleLabel = invitation.role === 'manager' ? 'Manager' : 'Staff'
  const joinPath = `/join?token=${encodeURIComponent(token)}`
  const loginHref = `/login?returnTo=${encodeURIComponent(joinPath)}`
  const registerHref = `/register?token=${encodeURIComponent(token)}&email=${encodeURIComponent(invitation.invitee_email)}`

  return (
    <CenteredCard>
      <p style={{ fontSize: 13, color: '#9b9b9b', margin: '0 0 6px', letterSpacing: '0.04em' }}>คำเชิญเข้าร่วม</p>
      <h1 style={heading}>{invitation.organization_name}</h1>
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

      {isAuthed ? (
        <div style={{ marginTop: 20 }}>
          <Button
            variant="primary"
            fullWidth
            disabled={status === 'joining'}
            onClick={handleAcceptAfterAuth}
          >
            {status === 'joining' ? 'กำลังเข้าร่วม...' : 'ยอมรับและเข้าร่วม →'}
          </Button>
        </div>
      ) : (
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Link href={loginHref}>
            <Button variant="primary" fullWidth>มีบัญชีอยู่แล้ว — เข้าสู่ระบบ</Button>
          </Link>
          <Link href={registerHref}>
            <Button variant="secondary" fullWidth>สร้างบัญชีใหม่</Button>
          </Link>
        </div>
      )}
    </CenteredCard>
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
      <div style={{ width: '100%', maxWidth: 440, background: '#ffffff', borderRadius: 12, padding: 28, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
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
  color: '#534AB7',
  textDecoration: 'none',
}
