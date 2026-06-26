import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { Page, NavDir, TgUser, Bot, PPVItem, AIModel, Transaction, GeneratedPhoto, ReadyPost, SavedPrompt, SavedFooter, SavedEmoji, PlanItem, ModuleSubscription } from '../types'
import api from '../api/client'
import { setTgUserId } from '../lib/tgUser'

const PAGE_DEPTH: Record<Page, number> = {
  home: 0, bots: 0, balance: 0, referral: 0, settings: 0,
  'bots/add': 1,
  'bots/detail': 2,
  'module/aichat-ppv': 1, 'module/models': 1, 'module/autopost': 1,
  'module/analytics': 1,
  'module/aichat': 2, 'module/ppv': 2,
  'module/models/create': 2,
  'module/models/detail': 2,
  'module/autopost/captions': 2,
  'module/autopost/schedule': 2,
  'module/autopost/analytics': 2,
  'admin': 0,
}

const TAB_INDEX: Partial<Record<Page, number>> = {
  home: 0, bots: 1, balance: 2, referral: 3, settings: 4, admin: 5,
}

const MOCK_USER: TgUser = { id: 123456789, first_name: 'Alex', username: 'alexdev' }

function ls<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback } catch { return fallback }
}
function lsSet(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
}

interface AppCtx {
  page: Page; dir: NavDir; user: TgUser; balance: number; isAdmin: boolean
  subscriptions: ModuleSubscription[]
  setSubscriptions: (s: ModuleSubscription[]) => void
  hasModuleSub: (module: string) => boolean
  bots: Bot[]; transactions: Transaction[]; ppvItems: PPVItem[]
  models: AIModel[]; selectedBotId: string | null; selectedModelId: string | null
  gallery: GeneratedPhoto[]; uploads: string[]
  readyPosts: ReadyPost[]; savedPrompts: SavedPrompt[]; savedFooters: SavedFooter[]; savedEmojis: SavedEmoji[]
  contentPlan: PlanItem[] | null
  navigate: (to: Page) => void; goBack: () => void
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
  setSavedEmojis: (e: SavedEmoji[]) => void
  setContentPlan: (p: PlanItem[] | null) => void
  syncContentPlan: (p: PlanItem[]) => Promise<void>
  setTransactions: (t: Transaction[]) => void
}

const Ctx = createContext<AppCtx>(null!)

