interface KpiCardProps {
  label: string
  value: string
  subLabel?: string
  target?: string
  status?: 'green' | 'amber' | 'red' | 'neutral'
  primary?: boolean
}

export function KpiCard({
  label,
  value,
  subLabel,
  target,
  status = 'neutral',
  primary = false,
}: KpiCardProps) {
  const valueColor =
    status === 'green'
      ? 'var(--color-positive)'
      : status === 'red'
      ? 'var(--color-negative)'
      : status === 'amber'
      ? 'var(--color-amber)'
      : 'var(--color-text-primary)'

  const deltaPrefix = status === 'green' ? '▲ ' : status === 'red' ? '▼ ' : ''

  return (
    <div
      style={{
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '12px 14px',
      }}
    >
      <p
        style={{
          fontSize: 'var(--font-size-xs)',
          fontWeight: 400,
          color: 'var(--color-text-tertiary)',
          marginBottom: 4,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: primary ? 22 : 20,
          fontWeight: 500,
          color: valueColor,
          lineHeight: 1.2,
        }}
      >
        {value}
      </p>
      {target && (
        <p
          style={{
            fontSize: 'var(--font-size-xs)',
            color:
              status === 'green'
                ? 'var(--color-positive)'
                : status === 'red'
                ? 'var(--color-negative)'
                : 'var(--color-text-tertiary)',
            marginTop: 3,
          }}
        >
          {deltaPrefix}{target}
        </p>
      )}
      {subLabel && (
        <p
          style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-tertiary)',
            marginTop: 3,
          }}
        >
          {subLabel}
        </p>
      )}
    </div>
  )
}
