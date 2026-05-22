'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { LocaleSwitcher } from '@/components/locale-switcher'

export default function SuspendedPage() {
  const router = useRouter()
  const supabase = createClient()
  const t = useTranslations('suspended')

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 420, background: '#ffffff', borderRadius: 12, padding: 28, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <LocaleSwitcher />
        </div>

        <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: '#1a1a1a', margin: '0 0 10px', letterSpacing: '-0.01em' }}>
          {t('title')}
        </h1>
        <p style={{ fontSize: 14, color: '#6b6b6b', lineHeight: 1.55, margin: '0 0 24px' }}>
          {t('body')}
        </p>

        <Button variant="primary" fullWidth onClick={handleSignOut}>
          {t('signOut')}
        </Button>
      </div>
    </div>
  )
}
