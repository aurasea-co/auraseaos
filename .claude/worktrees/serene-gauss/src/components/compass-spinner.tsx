'use client'

interface CompassSpinnerProps {
  size?: number
  className?: string
}

export function CompassSpinner({ size = 32, className }: CompassSpinnerProps) {
  const teal = '#5DCAA5'
  const navy = '#042C53'

  return (
    <div
      className={className}
      role="status"
      aria-label="Loading"
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Outer ring */}
        <circle cx="50" cy="50" r="44" stroke={teal} strokeWidth="1.5" opacity="0.3" />

        {/* Center hub */}
        <circle cx="50" cy="50" r="6" fill={navy} />
        <circle cx="50" cy="50" r="6" stroke={teal} strokeWidth="1" fill="none" />
        <circle cx="50" cy="50" r="2.5" fill={teal} />

        {/* Spinning north pointer */}
        <g style={{ transformOrigin: '50px 50px' }}>
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 50 50"
            to="360 50 50"
            dur="1.2s"
            repeatCount="indefinite"
          />
          <defs>
            <linearGradient id="spinner-grad" x1="50" y1="10" x2="50" y2="48" gradientUnits="userSpaceOnUse">
              <stop stopColor={teal} />
              <stop offset="1" stopColor="#185FA5" />
            </linearGradient>
          </defs>
          <polygon points="50,12 47,44 53,44" fill="url(#spinner-grad)" />
        </g>
      </svg>
    </div>
  )
}
