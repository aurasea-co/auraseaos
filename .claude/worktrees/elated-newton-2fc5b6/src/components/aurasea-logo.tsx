'use client'

import { CompassMark } from './compass-mark'

interface AuraSeaLogoProps {
  variant?: 'light' | 'dark'
  size?: number
  collapsed?: boolean
  className?: string
}

export function AuraSeaLogo({ variant = 'light', size = 32, collapsed = false, className }: AuraSeaLogoProps) {
  const wordmarkColor = variant === 'dark' ? '#ffffff' : '#042C53'
  const osColor = variant === 'dark' ? '#5DCAA5' : '#1D9E75'

  return (
    <span
      className={className}
      role="img"
      aria-label="AuraSeaOS"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
    >
      <CompassMark size={size} variant={variant} />
      {!collapsed && (
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 3 }}>
          <span
            style={{
              fontFamily: "'Plus Jakarta Sans', var(--font-primary), sans-serif",
              fontWeight: 500,
              fontSize: size * 0.5,
              letterSpacing: '-0.03em',
              color: wordmarkColor,
              lineHeight: 1,
            }}
          >
            AuraSea
          </span>
          <span
            style={{
              fontFamily: "'Plus Jakarta Sans', var(--font-primary), sans-serif",
              fontWeight: 500,
              fontSize: size * 0.34,
              letterSpacing: '0.2em',
              color: osColor,
              lineHeight: 1,
            }}
          >
            OS
          </span>
        </span>
      )}
    </span>
  )
}
