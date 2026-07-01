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
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
      onClick={close}
    >
      <div
        className="mx-5 rounded-[24px] overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, #071510 0%, #0b2018 60%, #071510 100%)',
          border: '1px solid rgba(0,255,170,0.22)',
          boxShadow: '0 0 60px rgba(0,255,170,0.08), 0 24px 80px rgba(0,0,0,0.6)',
          width: '100%',
          maxWidth: 340,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Icon */}
        <div className="flex justify-center pt-8 pb-4">
          <div
            className="w-16 h-16 rounded-[20px] flex items-center justify-center"
            style={{
              background: 'rgba(0,255,170,0.08)',
              border: '1px solid rgba(0,255,170,0.2)',
            }}
          >
            <span style={{ fontSize: 30 }}>💳</span>
          </div>
        </div>

        {/* Text */}
        <div className="px-6 pb-2 text-center">
          <h2
            className="text-[19px] font-black leading-tight mb-2"
            style={{ color: '#fff' }}
          >
            {t.lowBalance.title}
          </h2>
          <p
            className="text-[13px] leading-[1.6]"
            style={{ color: 'rgba(255,255,255,0.45)' }}
          >
            {t.lowBalance.desc}
          </p>
          {detail && (
            <p
              className="text-[11px] mt-2 font-mono"
              style={{ color: 'rgba(0,255,170,0.45)' }}
            >
              {detail}
            </p>
          )}
        </div>

        {/* Buttons */}
        <div className="px-6 pt-4 pb-7 flex flex-col gap-2.5">
          <button
            onClick={goTopUp}
            className="w-full py-3.5 rounded-[14px] text-[14px] font-black tracking-wide transition-all active:scale-[0.97]"
            style={{
              background: 'linear-gradient(135deg, rgba(0,255,170,0.18) 0%, rgba(0,200,130,0.12) 100%)',
              border: '1px solid rgba(0,255,170,0.35)',
              color: '#00ffaa',
              boxShadow: '0 0 20px rgba(0,255,170,0.08)',
            }}
          >
            {t.lowBalance.cta}
          </button>
          <button
            onClick={close}
            className="w-full py-3 rounded-[14px] text-[13px] font-semibold transition-all active:scale-[0.97]"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
              color: 'rgba(255,255,255,0.35)',
            }}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}
