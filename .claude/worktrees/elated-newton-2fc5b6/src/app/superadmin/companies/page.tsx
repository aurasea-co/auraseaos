'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BranchTypeBadge } from '@/components/ui/BranchTypeBadge'
import Link from 'next/link'

interface OrgWithBranches {
  id: string
  name: string
  plan: string
  created_at: string
  branches: { id: string; name: string; business_type: string; total_rooms: number | null; total_seats: number | null }[]
}

export default function CompaniesPage() {
  const supabase = createClient()
  const [orgs, setOrgs] = useState<OrgWithBranches[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any
      const { data: organizations } = await db.from('organizations').select('id, name, plan, created_at').order('created_at', { ascending: false })
      const { data: branches } = await db.from('branches').select('id, name, business_type, total_rooms, total_seats, organization_id')

      const result: OrgWithBranches[] = (organizations || []).map((org: { id: string; name: string; plan: string; created_at: string }) => ({
        ...org,
        branches: (branches || []).filter((b: { organization_id: string }) => b.organization_id === org.id),
      }))

      setOrgs(result)
      setLoading(false)
    }
    load()
  }, [supabase])

  if (loading) return <div style={{ padding: 40, color: 'var(--color-text-tertiary)' }}>Loading...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, color: 'var(--color-text-primary)' }}>บริษัทและสาขา</h1>

      {orgs.map((org) => (
        <div key={org.id} style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          {/* Org header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>{org.name}</span>
              <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 500, padding: '1px 8px', borderRadius: 'var(--radius-pill)', background: 'var(--color-accent-light)', color: 'var(--color-accent-text)' }}>{org.plan}</span>
            </div>
            <Link href={`/superadmin/companies/${org.id}`} style={{ fontSize: 12, color: 'var(--color-accent)', textDecoration: 'none' }}>ดูรายละเอียด →</Link>
          </div>

          {/* Branches */}
          {org.branches.map((branch, i) => (
            <div key={branch.id} style={{ padding: '10px 16px', borderTop: i > 0 ? '1px solid var(--color-border)' : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
              <BranchTypeBadge type={branch.business_type} />
              <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{branch.name}</span>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>
                {branch.business_type === 'accommodation' ? `${branch.total_rooms || 0} rooms` : `${branch.total_seats || 0} seats`}
              </span>
            </div>
          ))}

          {org.branches.length === 0 && (
            <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--color-text-tertiary)' }}>ยังไม่มีสาขา</div>
          )}
        </div>
      ))}
    </div>
  )
}
