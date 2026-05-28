'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, Check, Minus } from 'lucide-react'

// All-users tab — owners (organization_members.role='owner') plus
// invited branch managers / staff (branch_members). Data comes from
// /api/superadmin/users, which runs server-side with the service
// role client. The page is a thin renderer: search filters by email
// or display name client-side.

interface UserRow {
  userId: string
  email: string | null
  displayName: string | null
  role: 'owner' | 'manager' | 'staff'
  organization: { id: string; name: string } | null
  branches: Array<{ id: string; name: string; businessType: string }>
  lineConnected: boolean
  joinedAt: string | null
}

export default function UsersPage() {
  const [rows, setRows] = useState<UserRow[]>([])
  const [count, setCount] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/superadmin/users', { cache: 'no-store' })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          setError(body?.error || res.statusText)
          return
        }
        const json: { rows: UserRow[]; count: number } = await res.json()
        setRows(json.rows || [])
        setCount(json.count || 0)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        (r.email || '').toLowerCase().includes(q) ||
        (r.displayName || '').toLowerCase().includes(q),
    )
  }, [rows, search])

  if (loading) return <div style={{ padding: 40, color: 'var(--color-text-tertiary)' }}>Loading...</div>
  if (error) return <div style={{ padding: 40, color: 'var(--color-negative)' }}>Error: {error}</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: 'var(--color-text-primary)', margin: 0 }}>ผู้ใช้งานทั้งหมด</h1>
          <span style={{
            fontSize: 11,
            fontWeight: 500,
            padding: '2px 10px',
            borderRadius: 999,
            background: 'var(--color-bg-surface, #f4f4f2)',
            color: 'var(--color-text-secondary)',
          }}>
            {count} ผู้ใช้
          </span>
        </div>
        <div style={{ position: 'relative', minWidth: 240 }}>
          <Search
            size={14}
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9b9b9b' }}
            aria-hidden
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาอีเมลหรือชื่อ"
            style={{
              width: '100%',
              padding: '8px 12px 8px 30px',
              fontSize: 13,
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              background: 'var(--color-bg)',
              color: 'var(--color-text-primary)',
            }}
          />
        </div>
      </div>

      <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              <th style={th}>Email</th>
              <th style={th}>Display name</th>
              <th style={th}>Role</th>
              <th style={th}>Company</th>
              <th style={th}>Branch</th>
              <th style={th}>LINE</th>
              <th style={th}>Joined</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.userId} className="superadmin-row" style={{ borderTop: '1px solid var(--color-border)' }}>
                <td style={{ ...td, color: 'var(--color-text-tertiary)' }}>{u.email || '—'}</td>
                <td style={{ ...td, fontWeight: 500 }}>{u.displayName || '—'}</td>
                <td style={td}>
                  <RoleBadge role={u.role} />
                </td>
                <td style={{ ...td, color: 'var(--color-text-secondary)' }}>
                  {u.organization?.name || '—'}
                </td>
                <td style={{ ...td, color: 'var(--color-text-secondary)' }}>
                  {u.branches.length > 0
                    ? u.branches.map((b) => b.name).join(', ')
                    : '—'}
                </td>
                <td style={td}>
                  {u.lineConnected ? (
                    <Check size={16} style={{ color: '#1D9E75' }} aria-label="LINE connected" />
                  ) : (
                    <Minus size={16} style={{ color: 'var(--color-text-tertiary)' }} aria-label="LINE not connected" />
                  )}
                </td>
                <td style={{ ...td, color: 'var(--color-text-tertiary)' }}>
                  {u.joinedAt ? formatThaiDate(u.joinedAt) : '—'}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 24, fontSize: 13, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
                  {search ? 'ไม่พบผลลัพธ์' : 'ยังไม่มีผู้ใช้งาน'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        :global(tr.superadmin-row:hover td) {
          background: var(--color-bg-surface, #fafafa);
        }
      `}</style>
    </div>
  )
}

function RoleBadge({ role }: { role: 'owner' | 'manager' | 'staff' }) {
  // Color matrix mirrors the spec — owner purple, manager teal,
  // staff neutral.
  const palette =
    role === 'owner'
      ? { bg: '#EEEDFE', fg: '#3C3489' }
      : role === 'manager'
        ? { bg: '#E1F5EE', fg: '#085041' }
        : { bg: '#F4F4F2', fg: '#6b6b6b' }
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: '2px 10px',
        borderRadius: 999,
        background: palette.bg,
        color: palette.fg,
        textTransform: 'capitalize',
      }}
    >
      {role}
    </span>
  )
}

function formatThaiDate(iso: string): string {
  return new Date(iso).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  fontWeight: 500,
  fontSize: 11,
  color: 'var(--color-text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}
const td: React.CSSProperties = {
  padding: '10px 12px',
  color: 'var(--color-text-primary)',
  verticalAlign: 'middle',
}
