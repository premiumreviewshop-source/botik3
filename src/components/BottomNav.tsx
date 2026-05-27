import { useApp } from '../store/app'
import { IconHome, IconBots, IconBalance, IconReferral, IconSettings } from './Icons'
import type { Page } from '../types'

const TABS: { page: Page; icon: typeof IconHome; label: string }[] = [
  { page: 'home', icon: IconHome, label: 'Главная' },
  { page: 'bots', icon: IconBots, label: 'Боты' },
  { page: 'balance', icon: IconBalance, label: 'Баланс' },
  { page: 'referral', icon: IconReferral, label: 'Рефералы' },
  { page: 'settings', icon: IconSettings, label: 'Настройки' },
]

const TAB_PAGES = new Set<Page>(['home', 'bots', 'balance', 'referral', 'settings'])

export default function BottomNav() {
  const { page, navigate } = useApp()
  const activeTab = TAB_PAGES.has(page) ? page : null

  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] z-40">
      <div className="mx-3 mb-3 safe-bottom">
        <div className="h-[62px] bg-[rgba(0,0,0,0.92)] backdrop-blur-xl border border-[rgba(0,255,136,0.15)] rounded-[20px]
          flex items-center px-1.5"
          style={{ boxShadow: '0 0 24px rgba(0,255,136,0.07), 0 8px 40px rgba(0,0,0,0.7)' }}>
          {TABS.map(({ page: p, icon: Icon, label }) => {
            const active = activeTab === p
            return (
              <button key={p} onClick={() => navigate(p)}
                className={`flex-1 flex flex-col items-center gap-[3px] py-2 rounded-[14px] transition-all duration-200 ${
                  active ? 'bg-[rgba(0,255,136,0.08)]' : 'hover:bg-[rgba(255,255,255,0.03)]'
                }`}>
                <Icon size={20} color={active ? '#00ff88' : 'rgba(255,255,255,0.22)'} />
                <span className={`text-[9px] font-bold tracking-[0.3px] transition-colors ${
                  active ? 'text-[#00ff88]' : 'text-[rgba(255,255,255,0.22)]'
                }`}
                  style={active ? { textShadow: '0 0 8px rgba(0,255,136,0.6)' } : {}}>
                  {label}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
