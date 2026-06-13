import { useApp } from '../store/app'
import { useLang } from '../store/lang'
import { IconBrain, IconPhoto, IconZap, IconInfo, IconChevronRight, IconPlus } from '../components/Icons'
import StatusPill from '../components/StatusPill'

function ProfileCard() {
  const { user, balance, navigate } = useApp()
  const initials = user.first_name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="flex justify-center px-5 mb-6 pt-2 animate-reveal-up">
      <button onClick={() => navigate('balance')}
        className="relative active:scale-[0.96] transition-transform duration-200"
        style={{ width: 110, height: 110 }}>

        {/* Outer glow ring */}
        <div className="absolute inset-0 rounded-full"
          style={{ boxShadow: '0 0 0 2.5px rgba(0,255,170,0.35), 0 0 28px rgba(0,255,170,0.18)' }} />

        {/* Avatar circle */}
        <div className="w-full h-full rounded-full overflow-hidden">
          {user.photo_url
            ? <img src={user.photo_url} className="w-full h-full object-cover" alt="" />
            : <div className="w-full h-full flex items-center justify-center text-[30px] font-black"
                style={{
                  background: 'linear-gradient(135deg, rgba(0,255,170,0.18), rgba(0,212,255,0.12))',
                  color: '#00ffaa',
                }}>
                {initials}
              </div>
          }
        </div>

        {/* Name + balance overlay at bottom */}
        <div className="absolute bottom-0 left-0 right-0 rounded-b-full overflow-hidden"
          style={{ height: '46%' }}>
          <div className="w-full h-full flex flex-col items-center justify-end pb-2"
            style={{ background: 'linear-gradient(to top, rgba(2,2,2,0.88) 0%, rgba(2,2,2,0.55) 65%, transparent 100%)' }}>
            <p className="text-[10px] font-bold text-white leading-none truncate max-w-[90px] text-center">
              {user.username ? `@${user.username}` : user.first_name}
            </p>
            <p className="text-[11px] font-black tabular-nums leading-tight" style={{ color: '#00ffaa' }}>
              ${balance.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Online dot */}
        <span className="absolute bottom-1 right-1 w-3 h-3 rounded-full border-[2px] border-[#020202]"
          style={{ background: '#00ffaa', boxShadow: '0 0 8px rgba(0,255,170,0.9)' }} />
      </button>
    </div>
  )
}

