'use client'

import { useUser } from '@/providers/user-context'

export function BranchSwitcher() {
  const { branches, activeBranch, setActiveBranch } = useUser()

  if (branches.length <= 1) return null

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
      {branches.map((branch) => {
        const isActive = activeBranch?.id === branch.id
        const isHotel = branch.business_type === 'accommodation'
        return (
          <button
            key={branch.id}
            onClick={() => setActiveBranch(branch)}
            className="flex items-center gap-2 whitespace-nowrap"
            style={{
              fontSize: 13,
              fontWeight: isActive ? 500 : 400,
              color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              background: isActive ? 'var(--color-bg-surface)' : 'transparent',
              border: `1px solid ${isActive ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
              borderRadius: 'var(--radius-pill)',
              padding: '5px 14px',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {/* Coloured dot — no emoji */}
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: isHotel ? 'var(--color-accent)' : 'var(--color-green)',
                flexShrink: 0,
              }}
            />
            <span>{branch.name}</span>
          </button>
        )
      })}
    </div>
  )
}
