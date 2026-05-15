'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BranchTypeBadge } from '@/components/ui/BranchTypeBadge'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function CompanyDetailPage() {
  const { orgId } = useParams<{ orgId: string }>()
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [org, setOrg] = useState<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [branches, setBranches] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [members, setMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any
      const [orgR, brR, memR] = await Promise.all([
        db.from('organizations').select('*').eq('id', orgId).single(),
        db.from('branches').select('*').eq('organization_id', orgId),
        db.from('organization_members').select('*').eq('organization_id', orgId),
      ])
      setOrg(orgR.data)
      setBranches(brR.data || [])
      setMembers(memR.data || [])
      setLoading(false)
    }
    load()
  }, [orgId, supabase])

  if (loading) return <div style={{ padding: 40, color: 'var(--color-text-tertiary)' }}>Loading...</div>
  if (!org) return <div style={{ padding: 40, color: 'var(--color-text-tertiary)' }}>Not found</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Link href="/superadmin" className="flex items-center gap-2" style={{ fontSize: 13, color: 'var(--color-text-secondary)', textDecoration: 'none' }}>
        <ArrowLeft size={16} /> กลับ
      </Link>

      <h1 style={{ fontSize: 20, fontWeight: 500, color: 'var(--color-text-primary)' }}>{org.name}</h1>

      {/* Org info */}
      <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 16 }}>
        <Row label="Plan" value={org.plan} />
        <Row label="Type" value={org.vertical_type} />
        <Row label="Onboarding" value={org.onboarding_completed_at ? 'Complete' : 'Incomplete'} />
        <Row label="Created" value={new Date(org.created_at).toLocaleDateString('th-TH')} />
      </div>

      {/* Branches */}
      <h2 style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)' }}>สาขา ({branches.length})</h2>
      {branches.map((b: { id: string; name: string; business_type: string; total_rooms: number | null; total_seats: number | null }) => (
        <div key={b.id} style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '12px 16px' }}>
          <div className="flex items-center gap-2">
            <BranchTypeBadge type={b.business_type} />
            <span style={{ fontWeight: 500 }}>{b.name}</span>
          </div>
          <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
            {b.business_type === 'accommodation' ? `${b.total_rooms || 0} rooms` : `${b.total_seats || 0} seats`}
          </p>
        </div>
      ))}

      {/* Members */}
      <h2 style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)' }}>สมาชิก ({members.length})</h2>
      <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        {members.map((m: { id: string; user_id: string; role: string }, i: number) => (
          <div key={m.id} style={{ padding: '8px 16px', borderTop: i > 0 ? '1px solid var(--color-border)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{m.user_id.slice(0, 8)}...</span>
            <span style={{ fontSize: 11, fontWeight: 500, padding: '1px 8px', borderRadius: 'var(--radius-pill)', background: m.role === 'owner' ? 'var(--color-accent-light)' : 'var(--color-bg-surface)', color: m.role === 'owner' ? 'var(--color-accent-text)' : 'var(--color-text-secondary)' }}>{m.role}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between" style={{ padding: '6px 0', borderBottom: '1px solid var(--color-border)', fontSize: 13 }}>
      <span style={{ color: 'var(--color-text-tertiary)' }}>{label}</span>
      <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{value}</span>
    </div>
  )
}
