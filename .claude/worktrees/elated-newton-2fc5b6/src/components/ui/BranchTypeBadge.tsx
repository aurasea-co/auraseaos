interface BranchTypeBadgeProps {
  type: 'accommodation' | 'fnb' | string
  size?: 'sm' | 'md'
}

export function BranchTypeBadge({ type, size = 'sm' }: BranchTypeBadgeProps) {
  const isHotel = type === 'accommodation'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: size === 'sm' ? 10 : 11,
        fontWeight: 500,
        padding: '2px 8px',
        borderRadius: 'var(--radius-pill)',
        background: isHotel ? 'var(--color-accent-light)' : 'var(--color-green-light)',
        color: isHotel ? 'var(--color-accent-text)' : 'var(--color-green-text)',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: isHotel ? 'var(--color-accent)' : 'var(--color-green)',
          flexShrink: 0,
        }}
      />
      {isHotel ? 'Hotel' : 'F&B'}
    </span>
  )
}
