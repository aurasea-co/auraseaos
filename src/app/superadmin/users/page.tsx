'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function UsersPage() {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [members, setMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any
      const { data } = await db.from('organization_members').select('user_id, role, organization_id, organizations(name)')
      setMembers(data || [])
      setLoading(false)
    }
    load()
  }, [supabase])

  if (loading) return <div style={{ padding: 40, color: 'var(--color-text-tertiary)' }}>Loading...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, color: 'var(--color-text-primary)' }}>ผู้ใช้งานทั้งหมด</h1>

      <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              <th style={th}>User ID</th>
              <th style={th}>Role</th>
              <th style={th}>Company</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={td}>{m.user_id?.slice(0, 12)}...</td>
                <td style={td}>
                  <span style={{ fontSize: 11, fontWeight: 500, padding: '1px 8px', borderRadius: 'var(--radius-pill)', background: m.role === 'owner' ? 'var(--color-accent-light)' : 'var(--color-bg-surface)', color: m.role === 'owner' ? 'var(--color-accent-text)' : 'var(--color-text-secondary)' }}>{m.role}</span>
                </td>
                <td style={{ ...td, color: 'var(--color-text-secondary)' }}>{m.organizations?.name || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const th: React.CSSProperties = { textAlign: 'left', padding: '8px 12px', fontWeight: 500, fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }
const td: React.CSSProperties = { padding: '10px 12px', color: 'var(--color-text-primary)' }
