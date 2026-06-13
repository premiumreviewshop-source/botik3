import { type ReactNode } from 'react'

interface Props {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  fullWidth?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export default function Button({
  children, onClick, disabled, variant = 'primary',
  fullWidth, size = 'md', className = ''
}: Props) {
  const base = `inline-flex items-center justify-center gap-2 font-black transition-all duration-200 active:scale-[0.94] active:brightness-90 select-none ${fullWidth ? 'w-full' : ''}`

  const sizes = {
    sm: 'px-4 py-2.5 rounded-[14px] text-[13px] tracking-[-0.01em]',
    md: 'px-5 py-3.5 rounded-[18px] text-[14px] tracking-[-0.01em]',
    lg: 'px-6 py-4 rounded-[20px] text-[15px] tracking-[-0.01em]',
  }

  const styles: Record<string, React.CSSProperties> = {
    primary: {
      background: disabled
        ? 'rgba(0,255,170,0.18)'
        : 'linear-gradient(160deg, #00ffaa 0%, #00dda0 55%, #00c490 100%)',
      color: disabled ? 'rgba(0,255,170,0.5)' : '#061a10',
      boxShadow: disabled ? 'none' : '0 6px 28px rgba(0,255,170,0.32), 0 1px 0 rgba(255,255,255,0.3) inset, 0 -1px 0 rgba(0,0,0,0.12) inset',
      opacity: disabled ? 0.6 : 1,
      backdropFilter: 'blur(12px)',
    },
    secondary: {
      background: 'rgba(255,255,255,0.06)',
      color: disabled ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.88)',
      border: '1px solid rgba(255,255,255,0.12)',
      boxShadow: '0 2px 16px rgba(0,0,0,0.2), 0 1px 0 rgba(255,255,255,0.07) inset',
      backdropFilter: 'blur(20px)',
      opacity: disabled ? 0.45 : 1,
    },
    ghost: {
      background: 'rgba(0,255,170,0.05)',
      color: disabled ? 'rgba(0,255,170,0.3)' : 'rgba(0,255,170,0.8)',
      border: '1px solid rgba(0,255,170,0.18)',
      boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset',
      backdropFilter: 'blur(12px)',
      opacity: disabled ? 0.45 : 1,
    },
    danger: {
      background: 'rgba(255,59,48,0.08)',
      color: disabled ? 'rgba(255,100,88,0.4)' : 'rgba(255,100,88,0.9)',
      border: '1px solid rgba(255,59,48,0.25)',
      boxShadow: '0 2px 16px rgba(255,59,48,0.1), 0 1px 0 rgba(255,255,255,0.04) inset',
      backdropFilter: 'blur(12px)',
      opacity: disabled ? 0.45 : 1,
    },
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${sizes[size]} ${className}`}
      style={styles[variant]}
    >
      {children}
    </button>
  )
}
