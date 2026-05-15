'use client'

interface CompassMarkProps {
  size?: number
  variant?: 'light' | 'dark'
  className?: string
}

export function CompassMark({ size = 32, variant = 'light', className }: CompassMarkProps) {
  const teal = '#5DCAA5'
  const tealDark = '#1D9E75'
  const blue = '#378ADD'
  const navy = '#042C53'
  const purple = '#AFA9EC'
  const gradientId = `compass-grad-${variant}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="50" y1="10" x2="50" y2="55" gradientUnits="userSpaceOnUse">
          <stop stopColor={teal} />
          <stop offset="1" stopColor="#185FA5" />
        </linearGradient>
      </defs>

      {/* Outer aura ring (dashed) */}
      <circle cx="50" cy="50" r="48" stroke={tealDark} strokeWidth="0.6" strokeDasharray="4 3" opacity="0.35" />

      {/* Outer precision ring */}
      <circle cx="50" cy="50" r="44" stroke={teal} strokeWidth="1.5" />

      {/* Inner ring */}
      <circle cx="50" cy="50" r="34" stroke={blue} strokeWidth="0.75" opacity="0.5" />

      {/* Cardinal tick marks N/S/E/W */}
      <line x1="50" y1="2" x2="50" y2="8" stroke={teal} strokeWidth="1.5" />
      <line x1="50" y1="92" x2="50" y2="98" stroke={teal} strokeWidth="1.5" />
      <line x1="2" y1="50" x2="8" y2="50" stroke={teal} strokeWidth="1.5" />
      <line x1="92" y1="50" x2="98" y2="50" stroke={teal} strokeWidth="1.5" />

      {/* Diagonal minor ticks at 45° */}
      <line x1="14.6" y1="14.6" x2="18.4" y2="18.4" stroke="#9FE1CB" strokeWidth="1" opacity="0.6" />
      <line x1="81.6" y1="14.6" x2="85.4" y2="18.4" stroke="#9FE1CB" strokeWidth="1" opacity="0.6" transform="rotate(90 50 50)" />
      <line x1="81.6" y1="81.6" x2="85.4" y2="85.4" stroke="#9FE1CB" strokeWidth="1" opacity="0.6" />
      <line x1="14.6" y1="81.6" x2="18.4" y2="85.4" stroke="#9FE1CB" strokeWidth="1" opacity="0.6" transform="rotate(90 50 50)" />

      {/* South arm */}
      <polygon points="50,90 46,58 54,58" fill={purple} opacity="0.4" />
      {/* East arm */}
      <polygon points="90,50 58,46 58,54" fill={purple} opacity="0.45" />
      {/* West arm */}
      <polygon points="10,50 42,46 42,54" fill={purple} opacity="0.55" />

      {/* North pointer (tall, tapered) */}
      <polygon points="50,10 46,42 54,42" fill={`url(#${gradientId})`} />

      {/* Center hub */}
      <circle cx="50" cy="50" r="6" fill={navy} />
      <circle cx="50" cy="50" r="6" stroke={teal} strokeWidth="1" fill="none" />
      <circle cx="50" cy="50" r="2.5" fill={teal} />
      <circle cx="50" cy="50" r="0.8" fill={navy} />
    </svg>
  )
}
