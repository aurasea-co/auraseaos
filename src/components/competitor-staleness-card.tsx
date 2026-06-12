'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ArrowRight } from 'lucide-react'
import { getTodayBangkok, toBangkokDateStr } from '@/lib/businessDate'

// Home-dashboard nudge: "{stale} of {total} competitors not updated
// today" with an Update-now deep link to /ratedesk/competitors. The
// "Updated N days ago" badges show owners forget the daily check; this
// card surfaces the gap where they actually look every morning.
//
// Data source is the same GET endpoint the competitors page uses —
// per-competitor lastUpdatedAt is the max created_at (when a rate was
// WRITTEN, not captured_at which CSV imports set to future dates), so
// this count always agrees with the badges on the page it links to.
// Staleness = lastUpdatedAt's Bangkok calendar date !== today, matching
// the page's isUpdatedTodayBkk (plain Bangkok day, no business-date
// cutoff).
//
// Renders nothing when: still loading, the fetch fails (403 for roles
// without ratedesk_competitors access — staff — or transient errors),
// no competitors tracked yet, or everything is already updated today.
// The caller additionally gates on hotel branches; F&B never mounts it.

interface CompetitorSummary {
  competitorName: string
  lastUpdatedAt: string | null
}

export function CompetitorStalenessCard({ branchId }: { branchId: string }) {
  const t = useTranslations('home')
  const [counts, setCounts] = useState<{ stale: number; total: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/branches/${branchId}/competitor-rates`, { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as { competitors?: CompetitorSummary[] }
        if (cancelled) return
        const competitors = json.competitors || []
        const today = getTodayBangkok()
        const stale = competitors.filter(
          (c) => !c.lastUpdatedAt || toBangkokDateStr(c.lastUpdatedAt) !== today,
        ).length
        setCounts({ stale, total: competitors.length })
      } catch {
        // Network error — skip the nudge rather than alarm the owner.
      }
    }
    load()
    return () => { cancelled = true }
  }, [branchId])

  if (!counts || counts.total === 0 || counts.stale === 0) return null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        background: 'var(--color-amber-light)',
        border: '1px solid rgba(186,117,23,0.25)',
        borderRadius: 8,
        padding: '8px 12px',
      }}
    >
      <p style={{ flex: 1, minWidth: 180, fontSize: 12, fontWeight: 500, color: 'var(--color-amber-text)', margin: 0 }}>
        ⚠ {t('competitorsStale', { stale: counts.stale, total: counts.total })}
      </p>
      <Link
        href="/ratedesk/competitors"
        className="touch-target"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '5px 10px',
          fontSize: 12,
          fontWeight: 500,
          background: 'var(--color-amber-text)',
          color: 'var(--color-amber-light)',
          borderRadius: 6,
          textDecoration: 'none',
          flexShrink: 0,
        }}
      >
        {t('competitorsStaleCta')} <ArrowRight size={12} />
      </Link>
    </div>
  )
}
