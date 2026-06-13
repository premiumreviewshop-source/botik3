import { type ReactNode, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  isOpen: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
}

export default function BottomSheet({ isOpen, onClose, title, children, footer }: Props) {
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tg = (window as any).Telegram?.WebApp
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      tg?.disableVerticalSwipes?.()
    } else {
      document.body.style.overflow = ''
      tg?.enableVerticalSwipes?.()
    }
    return () => {
      document.body.style.overflow = ''
      tg?.enableVerticalSwipes?.()
    }
  }, [isOpen])

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 rounded-t-[28px] max-h-[88vh] flex flex-col animate-sheet"
        style={{
          background: 'rgba(8,11,24,0.96)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderBottom: 'none',
          boxShadow: '0 -8px 60px rgba(0,0,0,0.8), 0 -1px 0 rgba(255,255,255,0.06), 0 0 0 1px rgba(0,255,170,0.06)',
          backdropFilter: 'blur(32px) saturate(180%)',
        }}>
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(0,255,170,0.25)' }} />
        </div>
        {title && (
          <div className="px-5 pt-2 pb-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <h3 className="text-[18px] font-black tracking-tight">{title}</h3>
          </div>
        )}
        <div className={`overflow-y-auto overscroll-contain flex-1 px-5 pt-5 flex flex-col gap-4 ${footer ? 'pb-4' : 'pb-10'}`}>
          {children}
        </div>
        {footer && (
          <div className="px-5 pt-3 flex-shrink-0"
            style={{
              borderTop: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(8,11,24,0.98)',
              paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
            }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
