import { useApp } from '../../store/app'
import { useLang } from '../../store/lang'
import { IconBack, IconBrain, IconImage, IconChevronRight } from '../../components/Icons'

export default function AIChatPPV() {
  const { navigate, goBack } = useApp()
  const { t } = useLang()

  const cards = [
    {
      title: 'AI Chatting',
      desc: t.mods.aiChatDesc,
      icon: IconBrain,
      page: 'module/aichat' as const,
      tag: 'AI',
      accent: '#00ffaa',
      border: 'rgba(0,255,170,0.2)',
      cardBg: 'linear-gradient(135deg, rgba(0,30,30,0.85) 0%, rgba(8,11,24,0.95) 100%)',
    },
    {
      title: t.mods.ppvTitle,
      desc: t.mods.ppvDesc,
      icon: IconImage,
      page: 'module/ppv' as const,
      tag: 'Stars',
      accent: '#fbbf24',
      border: 'rgba(251,191,36,0.2)',
      cardBg: 'linear-gradient(135deg, rgba(30,22,0,0.85) 0%, rgba(8,11,24,0.95) 100%)',
    },
  ]

  return (
    <div className="flex flex-col gap-5 pt-4 pb-4">
      <div className="flex items-center gap-3 px-5 animate-reveal-up">
        <button onClick={goBack}
          className="w-10 h-10 rounded-[14px] flex items-center justify-center transition-all duration-200 active:scale-[0.92]"
          style={{ background: 'rgba(0,255,170,0.06)', border: '1px solid rgba(0,255,170,0.2)' }}>
          <IconBack size={20} color="#00ffaa" />
        </button>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[2.5px] text-[rgba(0,255,170,0.45)]">{t.mods.moduleLabel}</p>
          <h1 className="text-[22px] font-black tracking-tight leading-tight">AI Chatting + PPV</h1>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-5">
        {cards.map((c, i) => {
          const Icon = c.icon
          return (
            <button key={c.title} onClick={() => navigate(c.page)}
              className="w-full text-left rounded-[22px] overflow-hidden active:scale-[0.98] transition-all duration-200 animate-card-in"
              style={{
                background: c.cardBg,
                border: `1px solid ${c.border}`,
                animationDelay: `${i * 80}ms`,
              }}>
              <div className="h-[2px]" style={{ background: `linear-gradient(90deg, ${c.accent}, transparent)` }} />
              <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-[16px] flex items-center justify-center"
                    style={{
                      background: `linear-gradient(135deg, ${c.accent}1a, rgba(255,255,255,0.02))`,
                      border: `1px solid ${c.accent}33`,
                    }}>
                    <Icon size={24} color={c.accent} />
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-[1px] px-2.5 py-1 rounded-full"
                    style={{
                      background: `${c.accent}14`,
                      border: `1px solid ${c.accent}2e`,
                      color: c.accent,
                    }}>
                    {c.tag}
                  </span>
                </div>
                <p className="text-[21px] font-extrabold mb-2 tracking-tight text-white">{c.title}</p>
                <p className="text-[13px] text-[rgba(255,255,255,0.35)] leading-relaxed mb-4">{c.desc}</p>
                <div className="flex items-center justify-between pt-3.5"
                  style={{ borderTop: `1px solid ${c.accent}18` }}>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full animate-dot"
                      style={{ background: c.accent, boxShadow: `0 0 6px ${c.accent}` }} />
                    <span className="text-[9px] font-black uppercase tracking-[0.5px]" style={{ color: c.accent, opacity: 0.7 }}>{t.mods.ready}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[13px] font-bold" style={{ color: c.accent }}>
                    {t.mods.configure} <IconChevronRight size={15} color={c.accent} />
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
