import { type ReactNode, useEffect } from 'react'

interface Props {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

export default function BottomSheet({ isOpen, onClose, title, children }: Props) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-[#080808] rounded-t-[24px] border-t border-[rgba(0,255,136,0.2)] max-h-[85vh] flex flex-col animate-fade-up"
        style={{ boxShadow: '0 -4px 40px rgba(0,255,136,0.06)' }}>
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 bg-[rgba(0,255,136,0.2)] rounded-full" />
        </div>
        {title && (
          <div className="px-5 pt-2 pb-4 border-b border-[rgba(0,255,136,0.1)]">
            <h3 className="text-[17px] font-bold">{title}</h3>
          </div>
        )}
        <div className="overflow-y-auto px-5 pt-5 pb-24 flex flex-col gap-4">
          {children}
        </div>
      </div>
    </div>
  )
}
