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
  | 'ready'        // not authed, showing the two-option screen
  | 'magicForm'    // new-user magic-link form open
  | 'sendingLink'  // magic link request in flight
  | 'linkSent'     // success — email sent
  | 'joining'      // authed user accepting
  | 'joinError'

function JoinPageInner() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token') || ''
  const supabase = createClient()

  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null)
  const [isAuthed, setIsAuthed] = useState(false)
  const [magicEmail, setMagicEmail] = useState('')

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
      setMagicEmail(inv.invitee_email)

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

  async function handleSendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!magicEmail.trim()) return
    setStatus('sendingLink')
    setErrorMessage('')

    // The magic-link confirmation URL routes through /auth/callback
    // (PKCE code exchange), which then forwards to /join/complete?token=xxx
    // where we POST to /api/invite/accept and land the user on /welcome.
    const next = `/join/complete?token=${encodeURIComponent(token)}`
    const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`

    const { error } = await supabase.auth.signInWithOtp({
      email: magicEmail.trim(),
      options: { emailRedirectTo },
    })

    if (error) {
      setErrorMessage(error.message || 'ส่งลิงก์ไม่สำเร็จ')
      setStatus('magicForm')
      return
    }
    setStatus('linkSent')
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
  const joinPath = `/join?token=${encodeURIComponent(token)}`
  const loginHref = `/login?returnTo=${encodeURIComponent(joinPath)}`

  // Magic-link "check your inbox" screen
  if (status === 'linkSent') {
    return (
      <CenteredCard>
        <div style={{ fontSize: 36, marginBottom: 8 }}>📬</div>
        <h1 style={heading}>ตรวจสอบอีเมลของคุณ</h1>
        <p style={{ ...muted, marginTop: 6 }}>
          ส่งลิงก์ไปที่ <strong>{magicEmail.trim()}</strong> แล้ว
        </p>
        <p style={{ ...muted, marginTop: 12 }}>
          เปิดอีเมลจาก Aurasea แล้วคลิกลิงก์เพื่อเข้าสู่ระบบและเข้าร่วม{' '}
          <strong>{invitation.organization_name}</strong>
        </p>
        <div style={{ marginTop: 20 }}>
          <button
            onClick={() => setStatus('magicForm')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#534AB7', textDecoration: 'underline' }}
          >
            ไม่ได้รับอีเมล? ส่งอีกครั้ง
          </button>
        </div>
      </CenteredCard>
    )
  }

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

      {/* Already-signed-in shortcut */}
      {isAuthed && status !== 'magicForm' && (
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
      )}

      {/* Magic-link form */}
      {status === 'magicForm' || status === 'sendingLink' ? (
        <form onSubmit={handleSendMagicLink} style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ fontSize: 12, color: '#6b6b6b' }}>อีเมล</label>
          <input
            type="email"
            value={magicEmail}
            onChange={(e) => setMagicEmail(e.target.value)}
            placeholder="you@example.com"
            required
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #d4d4d4', borderRadius: 8, fontSize: 14, color: '#1a1a1a' }}
          />
          <Button variant="primary" fullWidth type="submit" disabled={status === 'sendingLink' || !magicEmail.trim()}>
            {status === 'sendingLink' ? 'กำลังส่ง...' : 'ส่งลิงก์เข้าสู่ระบบ'}
          </Button>
          <button
            type="button"
            onClick={() => setStatus('ready')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#9b9b9b', padding: 6 }}
          >
            ย้อนกลับ
          </button>
        </form>
      ) : (
        !isAuthed && (
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Button variant="primary" fullWidth onClick={() => setStatus('magicForm')}>
              สร้างบัญชีใหม่ด้วยอีเมล {invitation.invitee_email}
            </Button>
            <Link href={loginHref}>
              <Button variant="secondary" fullWidth>มีบัญชีอยู่แล้ว — เข้าสู่ระบบ</Button>
            </Link>
            <p style={{ fontSize: 12, color: '#9b9b9b', textAlign: 'center', margin: '4px 0 0', lineHeight: 1.5 }}>
              ไม่ต้องตั้งรหัสผ่าน — เราจะส่งลิงก์เข้าสู่ระบบให้ทางอีเมล
            </p>
          </div>
        )
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
