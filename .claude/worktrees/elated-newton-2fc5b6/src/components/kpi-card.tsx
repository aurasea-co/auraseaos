interface KpiCardProps {
  label: string
  value: string
  subLabel?: string
  /** Context line rendered directly under the headline value (before target
   *  and subLabel). Use for "Today" / "Last entry — 19 เม.ย. 2569" hints. */
  valueContext?: string
  /** Secondary metric stacked under the headline (e.g. "30-day avg: 17.1%").
   *  Kept deliberately distinct from `subLabel` so the numeric comparison
   *  line formats the same way across cards that use this pattern. */
  secondary?: { label: string; value: string }
  target?: string
  status?: 'green' | 'amber' | 'red' | 'neutral'
  primary?: boolean
}

export function KpiCard({
  label,
  value,
  subLabel,
  valueContext,
  secondary,
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
      {valueContext && (
        <p
          style={{
            fontSize: 11,
            color: 'var(--color-text-tertiary)',
            marginTop: 2,
            lineHeight: 1.3,
          }}
        >
          {valueContext}
        </p>
      )}
      {secondary && (
        <p
          style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-secondary)',
            marginTop: 4,
            lineHeight: 1.3,
          }}
        >
          <span style={{ color: 'var(--color-text-tertiary)' }}>{secondary.label}:</span>{' '}
          <span style={{ fontWeight: 500 }}>{secondary.value}</span>
        </p>
      )}
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
