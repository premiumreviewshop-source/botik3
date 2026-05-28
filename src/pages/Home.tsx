import { useState, useEffect, useRef } from 'react'
import { useApp } from '../store/app'
import { IconBrain, IconPhoto, IconChevronRight, IconPlus, IconZap, IconInfo } from '../components/Icons'
import StatusPill from '../components/StatusPill'

function GlareCard({ children, className, onClick, style, delay = 0 }: {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  style?: React.CSSProperties
  delay?: number
}) {
  const [glaring, setGlaring] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setGlaring(true), delay)
    return () => clearTimeout(t)
  }, [delay])

  return (
    <button onClick={onClick} className={`relative overflow-hidden ${className ?? ''}`} style={style}>
      {glaring && (
        <span
          className="glare-sweep pointer-events-none absolute inset-0 z-10"
          style={{ background: 'linear-gradient(105deg, transparent 30%, rgba(0,255,136,0.1) 50%, transparent 70%)' }}
          onAnimationEnd={() => setGlaring(false)}
        />
      )}
      {children}
    </button>
  )
}

function Avatar({ name, photoUrl }: { name: string; photoUrl?: string }) {
  if (photoUrl) return (
    <div className="relative">
      <img src={photoUrl} className="w-10 h-10 rounded-full object-cover" alt="" />
    </div>
  )
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="w-10 h-10 rounded-full bg-[rgba(0,255,136,0.07)] border border-[rgba(0,255,136,0.3)] flex items-center justify-center text-[13px] font-black text-[#00ff88]"
      style={{ boxShadow: '0 0 12px rgba(0,255,136,0.15)' }}>
      {initials}
    </div>
  )
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[#00ff88] text-[10px]" style={{ textShadow: '0 0 8px rgba(0,255,136,0.9)' }}>◆</span>
      <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.38)]">{children}</p>
    </div>
  )
}

