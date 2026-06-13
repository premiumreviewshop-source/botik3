import React, { useMemo, useState, useEffect } from 'react'
import { AppProvider, useApp } from './store/app'
import { LangProvider } from './store/lang'
import BottomNav from './components/BottomNav'
import Home from './pages/Home'
import Bots from './pages/Bots'
import AddBot from './pages/AddBot'
import BotDetail from './pages/BotDetail'
import Balance from './pages/Balance'
import Referral from './pages/Referral'
import Settings from './pages/Settings'
import AIChatPPV from './pages/modules/AIChatPPV'
import AIChat from './pages/modules/AIChat'
import PPV from './pages/modules/PPV'
import Models from './pages/modules/Models'
import CreateModel from './pages/modules/CreateModel'
import ModelDetail from './pages/modules/ModelDetail'
import AutoPost from './pages/modules/AutoPost'
import AutoPostCaptions from './pages/modules/AutoPostCaptions'
import AutoPostSchedule from './pages/modules/AutoPostSchedule'
import AutoPostAnalytics from './pages/modules/AutoPostAnalytics'
import Analytics from './pages/modules/Analytics'
import Admin from './pages/Admin'
import PlatformOverlay from './components/PlatformOverlay'

function MobileOnlyGate({ children }: { children: React.ReactNode }) {
  const [wide, setWide] = useState(() => window.innerWidth >= 768)
  useEffect(() => {
    const check = () => setWide(window.innerWidth >= 768)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  if (!wide) return <>{children}</>
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: '#02020a',
      backgroundImage: 'linear-gradient(rgba(0,255,136,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,136,0.04) 1px, transparent 1px)',
      backgroundSize: '38px 38px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{
        textAlign: 'center', maxWidth: 340,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 28, padding: '40px 24px',
      }}>
        <div style={{ fontSize: 52, marginBottom: 20 }}>📱</div>
        <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '0 0 10px' }}>
          Только для телефона
        </p>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7, margin: 0 }}>
          Откройте приложение через Telegram на телефоне
        </p>
      </div>
    </div>
  )
}

function PageRouter() {
  const { page, dir } = useApp()

  const animClass = useMemo(() => {
    if (dir === 'forward') return 'page-slide-in'
    if (dir === 'back') return 'page-slide-back'
    return 'page-tab-switch'
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  const content = () => {
    switch (page) {
      case 'home': return <Home />
      case 'bots': return <Bots />
      case 'bots/add': return <AddBot />
      case 'bots/detail': return <BotDetail />
      case 'balance': return <Balance />
      case 'referral': return <Referral />
      case 'settings': return <Settings />
      case 'module/aichat-ppv': return <AIChatPPV />
      case 'module/aichat': return <AIChat />
      case 'module/ppv': return <PPV />
      case 'module/models': return <Models />
      case 'module/models/create': return <CreateModel />
      case 'module/models/detail': return <ModelDetail />
      case 'module/analytics': return <Analytics />
      case 'module/autopost': return <AutoPost />
      case 'module/autopost/captions': return <AutoPostCaptions />
      case 'module/autopost/schedule': return <AutoPostSchedule />
      case 'module/autopost/analytics': return <AutoPostAnalytics />
      case 'admin': return <Admin />
      default: return <Home />
    }
  }

  return (
    <div key={page} className={`page ${animClass} page--${page.replace(/\//g, '-')}`}>
      {content()}
    </div>
  )
}

export default function App() {
  return (
    <MobileOnlyGate>
      <LangProvider>
        <AppProvider>
          <PlatformOverlay />
          <PageRouter />
          <div className="page-top-fade" />
          <div className="page-bottom-fade" />
          <BottomNav />
        </AppProvider>
      </LangProvider>
    </MobileOnlyGate>
  )
}
