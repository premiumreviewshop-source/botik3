import { useApp } from '../store/app'
import { IconPlus, IconChevronRight } from '../components/Icons'
import StatusPill from '../components/StatusPill'
import Button from '../components/Button'

export default function Bots() {
  const { bots, navigate } = useApp()

  return (
    <div className="flex flex-col gap-5 pt-4">
      <div className="flex items-center justify-between px-5">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[#00ff88] text-[10px]" style={{ textShadow: '0 0 8px rgba(0,255,136,0.9)' }}>◆</span>
            <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.38)]">Управление</p>
          </div>
          <h1 className="text-[24px] font-black tracking-tight">Мои боты</h1>
        </div>
        <button onClick={() => navigate('bots/add')}
          className="w-9 h-9 rounded-full bg-[rgba(0,255,136,0.07)] border border-[rgba(0,255,136,0.25)] flex items-center justify-center
            hover:bg-[rgba(0,255,136,0.14)] hover:border-[rgba(0,255,136,0.5)] transition-all duration-200"
          style={{ boxShadow: '0 0 10px rgba(0,255,136,0.1)' }}>
          <IconPlus size={18} color="#00ff88" />
        </button>
      </div>

      <div className="flex flex-col gap-2.5 px-5">
        {bots.map(bot => (
          <button key={bot.id}
            className="flex items-center gap-3.5 p-4 bg-[#080808] border border-[rgba(0,255,136,0.12)] rounded-[16px] text-left
              hover:border-[rgba(0,255,136,0.35)] hover:bg-[rgba(0,255,136,0.02)] hover:-translate-y-[1px] transition-all duration-200">
            <div className="w-11 h-11 rounded-full bg-[rgba(0,255,136,0.07)] border border-[rgba(0,255,136,0.2)] flex items-center justify-center text-[13px] font-black text-[#00ff88] flex-shrink-0">
              {bot.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[16px] font-bold truncate">{bot.name}</p>
              <p className="text-[12px] text-[rgba(255,255,255,0.32)] mb-2">{bot.handle}</p>
              <div className="flex flex-wrap gap-1.5">
                {bot.modules.map(m => (
                  <span key={m} className="text-[9px] font-black uppercase tracking-[0.5px] bg-[rgba(0,255,136,0.07)] border border-[rgba(0,255,136,0.2)] text-[rgba(0,255,136,0.65)] rounded-full px-2 py-0.5">
                    {m}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusPill active={bot.isActive} />
              <IconChevronRight size={16} color="rgba(255,255,255,0.15)" />
            </div>
          </button>
        ))}

        {bots.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="w-16 h-16 rounded-[20px] bg-[rgba(0,255,136,0.06)] border border-[rgba(0,255,136,0.15)] flex items-center justify-center text-3xl">🤖</div>
            <div>
              <p className="text-[17px] font-bold mb-1">Нет подключённых ботов</p>
              <p className="text-[13px] text-[rgba(255,255,255,0.32)]">Добавь Telegram-бота<br/>чтобы начать работу</p>
            </div>
          </div>
        )}
      </div>

      <div className="px-5 pb-4">
        <Button fullWidth onClick={() => navigate('bots/add')}>
          <IconPlus size={18} />
          Подключить нового бота
        </Button>
      </div>
    </div>
  )
}
