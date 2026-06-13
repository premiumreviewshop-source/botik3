import { useApp } from '../store/app'
import { useLang } from '../store/lang'
import { IconHome, IconBots, IconBalance, IconSettings, IconReferral } from './Icons'

function IconShield({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

export default function BottomNav() {
  const { page, navigate, isAdmin } = useApp()
  const { t } = useLang()

  const TABS = [
    { id: 'home',     Icon: IconHome,     label: t.nav.home,     color: '#00ffaa', glow: 'rgba(0,255,170,0.3)' },
    { id: 'bots',     Icon: IconBots,     label: t.nav.bots,     color: '#00d4ff', glow: 'rgba(0,212,255,0.3)' },
    { id: 'balance',  Icon: IconBalance,  label: t.nav.balance,  color: '#00ffaa', glow: 'rgba(0,255,170,0.3)' },
    { id: 'referral', Icon: IconReferral, label: 'Рефы',         color: '#0099ff', glow: 'rgba(0,153,255,0.3)' },
    { id: 'settings', Icon: IconSettings, label: t.nav.settings, color: '#fbbf24', glow: 'rgba(251,191,36,0.3)' },
    ...(isAdmin ? [{ id: 'admin', Icon: IconShield, label: 'Admin', color: '#a78bfa', glow: 'rgba(167,139,250,0.3)' }] : []),
  ] as const

  return (
    <nav className="absolute bottom-0 left-0 right-0 z-40"
      style={{
        paddingBottom: 'max(var(--safe-bottom, env(safe-area-inset-bottom, 0px)), 8px)',
        background: 'rgba(4,4,4,0.92)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}>
      <div className="flex items-stretch h-[72px]">
        {TABS.map(({ id, Icon, label, color, glow }) => {
          const active = page === id
          return (
            <button key={id} onClick={() => navigate(id as any)}
              className="flex-1 flex flex-col items-center justify-center gap-1.5 relative transition-all duration-200 active:scale-[0.93]">

              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-[2px] rounded-full"
                  style={{ background: color, boxShadow: `0 0 10px ${glow}` }} />
              )}

              <div className="relative flex items-center justify-center"
                style={active ? {
                  width: 36, height: 36, borderRadius: 14,
                  background: `${color}18`,
                  border: `1px solid ${color}30`,
                  boxShadow: `0 0 16px ${color}20`,
                } : {}}>
                <Icon size={22} color={active ? color : 'rgba(255,255,255,0.28)'} />
              </div>

              <span className="text-[10px] font-bold tracking-[0.2px]"
                style={{ color: active ? color : 'rgba(255,255,255,0.28)' }}>
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
