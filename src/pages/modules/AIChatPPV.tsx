import { useApp } from '../../store/app'
import { IconBack, IconBrain, IconImage, IconChevronRight } from '../../components/Icons'

function BackBtn({ onPress }: { onPress: () => void }) {
  return (
    <button onClick={onPress}
      className="w-9 h-9 rounded-full bg-[rgba(0,255,136,0.06)] border border-[rgba(0,255,136,0.2)] flex items-center justify-center hover:bg-[rgba(0,255,136,0.12)] transition-colors">
      <IconBack size={20} color="#00ff88" />
    </button>
  )
}

export default function AIChatPPV() {
  const { navigate, goBack } = useApp()

  const cards = [
    {
      title: 'AI Chatting',
      desc: 'AI-персонаж общается с подписчиками от твоего имени круглосуточно без выходных',
      icon: IconBrain,
      page: 'module/aichat' as const,
      tag: 'Grok AI',
    },
    {
      title: 'PPV Контент',
      desc: 'Загружай эксклюзивный контент и продавай за Telegram Stars прямо в боте',
      icon: IconImage,
      page: 'module/ppv' as const,
      tag: 'Stars',
    },
  ]

  return (
    <div className="flex flex-col gap-5 pt-4">
      <div className="flex items-center gap-3 px-5">
        <BackBtn onPress={goBack} />
        <div>
          <p className="text-[9px] font-black uppercase tracking-[2px] text-[rgba(0,255,136,0.5)]">Модуль</p>
          <h1 className="text-[22px] font-black tracking-tight leading-tight">AI Chatting + PPV</h1>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-5">
        {cards.map(c => {
          const Icon = c.icon
          return (
            <button key={c.title} onClick={() => navigate(c.page)}
              className="w-full p-5 bg-[#080808] border border-[rgba(0,255,136,0.18)] rounded-[20px] text-left
                hover:border-[rgba(0,255,136,0.45)] hover:-translate-y-[2px] hover:bg-[rgba(0,255,136,0.02)] transition-all duration-200"
              style={{ boxShadow: '0 0 0 rgba(0,255,136,0)' }}>
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-[16px] bg-[rgba(0,255,136,0.07)] border border-[rgba(0,255,136,0.2)] flex items-center justify-center"
                  style={{ boxShadow: '0 0 14px rgba(0,255,136,0.1)' }}>
                  <Icon size={24} color="#00ff88" />
                </div>
                <span className="text-[9px] font-black uppercase tracking-[1px] text-[rgba(0,255,136,0.65)] bg-[rgba(0,255,136,0.07)] border border-[rgba(0,255,136,0.2)] rounded-full px-2.5 py-1">
                  {c.tag}
                </span>
              </div>
              <p className="text-[21px] font-extrabold mb-2 tracking-tight">{c.title}</p>
              <p className="text-[13px] text-[rgba(255,255,255,0.35)] leading-relaxed mb-4">{c.desc}</p>
              <div className="flex items-center justify-between pt-3 border-t border-[rgba(0,255,136,0.1)]">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-dot" style={{ boxShadow: '0 0 5px rgba(0,255,136,1)' }} />
                  <span className="text-[9px] text-[rgba(0,255,136,0.5)] font-black uppercase tracking-[0.5px]">Ready</span>
                </div>
                <div className="flex items-center gap-1 text-[#00ff88] text-[13px] font-bold">
                  Настроить <IconChevronRight size={15} color="#00ff88" />
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
