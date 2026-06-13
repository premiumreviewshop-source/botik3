import { useState } from 'react'
import { useApp } from '../store/app'
import { useLang } from '../store/lang'
import { IconBack, IconTrash } from '../components/Icons'
import Button from '../components/Button'
import BottomSheet from '../components/BottomSheet'
import StatusPill from '../components/StatusPill'
import api from '../api/client'

const isBotModule = (m: string) => !m.toLowerCase().includes('autopost') && m !== 'Автопостинг'

export default function BotDetail() {
  const { goBack, bots, setBots, selectedBotId } = useApp()
  const { t } = useLang()
  const [showConfirm, setShowConfirm] = useState(false)

  const bot = bots.find(b => b.id === selectedBotId)
  if (!bot) return null

  const toggleActive = async () => {
    const newActive = !bot.isActive
    await api.bots.update(bot.id, { isActive: newActive })
    setBots(bots.map(b => b.id === bot.id ? { ...b, isActive: newActive } : b))
  }

  const resetBot = async () => {
    await api.bots.reset(bot.id)
    setBots(bots.map(b => b.id === bot.id ? { ...b, modules: [], isActive: false } : b))
    setShowConfirm(false)
  }

  return (
    <div className="flex flex-col gap-5 pt-4 pb-4">
      <div className="flex items-center gap-3 px-5 animate-reveal-up">
        <button onClick={goBack}
          className="w-10 h-10 rounded-[14px] flex items-center justify-center transition-all duration-200 active:scale-[0.92]"
          style={{ background: 'rgba(0,255,170,0.06)', border: '1px solid rgba(0,255,170,0.2)' }}>
          <IconBack size={20} color="#00ffaa" />
        </button>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[2.5px] text-[rgba(0,255,170,0.45)]">{t.mods.myBots}</p>
          <h1 className="text-[22px] font-black tracking-tight">{bot.name}</h1>
        </div>
      </div>

      <div className="px-5 flex flex-col gap-3">
        {/* Bot identity card */}
        <div className="p-5 rounded-[22px] animate-card-in"
          style={{
            background: 'rgba(255,255,255,0.035)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
          }}>
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-[18px] flex items-center justify-center text-[18px] font-black flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, rgba(0,255,170,0.15), rgba(0,212,255,0.1))',
                border: '1px solid rgba(0,255,170,0.25)',
                color: '#00ffaa',
              }}>
              {bot.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[18px] font-bold truncate text-white">{bot.name}</p>
              <p className="text-[13px] text-[rgba(255,255,255,0.3)]">{bot.handle}</p>
            </div>
          </div>

          <div className="flex items-center justify-between py-3.5"
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div>
              <p className="text-[13px] font-semibold text-white">{t.mods.status}</p>
              <p className="text-[11px] text-[rgba(255,255,255,0.3)] mt-0.5">
                {bot.isActive ? t.mods.botActive : t.mods.botInactive}
              </p>
            </div>
            <button onClick={toggleActive}
              className="relative transition-all duration-300"
              style={{
                width: '50px', height: '28px', borderRadius: '999px',
                ...(bot.isActive ? {
                  background: 'linear-gradient(90deg, rgba(0,255,170,0.25), rgba(0,212,255,0.15))',
                  border: '1px solid rgba(0,255,170,0.45)',
                } : {
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }),
              }}>
              <span className="absolute top-[3px] w-[22px] h-[22px] rounded-full transition-all duration-300"
                style={bot.isActive ? {
                  left: '25px',
                  background: 'linear-gradient(135deg, #00ffaa, #00d4ff)',
                  boxShadow: '0 0 10px rgba(0,255,170,0.7)',
                } : {
                  left: '3px', background: 'rgba(255,255,255,0.3)',
                }} />
            </button>
          </div>

          <div className="flex items-center justify-between py-3"
            style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-[12px] text-[rgba(255,255,255,0.3)]">{t.mods.currentStatus}</p>
            <StatusPill active={bot.isActive} />
          </div>
        </div>

        {/* Connected modules */}
        <div className="p-4 rounded-[18px] animate-card-in" style={{ animationDelay: '80ms',
          background: 'rgba(255,255,255,0.035)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
        }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1 h-4 rounded-full" style={{ background: 'linear-gradient(180deg, #00ffaa, #00d4ff)' }} />
            <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,170,0.6)]">{t.mods.connectedModules}</p>
          </div>
          {bot.modules.filter(isBotModule).length === 0 ? (
            <p className="text-[13px] text-[rgba(255,255,255,0.25)]">{t.mods.noModules}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {bot.modules.filter(isBotModule).map(m => (
                <span key={m}
                  className="text-[11px] font-bold px-3 py-1.5 rounded-[10px]"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.65)',
                  }}>
                  {m}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Reset */}
        {bot.modules.filter(isBotModule).length > 0 && (
          <div className="p-4 rounded-[18px] animate-card-in" style={{ animationDelay: '160ms',
            background: 'rgba(255,80,80,0.04)', border: '1px solid rgba(255,80,80,0.15)' }}>
            <p className="text-[12px] text-[rgba(255,255,255,0.35)] mb-3 leading-relaxed">{t.mods.resetBotWarn}</p>
            <Button variant="danger" fullWidth onClick={() => setShowConfirm(true)}>
              <IconTrash size={16} /> {t.mods.resetBotBtn}
            </Button>
          </div>
        )}
      </div>

      <BottomSheet
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        title={t.mods.resetBotTitle}
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setShowConfirm(false)}>{t.common.cancel}</Button>
            <button onClick={resetBot}
              className="flex-1 py-3 rounded-[14px] text-[14px] font-black transition-all active:scale-[0.97]"
              style={{
                background: 'rgba(255,80,80,0.15)',
                border: '1px solid rgba(255,80,80,0.35)',
                color: 'rgba(255,80,80,0.9)',
              }}>
              {t.mods.yesReset}
            </button>
          </div>
        }
      >
        <div className="p-4 rounded-[14px]"
          style={{ background: 'rgba(255,80,80,0.06)', border: '1px solid rgba(255,80,80,0.2)' }}>
          <p className="text-[13px] text-[rgba(255,255,255,0.7)] leading-relaxed">
            <span className="text-white font-bold">{bot.name}</span> {t.mods.resetBotDesc}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {bot.modules.filter(isBotModule).map(m => (
              <span key={m}
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{
                  background: 'rgba(255,80,80,0.12)',
                  border: '1px solid rgba(255,80,80,0.25)',
                  color: 'rgba(255,80,80,0.8)',
                }}>
                {m}
              </span>
            ))}
          </div>
        </div>
        <p className="text-[12px] text-[rgba(255,255,255,0.3)] text-center">{t.mods.resetBotAfter}</p>
      </BottomSheet>
    </div>
  )
}
