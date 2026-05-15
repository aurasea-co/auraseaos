'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const actionColors: Record<string, string> = {
  change_plan: 'var(--color-amber)',
  impersonate_start: '#A32D2D',
  impersonate_end: '#A32D2D',
  update_targets: 'var(--color-accent)',
  update_entry: 'var(--color-green)',
  create_entry: 'var(--color-green)',
  invite_member: 'var(--color-positive)',
}

export default function AuditPage() {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any
      const { data } = await db.from('audit_log').select('*').order('created_at', { ascending: false }).limit(100)
      setLogs(data || [])
      setLoading(false)
    }
    load()
  }, [supabase])

  if (loading) return <div style={{ padding: 40, color: 'var(--color-text-tertiary)' }}>Loading...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, color: 'var(--color-text-primary)' }}>Audit Log</h1>

      <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        {logs.map((log, i) => (
          <div key={log.id}>
            <div
              onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
              style={{ padding: '10px 16px', borderTop: i > 0 ? '1px solid var(--color-border)' : 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: actionColors[log.action] || 'var(--color-text-tertiary)', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', width: 140, flexShrink: 0 }}>
                {new Date(log.created_at).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{log.action}</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>{log.target_entity || ''}</span>
            </div>
            {expandedId === log.id && log.payload && (
              <div style={{ padding: '8px 16px 12px 32px', fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', background: 'var(--color-bg-surface)' }}>
                {JSON.stringify(log.payload, null, 2)}
              </div>
            )}
          </div>
        ))}
        {logs.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>ยังไม่มี audit log</div>
        )}
      </div>
    </div>
  )
}
