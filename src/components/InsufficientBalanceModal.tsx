import { useEffect, useState } from 'react'
import { useApp } from '../store/app'
import { useLang } from '../store/lang'

export default function InsufficientBalanceModal() {
  const [visible, setVisible] = useState(false)
  const [detail, setDetail] = useState<string | null>(null)
  const { navigate } = useApp()
  const { t } = useLang()

  useEffect(() => {
    const handler = (e: Event) => {
      setDetail((e as CustomEvent).detail ?? null)
      setVisible(true)
    }
    window.addEventListener('balance:insufficient', handler)
    return () => window.removeEventListener('balance:insufficient', handler)
  }, [])

  if (!visible) return null

  const close = () => setVisible(false)

  const goTopUp = () => {
    close()
    navigate('balance')
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center px-5"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={close}
    >
      <div
        className="w-full rounded-[18px]"
        style={{
          background: '#111',
          border: '1px solid rgba(255,255,255,0.08)',
          maxWidth: 320,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Top section */}
        <div className="px-6 pt-7 pb-5">
          {/* Icon */}
          <div
            className="w-11 h-11 rounded-[12px] flex items-center justify-center mb-5"
            style={{ background: 'rgba(255,255,255,0.05)' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="3"/>
              <line x1="2" y1="10" x2="22" y2="10"/>
              <line x1="7" y1="15" x2="9" y2="15"/>
            </svg>
          </div>

          <h2 className="text-[17px] font-bold text-white mb-1.5">
            {t.lowBalance.title}
          </h2>
          <p className="text-[13px] leading-[1.55]" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {t.lowBalance.desc}
          </p>
          {detail && (
            <p className="text-[11px] mt-3 leading-[1.5]" style={{ color: 'rgba(255,255,255,0.25)' }}>
              {detail}
            </p>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />

        {/* Buttons */}
        <div className="px-4 py-4 flex flex-col gap-2">
          <button
            onClick={goTopUp}
            className="w-full py-3 rounded-[12px] text-[14px] font-semibold transition-all active:scale-[0.98]"
            style={{
              background: 'transparent',
              border: '1px solid rgba(0,255,170,0.4)',
              color: '#00ffaa',
            }}
          >
            {t.lowBalance.cta}
          </button>
          <button
            onClick={close}
            className="w-full py-2.5 rounded-[12px] text-[13px] transition-all active:scale-[0.98]"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.05)',
              color: 'rgba(255,255,255,0.3)',
            }}
          >
            {t.lowBalance.cancel}
          </button>
        </div>
      </div>
    </div>
  )
}
