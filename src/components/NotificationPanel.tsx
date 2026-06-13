import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export interface PlatformNotification {
  id: string
  type: string
  amount?: number | null
  message?: string | null
}

interface Props {
  notification: PlatformNotification
  onClose: () => void
}

export default function NotificationPanel({ notification, onClose }: Props) {
  const hasAmount = notification.amount != null && notification.amount !== 0
  const isPositive = (notification.amount ?? 0) > 0
  const absTarget = Math.abs(notification.amount ?? 0)
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    setDisplayValue(0)
    if (!hasAmount) return
    const duration = 900
    const start = Date.now()
    const tick = () => {
      const elapsed = Date.now() - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(absTarget * eased)
      if (progress < 1) requestAnimationFrame(tick)
      else setDisplayValue(absTarget)
    }
    requestAnimationFrame(tick)
  }, [notification.id])

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        display: 'flex', alignItems: 'flex-end',
      }}
    >
      <div style={{
        width: '100%',
        background: 'rgba(8,9,18,0.96)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderRadius: '32px 32px 0 0',
        border: '1px solid rgba(255,255,255,0.07)',
        borderBottom: 'none',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 -24px 80px rgba(0,0,0,0.6)',
        padding: '0 28px',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 52px)',
        minHeight: '46vh',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        animation: 'panel-slide-up 0.32s cubic-bezier(0.22,1,0.36,1) both',
      }}>
        {/* Handle */}
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.12)', margin: '14px 0 16px' }} />

        {/* Admin label */}
        <p style={{
          fontSize: '10px', fontWeight: 800, letterSpacing: '2px',
          color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase',
          marginBottom: '20px',
        }}>
          Сообщение от администратора
        </p>

        {/* Amount or icon */}
        {hasAmount ? (
          <p style={{
            fontSize: '72px', fontWeight: 900, letterSpacing: '-3px', lineHeight: 1,
            color: isPositive ? '#00ffaa' : '#ff6b87',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {isPositive ? '+' : '-'}{displayValue.toFixed(2)}
          </p>
        ) : (
          <p style={{ fontSize: '52px', lineHeight: 1 }}>📢</p>
        )}

        {/* Balance label */}
        {hasAmount && notification.type === 'balance' && (
          <p style={{
            fontSize: '13px', fontWeight: 700,
            color: isPositive ? 'rgba(0,255,170,0.5)' : 'rgba(255,107,135,0.5)',
            letterSpacing: '0.5px', marginTop: '6px',
          }}>
            {isPositive ? 'Баланс пополнен' : 'Списание с баланса'}
          </p>
        )}

        {/* Message */}
        {notification.message && (
          <p style={{
            fontSize: '16px', fontWeight: 500,
            color: 'rgba(255,255,255,0.8)',
            textAlign: 'center', lineHeight: 1.65,
            maxWidth: '300px', marginTop: '12px',
          }}>
            {notification.message}
          </p>
        )}

        {/* Dismiss hint */}
        <p style={{
          fontSize: '11px', color: 'rgba(255,255,255,0.2)',
          marginTop: 'auto', paddingTop: '24px',
          letterSpacing: '0.5px',
        }}>
          нажмите чтобы закрыть
        </p>
      </div>
    </div>,
    document.body
  )
}
