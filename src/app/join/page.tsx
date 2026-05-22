'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { LocaleSwitcher } from '@/components/locale-switcher'

interface InvitationDetails {
  organization_id: string
  branch_id: string | null
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
  | 'signup'        // new user — show signUp form (default)
  | 'login'         // existing user — show signIn form
  | 'authedReady'   // logged in AS invitee, not yet a member — one-click accept
  | 'wrongAccount'  // logged in as a different user than the invitee_email
  | 'alreadyMember' // logged in AS invitee and already a member of this branch

const PURPLE = '#534AB7'

function JoinPageInner() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token') || ''
  const supabase = createClient()
  const t = useTranslations('join')

  const [status, setStatus] = useState<Status>('loading')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null)
  const [currentEmail, setCurrentEmail] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

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
        organization_id: data.organizationId || '',
        branch_id: data.branchId || null,
        organization_name: data.organizationName || '',
        branch_name: data.branchName || null,
        role: data.role,
        invitee_email: data.inviteeEmail,
        accepted_at: data.acceptedAt,
        expires_at: data.expiresAt,
      }
      setInvitation(inv)

      if (new Date(inv.expires_at).getTime() < Date.now()) {
        setStatus('expired')
        return
      }

      const { data: userRes } = await supabase.auth.getUser()
      const sessionUser = userRes?.user
      const sessionEmail = sessionUser?.email?.toLowerCase() || null
      setCurrentEmail(sessionUser?.email || null)

      const inviteEmailLower = inv.invitee_email.toLowerCase()
      const emailsMatch = sessionEmail === inviteEmailLower

      // Already-accepted invitation — three paths:
      //   logged in as the invitee    → go straight to /home
      //   logged in as someone else   → wrongAccount screen
      //   not logged in               → 'accepted' screen with login form
      if (inv.accepted_at) {
        if (sessionUser && emailsMatch) {
          router.replace('/home')
          return
        }
        if (sessionUser && !emailsMatch) {
          setStatus('wrongAccount')
          return
        }
        setStatus('accepted')
        return
      }

      // Pending invitation, no session → signup form
      if (!sessionUser) {
        setStatus('signup')
        return
      }

      if (!emailsMatch) {
        // Different account is signed in — show the disambiguation screen.
        setStatus('wrongAccount')
        return
      }

      // Emails match. If the user already has a row in branch_members for
      // this branch, they've already joined — send them to the dashboard
      // instead of trying to re-accept.
      if (inv.branch_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabase as any
        const { data: existingMembership } = await db
          .from('branch_members')
          .select('id')
          .eq('user_id', sessionUser.id)
          .eq('branch_id', inv.branch_id)
          .maybeSingle()
        if (existingMembership) {
          setStatus('alreadyMember')
          return
        }
      }

      // If the invitation row was marked accepted but the membership
      // doesn't exist (e.g. branch was recreated), still let them through
      // the authedReady flow — the accept route is idempotent.
      setStatus('authedReady')
    }
    load()
  }, [token, supabase, router])

  async function acceptInvitation(): Promise<{ ok: boolean; error?: string; alreadyAccepted?: boolean }> {
    const res = await fetch('/api/invite/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        displayName: displayName.trim() || undefined,
      }),
    })
    // 409 = invitation already accepted. That's not an error — it just
    // means we beat the server to it (e.g. user signed in with an
    // already-joined account). Treat as success so the caller can
    // proceed to redirect.
    if (res.status === 409) {
      return { ok: true, alreadyAccepted: true }
    }
    const json = await res.json()
    if (!res.ok || !json.success) {
      return { ok: false, error: json.error || t('errJoinFailed') }
    }
    return { ok: true }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    if (!invitation || submitting) return
    setErrorMessage('')

    if (!displayName.trim()) {
      setErrorMessage(t('errDisplayName'))
      return
    }
    if (password.length < 8) {
      setErrorMessage(t('errPasswordShort'))
      return
    }
    if (password !== confirmPassword) {
      setErrorMessage(t('errPasswordMismatch'))
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
          setErrorMessage(t('errEmailExists'))
          setStatus('login')
          return
        }
        setErrorMessage(error.message)
        return
      }

      // Supabase returns a user with empty identities[] when the email already
      // exists (this avoids leaking existence). Detect and bounce to login.
      if (data.user && (data.user.identities?.length ?? 0) === 0) {
        setErrorMessage(t('errEmailExists'))
        setStatus('login')
        return
      }

      // If "Confirm email" is enabled in Supabase, signUp returns a user but
      // no session. We can't call /api/invite/accept without a session.
      if (!data.session) {
        setErrorMessage(t('errNoSession'))
        return
      }

      const result = await acceptInvitation()
      if (!result.ok) {
        setErrorMessage(result.error || t('errJoinFailed'))
        return
      }
      router.push(result.alreadyAccepted ? '/home' : '/welcome')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!invitation || submitting) return
    setErrorMessage('')

    if (!loginPassword) {
      setErrorMessage(t('errPasswordRequired'))
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: invitation.invitee_email,
        password: loginPassword,
      })

      if (error) {
        setErrorMessage(t('errInvalidCredentials'))
        return
      }

      const result = await acceptInvitation()
      if (!result.ok) {
        setErrorMessage(result.error || t('errJoinFailed'))
        return
      }
      // If the invitation was already accepted (e.g. user is logging in
      // from the 'accepted' screen), skip /welcome and go straight to
      // the dashboard — they've seen it before.
      router.push(result.alreadyAccepted ? '/home' : '/welcome')
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
        setErrorMessage(result.error || t('errJoinFailed'))
        return
      }
      router.push(result.alreadyAccepted ? '/home' : '/welcome')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSignOutAndRejoin() {
    if (submitting) return
    setErrorMessage('')
    setSubmitting(true)
    try {
      await supabase.auth.signOut()
      setCurrentEmail(null)
      // Drop into the signup form with the invitee_email pre-bound by
      // the existing render path (it reads invitation.invitee_email).
      setStatus('signup')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t('errJoinFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCopyLink() {
    try {
      const url = typeof window !== 'undefined' ? window.location.href : ''
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard might be blocked — surface a manual prompt as fallback
      window.prompt(t('copyLink'), typeof window !== 'undefined' ? window.location.href : '')
    }
  }

  if (status === 'loading') {
    return <CenteredCard><p style={muted}>{t('checkingLink')}</p></CenteredCard>
  }

  if (status === 'invalid' || status === 'expired') {
    const isExpired = status === 'expired'
    return (
      <CenteredCard>
        <h1 style={heading}>{isExpired ? t('expiredTitle') : t('invalidTitle')}</h1>
        <p style={muted}>{isExpired ? t('expiredBody') : t('invalidBody')}</p>
        <Link href="/login" style={linkStyle}>{t('backToLogin')}</Link>
      </CenteredCard>
    )
  }

  if (status === 'accepted' && invitation) {
    return (
      <CenteredCard>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <LocaleSwitcher />
        </div>
        <h1 style={heading}>{t('alreadyAcceptedTitle')}</h1>
        <p style={muted}>{t('alreadyAcceptedBody')}</p>

        <form onSubmit={handleLogin} style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label={t('emailLabel')}>
            <input
              type="email"
              value={invitation.invitee_email}
              disabled
              style={{ ...inputStyle, color: '#9b9b9b', background: '#f7f7f5' }}
            />
          </Field>
          <Field label={t('passwordSimple')}>
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

          {errorMessage && (
            <div style={{ fontSize: 13, color: '#A32D2D', background: '#FBEAEA', padding: '8px 12px', borderRadius: 6 }}>
              {errorMessage}
            </div>
          )}

          <Button variant="primary" fullWidth type="submit" disabled={submitting}>
            {submitting ? t('loggingIn') : t('signIn')}
          </Button>

          <div style={{ textAlign: 'center', marginTop: 2 }}>
            <Link href="/forgot-password" style={{ fontSize: 13, color: PURPLE, textDecoration: 'none' }}>
              {t('forgotPassword')}
            </Link>
          </div>
        </form>
      </CenteredCard>
    )
  }

  if (status === 'alreadyMember' && invitation) {
    return (
      <CenteredCard>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <LocaleSwitcher />
        </div>
        <h1 style={heading}>{t('alreadyMemberTitle')}</h1>
        <p style={muted}>
          {t('alreadyMemberBody', {
            email: currentEmail || invitation.invitee_email,
            org: invitation.organization_name,
          })}
        </p>
        <div style={{ marginTop: 20 }}>
          <Link href="/home">
            <Button variant="primary" fullWidth>{t('goToDashboard')}</Button>
          </Link>
        </div>
      </CenteredCard>
    )
  }

  if (status === 'wrongAccount' && invitation) {
    return (
      <CenteredCard>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <LocaleSwitcher />
        </div>
        <h1 style={heading}>{t('wrongAccountTitle')}</h1>
        <p style={muted}>{t('wrongAccountBody')}</p>

        <div style={{ marginTop: 16, background: '#f7f7f5', padding: '14px 16px', borderRadius: 8, fontSize: 13, lineHeight: 1.55 }}>
          <div style={{ marginBottom: 6 }}>
            <span style={{ color: '#9b9b9b' }}>{t('currentAccount')}: </span>
            <strong style={{ color: '#1a1a1a' }}>{currentEmail || '—'}</strong>
          </div>
          <div>
            <span style={{ color: '#9b9b9b' }}>{t('invitedTo')}: </span>
            <strong style={{ color: '#1a1a1a' }}>{invitation.invitee_email}</strong>
          </div>
        </div>

        {errorMessage && (
          <div style={{ marginTop: 12, fontSize: 13, color: '#A32D2D', background: '#FBEAEA', padding: '8px 12px', borderRadius: 6 }}>
            {errorMessage}
          </div>
        )}

        <div style={{ marginTop: 20 }}>
          <Button
            variant="primary"
            fullWidth
            disabled={submitting}
            onClick={handleSignOutAndRejoin}
          >
            {submitting
              ? t('signingOut')
              : t('signOutAndJoin', { email: invitation.invitee_email })}
          </Button>
        </div>

        <details style={{ marginTop: 16 }}>
          <summary style={{ fontSize: 13, color: PURPLE, cursor: 'pointer' }}>
            {t('incognitoOption')}
          </summary>
          <div style={{ marginTop: 10, fontSize: 12, color: '#6b6b6b', lineHeight: 1.5 }}>
            <p style={{ margin: '0 0 8px' }}>{t('incognitoHint')}</p>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                readOnly
                value={typeof window !== 'undefined' ? window.location.href : ''}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  fontSize: 12,
                  border: '1px solid #d4d4d4',
                  borderRadius: 6,
                  background: '#fafafa',
                  color: '#1a1a1a',
                  fontFamily: 'monospace',
                }}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                onClick={handleCopyLink}
                style={{
                  fontSize: 12,
                  padding: '6px 10px',
                  border: '1px solid #d4d4d4',
                  borderRadius: 6,
                  background: '#fff',
                  cursor: 'pointer',
                  color: '#1a1a1a',
                  whiteSpace: 'nowrap',
                }}
              >
                {copied ? t('copied') : t('copyLink')}
              </button>
            </div>
          </div>
        </details>
      </CenteredCard>
    )
  }

  if (!invitation) return null

  const roleLabel = invitation.role === 'manager' ? 'Manager' : 'Staff'
  const orgLabel = invitation.organization_name

  return (
    <CenteredCard>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <LocaleSwitcher />
      </div>

      <p style={{ fontSize: 13, color: '#9b9b9b', margin: '0 0 6px', letterSpacing: '0.04em' }}>{t('eyebrow')}</p>
      <h1 style={heading}>{orgLabel}</h1>

      {/* Invitation info box */}
      <div style={{ marginTop: 14, background: '#f7f7f5', padding: '14px 16px', borderRadius: 8 }}>
        {invitation.branch_name && (
          <div style={{ fontSize: 14, color: '#1a1a1a', marginBottom: 4 }}>
            {t('branchLabel')}: <strong>{invitation.branch_name}</strong>
          </div>
        )}
        <div style={{ fontSize: 14, color: '#1a1a1a' }}>
          {t('roleLabel')}: <strong>{roleLabel}</strong>
        </div>
        <div style={{ fontSize: 12, color: '#9b9b9b', marginTop: 6 }}>
          {t('emailLabel')}: {invitation.invitee_email}
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
            {submitting ? t('accepting') : t('acceptCta')}
          </Button>
        </div>
      )}

      {/* SIGN-UP form */}
      {status === 'signup' && (
        <form onSubmit={handleSignUp} style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label={t('displayName')}>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('displayNamePlaceholder')}
              required
              autoFocus
              style={inputStyle}
            />
          </Field>
          <Field label={t('password')}>
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
          <Field label={t('confirmPassword')}>
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
              {submitting ? t('signingUp') : t('signUpCta', { org: orgLabel })}
            </Button>
          </div>
          <button
            type="button"
            onClick={() => { setErrorMessage(''); setStatus('login') }}
            style={textButton}
          >
            {t('haveAccountToggle')}
          </button>
        </form>
      )}

      {/* LOGIN form */}
      {status === 'login' && (
        <form onSubmit={handleLogin} style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label={t('emailLabel')}>
            <input
              type="email"
              value={invitation.invitee_email}
              disabled
              style={{ ...inputStyle, color: '#9b9b9b', background: '#f7f7f5' }}
            />
          </Field>
          <Field label={t('passwordSimple')}>
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
              {submitting ? t('loggingIn') : t('loginCta')}
            </Button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
            <button
              type="button"
              onClick={() => { setErrorMessage(''); setStatus('signup') }}
              style={textButton}
            >
              {t('noAccountToggle')}
            </button>
            <Link href="/forgot-password" style={{ fontSize: 13, color: PURPLE, textDecoration: 'none' }}>
              {t('forgotPassword')}
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
    <Suspense fallback={<CenteredCard><p style={muted}>Loading...</p></CenteredCard>}>
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