export default function Home() {
  const { user, balance, bots, navigate } = useApp()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [activeModule, setActiveModule] = useState(0)
  const handleModuleScroll = () => {
    if (!scrollRef.current) return
    setActiveModule(Math.min(Math.round(scrollRef.current.scrollLeft / 300), 3))
  }

  const modules = [
    {
      id: 'aichat-ppv',
      title: 'AI Chatting + PPV',
      desc: 'Автоматический AI-чатер и продажа контента 24/7',
      icon: IconBrain,
      page: 'module/aichat-ppv' as const,
      tag: 'AI · PPV',
      stat: '24/7',
    },
    {
      id: 'models',
      title: 'AI Models',
      desc: 'Генерируй изображения с твоей AI-моделью',
      icon: IconPhoto,
      page: 'module/models' as const,
      tag: 'Face ID',
      stat: 'HD',
    },
    {
      id: 'autopost',
      title: 'Посты + Автопостинг',
      desc: 'AI генерирует описания и публикует по расписанию',
      icon: IconZap,
      page: 'module/autopost' as const,
      tag: 'AI · Post',
      stat: 'AUTO',
    },
    {
      id: 'analytics',
      title: 'Аналитика',
      desc: 'Сообщения, посты, PPV-продажи — вся статистика в одном месте',
      icon: IconInfo,
      page: 'module/analytics' as const,
      tag: 'Stats',
      stat: 'LIVE',
    },
  ]

  return (
    <div className="flex flex-col gap-6 pt-5">
      {/* Header */}
      <div className="flex items-center justify-between px-5">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar name={user.first_name} photoUrl={user.photo_url} />
            <span className="absolute -bottom-0.5 -right-0.5 w-[11px] h-[11px] bg-[#00ff88] rounded-full border-2 border-black"
              style={{ boxShadow: '0 0 7px rgba(0,255,136,1)' }} />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[2px] text-[rgba(0,255,136,0.5)]">Добро пожаловать</p>
            <p className="text-[18px] font-black tracking-tight leading-tight">{user.first_name} {user.last_name ?? ''}</p>
          </div>
        </div>
        <button onClick={() => navigate('balance')}
          className="flex flex-col items-end gap-0 bg-[rgba(0,255,136,0.05)] border border-[rgba(0,255,136,0.2)] rounded-[16px] px-4 py-2.5
            hover:bg-[rgba(0,255,136,0.09)] hover:border-[rgba(0,255,136,0.4)] transition-all duration-200"
          style={{ boxShadow: '0 0 16px rgba(0,255,136,0.06)' }}>
          <p className="text-[9px] font-black uppercase tracking-[2px] text-[rgba(0,255,136,0.5)]">Баланс</p>
          <p className="text-[22px] font-black text-[#00ff88] leading-tight"
            style={{ textShadow: '0 0 16px rgba(0,255,136,0.55)' }}>
            ${balance.toFixed(2)}
          </p>
        </button>
      </div>

      {/* Modules */}
      <div>
        <div className="px-5 mb-3">
          <SectionLabel>Модули</SectionLabel>
        </div>
        <div ref={scrollRef} onScroll={handleModuleScroll} className="scroll-x flex gap-3 pr-5 pb-1" style={{ scrollSnapType: 'x mandatory' }}>
          <div className="w-5 flex-shrink-0" />
          {modules.map((m, idx) => {
            const Icon = m.icon
            return (
              <GlareCard key={m.id} onClick={() => navigate(m.page)} delay={350 + idx * 220}
                className="flex-shrink-0 w-[288px] bg-[#080808] border border-[rgba(0,255,136,0.18)]
                  rounded-[20px] p-5 text-left transition-all duration-300
                  hover:border-[rgba(0,255,136,0.5)] hover:bg-[rgba(0,255,136,0.025)]"
                style={{ scrollSnapAlign: 'start' }}>
                {/* Top row */}
                <div className="flex items-start justify-between mb-4">
                  <div className="w-11 h-11 rounded-[14px] bg-[rgba(0,255,136,0.07)] border border-[rgba(0,255,136,0.2)] flex items-center justify-center"
                    style={{ boxShadow: '0 0 12px rgba(0,255,136,0.1)' }}>
                    <Icon size={22} color="#00ff88" />
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className="text-[9px] font-black uppercase tracking-[1px] text-[rgba(0,255,136,0.65)] bg-[rgba(0,255,136,0.07)] border border-[rgba(0,255,136,0.2)] rounded-full px-2.5 py-1">
                      {m.tag}
                    </span>
                    <span className="text-[22px] font-black text-[rgba(0,255,136,0.1)] leading-none">{m.stat}</span>
                  </div>
                </div>
                {/* Text */}
                <p className="text-[19px] font-extrabold leading-tight mb-1.5 tracking-tight">{m.title}</p>
                <p className="text-[12px] text-[rgba(255,255,255,0.32)] leading-relaxed mb-4">{m.desc}</p>
                {/* Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-[rgba(0,255,136,0.1)]">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-dot" style={{ boxShadow: '0 0 5px rgba(0,255,136,1)' }} />
                    <span className="text-[9px] text-[rgba(0,255,136,0.5)] font-black uppercase tracking-[0.5px]">Active</span>
                  </div>
                  <div className="flex items-center gap-1 text-[#00ff88] text-[12px] font-bold">
                    Открыть <IconChevronRight size={14} color="#00ff88" />
                  </div>
                </div>
              </GlareCard>
            )
          })}
        </div>
        {/* Scroll dots */}
        <div className="flex justify-center gap-2 mt-3 px-5">
          {modules.map((_, i) => (
            <span key={i} className={`rounded-full transition-all duration-300 ${i === activeModule ? 'w-4 h-1.5 bg-[#00ff88]' : 'w-1.5 h-1.5 bg-[rgba(255,255,255,0.15)]'}`}
              style={i === activeModule ? { boxShadow: '0 0 6px rgba(0,255,136,0.8)' } : {}} />
          ))}
        </div>
      </div>

      {/* My Bots */}
      <div className="px-5">
        <div className="flex items-center justify-between mb-3">
          <SectionLabel>Мои боты</SectionLabel>
          <button onClick={() => navigate('bots')}
            className="text-[10px] font-black uppercase tracking-[1px] text-[rgba(0,255,136,0.5)] hover:text-[#00ff88] transition-colors">
            Все →
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {bots.slice(0, 2).map(bot => (
            <div key={bot.id}
              className="flex items-center gap-3 p-4 bg-[#080808] border border-[rgba(0,255,136,0.12)] rounded-[16px]
                hover:border-[rgba(0,255,136,0.3)] hover:bg-[rgba(0,255,136,0.02)] transition-all duration-200 cursor-pointer">
              <div className="w-10 h-10 rounded-full bg-[rgba(0,255,136,0.07)] border border-[rgba(0,255,136,0.2)] flex items-center justify-center text-[11px] font-black text-[#00ff88] flex-shrink-0">
                {bot.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold truncate">{bot.name}</p>
                <p className="text-[12px] text-[rgba(255,255,255,0.32)]">{bot.handle}</p>
              </div>
              <StatusPill active={bot.isActive} />
            </div>
          ))}
          <button onClick={() => navigate('bots/add')}
            className="flex items-center justify-center gap-2 p-3.5 bg-transparent border border-dashed border-[rgba(0,255,136,0.15)] rounded-[16px]
              hover:bg-[rgba(0,255,136,0.04)] hover:border-[rgba(0,255,136,0.3)] transition-all duration-200
              text-[rgba(255,255,255,0.32)] hover:text-[#00ff88] text-[13px] font-bold">
            <IconPlus size={17} color="currentColor" />
            Подключить бота
          </button>
        </div>
      </div>
    </div>
  )
}
