import { useEffect, useState } from 'react'
import { useApp } from '../store/app'
import { useLang } from '../store/lang'


export default function InsufficientBalanceModal() {
  const [visible, setVisible] = useState(false)
  const [animIn, setAnimIn] = useState(false)
  const [detail, setDetail] = useState<string | null>(null)
  const { navigate, balance } = useApp()
  const { t } = useLang()

  useEffect(() => {
    const handler = (e: Event) => {
      setDetail((e as CustomEvent).detail ?? null)
      setVisible(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimIn(true)))
    }
    window.addEventListener('balance:insufficient', handler)
    return () => window.removeEventListener('balance:insufficient', handler)
  }, [])

  const close = () => {
    setAnimIn(false)
    setTimeout(() => setVisible(false), 260)
  }

  const goTopUp = () => {
    close()
    setTimeout(() => navigate('balance'), 260)
  }

  if (!visible) return null

  return (
    <>
      <style>{`
        @keyframes bm-backdrop-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes bm-card-in { from { opacity: 0; transform: translateY(24px) scale(0.96) } to { opacity: 1; transform: translateY(0) scale(1) } }
        @keyframes bm-backdrop-out { from { opacity: 1 } to { opacity: 0 } }
        @keyframes bm-card-out { from { opacity: 1; transform: translateY(0) scale(1) } to { opacity: 0; transform: translateY(16px) scale(0.97) } }
        @keyframes bm-shine { 0% { left: -60% } 100% { left: 130% } }
        .bm-backdrop-in  { animation: bm-backdrop-in  0.22s ease forwards }
        .bm-backdrop-out { animation: bm-backdrop-out 0.24s ease forwards }
        .bm-card-in      { animation: bm-card-in  0.28s cubic-bezier(.22,.68,0,1.3) forwards }
        .bm-card-out     { animation: bm-card-out 0.22s ease forwards }
        .bm-shine::after {
          content: '';
          position: absolute;
          top: 0; left: -60%;
          width: 50%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent);
          animation: bm-shine 1.6s ease 0.4s infinite;
        }
      `}</style>

      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[9999] flex items-end justify-center px-4 pb-6 ${animIn ? 'bm-backdrop-in' : 'bm-backdrop-out'}`}
        style={{ background: 'rgba(0,0,0,0.88)' }}
        onClick={close}
      >
        {/* Card */}
        <div
          className={`w-full overflow-hidden rounded-[22px] ${animIn ? 'bm-card-in' : 'bm-card-out'}`}
          style={{
            background: '#0f0f0f',
            border: '1px solid rgba(255,255,255,0.09)',
            maxWidth: 380,
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 pt-7 pb-6">
            {/* Icon row */}
            <div className="flex items-center justify-between mb-5">
              <div
                className="w-12 h-12 rounded-[14px] flex items-center justify-center"
                style={{ background: 'rgba(0,255,170,0.07)', border: '1px solid rgba(0,255,170,0.15)' }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#00ffaa" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" opacity="0.8">
                  <rect x="2" y="5" width="20" height="14" rx="3"/>
                  <line x1="2" y1="10" x2="22" y2="10"/>
                  <circle cx="7.5" cy="15" r="1" fill="#00ffaa" stroke="none"/>
                  <line x1="11" y1="15" x2="15" y2="15"/>
                </svg>
              </div>
              {/* Current balance badge */}
              <div
                className="px-3 py-1.5 rounded-[8px]"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <span className="text-[10px] font-black uppercase tracking-[1.5px]" style={{ color: 'rgba(255,255,255,0.25)' }}>Баланс </span>
                <span className="text-[13px] font-bold" style={{ color: balance > 0 ? 'rgba(255,255,255,0.7)' : '#ff4d4d' }}>
                  ${balance.toFixed(2)}
                </span>
              </div>
            </div>

            <h2 className="text-[19px] font-black text-white mb-2 leading-tight">
              {t.lowBalance.title}
            </h2>
            <p className="text-[13px] leading-[1.6]" style={{ color: 'rgba(255,255,255,0.38)' }}>
              {t.lowBalance.desc}
            </p>

            {detail && (
              <div
                className="mt-3 px-3 py-2.5 rounded-[10px]"
                style={{ background: 'rgba(255,60,60,0.06)', border: '1px solid rgba(255,60,60,0.12)' }}
              >
                <p className="text-[11.5px] leading-[1.5]" style={{ color: 'rgba(255,120,120,0.7)' }}>
                  {detail}
                </p>
              </div>
            )}
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.05)' }} />

          {/* Buttons */}
          <div className="px-4 py-4 flex flex-col gap-2">
            {/* CTA — solid green with shine */}
            <button
              onClick={goTopUp}
              className="bm-shine relative w-full py-3.5 rounded-[13px] text-[14px] font-black overflow-hidden transition-all active:scale-[0.97]"
              style={{
                background: 'linear-gradient(135deg, #00e699 0%, #00c87a 100%)',
                color: '#000',
                boxShadow: '0 4px 20px rgba(0,230,153,0.25)',
              }}
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12l7 7 7-7"/>
                </svg>
                {t.lowBalance.cta}
              </span>
            </button>

            <button
              onClick={close}
              className="w-full py-2.5 rounded-[13px] text-[12.5px] transition-all active:scale-[0.97]"
              style={{
                background: 'transparent',
                color: 'rgba(255,255,255,0.22)',
              }}
            >
              {t.lowBalance.cancel}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
