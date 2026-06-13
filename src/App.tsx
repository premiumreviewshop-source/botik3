import { useMemo } from 'react'
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
    <LangProvider>
      <AppProvider>
        <PlatformOverlay />
        <PageRouter />
        <div className="page-top-fade" />
        <div className="page-bottom-fade" />
        <BottomNav />
      </AppProvider>
    </LangProvider>
  )
}
