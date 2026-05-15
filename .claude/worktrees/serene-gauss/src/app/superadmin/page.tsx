'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { KpiCard } from '@/components/kpi-card'
import Link from 'next/link'

interface OrgRow { id: string; name: string; plan: string; plan_expires_at: string | null; created_at: string }

export default function SuperadminDashboard() {
  const supabase = createClient()
  const [orgs, setOrgs] = useState<OrgRow[]>([])
  const [stats, setStats] = useState({ companies: 0, branches: 0, users: 0, activeTrials: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any
      const [orgResult, branchResult] = await Promise.all([
        db.from('organizations').select('*').order('created_at', { ascending: false }),
        db.from('branches').select('id', { count: 'exact', head: true }),
      ])
      const organizations = orgResult.data || []
      setOrgs(organizations)
      const now = new Date().toISOString()
      setStats({
        companies: organizations.length,
        branches: branchResult.count || 0,
        users: 0, // Would need admin API
        activeTrials: organizations.filter((o: OrgRow) => o.plan_expires_at && o.plan_expires_at > now).length,
      })
      setLoading(false)
    }
    load()
  }, [supabase])

  const [pendingChange, setPendingChange] = useState<{ orgId: string; orgName: string; fromPlan: string; toPlan: string } | null>(null)

  function requestPlanChange(orgId: string, orgName: string, fromPlan: string, toPlan: string) {
    if (fromPlan === toPlan) return
    setPendingChange({ orgId, orgName, fromPlan, toPlan })
  }

  async function confirmPlanChange() {
    if (!pendingChange) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    await db.from('organizations').update({ plan: pendingChange.toPlan }).eq('id', pendingChange.orgId)
    await db.from('audit_log').insert({ action: 'change_plan', target_entity: 'organizations', target_id: pendingChange.orgId, payload: { from: pendingChange.fromPlan, to: pendingChange.toPlan } })
    setOrgs((prev) => prev.map((o) => o.id === pendingChange.orgId ? { ...o, plan: pendingChange.toPlan } : o))
    setPendingChange(null)
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--color-text-tertiary)' }}>Loading...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, color: 'var(--color-text-primary)' }}>ภาพรวมระบบ</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <KpiCard label="Companies" value={`${stats.companies}`} status="neutral" />
        <KpiCard label="Branches" value={`${stats.branches}`} status="neutral" />
        <KpiCard label="Users" value="—" status="neutral" />
        <KpiCard label="Active trials" value={`${stats.activeTrials}`} status="neutral" />
      </div>

      {/* Company table */}
      <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              <th style={th}>Company</th>
              <th style={th}>Plan</th>
              <th style={th}>Created</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((org) => (
              <tr key={org.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={td}>{org.name}</td>
                <td style={td}>
                  <select
                    value={org.plan}
                    onChange={(e) => requestPlanChange(org.id, org.name, org.plan, e.target.value)}
                    style={{ fontSize: 12, padding: '2px 8px', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg)' }}
                  >
                    <option value="starter">Starter</option>
                    <option value="growth">Growth</option>
                    <option value="pro">Pro</option>
                  </select>
                </td>
                <td style={{ ...td, color: 'var(--color-text-tertiary)' }}>
                  {new Date(org.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
                <td style={td}>
                  <Link href={`/superadmin/companies/${org.id}`} style={{ fontSize: 12, color: 'var(--color-accent)', textDecoration: 'none' }}>ดูรายละเอียด</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Plan change confirmation dialog */}
      {pendingChange && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--color-bg)', borderRadius: 'var(--radius-lg)', padding: 24, maxWidth: 400, width: '90%' }}>
            <h3 style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 8 }}>ยืนยันเปลี่ยนแพลน</h3>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
              เปลี่ยน <strong>{pendingChange.orgName}</strong> จาก{' '}
              <span style={{ fontWeight: 500 }}>{pendingChange.fromPlan}</span> เป็น{' '}
              <span style={{ fontWeight: 500, color: 'var(--color-accent)' }}>{pendingChange.toPlan}</span>?
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setPendingChange(null)} style={{ fontSize: 13, fontWeight: 500, padding: '7px 16px', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>ยกเลิก</button>
              <button onClick={confirmPlanChange} style={{ fontSize: 13, fontWeight: 500, padding: '7px 16px', border: 'none', borderRadius: 'var(--radius-md)', background: 'var(--color-accent)', color: 'white', cursor: 'pointer' }}>ยืนยัน</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { textAlign: 'left', padding: '8px 12px', fontWeight: 500, fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }
const td: React.CSSProperties = { padding: '10px 12px', color: 'var(--color-text-primary)' }
