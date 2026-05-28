import { useApp } from '../../store/app'
import { IconBack, IconZap, IconSend, IconChevronRight, IconInfo } from '../../components/Icons'

export default function AutoPost() {
  const { navigate, goBack } = useApp()

  const cards = [
    {
      title: 'Генерация описаний',
      desc: 'AI создаёт тексты для постов с твоими фото. Готовые промпты, свой стиль, мультиязычность, футер со ссылками и emoji.',
      icon: IconZap,
      page: 'module/autopost/captions' as const,
      tag: 'AI · Text',
    },
    {
      title: 'Автопостинг',
      desc: 'Публикуй готовые посты в свой Telegram-канал по расписанию. Категории, очерёдность, AI-план на несколько недель.',
      icon: IconSend,
      page: 'module/autopost/schedule' as const,
      tag: 'TG · Auto',
    },
  ]

  return (
    <div className="flex flex-col gap-5 pt-4">
      <div className="flex items-center gap-3 px-5">
        <button onClick={goBack}
          className="w-9 h-9 rounded-full bg-[rgba(0,255,136,0.06)] border border-[rgba(0,255,136,0.2)] flex items-center justify-center hover:bg-[rgba(0,255,136,0.12)] transition-colors">
          <IconBack size={20} color="#00ff88" />
        </button>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[2px] text-[rgba(0,255,136,0.5)]">Модуль</p>
          <h1 className="text-[22px] font-black tracking-tight leading-tight">Посты + Автопостинг</h1>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-5">
        {cards.map(c => {
          const Icon = c.icon
          return (
            <button key={c.title} onClick={() => navigate(c.page)}
              className="w-full p-5 bg-[#080808] border border-[rgba(0,255,136,0.18)] rounded-[20px] text-left
                hover:border-[rgba(0,255,136,0.45)] hover:bg-[rgba(0,255,136,0.02)] transition-all duration-200">
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
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88]" style={{ boxShadow: '0 0 5px rgba(0,255,136,1)' }} />
                  <span className="text-[9px] text-[rgba(0,255,136,0.5)] font-black uppercase tracking-[0.5px]">Ready</span>
                </div>
                <div className="flex items-center gap-1 text-[#00ff88] text-[13px] font-bold">
                  Открыть <IconChevronRight size={15} color="#00ff88" />
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Analytics card */}
      <div className="px-5">
        <button onClick={() => navigate('module/autopost/analytics')}
          className="w-full flex items-center gap-3 p-4 bg-[rgba(0,255,136,0.03)] border border-[rgba(0,255,136,0.15)] rounded-[16px] hover:border-[rgba(0,255,136,0.35)] hover:bg-[rgba(0,255,136,0.06)] transition-all">
          <div className="w-10 h-10 rounded-[12px] bg-[rgba(0,255,136,0.08)] border border-[rgba(0,255,136,0.2)] flex items-center justify-center flex-shrink-0">
            <IconInfo size={20} color="rgba(0,255,136,0.8)" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-[14px] font-bold">Аналитика</p>
            <p className="text-[11px] text-[rgba(255,255,255,0.35)]">Лучшее время, охват, AI-рекомендации</p>
          </div>
          <IconChevronRight size={15} color="rgba(0,255,136,0.5)" />
        </button>
      </div>
    </div>
  )
}
