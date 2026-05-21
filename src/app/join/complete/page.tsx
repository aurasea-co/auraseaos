'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type State = 'working' | 'error' | 'unauth'

// Landed here after the magic link in the invitation flow. The user's
// Supabase session is established (PKCE exchange happened in /auth/callback
// before redirecting here). We POST the token to /api/invite/accept to
// create memberships, then send them to /welcome.

function JoinCompleteInner() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token') || ''
  const supabase = createClient()
  const [state, setState] = useState<State>('working')
  const [message, setMessage] = useState<string>('')

  useEffect(() => {
    async function run() {
      if (!token) {
        setMessage('ไม่พบ token')
        setState('error')
        return
      }

      const { data: userRes } = await supabase.auth.getUser()
      if (!userRes?.user) {
        // Session didn't establish — bounce back to /join so they can retry
        setState('unauth')
        return
      }

      try {
        const res = await fetch('/api/invite/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const json = await res.json()
        if (!res.ok || !json.success) {
          setMessage(json.error || 'เข้าร่วมไม่สำเร็จ')
          setState('error')
          return
        }
        router.replace('/welcome')
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'เข้าร่วมไม่สำเร็จ')
        setState('error')
      }
    }
    run()
  }, [router, supabase, token])

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 440, background: '#ffffff', borderRadius: 12, padding: 28, boxShadow: '0 1px 2px rgba(0,0,0,0.04)', textAlign: 'center' }}>
        {state === 'working' && (
          <>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
            <p style={{ fontSize: 14, color: '#6b6b6b', margin: 0 }}>กำลังเข้าร่วม...</p>
          </>
        )}
        {state === 'unauth' && (
          <>
            <h1 style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a', margin: '0 0 8px' }}>เซสชันยังไม่พร้อม</h1>
            <p style={{ fontSize: 14, color: '#6b6b6b', margin: '0 0 16px' }}>
              ลิงก์อาจหมดอายุหรือเปิดในเบราว์เซอร์อื่น กรุณาขอลิงก์ใหม่
            </p>
            <Link href={`/join?token=${encodeURIComponent(token)}`} style={{ fontSize: 14, color: '#534AB7' }}>
              กลับไปหน้าคำเชิญ →
            </Link>
          </>
        )}
        {state === 'error' && (
          <>
            <h1 style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a', margin: '0 0 8px' }}>เข้าร่วมไม่สำเร็จ</h1>
            <p style={{ fontSize: 14, color: '#A32D2D', background: '#FBEAEA', padding: '8px 12px', borderRadius: 6, margin: '0 0 16px' }}>
              {message}
            </p>
            <Link href={`/join?token=${encodeURIComponent(token)}`} style={{ fontSize: 14, color: '#534AB7' }}>
              ลองอีกครั้ง →
            </Link>
          </>
        )}
      </div>
    </div>
  )
}

export default function JoinCompletePage() {
  return (
    <Suspense fallback={null}>
      <JoinCompleteInner />
    </Suspense>
  )
}
