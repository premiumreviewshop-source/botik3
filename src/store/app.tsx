import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { Page, NavDir, TgUser, Bot, PPVItem, AIModel, Transaction, GeneratedPhoto, ReadyPost, SavedPrompt, SavedFooter } from '../types'

const PAGE_DEPTH: Record<Page, number> = {
  home: 0, bots: 0, balance: 0, referral: 0, settings: 0,
  'bots/add': 1,
  'bots/detail': 2,
  'module/aichat-ppv': 1, 'module/models': 1, 'module/autopost': 1,
  'module/aichat': 2, 'module/ppv': 2,
  'module/models/create': 2,
  'module/models/detail': 2,
  'module/autopost/captions': 2,
  'module/autopost/schedule': 2,
}

const TAB_INDEX: Partial<Record<Page, number>> = {
  home: 0, bots: 1, balance: 2, referral: 3, settings: 4,
}

const MOCK_USER: TgUser = {
  id: 123456789,
  first_name: 'Alex',
  username: 'alexdev',
}

const MOCK_BOTS: Bot[] = [
  { id: '1', name: 'SofiaAI', handle: '@sofiaai_bot', isActive: true, modules: ['AI Chat', 'PPV'] },
  { id: '2', name: 'AnaBot', handle: '@anabot_official', isActive: false, modules: ['AI Chat'] },
]

const MOCK_MODELS: AIModel[] = [
  { id: 'demo-1', name: 'Sofia Demo', status: 'ready', createdAt: '28 янв' },
]

const MOCK_TRANSACTIONS: Transaction[] = [
  { id: '1', type: 'topup', amount: 25, description: 'Пополнение через Stars', date: '15 янв' },
  { id: '2', type: 'spend', amount: -2.5, description: 'AI Messages — SofiaAI', date: '15 янв' },
  { id: '3', type: 'referral', amount: 5, description: 'Реферал @user123', date: '14 янв' },
  { id: '4', type: 'spend', amount: -1.2, description: 'AI Messages — AnaBot', date: '13 янв' },
  { id: '5', type: 'topup', amount: 10, description: 'Пополнение через Stars', date: '12 янв' },
]

interface AppCtx {
  page: Page
  dir: NavDir
  user: TgUser
  balance: number
  bots: Bot[]
  transactions: Transaction[]
  ppvItems: PPVItem[]
  models: AIModel[]
  selectedBotId: string | null
  selectedModelId: string | null
  gallery: GeneratedPhoto[]
  uploads: string[]
  readyPosts: ReadyPost[]
  savedPrompts: SavedPrompt[]
  savedFooters: SavedFooter[]
  navigate: (to: Page) => void
  goBack: () => void
  setSelectedBotId: (id: string | null) => void
  setSelectedModelId: (id: string | null) => void
  setBots: (b: Bot[]) => void
  setPpvItems: (items: PPVItem[]) => void
  setModels: (m: AIModel[]) => void
  setGallery: (g: GeneratedPhoto[]) => void
  setUploads: (u: string[]) => void
  setReadyPosts: (p: ReadyPost[]) => void
  setSavedPrompts: (p: SavedPrompt[]) => void
  setSavedFooters: (f: SavedFooter[]) => void
}

const Ctx = createContext<AppCtx>(null!)

export function AppProvider({ children }: { children: ReactNode }) {
  const tgUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user as TgUser | undefined
  const user = tgUser ?? MOCK_USER

  const [page, setPage] = useState<Page>('home')
  const [dir, setDir] = useState<NavDir>('tab')
  const [, setHistory] = useState<Page[]>(['home'])
  const [bots, setBots] = useState<Bot[]>(MOCK_BOTS)
  const [ppvItems, setPpvItems] = useState<PPVItem[]>([])
  const [models, setModels] = useState<AIModel[]>(MOCK_MODELS)
  const [gallery, setGallery] = useState<GeneratedPhoto[]>([])
  const [uploads, setUploads] = useState<string[]>([])
  const [selectedBotId, setSelectedBotId] = useState<string | null>(MOCK_BOTS[0]?.id ?? null)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [readyPosts, setReadyPosts] = useState<ReadyPost[]>([])
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([])
  const [savedFooters, setSavedFooters] = useState<SavedFooter[]>([])

  const navigate = useCallback((to: Page) => {
    const fromDepth = PAGE_DEPTH[page]
    const toDepth = PAGE_DEPTH[to]
    const fromTab = TAB_INDEX[page]
    const toTab = TAB_INDEX[to]

    let d: NavDir = 'forward'
    if (toDepth < fromDepth) d = 'back'
    else if (toDepth === fromDepth) {
      if (fromTab !== undefined && toTab !== undefined) d = toTab > fromTab ? 'forward' : 'back'
      else d = 'tab'
    }

    setDir(d)
    setPage(to)
    setHistory(h => [...h, to])
  }, [page])

  const goBack = useCallback(() => {
    setHistory(h => {
      const next = h.slice(0, -1)
      const prev = next[next.length - 1] ?? 'home'
      setDir('back')
      setPage(prev)
      return next
    })
  }, [])

  return (
    <Ctx.Provider value={{
      page, dir, user, balance: 47.50, bots, transactions: MOCK_TRANSACTIONS,
      ppvItems, models, selectedBotId, selectedModelId, gallery, uploads, readyPosts, savedPrompts, savedFooters,
      navigate, goBack, setSelectedBotId, setSelectedModelId, setBots, setPpvItems, setModels, setGallery, setUploads,
      setReadyPosts, setSavedPrompts, setSavedFooters,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export const useApp = () => useContext(Ctx)
