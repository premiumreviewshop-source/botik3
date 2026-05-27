import { useState } from 'react'
import { useApp } from '../store/app'
import { IconCopy, IconCheck } from '../components/Icons'

const LEVELS = [
  { level: 1, label: 'Прямые рефералы', pct: 20, glow: true },
  { level: 2, label: 'Уровень 2', pct: 10, glow: false },
  { level: 3, label: 'Уровень 3', pct: 5, glow: false },
]

export default function Referral() {
  const { user } = useApp()
  const [copied, setCopied] = useState(false)
  const refCode = `REF_${user.username?.toUpperCase() ?? user.id}`
  const refLink = `https://t.me/aibotplatform_bot?start=${refCode}`

  const copy = () => {
    navigator.clipboard.writeText(refLink).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const stats = [
    { label: 'Рефералов', value: '7' },
    { label: 'Заработано', value: '$12.40' },
    { label: 'Активных', value: '4' },
  ]

  return (
    <div className="flex flex-col gap-5 pt-4">
      <div className="px-5">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[#00ff88] text-[10px]" style={{ textShadow: '0 0 8px rgba(0,255,136,0.9)' }}>◆</span>
          <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.38)]">Партнёрство</p>
        </div>
        <h1 className="text-[24px] font-black tracking-tight mb-1">Рефералы</h1>
        <p className="text-[13px] text-[rgba(255,255,255,0.35)]">Приглашай и зарабатывай с каждого платежа</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2.5 px-5">
        {stats.map(s => (
          <div key={s.label} className="bg-[#080808] border border-[rgba(0,255,136,0.15)] rounded-[16px] p-3.5 text-center">
            <p className="text-[26px] font-black text-[#00ff88]" style={{ textShadow: '0 0 14px rgba(0,255,136,0.4)' }}>{s.value}</p>
            <p className="text-[9px] font-bold uppercase tracking-[0.5px] text-[rgba(255,255,255,0.32)] mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Ref link */}
      <div className="px-5">
        <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.38)] mb-2">Твоя ссылка</p>
        <button onClick={copy}
          className="w-full flex items-center gap-3 p-4 bg-[#080808] border border-[rgba(0,255,136,0.15)] rounded-[16px]
            hover:border-[rgba(0,255,136,0.38)] hover:bg-[rgba(0,255,136,0.02)] transition-all duration-200">
          <div className="flex-1 text-left min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[1px] text-[rgba(0,255,136,0.5)] mb-1">
              Код: <span className="font-mono">{refCode}</span>
            </p>
            <p className="text-[12px] text-[rgba(255,255,255,0.28)] truncate">{refLink}</p>
          </div>
          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200 border ${
            copied
              ? 'bg-[rgba(34,197,94,0.12)] border-[rgba(34,197,94,0.3)]'
              : 'bg-[rgba(0,255,136,0.07)] border-[rgba(0,255,136,0.25)]'
          }`}>
            {copied ? <IconCheck size={16} color="#22c55e" /> : <IconCopy size={16} color="#00ff88" />}
          </div>
        </button>
      </div>

      {/* Commission */}
      <div className="px-5">
        <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.38)] mb-3">Комиссия</p>
        <div className="flex flex-col gap-2">
          {LEVELS.map(l => (
            <div key={l.level}
              className="flex items-center justify-between p-4 bg-[#080808] border border-[rgba(0,255,136,0.12)] rounded-[14px]
                hover:border-[rgba(0,255,136,0.25)] transition-colors">
              <div>
                <p className="text-[14px] font-bold">{l.label}</p>
                <p className="text-[11px] text-[rgba(255,255,255,0.25)] mt-0.5">Уровень {l.level}</p>
              </div>
              <span className="text-[28px] font-black text-[#00ff88]"
                style={l.glow ? { textShadow: '0 0 14px rgba(0,255,136,0.5)' } : { opacity: 0.5 }}>
                {l.pct}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
