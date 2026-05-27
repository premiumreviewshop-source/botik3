import { type ReactNode } from 'react'
import clsx from 'clsx'

interface Props {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
  disabled?: boolean
  className?: string
  type?: 'button' | 'submit'
}

export default function Button({
  children, onClick, variant = 'primary', size = 'md',
  fullWidth, disabled, className, type = 'button',
}: Props) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'relative overflow-hidden font-bold rounded-btn transition-all duration-200 select-none',
        'active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none',
        {
          'text-sm px-4 py-2.5': size === 'sm',
          'text-[15px] px-5 py-3.5': size === 'md',
          'text-base px-6 py-4': size === 'lg',
          'w-full': fullWidth,
        },
        variant === 'primary' && [
          'bg-[#00ff88] text-black',
          'shadow-[0_0_20px_rgba(0,255,136,0.4)]',
          'hover:shadow-[0_0_36px_rgba(0,255,136,0.7)] hover:-translate-y-[1px] hover:brightness-105',
        ],
        variant === 'secondary' && [
          'bg-transparent border border-[rgba(0,255,136,0.25)] text-[rgba(255,255,255,0.8)]',
          'hover:border-[rgba(0,255,136,0.5)] hover:bg-[rgba(0,255,136,0.06)] hover:text-[#00ff88]',
        ],
        variant === 'ghost' && 'text-[#00ff88] hover:text-white transition-colors',
        variant === 'danger' && 'bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.25)] text-red-400 hover:bg-[rgba(239,68,68,0.18)]',
        className,
      )}
    >
      {variant === 'primary' && (
        <span className="pointer-events-none absolute inset-0 animate-shimmer"
          style={{ background: 'linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.3) 50%,transparent 100%)', width: '60%' }} />
      )}
      <span className="relative flex items-center justify-center gap-2">{children}</span>
    </button>
  )
}
