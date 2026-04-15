'use client'

type ButtonProps = {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
  disabled?: boolean
  onClick?: () => void
  type?: 'button' | 'submit' | 'reset'
  children: React.ReactNode
  className?: string
}

const paddings = {
  sm: '6px 14px',
  md: '9px 18px',
  lg: '11px 22px',
}

const variantStyles: Record<string, React.CSSProperties> = {
  primary: {
    background: 'var(--color-primary-action)',
    color: 'white',
    border: 'none',
  },
  secondary: {
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    border: '1px solid var(--color-border-strong)',
  },
  danger: {
    background: 'transparent',
    color: 'var(--color-negative)',
    border: '1px solid #F09595',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    border: 'none',
  },
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
  onClick,
  type = 'button',
  children,
  className,
}: ButtonProps) {
  const style: React.CSSProperties = {
    ...variantStyles[variant],
    borderRadius: 'var(--radius-lg)',
    fontSize: 14,
    fontWeight: 500,
    fontFamily: 'inherit',
    padding: paddings[size],
    width: fullWidth ? '100%' : 'auto',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'opacity 0.15s',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    lineHeight: 1.4,
  }

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`touch-target ${className || ''}`}
      style={style}
      onMouseEnter={(e) => {
        if (!disabled) (e.currentTarget as HTMLButtonElement).style.opacity = '0.9'
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.opacity = disabled ? '0.5' : '1'
      }}
    >
      {children}
    </button>
  )
}