export default function Home() {
  const { bots, navigate } = useApp()
  const { t } = useLang()

  const MODULES = [
    {
      id: 'aichat-ppv', title: t.home.modAiChat, subtitle: t.home.modAiChatSub,
      icon: IconBrain, page: 'module/aichat-ppv' as const,
      grad: 'linear-gradient(135deg, rgba(0,255,170,0.18) 0%, rgba(0,180,120,0.08) 100%)',
      border: 'rgba(0,255,170,0.2)', color: '#00ffaa', label: 'AI · 24/7',
    },
    {
      id: 'models', title: t.home.modModels, subtitle: t.home.modModelsSub,
      icon: IconPhoto, page: 'module/models' as const,
      grad: 'linear-gradient(135deg, rgba(0,200,255,0.18) 0%, rgba(0,130,200,0.08) 100%)',
      border: 'rgba(0,200,255,0.2)', color: '#00d4ff', label: 'Face ID',
    },
    {
      id: 'autopost', title: t.home.modAutopost, subtitle: t.home.modAutopostSub,
      icon: IconZap, page: 'module/autopost' as const,
      grad: 'linear-gradient(135deg, rgba(157,143,255,0.18) 0%, rgba(100,80,220,0.08) 100%)',
      border: 'rgba(157,143,255,0.2)', color: '#9d8fff', label: 'Auto',
    },
    {
      id: 'analytics', title: t.home.modAnalytics, subtitle: t.home.modAnalyticsSub,
      icon: IconInfo, page: 'module/analytics' as const,
      grad: 'linear-gradient(135deg, rgba(255,180,50,0.18) 0%, rgba(200,120,0,0.08) 100%)',
      border: 'rgba(255,180,50,0.2)', color: '#ffb432', label: 'Live',
    },
  ]

  return (
    <div className="flex flex-col gap-0 pb-2">

      <ProfileCard />

      {/* ── Module Grid ── */}
      <div className="px-5 mb-6">
        <div className="flex items-center gap-2 mb-3.5 animate-reveal-up stagger-1">
          <div className="w-1 h-4 rounded-full" style={{ background: 'linear-gradient(180deg, #00ffaa, #00d4ff)' }} />
          <p className="text-[11px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.4)]">{t.home.modules}</p>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {MODULES.map((m, i) => {
            const Icon = m.icon
            return (
              <button key={m.id} onClick={() => navigate(m.page)}
                className="relative text-left p-4 rounded-[20px] overflow-hidden active:scale-[0.96] transition-all duration-200 animate-card-in"
                style={{
                  background: m.grad,
                  border: `1px solid ${m.border}`,
                  animationDelay: `${60 + i * 55}ms`,
                }}>
                {/* One-shot light sweep on page entry */}
                <div className="absolute inset-y-0 w-[55%] card-shine pointer-events-none"
                  style={{ animationDelay: `${220 + i * 90}ms` }} />
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-[13px] flex items-center justify-center"
                    style={{ background: `${m.color}18`, border: `1px solid ${m.color}30` }}>
                    <Icon size={20} color={m.color} />
                  </div>
                  <span className="text-[8px] font-black uppercase tracking-[0.8px] px-2 py-0.5 rounded-full"
                    style={{ background: `${m.color}14`, color: m.color, border: `1px solid ${m.color}25` }}>
                    {m.label}
                  </span>
                </div>
                <p className="text-[14px] font-extrabold leading-snug text-white mb-0.5">{m.title}</p>
                <p className="text-[11px] font-medium" style={{ color: `${m.color}90` }}>{m.subtitle}</p>
                <div className="flex items-center justify-between mt-3 pt-2.5"
                  style={{ borderTop: `1px solid ${m.color}15` }}>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full animate-dot" style={{ background: m.color }} />
                    <span className="text-[9px] font-bold" style={{ color: `${m.color}70` }}>{t.home.active}</span>
                  </div>
                  <IconChevronRight size={13} color={`${m.color}60`} />
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Bots Panel (glass style) ── */}
      <div className="px-4 pb-4 animate-reveal-up stagger-4">
        <div style={{
          background: 'rgba(255,255,255,0.025)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderRadius: '24px',
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
          overflow: 'hidden',
        }}>
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 rounded-full" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.4), rgba(255,255,255,0.1))' }} />
              <p className="text-[11px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.4)]">{t.home.myBots}</p>
            </div>
            <button onClick={() => navigate('bots')}
              className="text-[10px] font-black uppercase tracking-[1px] px-3 py-1.5 rounded-full transition-all"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.4)',
              }}>
              {t.home.allBots}
            </button>
          </div>

          {/* Bot rows */}
          {bots.slice(0, 2).map((bot, i) => (
            <div key={bot.id}
              className="flex items-center gap-3 px-4 py-3 animate-card-in"
              style={{
                borderTop: '1px solid rgba(255,255,255,0.05)',
                animationDelay: `${i * 50 + 240}ms`,
              }}>
              <div className="w-9 h-9 rounded-[11px] flex items-center justify-center text-[11px] font-black flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
                {bot.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-bold truncate text-white">{bot.name}</p>
                <p className="text-[11px] text-[rgba(255,255,255,0.3)]">{bot.handle}</p>
              </div>
              <StatusPill active={bot.isActive} />
            </div>
          ))}

          {/* Connect bot button */}
          <div style={{ padding: '8px 16px 12px' }}>
            <button onClick={() => navigate('bots/add')}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-[14px] transition-all active:scale-[0.97]"
              style={{
                background: 'rgba(0,255,170,0.05)',
                border: '1px dashed rgba(0,255,170,0.3)',
                boxShadow: '0 0 12px rgba(0,255,170,0.05)',
              }}>
              <IconPlus size={14} color="rgba(0,255,170,0.65)" />
              <span className="text-[13px] font-bold" style={{ color: 'rgba(0,255,170,0.8)' }}>{t.home.connectBot}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
