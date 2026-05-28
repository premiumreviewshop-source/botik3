import { useState } from 'react'
import { useApp } from '../store/app'
import { IconBack, IconTrash } from '../components/Icons'
import Button from '../components/Button'
import BottomSheet from '../components/BottomSheet'
import StatusPill from '../components/StatusPill'

export default function BotDetail() {
  const { goBack, bots, setBots, selectedBotId } = useApp()
  const [showConfirm, setShowConfirm] = useState(false)

  const bot = bots.find(b => b.id === selectedBotId)
  if (!bot) return null

  const toggleActive = () =>
    setBots(bots.map(b => b.id === bot.id ? { ...b, isActive: !b.isActive } : b))

  const resetBot = () => {
    setBots(bots.map(b => b.id === bot.id ? { ...b, modules: [], isActive: false } : b))
    setShowConfirm(false)
  }

  return (
    <div className="flex flex-col gap-5 pt-4">
      <div className="flex items-center gap-3 px-5">
        <button onClick={goBack}
          className="w-9 h-9 rounded-full bg-[rgba(0,255,136,0.06)] border border-[rgba(0,255,136,0.2)] flex items-center justify-center hover:bg-[rgba(0,255,136,0.12)] transition-colors">
          <IconBack size={20} color="#00ff88" />
        </button>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[2px] text-[rgba(0,255,136,0.5)]">Мои боты</p>
          <h1 className="text-[22px] font-black tracking-tight">{bot.name}</h1>
        </div>
      </div>

      <div className="px-5 flex flex-col gap-3">
        {/* Bot card */}
        <div className="p-4 bg-[#080808] border border-[rgba(0,255,136,0.12)] rounded-[20px]">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-[16px] bg-[rgba(0,255,136,0.07)] border border-[rgba(0,255,136,0.2)] flex items-center justify-center text-[18px] font-black text-[#00ff88] flex-shrink-0"
              style={{ boxShadow: '0 0 14px rgba(0,255,136,0.08)' }}>
              {bot.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[17px] font-bold truncate">{bot.name}</p>
              <p className="text-[13px] text-[rgba(255,255,255,0.35)]">{bot.handle}</p>
            </div>
          </div>

          {/* Status toggle */}
          <div className="flex items-center justify-between py-3 border-t border-[rgba(0,255,136,0.08)]">
            <div>
              <p className="text-[13px] font-bold">Статус</p>
              <p className="text-[11px] text-[rgba(255,255,255,0.3)]">{bot.isActive ? 'Бот активен и отвечает' : 'Бот отключён'}</p>
            </div>
            <button onClick={toggleActive}
              className={`relative w-12 h-6 rounded-full border transition-all duration-200 ${bot.isActive ? 'bg-[#00ff88] border-[#00ff88]' : 'bg-[rgba(255,255,255,0.06)] border-[rgba(255,255,255,0.1)]'}`}
              style={bot.isActive ? { boxShadow: '0 0 10px rgba(0,255,136,0.4)' } : {}}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full transition-all duration-200 ${bot.isActive ? 'left-[26px] bg-black' : 'left-0.5 bg-[rgba(255,255,255,0.4)]'}`} />
            </button>
          </div>

          {/* Status pill display */}
          <div className="flex items-center justify-between py-3 border-t border-[rgba(0,255,136,0.08)]">
            <p className="text-[12px] text-[rgba(255,255,255,0.4)]">Текущий статус</p>
            <StatusPill active={bot.isActive} />
          </div>
        </div>

        {/* Connected modules */}
        <div className="p-4 bg-[#080808] border border-[rgba(0,255,136,0.1)] rounded-[16px]">
          <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,136,0.55)] mb-3">Подключённые модули</p>
          {bot.modules.length === 0 ? (
            <p className="text-[13px] text-[rgba(255,255,255,0.3)]">Нет подключённых модулей</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {bot.modules.map(m => (
                <span key={m} className="text-[11px] font-bold px-3 py-1.5 rounded-[10px] bg-[rgba(0,255,136,0.07)] border border-[rgba(0,255,136,0.22)] text-[rgba(0,255,136,0.85)]">
                  {m}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Reset */}
        {bot.modules.length > 0 && (
          <div className="p-4 bg-[rgba(255,80,80,0.04)] border border-[rgba(255,80,80,0.15)] rounded-[16px]">
            <p className="text-[12px] text-[rgba(255,255,255,0.4)] mb-3 leading-relaxed">
              Бот привязан к модулям. Для переподключения к другому модулю — сначала сбрось бота.
            </p>
            <Button variant="secondary" fullWidth onClick={() => setShowConfirm(true)}>
              <IconTrash size={16} /> Сбросить бота
            </Button>
          </div>
        )}
      </div>

      {/* Confirm reset sheet */}
      <BottomSheet isOpen={showConfirm} onClose={() => setShowConfirm(false)} title="Сбросить бота?">
        <div className="flex flex-col gap-4">
          <div className="p-4 bg-[rgba(255,80,80,0.06)] border border-[rgba(255,80,80,0.2)] rounded-[14px]">
            <p className="text-[13px] text-[rgba(255,255,255,0.7)] leading-relaxed">
              Бот <span className="text-white font-bold">{bot.name}</span> будет отвязан от всех модулей:
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {bot.modules.map(m => (
                <span key={m} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[rgba(255,80,80,0.12)] border border-[rgba(255,80,80,0.25)] text-[rgba(255,80,80,0.8)]">{m}</span>
              ))}
            </div>
          </div>
          <p className="text-[12px] text-[rgba(255,255,255,0.35)] text-center">После сброса бот станет неактивным и сможет быть подключён заново</p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setShowConfirm(false)}>Отмена</Button>
            <button onClick={resetBot}
              className="flex-1 py-3 rounded-[14px] bg-[rgba(255,80,80,0.15)] border border-[rgba(255,80,80,0.35)] text-[14px] font-black text-[rgba(255,80,80,0.9)] hover:bg-[rgba(255,80,80,0.25)] transition-all">
              Да, сбросить
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}
