import { useApp } from '../store/app'
import { useLang } from '../store/lang'
import { IconPlus, IconChevronRight, IconBots } from '../components/Icons'
import StatusPill from '../components/StatusPill'

export default function Bots() {
  const { bots, navigate, setSelectedBotId } = useApp()
  const { t } = useLang()

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div className="px-5 flex items-center justify-between animate-reveal-up">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[2px] mb-1" style={{ color: 'rgba(255,255,255,0.28)' }}>{t.bots.section}</p>
          <h1 className="text-[26px] font-black tracking-tight">{t.bots.title}</h1>
        </div>
        <button onClick={() => navigate('bots/add')}
          className="w-11 h-11 rounded-[15px] flex items-center justify-center active:scale-[0.92] transition-all"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}>
          <IconPlus size={18} color="rgba(255,255,255,0.6)" />
        </button>
      </div>

      <div className="flex flex-col gap-2.5 px-5">
        {bots.map((bot, i) => (
          <button key={bot.id}
            onClick={() => { setSelectedBotId(bot.id); navigate('bots/detail') }}
            className="w-full text-left p-4 rounded-[20px] active:scale-[0.97] transition-all duration-200 animate-card-in"
            style={{
              background: 'rgba(255,255,255,0.035)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.07)',
              animationDelay: `${i * 70}ms`,
            }}>
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-[16px] flex items-center justify-center text-[14px] font-black flex-shrink-0"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.6)',
                }}>
                {bot.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[16px] font-bold text-white truncate">{bot.name}</p>
                <p className="text-[12px] text-[rgba(255,255,255,0.3)] mb-2">{bot.handle}</p>
                <div className="flex flex-wrap gap-1.5">
                  {bot.modules.filter(m => !m.toLowerCase().includes('autopost') && m !== 'Автопостинг').map(m => (
                    <span key={m} className="text-[9px] font-black uppercase tracking-[0.5px] px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.38)' }}>
                      {m}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <StatusPill active={bot.isActive} />
                <IconChevronRight size={14} color="rgba(255,255,255,0.18)" />
              </div>
            </div>
          </button>
        ))}

        {bots.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-16 rounded-[22px] animate-reveal-scale"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="w-16 h-16 rounded-[20px] flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <IconBots size={30} color="rgba(255,255,255,0.28)" />
            </div>
            <div className="text-center">
              <p className="text-[17px] font-bold mb-1.5">{t.bots.empty}</p>
              <p className="text-[13px] text-[rgba(255,255,255,0.3)] leading-relaxed whitespace-pre-line">{t.bots.emptyDesc}</p>
            </div>
          </div>
        )}
      </div>

      <div className="px-5">
        <button onClick={() => navigate('bots/add')}
          className="w-full flex items-center justify-center gap-2.5 py-4 rounded-[18px] text-[15px] font-black transition-all active:scale-[0.97]"
          style={{
            background: 'rgba(255,255,255,0.04)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.65)',
          }}>
          <IconPlus size={19} color="rgba(255,255,255,0.45)" />
          {t.bots.connect}
        </button>
      </div>
    </div>
  )
}