export function AppProvider({ children }: { children: ReactNode }) {
  const tgUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user as TgUser | undefined
  const user = tgUser ?? MOCK_USER
  setTgUserId(user.id)

  const [page, setPage] = useState<Page>('home')
  const [dir, setDir] = useState<NavDir>('tab')
  const [, setHistory] = useState<Page[]>(['home'])

  const [bots, setBots] = useState<Bot[]>(ls('bots', []))
  const [ppvItems, setPpvItems] = useState<PPVItem[]>(ls('ppvItems', []))
  const [models, setModels] = useState<AIModel[]>(ls('models', []))
  const [gallery, setGallery] = useState<GeneratedPhoto[]>(ls('gallery', []))
  const [uploads, setUploads] = useState<string[]>([])
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [readyPosts, setReadyPosts] = useState<ReadyPost[]>(ls('readyPosts', []))
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>(ls('savedPrompts', []))
  const [savedFooters, setSavedFooters] = useState<SavedFooter[]>(ls('savedFooters', []))
  const [savedEmojis, setSavedEmojis] = useState<SavedEmoji[]>(
    (ls('savedEmojis', []) as SavedEmoji[]).map(e => ({ ...e, alt: e.alt ?? '✨' }))
  )
  const [contentPlan, setContentPlan] = useState<PlanItem[] | null>(ls('contentPlan', null))
  const [transactions, setTransactions] = useState<Transaction[]>(ls('transactions', []))
  const [isAdmin, setIsAdmin] = useState(false)
  const [subscriptions, setSubscriptions] = useState<ModuleSubscription[]>([])
  const hasModuleSub = (module: string) => {
    const now = new Date()
    return subscriptions.some(s => s.module_name === module && new Date(s.expires_at) > now)
  }
  const balance = transactions.filter(t => t.type === 'topup').reduce((s, t) => s + t.amount, 0)
    - transactions.filter(t => t.type === 'spend').reduce((s, t) => s + Math.abs(t.amount), 0)

  // Load from API on mount, fall back to localStorage cache if unavailable
  useEffect(() => {
    api.bots.list().then(d => { setBots(d); lsSet('bots', d); if (d[0]) setSelectedBotId(d[0].id) }).catch(() => {})
    api.models.list().then(d => { setModels(d); lsSet('models', d) }).catch(() => {})
    api.generate.list().then(d => {
      const photos: GeneratedPhoto[] = d.map((g: any) => ({ id: g.id, modelId: g.modelId ?? '', modelName: g.modelName ?? '', url: g.url ?? '', createdAt: g.createdAt ?? '' }))
      setGallery(photos); lsSet('gallery', photos)
    }).catch(() => {})
    api.posts.list().then(d => { setReadyPosts(d); lsSet('readyPosts', d) }).catch(() => {})
    api.prompts.list().then(d => { setSavedPrompts(d); lsSet('savedPrompts', d) }).catch(() => {})
    api.footers.list().then(d => { setSavedFooters(d); lsSet('savedFooters', d) }).catch(() => {})
    api.autopost.getPlan().then(d => { if (d.length) { setContentPlan(d); lsSet('contentPlan', d) } }).catch(() => {})
    api.ppv.list().then(d => { setPpvItems(d); lsSet('ppvItems', d) }).catch(() => {})
    api.emojis.list().then(d => { setSavedEmojis(d); lsSet('savedEmojis', d) }).catch(() => {})
    api.transactions.list().then(d => { setTransactions(d); lsSet('transactions', d) }).catch(() => {})
    import('../lib/supabase').then(({ supabase }) => {
      const initData = (window as any).Telegram?.WebApp?.initData ?? ''
      if (initData) {
        supabase.functions.invoke<{ subscriptions: ModuleSubscription[] }>('payments', {
          body: { action: 'get_subscriptions', initData }
        }).then(({ data }) => { if (data?.subscriptions) setSubscriptions(data.subscriptions) }).catch(() => {})
        supabase.functions.invoke('admin', {
          body: {
            action: 'save_profile',
            initData,
            username: user.username ?? null,
            firstName: user.first_name ?? null,
            lastName: (user as any).last_name ?? null,
          }
        }).catch(() => {})
      }
      // Register referral if user arrived via ref link (DB handles dedup via PK)
      const startParam = (window as any).Telegram?.WebApp?.initDataUnsafe?.start_param as string | undefined
      const urlRef = new URLSearchParams(window.location.search).get('ref')
      const refRaw = startParam?.startsWith('ref_') ? startParam.slice(4) : urlRef ?? null
      if (refRaw && refRaw !== String(user.id)) {
        const initData = (window as any).Telegram?.WebApp?.initData ?? ''
        supabase.functions.invoke('payments', {
          body: { action: 'track_referral', refereeTgUserId: user.id, referrerTgUserId: refRaw, initData }
        }).catch(() => {})
      }
      // Check admin status — must pass initData for signature verification
      const adminInitData = (window as any).Telegram?.WebApp?.initData ?? ''
      supabase.functions.invoke('admin', { body: { action: 'check_admin', initData: adminInitData } })
        .then(({ data }) => { if (data?.isAdmin) setIsAdmin(true) })
        .catch(() => {})
    })
  }, [])

  // Persist changes to localStorage when they change
  useEffect(() => { lsSet('bots', bots) }, [bots])
  useEffect(() => { lsSet('models', models) }, [models])
  useEffect(() => { lsSet('gallery', gallery) }, [gallery])
  useEffect(() => { lsSet('readyPosts', readyPosts) }, [readyPosts])
  useEffect(() => { lsSet('savedPrompts', savedPrompts) }, [savedPrompts])
  useEffect(() => { lsSet('savedFooters', savedFooters) }, [savedFooters])
  useEffect(() => { lsSet('savedEmojis', savedEmojis) }, [savedEmojis])
  useEffect(() => { lsSet('contentPlan', contentPlan) }, [contentPlan])
  useEffect(() => { lsSet('ppvItems', ppvItems) }, [ppvItems])
  useEffect(() => { lsSet('transactions', transactions) }, [transactions])

  const syncContentPlan = useCallback(async (plan: PlanItem[]) => {
    setContentPlan(plan)
    await api.autopost.savePlan(plan).catch(() => {})
  }, [])

  const navigate = useCallback((to: Page) => {
    const fromDepth = PAGE_DEPTH[page], toDepth = PAGE_DEPTH[to]
    const fromTab = TAB_INDEX[page], toTab = TAB_INDEX[to]
    let d: NavDir = 'forward'
    if (toDepth < fromDepth) d = 'back'
    else if (toDepth === fromDepth) {
      if (fromTab !== undefined && toTab !== undefined) d = toTab > fromTab ? 'forward' : 'back'
      else d = 'tab'
    }
    setDir(d); setPage(to); setHistory(h => [...h, to])
  }, [page])

  const goBack = useCallback(() => {
    setHistory(h => {
      const next = h.slice(0, -1)
      const prev = next[next.length - 1] ?? 'home'
      setDir('back'); setPage(prev)
      return next
    })
  }, [])

  return (
    <Ctx.Provider value={{
      page, dir, user, balance, isAdmin, subscriptions, setSubscriptions, hasModuleSub,
      bots, transactions, ppvItems, models,
      selectedBotId, selectedModelId, gallery, uploads, readyPosts, savedPrompts, savedFooters, savedEmojis, contentPlan,
      navigate, goBack, setSelectedBotId, setSelectedModelId, setBots, setPpvItems, setModels,
      setGallery, setUploads, setReadyPosts, setSavedPrompts, setSavedFooters, setSavedEmojis, setContentPlan, syncContentPlan, setTransactions,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export const useApp = () => useContext(Ctx)
