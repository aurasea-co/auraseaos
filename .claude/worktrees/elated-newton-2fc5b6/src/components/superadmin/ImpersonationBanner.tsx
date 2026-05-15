'use client'

import { useRouter } from 'next/navigation'

export function ImpersonationBanner({ orgName }: { orgName: string }) {
  const router = useRouter()

  function endImpersonation() {
    document.cookie = 'superadmin_impersonating=; path=/; max-age=0'
    router.push('/superadmin')
    router.refresh()
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      height: 36, background: '#A32D2D',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
      fontSize: 12, color: 'white',
    }}>
      <span>คุณกำลังดูในนาม <strong>{orgName}</strong> — ข้อมูลทั้งหมดเป็นของจริง ระวังการแก้ไข</span>
      <button
        onClick={endImpersonation}
        style={{ fontSize: 11, color: 'white', background: 'none', border: '1px solid rgba(255,255,255,0.5)', borderRadius: 4, padding: '2px 10px', cursor: 'pointer' }}
      >
        ออกจากโหมดดูแทน
      </button>
    </div>
  )
}
