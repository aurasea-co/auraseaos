'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { BranchTypeBadge } from '@/components/ui/BranchTypeBadge'

// Companies & Branches tab — flat row per branch with the parent org
// denormalised so the super-admin can scan across the whole portfolio
// at a glance. All data comes from /api/superadmin/companies, which
// runs the service-role client server-side. The page itself is RLS-
// agnostic — it just renders whatever the route hands back.

interface BranchRow {
  organizationId: string
  organizationName: string
  ownerEmail: string | null
  plan: string
  status: string | null
  trialEndsAt: string | null
  organizationCreatedAt: string
  branchId: string
  branchName: string
  branchType: string
  branchCreatedAt: string
}

interface BranchlessOrg {
  organizationId: string
  organizationName: string
  ownerEmail: string | null
  plan: string
  status: string | null
  trialEndsAt: string | null
  organizationCreatedAt: string
}

export default function CompaniesPage() {
  const [rows, setRows] = useState<BranchRow[]>([])
  const [branchlessOrgs, setBranchlessOrgs] = useState<BranchlessOrg[]>([])
  const [counts, setCounts] = useState({ companies: 0, branches: 0 })
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/superadmin/companies', { cache: 'no-store' })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          setError(body?.error || res.statusText)
          return
        }
        const json: { rows: BranchRow[]; branchlessOrgs: BranchlessOrg[]; counts: { companies: number; branches: number } } =
          await res.json()
        setRows(json.rows || [])
        setBranchlessOrgs(json.branchlessOrgs || [])
        setCounts(json.counts || { companies: 0, branches: 0 })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Client-side filter — keeps the search snappy without re-hitting
  // the route. Matches company name OR owner email (both lowercased).
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.organizationName.toLowerCase().includes(q) ||
        (r.ownerEmail || '').toLowerCase().includes(q),
    )
  }, [rows, search])

  const filteredBranchless = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return branchlessOrgs
    return branchlessOrgs.filter(
      (o) =>
        o.organizationName.toLowerCase().includes(q) ||
        (o.ownerEmail || '').toLowerCase().includes(q),
    )
  }, [branchlessOrgs, search])

  if (loading) return <div style={{ padding: 40, color: 'var(--color-text-tertiary)' }}>Loading...</div>
  if (error) return <div style={{ padding: 40, color: 'var(--color-negative)' }}>Error: {error}</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: 'var(--color-text-primary)', margin: 0 }}>บริษัทและสาขา</h1>
          <span style={{
            fontSize: 11,
            fontWeight: 500,
            padding: '2px 10px',
            borderRadius: 999,
            background: 'var(--color-bg-surface, #f4f4f2)',
            color: 'var(--color-text-secondary)',
          }}>
            {counts.companies} บริษัท · {counts.branches} สาขา
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
            placeholder="ค้นหาบริษัทหรืออีเมล"
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
              <th style={th}>Company</th>
              <th style={th}>Owner</th>
              <th style={th}>Branch</th>
              <th style={th}>Type</th>
              <th style={th}>Plan</th>
              <th style={th}>Status</th>
              <th style={th}>Created</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((r, i) => {
              const prev = filteredRows[i - 1]
              const newOrg = !prev || prev.organizationId !== r.organizationId
              return (
                <tr
                  key={r.branchId}
                  className="superadmin-row"
                  style={{
                    borderTop: newOrg && i > 0 ? '1px solid var(--color-border)' : 'none',
                  }}
                >
                  <td style={td}>
                    {newOrg ? (
                      <Link
                        href={`/superadmin/companies/${r.organizationId}`}
                        style={{ fontWeight: 500, color: 'var(--color-text-primary)', textDecoration: 'none' }}
                      >
                        {r.organizationName}
                      </Link>
                    ) : (
                      <span style={{ color: 'var(--color-text-tertiary)' }}>↳</span>
                    )}
                  </td>
                  <td style={{ ...td, color: 'var(--color-text-tertiary)' }}>
                    {newOrg ? r.ownerEmail || '—' : ''}
                  </td>
                  <td style={td}>{r.branchName}</td>
                  <td style={td}>
                    <BranchTypeBadge type={r.branchType} />
                  </td>
                  <td style={{ ...td, color: 'var(--color-text-secondary)' }}>
                    {r.plan ? r.plan[0].toUpperCase() + r.plan.slice(1) : '—'}
                  </td>
                  <td style={td}>
                    <StatusPill status={r.status} trialEndsAt={r.trialEndsAt} />
                  </td>
                  <td style={{ ...td, color: 'var(--color-text-tertiary)' }}>
                    {formatThaiDate(r.organizationCreatedAt)}
                  </td>
                </tr>
              )
            })}
            {filteredBranchless.map((o) => (
              <tr key={o.organizationId} style={{ borderTop: '1px solid var(--color-border)' }}>
                <td style={td}>
                  <Link
                    href={`/superadmin/companies/${o.organizationId}`}
                    style={{ fontWeight: 500, color: 'var(--color-text-primary)', textDecoration: 'none' }}
                  >
                    {o.organizationName}
                  </Link>
                </td>
                <td style={{ ...td, color: 'var(--color-text-tertiary)' }}>{o.ownerEmail || '—'}</td>
                <td style={{ ...td, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
                  (ยังไม่มีสาขา)
                </td>
                <td style={td} />
                <td style={{ ...td, color: 'var(--color-text-secondary)' }}>
                  {o.plan ? o.plan[0].toUpperCase() + o.plan.slice(1) : '—'}
                </td>
                <td style={td}>
                  <StatusPill status={o.status} trialEndsAt={o.trialEndsAt} />
                </td>
                <td style={{ ...td, color: 'var(--color-text-tertiary)' }}>
                  {formatThaiDate(o.organizationCreatedAt)}
                </td>
              </tr>
            ))}
            {filteredRows.length === 0 && filteredBranchless.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 24, fontSize: 13, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
                  {search ? 'ไม่พบผลลัพธ์' : 'ยังไม่มีบริษัท'}
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

function StatusPill({ status, trialEndsAt }: { status: string | null; trialEndsAt: string | null }) {
  // Three buckets: active (green), trial-with-days-left (amber),
  // expired/zero-days (red). Days are computed from trial_ends_at,
  // not trial_days, so a paused trial reflects accurately.
  if (status === 'active') {
    return <Pill label="Active" bg="#E6F4EE" fg="#0F5132" />
  }
  if (status === 'trial' && trialEndsAt) {
    const ms = new Date(trialEndsAt).getTime() - Date.now()
    const days = Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)))
    if (days <= 0) return <Pill label="0 days" bg="#FBEAEA" fg="#A32D2D" />
    return <Pill label={`${days} days left`} bg="#FFF4E0" fg="#8A5A00" />
  }
  if (status === 'expired') {
    return <Pill label="Expired" bg="#FBEAEA" fg="#A32D2D" />
  }
  return <Pill label={status || '—'} bg="#F4F4F2" fg="#6b6b6b" />
}

function Pill({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 500,
        padding: '2px 10px',
        borderRadius: 999,
        background: bg,
        color: fg,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
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
