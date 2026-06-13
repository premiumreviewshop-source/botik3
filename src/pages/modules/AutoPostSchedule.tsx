import { useState, useRef, useCallback, useEffect } from 'react'
import { type ReactNode } from 'react'
import { useApp } from '../../store/app'
import { useLang } from '../../store/lang'
import { IconBack, IconZap, IconPlus, IconCheck, IconUpload, IconFileText, IconImage, IconStar, IconPin, IconEdit, IconInfo, IconGallery, IconSparkle, IconTrash } from '../../components/Icons'
import Button from '../../components/Button'
import BottomSheet from '../../components/BottomSheet'
import Input from '../../components/Input'
import AutoPostPlanTab from './AutoPostPlanTab'
import api from '../../api/client'
import type { ReadyPost, PlanItem, Channel } from '../../types'
import { openTgLink } from '../../lib/tgUser'

type Category = 'free' | 'paid' | 'fix'
interface CatPost { post: ReadyPost; price?: number }

const CAT_INFO_EN = {
  free: { label: 'Regular',   Icon: IconImage, desc: 'Free content' },
  paid: { label: 'Paid',      Icon: IconStar,  desc: 'PPV — paid content' },
  fix:  { label: 'Pinned',    Icon: IconPin,   desc: 'Pinned post' },
}
const CAT_INFO_RU = {
  free: { label: 'Обычный',   Icon: IconImage, desc: 'Бесплатный контент' },
  paid: { label: 'Платный',   Icon: IconStar,  desc: 'PPV — платный контент' },
  fix:  { label: 'Фикс пост', Icon: IconPin,   desc: 'Закреплённый пост' },
}
const CAT_INFO_TR = {
  free: { label: 'Normal',    Icon: IconImage, desc: 'Ücretsiz içerik' },
  paid: { label: 'Ücretli',   Icon: IconStar,  desc: 'PPV — ücretli içerik' },
  fix:  { label: 'Sabitlenmiş', Icon: IconPin, desc: 'Sabit gönderi' },
}
interface PostTimeConfig {
  type: 'range' | 'fixed'
  from: string
  to: string
  fixed: string
}

const DEFAULT_TIME_CONFIGS: PostTimeConfig[] = [
  { type: 'range', from: '09:00', to: '12:00', fixed: '09:00' },
  { type: 'range', from: '14:00', to: '17:00', fixed: '14:00' },
  { type: 'range', from: '18:00', to: '21:00', fixed: '18:00' },
  { type: 'range', from: '20:00', to: '23:00', fixed: '20:00' },
  { type: 'range', from: '10:00', to: '13:00', fixed: '10:00' },
  { type: 'range', from: '15:00', to: '18:00', fixed: '15:00' },
]

function randomInRange(from: string, to: string): string {
  const [fh, fm] = from.split(':').map(Number)
  const [th, tm] = to.split(':').map(Number)
  const fromMin = fh * 60 + fm
  const toMin = th * 60 + tm
  const r = fromMin + Math.floor(Math.random() * (Math.max(toMin - fromMin, 1) + 1))
  return `${String(Math.floor(r / 60)).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}`
}

function SL({ children }: { children: ReactNode }) {
  return <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,170,0.55)] mb-2">{children}</p>
}

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function buildSlots(
  start: string,
  needed: number,
  timeConfigs: PostTimeConfig[],
  dayStepMin = 1,
  dayStepMax = 1,
): { dateObj: string; time: string; date: string }[] {
  const now = new Date()
  // Use LOCAL date for "today" so UTC offset never causes a 1-day mismatch
  const todayStr = localDateStr(now)
  const BUFFER_MS = 5 * 60 * 1000
  // Parse start as LOCAL midnight so day arithmetic stays in local time
  const base = new Date(`${start}T00:00:00`)
  const slots: { dateObj: string; time: string; date: string }[] = []
  let dayOffset = 0
  while (slots.length < needed + timeConfigs.length + 1) {
    const d = new Date(base)
    d.setDate(base.getDate() + dayOffset)
    const dateObj = localDateStr(d)
    const dateLabel = d.toLocaleDateString('ru', { day: 'numeric', month: 'short', weekday: 'short' })
    const daySlots: string[] = []
    for (const cfg of timeConfigs) {
      let t = cfg.type === 'fixed' ? cfg.fixed : randomInRange(cfg.from, cfg.to)
      if (dateObj === todayStr) {
        const [h, m] = t.split(':').map(Number)
        const dt = new Date(d); dt.setHours(h, m, 0, 0)
        if (dt.getTime() <= now.getTime() + BUFFER_MS) {
          // For ranges: try the future portion of today's range instead of skipping entirely
          if (cfg.type !== 'range') continue
          const earliest = new Date(now.getTime() + BUFFER_MS)
          const efrom = `${String(earliest.getHours()).padStart(2, '0')}:${String(earliest.getMinutes()).padStart(2, '0')}`
          const [toH, toM] = cfg.to.split(':').map(Number)
          if (earliest.getHours() * 60 + earliest.getMinutes() >= toH * 60 + toM) continue
          t = randomInRange(efrom, cfg.to)
        }
      }
      daySlots.push(t)
    }
    daySlots.sort()
    for (const time of daySlots) slots.push({ dateObj, time, date: dateLabel })
    const step = dayStepMin === dayStepMax
      ? dayStepMin
      : dayStepMin + Math.floor(Math.random() * (dayStepMax - dayStepMin + 1))
    dayOffset += step
  }
  return slots
}

function buildSmartPlan(
  catPosts: Record<Category, CatPost[]>,
  seq: Category[],
  start: string,
  timeConfigs: PostTimeConfig[],
  dayStepMin = 1,
  dayStepMax = 1,
): PlanItem[] {
  if (!seq.length || !start || !timeConfigs.length) return []

  // fix posts rotate (each post repeats for every fix slot); free/paid are consumed normally
  const nonFixQ: Record<string, CatPost[]> = { free: [...catPosts.free], paid: [...catPosts.paid] }
  const fixPool = [...catPosts.fix]
  let fixIdx = 0

  const nonFixTotal = nonFixQ.free.length + nonFixQ.paid.length
  if (nonFixTotal === 0 && fixPool.length === 0) return []

  // Estimate total slots: how many cycles of seq to consume all non-fix posts, plus fix slots per cycle
  const nonFixPerCycle = seq.filter(c => c !== 'fix').length || 1
  const cycles = Math.ceil(nonFixTotal / nonFixPerCycle) + 1  // +1 buffer for last cycle alignment
  const slotCount = Math.max(cycles * seq.length, nonFixTotal + fixPool.length)
  const slots = buildSlots(start, slotCount, timeConfigs, dayStepMin, dayStepMax)

  const allNonFixEmpty = () => Object.values(nonFixQ).every(a => a.length === 0)

  const result: PlanItem[] = []
  let si = 0, slotIdx = 0

  while (slotIdx < slots.length) {
    if (allNonFixEmpty()) break  // stop when all consumable posts are used up

    const cat = seq[si % seq.length]; si++

    if (cat === 'fix') {
      if (fixPool.length === 0) continue  // no fix posts — skip slot
      const cp = fixPool[fixIdx % fixPool.length]; fixIdx++
      const slot = slots[slotIdx++]
      result.push({ id: crypto.randomUUID(), date: slot.date, dateObj: slot.dateObj, time: slot.time, category: cat, postId: cp.post.id, postUrl: cp.post.url, postCaption: cp.post.caption, price: cp.price, status: 'scheduled', editing: false })
    } else {
      const q = nonFixQ[cat]
      if (!q || q.length === 0) continue  // skip empty category
      const cp = q.shift()!
      const slot = slots[slotIdx++]
      result.push({ id: crypto.randomUUID(), date: slot.date, dateObj: slot.dateObj, time: slot.time, category: cat, postId: cp.post.id, postUrl: cp.post.url, postCaption: cp.post.caption, price: cp.price, status: 'scheduled', editing: false })
    }
  }
  return result
}


export default function AutoPostSchedule() {
  const { goBack, readyPosts, setReadyPosts, uploads, setUploads, gallery, contentPlan, setContentPlan, savedEmojis } = useApp()
  const { t, lang } = useLang()
  const CAT_INFO = lang === 'ru' ? CAT_INFO_RU : lang === 'tr' ? CAT_INFO_TR : CAT_INFO_EN

  const [channels, setChannels] = useState<Channel[]>([])
  const [channelsLoading, setChannelsLoading] = useState(true)
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null)
  const [addChannelOpen, setAddChannelOpen] = useState(false)
  const [newUsername, setNewUsername] = useState('@')
  const [resolving, setResolving] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [resolvedPreview, setResolvedPreview] = useState<Channel | null>(null)

  const [tab, setTab] = useState<'setup' | 'plan'>('setup')

  const [catPosts, setCatPosts] = useState<Record<Category, CatPost[]>>({ free: [], paid: [], fix: [] })
  const [postsPerDay, setPostsPerDay] = useState(2)
  const [postsPerDayInput, setPostsPerDayInput] = useState('2')
  const [postTimeConfigs, setPostTimeConfigs] = useState<PostTimeConfig[]>(DEFAULT_TIME_CONFIGS.slice(0, 2))
  const [sequence, setSequence] = useState<Category[]>(['free', 'paid'])
  const [startDate, setStartDate] = useState('')
  const [planLoading, setPlanLoading] = useState(false)
  const [planSaveError, setPlanSaveError] = useState<string | null>(null)
  const [autoActive, setAutoActive] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)
  const [deleteAfterCreate, setDeleteAfterCreate] = useState(false)
  const [intervalMode, setIntervalMode] = useState(false)
  const [intervalDays, setIntervalDays] = useState(2)
  const [intervalDaysInput, setIntervalDaysInput] = useState('2')
  const [useRangeInterval, setUseRangeInterval] = useState(false)
  const [intervalDaysMax, setIntervalDaysMax] = useState(4)
  const [intervalDaysMaxInput, setIntervalDaysMaxInput] = useState('4')
  const [showPostTimesSheet, setShowPostTimesSheet] = useState(false)

  useEffect(() => {
    setPostTimeConfigs(prev => {
      if (prev.length === postsPerDay) return prev
      if (postsPerDay > prev.length) {
        const extra = DEFAULT_TIME_CONFIGS.slice(prev.length, postsPerDay)
        return [...prev, ...extra.map(c => ({ ...c }))]
      }
      return prev.slice(0, postsPerDay)
    })
  }, [postsPerDay])

  useEffect(() => {
    Promise.all([api.channels.list(), api.autopost.isActive()])
      .then(([list, active]) => {
        setChannels(list)
        if (list.length > 0 && !selectedChannelId) setSelectedChannelId(list[0].id)
        setAutoActive(active)
      })
      .catch(() => {})
      .finally(() => setChannelsLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Live plan refresh while on plan tab
  useEffect(() => {
    if (tab !== 'plan') return
    const refresh = () => { api.autopost.getPlan().then(p => setContentPlan(p)).catch(() => {}) }
    refresh()
    const t = setInterval(refresh, 30_000)
    return () => clearInterval(t)
  }, [tab, setContentPlan])

  const [multiSelectMode, setMultiSelectMode] = useState(false)
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(new Set())
  const [storageMultiSelect, setStorageMultiSelect] = useState(false)
  const [selectedStorageUrls, setSelectedStorageUrls] = useState<Set<string>>(new Set())
  const [viewAllCat, setViewAllCat] = useState<Category | null>(null)
  const [viewAllPosts, setViewAllPosts] = useState(false)
  const [editingPost, setEditingPost] = useState<{ postId: string; cat: Category } | null>(null)
  const [editCaption, setEditCaption] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [pickerCat, setPickerCat] = useState<Category | null>(null)
  const [pickerSource, setPickerSource] = useState<'ready' | 'storage' | 'device'>('ready')
  const deviceInputRef = useRef<HTMLInputElement>(null)
  const [viewingPackPost, setViewingPackPost] = useState<ReadyPost | null>(null)
  const [showAddCustom, setShowAddCustom] = useState(false)
  const [customPhoto, setCustomPhoto] = useState<string | null>(null)
  const [customCaption, setCustomCaption] = useState('')

  const customPhotoRef = useRef<HTMLInputElement>(null)
  const customCaptionRef = useRef<HTMLTextAreaElement>(null)
  const editCaptionRef = useRef<HTMLTextAreaElement>(null)
  const [pendingPaidPost, setPendingPaidPost] = useState<ReadyPost | null>(null)
  const [paidPriceStr, setPaidPriceStr] = useState('')

  const handleCustomPhotoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCustomPhoto(URL.createObjectURL(file))
    e.target.value = ''
  }

  const saveCustomPost = () => {
    if (!customPhoto && !customCaption.trim()) return
    setReadyPosts([...readyPosts, { id: Date.now().toString(), url: customPhoto ?? undefined, caption: customCaption, createdAt: new Date().toLocaleDateString('ru') }])
    setCustomPhoto(null); setCustomCaption(''); setShowAddCustom(false)
  }

  const confirmPaidPost = () => {
    if (!pendingPaidPost) return
    setCatPosts(prev => ({ ...prev, paid: [...prev.paid, { post: pendingPaidPost, price: paidPriceStr ? Number(paidPriceStr) : undefined }] }))
    setPendingPaidPost(null); setPaidPriceStr('')
  }

  const insertCustomEmoji = (stickerId: string, label: string) => {
    const token = `{${label}:${stickerId}}`
    const el = customCaptionRef.current
    if (el) {
      const s = el.selectionStart, e = el.selectionEnd
      setCustomCaption(customCaption.slice(0, s) + token + customCaption.slice(e))
    } else {
      setCustomCaption(t => t + token)
    }
  }

  const insertEmojiToEdit = (stickerId: string, label: string) => {
    const token = `{${label}:${stickerId}}`
    const el = editCaptionRef.current
    if (el) {
      const s = el.selectionStart, e = el.selectionEnd
      setEditCaption(editCaption.slice(0, s) + token + editCaption.slice(e))
    } else {
      setEditCaption(t => t + token)
    }
  }

  const resolveChannel = async () => {
    if (!newUsername.trim() || newUsername === '@') return
    setResolving(true)
    setResolveError(null)
    setResolvedPreview(null)
    try {
      const ch = await api.channels.resolve(newUsername.trim())
      setResolvedPreview(ch)
    } catch (err) {
      setResolveError(String(err).replace('Error: ', ''))
    } finally {
      setResolving(false)
    }
  }

  const confirmAddChannel = () => {
    if (!resolvedPreview) return
    const exists = channels.find(c => c.id === resolvedPreview.id)
    const updated = exists ? channels : [...channels, resolvedPreview]
    setChannels(updated)
    setSelectedChannelId(resolvedPreview.id)
    setAddChannelOpen(false)
    setNewUsername('@')
    setResolvedPreview(null)
    setResolveError(null)
  }

  const removeChannel = async (id: string) => {
    try { await api.channels.remove(id) } catch { /* ignore */ }
    const updated = channels.filter(c => c.id !== id)
    setChannels(updated)
    if (selectedChannelId === id) setSelectedChannelId(updated[0]?.id ?? null)
  }


  const generatePlan = async () => {
    if (!startDate || sequence.length === 0 || postTimeConfigs.length === 0) return
    setPlanLoading(true)
    setPlanSaveError(null)
    await new Promise(r => setTimeout(r, 800))
    const stepMin = intervalMode ? intervalDays : 1
    const stepMax = intervalMode && useRangeInterval ? Math.max(intervalDays, intervalDaysMax) : stepMin
    const newPlan = buildSmartPlan(catPosts, sequence, startDate, postTimeConfigs, stepMin, stepMax)
    setContentPlan(newPlan)
    const channelIdForPlan = autoActive && selectedChannelId ? selectedChannelId : undefined
    if (autoActive) setAutoActive(false)
    try {
      await api.autopost.savePlan(newPlan, channelIdForPlan)
    } catch (err) {
      setPlanSaveError(String(err).replace('Error: ', ''))
    }
    if (deleteAfterCreate) {
      const usedPostIds = new Set(newPlan.map(p => p.postId).filter(Boolean) as string[])
      setReadyPosts(readyPosts.filter(p => !usedPostIds.has(p.id)))
    }
    // Always clear categories after plan creation (posts remain in readyPosts unless checkbox was checked)
    setCatPosts({ free: [], paid: [], fix: [] })
    setPlanLoading(false)
    setTab('plan')
  }

  const toggleAuto = useCallback(async () => {
    const newActive = !autoActive
    setAutoActive(newActive)
    setToggleError(null)
    try {
      if (newActive && selectedChannelId) {
        await api.autopost.enableAutopost(selectedChannelId)
      } else {
        await api.autopost.disableAutopost()
      }
    } catch (err) {
      setAutoActive(!newActive)
      setToggleError(String(err).replace('Error: ', ''))
    }
  }, [autoActive, selectedChannelId])

  const extendPlan = async () => {
    if (!contentPlan) return
    const usedIds = new Set(contentPlan.filter(p => p.status !== 'cancelled').map(p => p.postId).filter(Boolean) as string[])
    const remaining: Record<Category, CatPost[]> = {
      free: catPosts.free.filter(cp => !usedIds.has(cp.post.id)),
      paid: catPosts.paid.filter(cp => !usedIds.has(cp.post.id)),
      fix:  catPosts.fix.filter(cp => !usedIds.has(cp.post.id)),
    }
    if (!Object.values(remaining).flat().length) return
    const lastDate = contentPlan.filter(p => p.status !== 'cancelled').at(-1)?.dateObj
    if (!lastDate) return
    const next = new Date(lastDate); next.setDate(next.getDate() + 1)
    const stepMin = intervalMode ? intervalDays : 1
    const stepMax = intervalMode && useRangeInterval ? Math.max(intervalDays, intervalDaysMax) : stepMin
    const newItems = buildSmartPlan(remaining, sequence, next.toISOString().slice(0, 10), postTimeConfigs, stepMin, stepMax)
    if (newItems.length) {
      const combined = [...contentPlan, ...newItems]
      setContentPlan(combined)
      const channelIdForPlan = autoActive && selectedChannelId ? selectedChannelId : undefined
      // Store raw captions — edge functions compile at publish time using latest saved emojis
      try { await api.autopost.savePlan(combined, channelIdForPlan) } catch { /* local fallback */ }
    }
  }

  const deleteUsedPosts = () => {
    if (!contentPlan) return
    const publishedIds = new Set(contentPlan.filter(p => p.status === 'published').map(p => p.postId).filter(Boolean) as string[])
    setReadyPosts(readyPosts.filter(p => !publishedIds.has(p.id)))
    setCatPosts(prev => ({
      free: prev.free.filter(cp => !publishedIds.has(cp.post.id)),
      paid: prev.paid.filter(cp => !publishedIds.has(cp.post.id)),
      fix:  prev.fix.filter(cp => !publishedIds.has(cp.post.id)),
    }))
  }

  const openEdit = (postId: string, cat: Category) => {
    const cp = catPosts[cat].find(x => x.post.id === postId)
    if (!cp) return
    setEditingPost({ postId, cat }); setEditCaption(cp.post.caption); setEditPrice(cp.price?.toString() ?? '')
  }

  const saveEdit = () => {
    if (!editingPost) return
    const { postId, cat } = editingPost
    setCatPosts(prev => ({ ...prev, [cat]: prev[cat].map(cp => cp.post.id === postId ? { ...cp, post: { ...cp.post, caption: editCaption }, price: editPrice ? Number(editPrice) : undefined } : cp) }))
    // Persist caption change to DB for any plan items using this post
    const planItem = contentPlan?.find(p => p.postId === postId)
    if (planItem && contentPlan) {
      setContentPlan(contentPlan.map(p => p.postId === postId ? { ...p, postCaption: editCaption } : p))
      api.autopost.updateItem(planItem.id, { postCaption: editCaption }).catch(() => {})
    }
    setEditingPost(null)
  }

  const addFromReady = (post: ReadyPost, cat: Category) => {
    setPickerCat(null)
    if (cat === 'paid') { setPendingPaidPost(post); setPaidPriceStr(''); return }
    setCatPosts(prev => ({ ...prev, [cat]: [...prev[cat], { post }] }))
  }

  const addMultipleFromReady = (cat: Category) => {
    const posts = readyPosts.filter(p => selectedPostIds.has(p.id))
    if (!posts.length) return
    setCatPosts(prev => ({ ...prev, [cat]: [...prev[cat], ...posts.map(post => ({ post }))] }))
    setMultiSelectMode(false)
    setSelectedPostIds(new Set())
    setPickerCat(null)
  }

  const addMultipleFromStorage = (cat: Category) => {
    const urls = Array.from(selectedStorageUrls)
    if (!urls.length) return
    const posts = urls.map(url => ({ post: { id: Date.now().toString() + Math.random(), url, caption: '', createdAt: new Date().toLocaleDateString('ru') } as ReadyPost }))
    setCatPosts(prev => ({ ...prev, [cat]: [...prev[cat], ...posts] }))
    setStorageMultiSelect(false)
    setSelectedStorageUrls(new Set())
    setPickerCat(null)
  }
  const resetPicker = () => { setPickerCat(null); setMultiSelectMode(false); setSelectedPostIds(new Set()); setStorageMultiSelect(false); setSelectedStorageUrls(new Set()) }
  const addFromUrl = (url: string, cat: Category) => {
    const post: ReadyPost = { id: Date.now().toString(), url, caption: '', createdAt: new Date().toLocaleDateString('ru') }
    setPickerCat(null)
    if (cat === 'paid') { setPendingPaidPost(post); setPaidPriceStr(''); return }
    setCatPosts(prev => ({ ...prev, [cat]: [...prev[cat], { post }] }))
  }
  const handleDeviceFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !pickerCat) return
    const url = URL.createObjectURL(file); setUploads([url, ...uploads]); addFromUrl(url, pickerCat); e.target.value = ''
  }
  const removeFromCat = (cat: Category, postId: string) => setCatPosts(prev => ({ ...prev, [cat]: prev[cat].filter(x => x.post.id !== postId) }))

  // Usage stats
  const plannedIds = new Set(contentPlan?.filter(p => p.status !== 'cancelled').map(p => p.postId).filter(Boolean) as string[] ?? [])
  const publishedIds = new Set(contentPlan?.filter(p => p.status === 'published').map(p => p.postId).filter(Boolean) as string[] ?? [])

  const handleSaveItem = useCallback((id: string, data: { time?: string; date?: string; dateObj?: string; status?: string; price?: number | null }) => {
    api.autopost.updateItem(id, data).catch(() => {})
  }, [])

  if (channelsLoading) {
    return (
      <div className="flex flex-col gap-5 pt-4">
        <div className="flex items-center gap-3 px-5">
          <button onClick={goBack} className="w-10 h-10 rounded-[14px] flex items-center justify-center transition-all duration-200 active:scale-[0.92]" style={{ background: 'rgba(0,255,170,0.06)', border: '1px solid rgba(0,255,170,0.2)' }}>
            <IconBack size={20} color="#00ffaa" />
          </button>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[2px] text-[rgba(0,255,170,0.5)]">{t.mods.autopostingLabel}</p>
            <h1 className="text-[20px] font-black tracking-tight">{t.common.loading}</h1>
          </div>
        </div>
        <div className="flex items-center justify-center py-16">
          <span className="w-8 h-8 border-2 border-[rgba(0,255,170,0.15)] border-t-[#00ffaa] rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  // First-time setup: no channels yet
  if (channels.length === 0) {
    return (
      <div className="flex flex-col gap-5 pt-4">
        <div className="flex items-center gap-3 px-5">
          <button onClick={goBack} className="w-10 h-10 rounded-[14px] flex items-center justify-center transition-all duration-200 active:scale-[0.92]" style={{ background: 'rgba(0,255,170,0.06)', border: '1px solid rgba(0,255,170,0.2)' }}>
            <IconBack size={20} color="#00ffaa" />
          </button>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[2px] text-[rgba(0,255,170,0.5)]">{t.mods.autopostingLabel}</p>
            <h1 className="text-[20px] font-black tracking-tight">{t.mods.connectChannelTitle}</h1>
          </div>
        </div>

        <div className="px-5 flex flex-col gap-4">
          <div className="p-4 bg-[rgba(0,255,170,0.04)] border border-[rgba(0,255,170,0.15)] rounded-[16px] flex items-start gap-3">
            <div className="w-10 h-10 rounded-[12px] bg-[rgba(0,255,170,0.1)] border border-[rgba(0,255,170,0.25)] flex items-center justify-center flex-shrink-0">
              <IconZap size={20} color="#00ffaa" />
            </div>
            <div>
              <p className="text-[14px] font-black mb-1">Автопостинг в Telegram</p>
              <p className="text-[12px] text-[rgba(255,255,255,0.4)] leading-relaxed">Подключи свой канал — и бот будет публиковать посты автоматически по расписанию</p>
            </div>
          </div>

          <Input label="Username канала" value={newUsername} onChange={setNewUsername} placeholder="@yourchannel" />

          <div className="p-4 bg-[rgba(251,191,36,0.05)] border border-[rgba(251,191,36,0.2)] rounded-[14px]">
            <div className="flex items-center gap-1.5 text-[12px] font-bold text-amber-400 mb-1.5"><IconInfo size={13} color="rgb(251,191,36)" /> Перед добавлением</div>
            <p className="text-[12px] text-[rgba(255,255,255,0.5)] leading-relaxed">
              Зайди в настройки канала → Администраторы → добавь <span onClick={() => openTgLink('WeloPosting')} className="text-[rgba(0,255,170,0.9)] font-bold underline underline-offset-2 cursor-pointer">@WeloPosting</span> и выдай право <span className="text-white font-bold">«Публикация сообщений»</span>
            </p>
          </div>

          {resolveError && <p className="text-[11px] text-red-400 text-center">{resolveError}</p>}

          {resolvedPreview && (
            <div className="flex items-center gap-3 p-3 bg-[rgba(0,255,170,0.06)] border border-[rgba(0,255,170,0.3)] rounded-[14px] animate-fade-up">
              {resolvedPreview.photoUrl
                ? <img src={resolvedPreview.photoUrl} className="w-12 h-12 rounded-full object-cover flex-shrink-0" alt="" />
                : <div className="w-12 h-12 rounded-full bg-[rgba(0,255,170,0.15)] border border-[rgba(0,255,170,0.3)] flex items-center justify-center flex-shrink-0 text-[18px] font-black text-[#00ffaa]">{(resolvedPreview.title || '@')[0].toUpperCase()}</div>
              }
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-bold truncate">{resolvedPreview.title}</p>
                <p className="text-[11px] text-[rgba(0,255,170,0.7)]">{resolvedPreview.username}</p>
              </div>
              <IconCheck size={18} color="#00ffaa" />
            </div>
          )}

          {!resolvedPreview ? (
            <Button fullWidth disabled={!newUsername.trim() || newUsername === '@' || resolving} onClick={resolveChannel}>
              {resolving
                ? <><span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> Проверяем...</>
                : <><IconCheck size={17} /> Проверить канал</>}
            </Button>
          ) : (
            <Button fullWidth onClick={confirmAddChannel}>
              <IconPlus size={17} /> Добавить канал
            </Button>
          )}
        </div>
      </div>
    )
  }

  const selectedChannel = channels.find(c => c.id === selectedChannelId)

  return (
    <div className="flex flex-col gap-0 pt-4">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 mb-3">
        <button onClick={goBack} className="w-10 h-10 rounded-[14px] flex items-center justify-center transition-all duration-200 active:scale-[0.92]" style={{ background: 'rgba(0,255,170,0.06)', border: '1px solid rgba(0,255,170,0.2)' }}>
          <IconBack size={20} color="#00ffaa" />
        </button>
        <div className="flex-1">
          <p className="text-[9px] font-black uppercase tracking-[2px] text-[rgba(0,255,170,0.5)]">{t.mods.autopostingLabel}</p>
          <h1 className="text-[20px] font-black tracking-tight">{t.mods.scheduleTitle}</h1>
        </div>
      </div>

      {/* Channels strip */}
      <div className="px-5 mb-3">
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollSnapType: 'x mandatory' }}>
          {channels.map(ch => (
            <button key={ch.id}
              onClick={() => setSelectedChannelId(ch.id)}
              style={{ scrollSnapAlign: 'start' }}
              className={`flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full border flex-shrink-0 transition-all ${selectedChannelId === ch.id ? 'bg-[rgba(0,255,170,0.1)] border-[rgba(0,255,170,0.5)]' : 'bg-[rgba(255,255,255,0.02)] border-[rgba(0,255,170,0.15)] hover:border-[rgba(0,255,170,0.35)]'}`}>
              {ch.photoUrl
                ? <img src={ch.photoUrl} className="w-6 h-6 rounded-full object-cover flex-shrink-0" alt="" />
                : <div className="w-6 h-6 rounded-full bg-[rgba(0,255,170,0.15)] flex items-center justify-center text-[10px] font-black text-[#00ffaa] flex-shrink-0">{(ch.title || '@')[0].toUpperCase()}</div>
              }
              <div className="text-left">
                <p className={`text-[11px] font-bold leading-none ${selectedChannelId === ch.id ? 'text-[#00ffaa]' : 'text-[rgba(255,255,255,0.7)]'}`}>{ch.title}</p>
                <p className="text-[9px] text-[rgba(255,255,255,0.35)] mt-0.5">{ch.username}</p>
              </div>
              <button onClick={e => { e.stopPropagation(); removeChannel(ch.id) }} className="ml-1 w-4 h-4 rounded-full bg-[rgba(255,80,80,0.15)] flex items-center justify-center hover:bg-[rgba(255,80,80,0.35)] transition-all flex-shrink-0">
                <IconTrash size={7} color="#ff5555" />
              </button>
            </button>
          ))}
          <button
            onClick={() => { setAddChannelOpen(true); setResolvedPreview(null); setResolveError(null); setNewUsername('@') }}
            style={{ scrollSnapAlign: 'start' }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-dashed border-[rgba(0,255,170,0.25)] text-[11px] font-bold text-[rgba(0,255,170,0.6)] hover:border-[rgba(0,255,170,0.5)] hover:text-[#00ffaa] transition-all flex-shrink-0">
            <IconPlus size={11} color="currentColor" /> {t.mods.addChannelBtn}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex px-5 border-b border-[rgba(0,255,170,0.1)] mb-4">
        {([['setup', t.mods.setupTabLabel], ['plan', `${t.mods.scheduleTitle}${contentPlan ? ` (${contentPlan.filter(p => p.status !== 'cancelled').length})` : ''}`]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`pb-3 mr-6 text-[12px] font-black tracking-wide transition-all border-b-2 ${tab === key ? 'text-[#00ffaa] border-[#00ffaa]' : 'text-[rgba(255,255,255,0.35)] border-transparent hover:text-[rgba(255,255,255,0.6)]'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── ПЛАН TAB ── */}
      {tab === 'plan' && (
        <AutoPostPlanTab
          plan={contentPlan ?? []}
          onUpdate={setContentPlan}
          onSaveItem={handleSaveItem}
          onExtend={extendPlan}
          autoActive={autoActive}
          onToggleAuto={toggleAuto}
          toggleError={toggleError}
          channelName={selectedChannel?.username ?? selectedChannel?.title ?? ''}
          channelId={selectedChannelId}
        />
      )}

      {/* ── НАСТРОЙКА TAB ── */}
      {tab === 'setup' && (
        <div className="flex flex-col gap-5 px-5 pb-28 animate-fade-up">

          {/* Usage stats */}
          {(contentPlan || Object.values(catPosts).some(l => l.length > 0)) && (
            <div className="rounded-[14px] p-3 animate-card-in" style={{ background: 'linear-gradient(135deg, rgba(18,24,60,0.7), rgba(8,11,30,0.9))', border: '1px solid rgba(0,255,170,0.1)' }}>
              <div className="flex items-center justify-between mb-2">
                <SL>{t.mods.postUsageLabel}</SL>
                {publishedIds.size > 0 && (
                  <button onClick={deleteUsedPosts} className="text-[10px] text-[rgba(255,80,80,0.6)] hover:text-[rgba(255,80,80,0.9)] transition-colors -mt-2">{t.mods.deleteUsedBtn}</button>
                )}
              </div>
              <div className="flex gap-2">
                {(['free', 'paid', 'fix'] as Category[]).map(cat => {
                  const total = catPosts[cat].length
                  const inPlan = catPosts[cat].filter(cp => plannedIds.has(cp.post.id)).length
                  const CatIcon = CAT_INFO[cat].Icon
                  return (
                    <div key={cat} className="flex-1 p-2 bg-[rgba(0,255,170,0.03)] border border-[rgba(0,255,170,0.08)] rounded-[10px]">
                      <div className="flex items-center gap-1 mb-1"><CatIcon size={11} color="rgba(0,255,170,0.6)" /><span className="text-[9px] text-[rgba(255,255,255,0.3)] truncate">{CAT_INFO[cat].label}</span></div>
                      <p className="text-[14px] font-black text-[#00ffaa]">{inPlan}<span className="text-[10px] text-[rgba(255,255,255,0.3)] font-normal">/{total}</span></p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Ready posts */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <SL>{t.mods.readyPostsLabel} ({readyPosts.length})</SL>
              <button onClick={() => setShowAddCustom(true)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-[9px] border border-[rgba(0,255,170,0.25)] hover:bg-[rgba(0,255,170,0.07)] text-[11px] font-bold text-[rgba(0,255,170,0.7)] transition-all -mt-2">
                <IconPlus size={11} color="rgba(0,255,170,0.7)" /> {t.mods.customPostBtn}
              </button>
            </div>
            {readyPosts.length === 0 ? (
              <div className="p-4 rounded-[14px] text-center" style={{ background: 'linear-gradient(135deg, rgba(14,18,50,0.5), rgba(8,11,24,0.7))', border: '1px solid rgba(0,255,170,0.08)' }}>
                <p className="text-[13px] text-[rgba(255,255,255,0.3)]">{t.mods.noReadyPosts}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {readyPosts.slice(0, 3).map(post => {
                  const packCount = post.extraUrls?.length ?? 0
                  return (
                    <div key={post.id} className="flex gap-3 p-3 rounded-[14px]" style={{ background: 'linear-gradient(135deg, rgba(16,22,55,0.7), rgba(8,11,28,0.9))', border: '1px solid rgba(0,255,170,0.1)' }}>
                      <div className="relative flex-shrink-0">
                        {post.url ? <img src={post.url} className="w-14 h-14 rounded-[10px] object-cover" alt="" />
                          : <div className="w-14 h-14 rounded-[10px] bg-[rgba(0,255,170,0.06)] border border-[rgba(0,255,170,0.15)] flex items-center justify-center"><IconFileText size={22} color="rgba(0,255,170,0.4)" /></div>}
                        {packCount > 0 && (
                          <button onClick={() => setViewingPackPost(post)} className="absolute -bottom-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-[#00ffaa] text-black text-[9px] font-black flex items-center justify-center" style={{ boxShadow: '0 0 6px rgba(0,255,170,0.7)' }}>+{packCount}</button>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] text-[rgba(255,255,255,0.6)] leading-snug line-clamp-2">{post.caption || <span className="text-[rgba(255,255,255,0.25)]">Без описания</span>}</p>
                        <p className="text-[10px] text-[rgba(255,255,255,0.25)] mt-0.5">{post.createdAt}{packCount > 0 ? ` · ${packCount + 1} фото` : ''}</p>
                      </div>
                      <button onClick={() => setReadyPosts(readyPosts.filter(x => x.id !== post.id))} className="text-[rgba(255,80,80,0.5)] hover:text-[rgba(255,80,80,0.9)] transition-colors text-[16px] self-start">×</button>
                    </div>
                  )
                })}
                {readyPosts.length > 3 && (
                  <button onClick={() => setViewAllPosts(true)} className="py-2 text-[12px] font-bold text-[rgba(0,255,170,0.7)] hover:text-[#00ffaa] transition-colors text-center border border-dashed border-[rgba(0,255,170,0.2)] rounded-[12px]">
                    {t.mods.viewAllLabel} ({readyPosts.length}) →
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Categories */}
          <div className="flex flex-col gap-3">
            <SL>{t.mods.postCategoriesLabel}</SL>
            {(['free', 'paid', 'fix'] as Category[]).map(cat => {
              const info = CAT_INFO[cat]; const cps = catPosts[cat]
              return (
                <div key={cat} className="p-4 rounded-[16px]" style={{ background: 'linear-gradient(135deg, rgba(16,22,55,0.8), rgba(8,11,28,0.95))', border: '1px solid rgba(0,255,170,0.12)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-[8px] bg-[rgba(0,255,170,0.08)] flex items-center justify-center"><info.Icon size={16} color="rgba(0,255,170,0.8)" /></div>
                      <div><p className="text-[13px] font-bold">{info.label}</p><p className="text-[10px] text-[rgba(255,255,255,0.3)]">{info.desc} · {cps.length} постов</p></div>
                    </div>
                    <button onClick={() => { setPickerCat(cat); setPickerSource('ready') }} className="flex items-center gap-1 px-2.5 py-1.5 rounded-[9px] border border-[rgba(0,255,170,0.25)] hover:bg-[rgba(0,255,170,0.07)] text-[11px] font-bold text-[rgba(0,255,170,0.7)] transition-all">
                      <IconPlus size={11} color="rgba(0,255,170,0.7)" /> Добавить
                    </button>
                  </div>
                  {cps.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {cps.slice(0, 3).map(cp => (
                        <div key={cp.post.id} className="flex items-center gap-2 p-2 bg-[rgba(0,255,170,0.03)] border border-[rgba(0,255,170,0.08)] rounded-[10px]">
                          {cp.post.url ? <img src={cp.post.url} className="w-8 h-8 rounded-[6px] object-cover flex-shrink-0" alt="" /> : <div className="w-8 h-8 rounded-[6px] bg-[rgba(0,255,170,0.06)] border border-[rgba(0,255,170,0.15)] flex items-center justify-center flex-shrink-0"><IconFileText size={14} color="rgba(0,255,170,0.4)" /></div>}
                          <p className="flex-1 text-[11px] text-[rgba(255,255,255,0.5)] truncate">{cp.post.caption}</p>
                          {cp.price && <span className="inline-flex items-center gap-0.5 text-[10px] font-black text-amber-400"><IconStar size={9} color="rgb(251,191,36)" />{cp.price}</span>}
                          <button onClick={() => openEdit(cp.post.id, cat)} className="w-8 h-8 rounded-[8px] bg-[rgba(0,255,170,0.07)] border border-[rgba(0,255,170,0.2)] flex items-center justify-center hover:bg-[rgba(0,255,170,0.15)] transition-all flex-shrink-0"><IconEdit size={13} color="rgba(0,255,170,0.7)" /></button>
                          <button onClick={() => removeFromCat(cat, cp.post.id)} className="w-8 h-8 rounded-[8px] bg-[rgba(255,80,80,0.07)] border border-[rgba(255,80,80,0.2)] flex items-center justify-center text-[16px] text-[rgba(255,80,80,0.6)] hover:bg-[rgba(255,80,80,0.15)] hover:text-[rgba(255,80,80,1)] transition-all flex-shrink-0">×</button>
                        </div>
                      ))}
                      {cps.length > 3 && (
                        <button onClick={() => setViewAllCat(cat)} className="text-[11px] text-[rgba(0,255,170,0.7)] hover:text-[#00ffaa] font-bold text-center py-1 transition-colors">
                          Смотреть все ({cps.length}) →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Schedule settings */}
          <div className="flex flex-col gap-4">
            <SL>{t.mods.scheduleSettingsLabel}</SL>

            {/* Frequency — interval toggle */}
            <div className="p-3.5 rounded-[16px]" style={{ background: 'rgba(0,255,170,0.03)', border: '1px solid rgba(0,255,170,0.12)' }}>
              <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,170,0.45)] mb-3">Частота публикаций</p>
              <button onClick={() => setIntervalMode(v => !v)}
                className="flex items-center gap-2.5 w-full select-none mb-3">
                <div className={`w-5 h-5 rounded-[6px] border-2 flex items-center justify-center flex-shrink-0 transition-all ${intervalMode ? 'bg-[#00ffaa] border-[#00ffaa]' : 'bg-transparent border-[rgba(0,255,170,0.35)]'}`}>
                  {intervalMode && <IconCheck size={11} color="black" />}
                </div>
                <span className="text-[13px] font-bold text-[rgba(255,255,255,0.75)]">С промежутком между днями</span>
              </button>
              {intervalMode ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-[rgba(255,255,255,0.45)] flex-shrink-0">
                      {useRangeInterval ? 'от' : 'Каждые'}
                    </span>
                    <input
                      type="number" min="1" max="30"
                      value={intervalDaysInput}
                      onChange={e => {
                        const raw = e.target.value
                        setIntervalDaysInput(raw)
                        const n = Math.max(1, Math.min(30, parseInt(raw) || 1))
                        setIntervalDays(n)
                      }}
                      style={{ colorScheme: 'dark' }}
                      className="w-14 h-9 bg-[rgba(255,255,255,0.03)] border border-[rgba(0,255,170,0.25)] rounded-[10px] px-2 text-[15px] font-bold text-white outline-none focus:border-[rgba(0,255,170,0.5)] transition-all text-center"
                    />
                    {useRangeInterval ? (
                      <>
                        <span className="text-[12px] text-[rgba(255,255,255,0.45)] flex-shrink-0">до</span>
                        <input
                          type="number" min="1" max="30"
                          value={intervalDaysMaxInput}
                          onChange={e => {
                            const raw = e.target.value
                            setIntervalDaysMaxInput(raw)
                            const n = Math.max(1, Math.min(30, parseInt(raw) || 1))
                            setIntervalDaysMax(n)
                          }}
                          style={{ colorScheme: 'dark' }}
                          className="w-14 h-9 bg-[rgba(255,255,255,0.03)] border border-[rgba(0,255,170,0.25)] rounded-[10px] px-2 text-[15px] font-bold text-white outline-none focus:border-[rgba(0,255,170,0.5)] transition-all text-center"
                        />
                      </>
                    ) : null}
                    <span className="text-[12px] text-[rgba(255,255,255,0.45)] flex-shrink-0">
                      {(useRangeInterval ? intervalDaysMax : intervalDays) === 1 ? 'день' : (useRangeInterval ? intervalDaysMax : intervalDays) < 5 ? 'дня' : 'дней'}
                    </span>
                  </div>
                  <button onClick={() => setUseRangeInterval(v => !v)}
                    className="flex items-center gap-2.5 select-none">
                    <div className={`w-4 h-4 rounded-[5px] border-2 flex items-center justify-center flex-shrink-0 transition-all ${useRangeInterval ? 'bg-[#00ffaa] border-[#00ffaa]' : 'bg-transparent border-[rgba(0,255,170,0.3)]'}`}>
                      {useRangeInterval && <IconCheck size={9} color="black" />}
                    </div>
                    <span className="text-[11px] text-[rgba(255,255,255,0.5)]">Добавить разброс (ИИ сам выберет)</span>
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-[rgba(255,255,255,0.35)]">Посты заливаются каждый день</p>
              )}
            </div>

            {/* Posts per upload day */}
            <div>
              <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,170,0.45)] mb-2">
                {intervalMode ? 'Постов за день заливки' : t.mods.postsPerDayLabel}
              </p>
              <div className="flex gap-2 items-center">
                {[1,2,3,4].map(n => (
                  <button key={n} onClick={() => { setPostsPerDay(n); setPostsPerDayInput(String(n)) }}
                    className={`w-10 h-10 rounded-[12px] text-[16px] font-black border transition-all flex-shrink-0 ${postsPerDay === n && postsPerDayInput === String(n) ? 'bg-[#00ffaa] border-[#00ffaa] text-black shadow-[0_0_12px_rgba(0,255,170,0.4)]' : 'border-[rgba(0,255,170,0.2)] text-[rgba(255,255,255,0.5)] bg-[rgba(255,255,255,0.02)]'}`}>{n}</button>
                ))}
                <input
                  type="number" min="1" max="20"
                  value={postsPerDayInput}
                  onChange={e => {
                    const raw = e.target.value
                    setPostsPerDayInput(raw)
                    const n = Math.max(1, Math.min(20, parseInt(raw) || 1))
                    setPostsPerDay(n)
                  }}
                  placeholder="5+"
                  style={{ colorScheme: 'dark' }}
                  className="flex-1 h-10 bg-[rgba(255,255,255,0.02)] border border-[rgba(0,255,170,0.2)] rounded-[12px] px-3 text-[14px] font-bold text-white outline-none focus:border-[rgba(0,255,170,0.5)] transition-all text-center"
                />
              </div>
              {intervalMode && (
                <p className="text-[10px] text-[rgba(255,255,255,0.3)] mt-1.5">
                  {useRangeInterval
                    ? `≈ ${(postsPerDay / intervalDaysMax).toFixed(1)}–${(postsPerDay / intervalDays).toFixed(1)} поста/день`
                    : `≈ ${(postsPerDay / intervalDays).toFixed(1)} поста/день в среднем`}
                </p>
              )}
            </div>

            {/* Post times button */}
            <div>
              <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,170,0.45)] mb-2">{t.mods.postTimesLabel}</p>
              <button onClick={() => setShowPostTimesSheet(true)}
                className="w-full flex items-center justify-between p-3.5 rounded-[16px] transition-all active:scale-[0.98]"
                style={{ background: 'rgba(0,255,170,0.04)', border: '1px solid rgba(0,255,170,0.18)' }}>
                <div className="text-left">
                  <p className="text-[13px] font-bold text-white">{postsPerDay} {postsPerDay === 1 ? 'слот' : postsPerDay < 5 ? 'слота' : 'слотов'}</p>
                  <p className="text-[11px] text-[rgba(255,255,255,0.38)] mt-0.5 leading-snug">
                    {postTimeConfigs.slice(0, postsPerDay).map(c =>
                      c.type === 'range' ? `${c.from}–${c.to}` : c.fixed
                    ).join('  ·  ')}
                  </p>
                </div>
                <span className="text-[rgba(0,255,170,0.6)] text-[18px] font-light ml-3">›</span>
              </button>
            </div>

            {/* Sequence */}
            <div>
              <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,170,0.45)] mb-2">{t.mods.orderLabel}</p>
              <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
                {sequence.length === 0 ? <p className="text-[12px] text-[rgba(255,255,255,0.2)]">Добавь категории</p>
                  : sequence.map((cat, i) => {
                      const CatIcon = CAT_INFO[cat].Icon
                      return <span key={i} className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-[rgba(0,255,170,0.07)] border border-[rgba(0,255,170,0.25)] text-[#00ffaa] inline-flex items-center gap-1">{i+1}. <CatIcon size={10} color="#00ffaa" /> {CAT_INFO[cat].label}</span>
                    })}
              </div>
              <div className="flex gap-2 mb-1">
                {(['free','paid','fix'] as Category[]).map(cat => (
                  <button key={cat} onClick={() => setSequence(s => [...s, cat])} className="flex-1 py-1.5 rounded-[9px] text-[11px] font-bold border border-[rgba(0,255,170,0.18)] hover:bg-[rgba(0,255,170,0.05)] text-[rgba(255,255,255,0.5)] transition-all">+ {CAT_INFO[cat].label}</button>
                ))}
              </div>
              {sequence.length > 0 && <button onClick={() => setSequence(s => s.slice(0,-1))} className="text-[11px] text-[rgba(255,80,80,0.6)] hover:text-[rgba(255,80,80,0.9)] transition-colors">← Удалить последний</button>}
            </div>

            {/* Start date */}
            <div>
              <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,170,0.45)] mb-2">{t.mods.startDateLabel}</p>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                style={{ colorScheme: 'dark' }}
                className="w-full bg-[rgba(255,255,255,0.02)] border border-[rgba(0,255,170,0.2)] rounded-[14px] px-5 py-3 text-[14px] text-white outline-none focus:border-[rgba(0,255,170,0.5)] transition-all" />
            </div>
          </div>

          {/* Delete-after-create checkbox */}
          <button
            onClick={() => setDeleteAfterCreate(v => !v)}
            className="flex items-center gap-2.5 w-full py-2 select-none">
            <div className={`w-5 h-5 rounded-[6px] border-2 flex items-center justify-center flex-shrink-0 transition-all
              ${deleteAfterCreate ? 'bg-[#00ffaa] border-[#00ffaa]' : 'bg-transparent border-[rgba(0,255,170,0.3)]'}`}>
              {deleteAfterCreate && <IconCheck size={11} color="black" />}
            </div>
            <span className="text-[12px] text-[rgba(255,255,255,0.55)] text-left leading-snug">
              {t.mods.deleteAfterPlan}
            </span>
          </button>

          {/* Generate */}
          <Button fullWidth disabled={!startDate || sequence.length === 0 || planLoading} onClick={generatePlan}>
            {planLoading
              ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />{t.mods.creatingPlanLabel}</span>
              : <><IconZap size={17} /> {contentPlan ? t.mods.recreatePlanBtn : t.mods.createPlanBtn}</>}
          </Button>
          {planSaveError && (
            <p className="text-[11px] text-red-400 text-center -mt-3">Ошибка сохранения: {planSaveError}</p>
          )}
          {!planSaveError && contentPlan && (
            <p className="text-[11px] text-[rgba(255,255,255,0.3)] text-center -mt-3">
              Активный план: <span className="text-[rgba(0,255,170,0.7)]">{contentPlan.filter(p => p.status !== 'cancelled').length} постов</span> →{' '}
              <button onClick={() => setTab('plan')} className="text-[#00ffaa] font-bold hover:underline">Посмотреть</button>
            </p>
          )}
        </div>
      )}

      {/* ── BOTTOM SHEETS ── */}
      <BottomSheet isOpen={!!pickerCat} onClose={resetPicker} title={pickerCat ? `${t.mods.addBtn} "${CAT_INFO[pickerCat].label}"` : ''}>
        <input ref={deviceInputRef} type="file" accept="image/*" className="hidden" onChange={handleDeviceFile} />
        <div className="flex gap-1.5 -mt-1">
          {(['ready', 'storage', 'device'] as const).map(src => (
            <button key={src} onClick={() => { setPickerSource(src); setMultiSelectMode(false); setSelectedPostIds(new Set()); setStorageMultiSelect(false); setSelectedStorageUrls(new Set()) }}
              className={`flex-1 py-2 rounded-[10px] text-[10px] font-black border transition-all ${pickerSource === src ? 'bg-[#00ffaa] border-[#00ffaa] text-black' : 'border-[rgba(0,255,170,0.2)] text-[rgba(255,255,255,0.4)] hover:border-[rgba(0,255,170,0.4)]'}`}>
              <span className="flex items-center justify-center gap-1">
                {src === 'ready' ? <IconFileText size={11} color="currentColor" /> : src === 'storage' ? <IconGallery size={11} color="currentColor" /> : <IconUpload size={11} color="currentColor" />}
                {src === 'ready' ? 'Готовые' : src === 'storage' ? 'Хранилище' : 'Устройство'}
              </span>
            </button>
          ))}
        </div>
        {pickerSource === 'ready' && (
          <div className="flex flex-col gap-2">
            {readyPosts.length === 0 ? (
              <p className="text-[12px] text-[rgba(255,255,255,0.3)] text-center py-4">{t.mods.noReadyPosts}</p>
            ) : (
              <>
                {pickerCat !== 'paid' && (
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => { setMultiSelectMode(v => !v); setSelectedPostIds(new Set()) }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] border text-[11px] font-bold transition-all ${multiSelectMode ? 'bg-[#00ffaa] border-[#00ffaa] text-black' : 'border-[rgba(0,255,170,0.25)] text-[rgba(0,255,170,0.7)] hover:bg-[rgba(0,255,170,0.07)]'}`}>
                      <IconCheck size={11} color="currentColor" />
                      {multiSelectMode ? 'Отмена' : 'Выбрать несколько'}
                    </button>
                    {multiSelectMode && selectedPostIds.size > 0 && (
                      <button
                        onClick={() => pickerCat && addMultipleFromReady(pickerCat)}
                        className="px-3 py-1.5 rounded-[9px] bg-[#00ffaa] text-black text-[11px] font-black transition-all shadow-[0_0_12px_rgba(0,255,170,0.4)]">
                        Добавить {selectedPostIds.size}
                      </button>
                    )}
                  </div>
                )}
                {readyPosts.map(post => {
                  const isSelected = selectedPostIds.has(post.id)
                  return (
                    <button key={post.id}
                      onClick={() => {
                        if (!pickerCat) return
                        if (multiSelectMode) {
                          setSelectedPostIds(prev => {
                            const next = new Set(prev)
                            if (next.has(post.id)) next.delete(post.id); else next.add(post.id)
                            return next
                          })
                        } else {
                          addFromReady(post, pickerCat)
                        }
                      }}
                      className={`flex gap-3 p-3 border rounded-[12px] text-left transition-all ${isSelected && multiSelectMode ? 'bg-[rgba(0,255,170,0.1)] border-[#00ffaa]' : 'bg-[rgba(0,255,170,0.04)] border-[rgba(0,255,170,0.12)] hover:border-[rgba(0,255,170,0.35)]'}`}>
                      {multiSelectMode && (
                        <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center self-center ${isSelected ? 'border-[#00ffaa] bg-[#00ffaa]' : 'border-[rgba(0,255,170,0.3)]'}`}>
                          {isSelected && <span className="w-2 h-2 rounded-full bg-black" />}
                        </div>
                      )}
                      {post.url ? <img src={post.url} className="w-12 h-12 rounded-[8px] object-cover flex-shrink-0" alt="" /> : <div className="w-12 h-12 rounded-[8px] bg-[rgba(0,255,170,0.06)] border border-[rgba(0,255,170,0.15)] flex items-center justify-center flex-shrink-0"><IconFileText size={20} color="rgba(0,255,170,0.4)" /></div>}
                      <div className="flex-1 min-w-0"><p className="text-[12px] text-[rgba(255,255,255,0.7)] leading-snug line-clamp-3">{post.caption}</p></div>
                    </button>
                  )
                })}
              </>
            )}
          </div>
        )}
        {pickerSource === 'storage' && (() => {
          const photos = [...uploads, ...gallery.map(g => g.url)]
          if (photos.length === 0) return <p className="text-[12px] text-[rgba(255,255,255,0.3)] text-center py-4">Хранилище пусто</p>
          return (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => { setStorageMultiSelect(v => !v); setSelectedStorageUrls(new Set()) }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] border text-[11px] font-bold transition-all ${storageMultiSelect ? 'bg-[#00ffaa] border-[#00ffaa] text-black' : 'border-[rgba(0,255,170,0.25)] text-[rgba(0,255,170,0.7)] hover:bg-[rgba(0,255,170,0.07)]'}`}>
                  <IconCheck size={11} color="currentColor" />
                  {storageMultiSelect ? 'Отмена' : 'Выбрать несколько'}
                </button>
                {storageMultiSelect && selectedStorageUrls.size > 0 && (
                  <button
                    onClick={() => pickerCat && addMultipleFromStorage(pickerCat)}
                    className="px-3 py-1.5 rounded-[9px] bg-[#00ffaa] text-black text-[11px] font-black shadow-[0_0_12px_rgba(0,255,170,0.4)]">
                    Добавить {selectedStorageUrls.size}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {photos.map((url, i) => {
                  const selected = selectedStorageUrls.has(url)
                  return (
                    <button key={i}
                      onClick={() => {
                        if (!pickerCat) return
                        if (storageMultiSelect) {
                          setSelectedStorageUrls(prev => { const s = new Set(prev); s.has(url) ? s.delete(url) : s.add(url); return s })
                        } else {
                          addFromUrl(url, pickerCat)
                        }
                      }}
                      className={`aspect-[3/4] rounded-[10px] overflow-hidden border-2 bg-[#050505] transition-all relative ${selected ? 'border-[#00ffaa]' : 'border-transparent hover:border-[rgba(0,255,170,0.5)]'}`}>
                      <img src={url} className="w-full h-full object-contain" alt="" />
                      {storageMultiSelect && selected && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#00ffaa] flex items-center justify-center" style={{ boxShadow: '0 0 6px rgba(0,255,170,0.8)' }}>
                          <IconCheck size={10} color="black" />
                        </div>
                      )}
                      {storageMultiSelect && !selected && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full border-2 border-[rgba(0,255,170,0.4)] bg-black/40" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })()}
        {pickerSource === 'device' && (
          <button onClick={() => deviceInputRef.current?.click()} className="flex items-center justify-center gap-2 w-full py-10 rounded-[14px] border-2 border-dashed border-[rgba(0,255,170,0.3)] bg-[rgba(0,255,170,0.03)] hover:bg-[rgba(0,255,170,0.07)] transition-all">
            <IconUpload size={22} color="#00ffaa" /><span className="text-[14px] font-bold text-[#00ffaa]">Загрузить с телефона</span>
          </button>
        )}
      </BottomSheet>

      <BottomSheet isOpen={!!viewingPackPost} onClose={() => setViewingPackPost(null)} title={viewingPackPost ? `Пак · ${(viewingPackPost.extraUrls?.length ?? 0) + 1} фото` : ''}>
        {viewingPackPost && (
          <div className="grid grid-cols-2 gap-2">
            {[viewingPackPost.url, ...(viewingPackPost.extraUrls ?? [])].map((url, i) => (
              <div key={i} className="relative aspect-[3/4] rounded-[12px] overflow-hidden bg-[#050505] border border-[rgba(0,255,170,0.15)]">
                <img src={url} className="w-full h-full object-contain" alt="" />
                {i === 0 && <span className="absolute bottom-1.5 left-1.5 text-[9px] font-black text-[#00ffaa] bg-black/60 px-1.5 py-0.5 rounded">обложка</span>}
              </div>
            ))}
          </div>
        )}
      </BottomSheet>

      <BottomSheet
        isOpen={showAddCustom}
        onClose={() => { setShowAddCustom(false); setCustomPhoto(null); setCustomCaption('') }}
        title={t.mods.addCustomPostTitle}
        footer={
          <Button fullWidth disabled={!customPhoto && !customCaption.trim()} onClick={saveCustomPost}>
            <IconCheck size={17} /> {t.mods.addToReadyBtn}
          </Button>
        }
      >
        <input ref={customPhotoRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleCustomPhotoFile} />
        {customPhoto ? (
          <div className="relative rounded-[14px] overflow-hidden border border-[rgba(0,255,170,0.2)] bg-black flex items-center justify-center">
            <img src={customPhoto} className="max-w-full max-h-[45vh] w-auto h-auto block" alt="" />
            <button onClick={() => setCustomPhoto(null)} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 border border-[rgba(255,80,80,0.4)] flex items-center justify-center text-[14px] text-[rgba(255,80,80,0.8)]">×</button>
          </div>
        ) : (
          <button onClick={() => customPhotoRef.current?.click()} className="flex flex-col items-center justify-center gap-3 w-full py-10 rounded-[14px] border-2 border-dashed border-[rgba(0,255,170,0.25)] bg-[rgba(0,255,170,0.02)] hover:bg-[rgba(0,255,170,0.06)] transition-all">
            <IconUpload size={24} color="#00ffaa" /><span className="text-[13px] font-bold text-[rgba(0,255,170,0.8)]">Выбрать фото или видео</span>
          </button>
        )}
        <div>
          <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,170,0.55)] mb-2">Описание</p>
          <textarea ref={customCaptionRef} value={customCaption} onChange={e => setCustomCaption(e.target.value)} placeholder="Напиши описание вручную..." rows={4}
            className="w-full bg-[rgba(255,255,255,0.02)] border border-[rgba(0,255,170,0.2)] rounded-[12px] px-4 py-3 text-[13px] text-white resize-none outline-none focus:border-[rgba(0,255,170,0.5)] transition-all" />
        </div>
        {savedEmojis.length > 0 && (
          <div>
            <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,170,0.55)] mb-2">Premium Emoji</p>
            <div className="flex flex-wrap gap-2">
              {savedEmojis.map(e => (
                <button key={e.id} onClick={() => insertCustomEmoji(e.stickerId, e.label)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[9px] bg-[rgba(0,255,170,0.06)] border border-[rgba(0,255,170,0.2)] text-[11px] font-bold text-[rgba(0,255,170,0.8)] hover:bg-[rgba(0,255,170,0.12)] transition-all">
                  <IconSparkle size={11} color="rgba(0,255,170,0.7)" /> {e.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </BottomSheet>

      <BottomSheet
        isOpen={!!pendingPaidPost}
        onClose={() => setPendingPaidPost(null)}
        title={t.mods.paidPriceTitle}
        footer={<Button fullWidth onClick={confirmPaidPost}><IconCheck size={17} /> Добавить в Платный</Button>}
      >
        {pendingPaidPost && (
          <div className="flex flex-col gap-4">
            <div className="flex gap-3 p-3 bg-[rgba(0,255,170,0.04)] border border-[rgba(0,255,170,0.12)] rounded-[12px]">
              {pendingPaidPost.url
                ? <img src={pendingPaidPost.url} className="w-12 h-12 rounded-[8px] object-cover flex-shrink-0" alt="" />
                : <div className="w-12 h-12 rounded-[8px] bg-[rgba(0,255,170,0.06)] border border-[rgba(0,255,170,0.15)] flex items-center justify-center flex-shrink-0"><IconFileText size={20} color="rgba(0,255,170,0.4)" /></div>}
              <p className="text-[12px] text-[rgba(255,255,255,0.5)] line-clamp-3 self-center">{pendingPaidPost.caption || 'Без описания'}</p>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,170,0.55)] mb-2">{t.mods.paidPriceLabel}</p>
              <input type="number" value={paidPriceStr} onChange={e => setPaidPriceStr(e.target.value)} placeholder="250" min="1" autoFocus style={{ colorScheme: 'dark' }}
                className="w-full bg-[rgba(255,255,255,0.02)] border border-[rgba(0,255,170,0.2)] rounded-[12px] px-4 py-3 text-[14px] text-white outline-none focus:border-[rgba(0,255,170,0.5)] transition-all" />
            </div>
          </div>
        )}
      </BottomSheet>

      {/* ── ADD CHANNEL ── */}
      <BottomSheet
        isOpen={addChannelOpen}
        onClose={() => { setAddChannelOpen(false); setResolvedPreview(null); setResolveError(null) }}
        title={t.mods.addChannelTitle}
        footer={resolvedPreview
          ? <Button fullWidth onClick={confirmAddChannel}><IconPlus size={17} /> Добавить канал</Button>
          : <Button fullWidth disabled={!newUsername.trim() || newUsername === '@' || resolving} onClick={resolveChannel}>
              {resolving
                ? <><span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> Проверяем...</>
                : <><IconCheck size={17} /> Проверить канал</>}
            </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label="Username канала" value={newUsername} onChange={v => { setNewUsername(v); setResolvedPreview(null); setResolveError(null) }} placeholder="@yourchannel" />
          <div className="p-3 bg-[rgba(251,191,36,0.05)] border border-[rgba(251,191,36,0.15)] rounded-[12px]">
            <p className="text-[11px] text-[rgba(255,255,255,0.45)] leading-relaxed">
              <span className="text-amber-400 font-bold">Важно:</span> добавь <span onClick={() => openTgLink('WeloPosting')} className="text-[rgba(0,255,170,0.9)] font-bold underline underline-offset-2 cursor-pointer">@WeloPosting</span> как администратора канала с правом <span className="text-white font-bold">«Публикация сообщений»</span>
            </p>
          </div>
          {resolveError && <p className="text-[11px] text-red-400">{resolveError}</p>}
          {resolvedPreview && (
            <div className="flex items-center gap-3 p-3 bg-[rgba(0,255,170,0.06)] border border-[rgba(0,255,170,0.3)] rounded-[14px]">
              {resolvedPreview.photoUrl
                ? <img src={resolvedPreview.photoUrl} className="w-12 h-12 rounded-full object-cover flex-shrink-0" alt="" />
                : <div className="w-12 h-12 rounded-full bg-[rgba(0,255,170,0.15)] border border-[rgba(0,255,170,0.3)] flex items-center justify-center text-[18px] font-black text-[#00ffaa] flex-shrink-0">{(resolvedPreview.title || '@')[0].toUpperCase()}</div>
              }
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-bold truncate">{resolvedPreview.title}</p>
                <p className="text-[11px] text-[rgba(0,255,170,0.7)]">{resolvedPreview.username}</p>
              </div>
              <div className="w-6 h-6 rounded-full bg-[#00ffaa] flex items-center justify-center flex-shrink-0" style={{ boxShadow: '0 0 8px rgba(0,255,170,0.5)' }}>
                <IconCheck size={12} color="black" />
              </div>
            </div>
          )}
        </div>
      </BottomSheet>

      <BottomSheet
        isOpen={!!editingPost}
        onClose={() => setEditingPost(null)}
        title="Редактировать пост"
        footer={<Button fullWidth onClick={saveEdit}><IconCheck size={17} /> Сохранить</Button>}
      >
        <div>
          <SL>Описание</SL>
          <textarea ref={editCaptionRef} value={editCaption} onChange={e => setEditCaption(e.target.value)} rows={4}
            className="w-full bg-[rgba(255,255,255,0.02)] border border-[rgba(0,255,170,0.2)] rounded-[12px] px-4 py-3 text-[13px] text-white resize-none outline-none focus:border-[rgba(0,255,170,0.5)] transition-all" />
          {savedEmojis.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {savedEmojis.map(e => (
                <button key={e.id} onClick={() => insertEmojiToEdit(e.stickerId, e.label)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[9px] bg-[rgba(0,255,170,0.06)] border border-[rgba(0,255,170,0.2)] text-[11px] font-bold text-[rgba(0,255,170,0.8)] hover:bg-[rgba(0,255,170,0.12)] transition-all">
                  ✨ {e.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {editingPost?.cat === 'paid' && (
          <div>
            <SL><span className="inline-flex items-center gap-1">Цена (<IconStar size={9} color="rgba(0,255,170,0.6)" /> Stars)</span></SL>
            <input type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)} placeholder="250" min="1" style={{ colorScheme: 'dark' }}
              className="w-full bg-[rgba(255,255,255,0.02)] border border-[rgba(0,255,170,0.2)] rounded-[12px] px-4 py-3 text-[14px] text-white outline-none focus:border-[rgba(0,255,170,0.5)] transition-all" />
          </div>
        )}
      </BottomSheet>

      {/* ── VIEW ALL READY POSTS ── */}
      <BottomSheet isOpen={viewAllPosts} onClose={() => setViewAllPosts(false)} title={`${t.mods.readyPostsLabel} (${readyPosts.length})`}>
        <div className="flex flex-col gap-2">
          {readyPosts.map(post => {
            const packCount = post.extraUrls?.length ?? 0
            return (
              <div key={post.id} className="flex gap-3 p-3 bg-[rgba(255,255,255,0.02)] border border-[rgba(0,255,170,0.1)] rounded-[14px]">
                <div className="relative flex-shrink-0">
                  {post.url ? <img src={post.url} className="w-12 h-12 rounded-[10px] object-cover" alt="" />
                    : <div className="w-12 h-12 rounded-[10px] bg-[rgba(0,255,170,0.06)] border border-[rgba(0,255,170,0.15)] flex items-center justify-center"><IconFileText size={18} color="rgba(0,255,170,0.4)" /></div>}
                  {packCount > 0 && <button onClick={() => setViewingPackPost(post)} className="absolute -bottom-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-[#00ffaa] text-black text-[9px] font-black flex items-center justify-center" style={{ boxShadow: '0 0 6px rgba(0,255,170,0.7)' }}>+{packCount}</button>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-[rgba(255,255,255,0.6)] leading-snug line-clamp-2">{post.caption || <span className="text-[rgba(255,255,255,0.25)]">Без описания</span>}</p>
                  <p className="text-[10px] text-[rgba(255,255,255,0.25)] mt-0.5">{post.createdAt}{packCount > 0 ? ` · ${packCount + 1} фото` : ''}</p>
                </div>
                <button onClick={() => setReadyPosts(readyPosts.filter(x => x.id !== post.id))} className="text-[rgba(255,80,80,0.5)] hover:text-[rgba(255,80,80,0.9)] transition-colors text-[16px] self-start">×</button>
              </div>
            )
          })}
        </div>
      </BottomSheet>

      {/* ── VIEW ALL CATEGORY ── */}
      <BottomSheet isOpen={!!viewAllCat} onClose={() => setViewAllCat(null)} title={viewAllCat ? `${CAT_INFO[viewAllCat].label} — все посты (${catPosts[viewAllCat].length})` : ''}>
        {viewAllCat && (
          <div className="flex flex-col gap-2">
            {catPosts[viewAllCat].map(cp => (
              <div key={cp.post.id} className="flex items-center gap-2 p-2 bg-[rgba(0,255,170,0.03)] border border-[rgba(0,255,170,0.08)] rounded-[10px]">
                {cp.post.url ? <img src={cp.post.url} className="w-10 h-10 rounded-[6px] object-cover flex-shrink-0" alt="" /> : <div className="w-10 h-10 rounded-[6px] bg-[rgba(0,255,170,0.06)] border border-[rgba(0,255,170,0.15)] flex items-center justify-center flex-shrink-0"><IconFileText size={16} color="rgba(0,255,170,0.4)" /></div>}
                <p className="flex-1 text-[11px] text-[rgba(255,255,255,0.5)] truncate">{cp.post.caption || 'Без описания'}</p>
                {cp.price && <span className="inline-flex items-center gap-0.5 text-[10px] font-black text-amber-400"><IconStar size={9} color="rgb(251,191,36)" />{cp.price}</span>}
                <button onClick={() => openEdit(cp.post.id, viewAllCat)} className="w-8 h-8 rounded-[8px] bg-[rgba(0,255,170,0.07)] border border-[rgba(0,255,170,0.2)] flex items-center justify-center hover:bg-[rgba(0,255,170,0.15)] transition-all flex-shrink-0"><IconEdit size={13} color="rgba(0,255,170,0.7)" /></button>
                <button onClick={() => removeFromCat(viewAllCat, cp.post.id)} className="w-8 h-8 rounded-[8px] bg-[rgba(255,80,80,0.07)] border border-[rgba(255,80,80,0.2)] flex items-center justify-center text-[16px] text-[rgba(255,80,80,0.6)] hover:bg-[rgba(255,80,80,0.15)] transition-all flex-shrink-0">×</button>
              </div>
            ))}
          </div>
        )}
      </BottomSheet>

      {/* ── POST TIMES ── */}
      <BottomSheet
        isOpen={showPostTimesSheet}
        onClose={() => setShowPostTimesSheet(false)}
        title={t.mods.postTimesLabel}
        footer={<Button fullWidth onClick={() => setShowPostTimesSheet(false)}><IconCheck size={17} /> Готово</Button>}
      >
        <div className="flex flex-col gap-3">
          {Array.from({ length: postsPerDay }).map((_, i) => {
            const cfg = postTimeConfigs[i] ?? DEFAULT_TIME_CONFIGS[i] ?? DEFAULT_TIME_CONFIGS[0]
            return (
              <div key={i} className="p-3.5 rounded-[16px]" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(0,255,170,0.12)' }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[12px] font-bold text-[rgba(255,255,255,0.55)]">Пост {i + 1}</p>
                  <div className="flex gap-1">
                    {(['range', 'fixed'] as const).map(type => (
                      <button key={type}
                        onClick={() => setPostTimeConfigs(prev => {
                          const next = [...prev]
                          while (next.length <= i) next.push(DEFAULT_TIME_CONFIGS[next.length] ?? DEFAULT_TIME_CONFIGS[0])
                          next[i] = { ...next[i], type }
                          return next
                        })}
                        className={`px-3 py-1 rounded-[9px] text-[10px] font-black border transition-all ${cfg.type === type ? 'bg-[#00ffaa] border-[#00ffaa] text-black' : 'border-[rgba(0,255,170,0.2)] text-[rgba(255,255,255,0.4)]'}`}>
                        {type === 'range' ? 'Диапазон' : 'Точное'}
                      </button>
                    ))}
                  </div>
                </div>
                {cfg.type === 'range' ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[rgba(255,255,255,0.3)] flex-shrink-0">от</span>
                    <input type="time" value={cfg.from} style={{ colorScheme: 'dark' }}
                      onChange={e => setPostTimeConfigs(prev => {
                        const next = [...prev]
                        while (next.length <= i) next.push(DEFAULT_TIME_CONFIGS[next.length] ?? DEFAULT_TIME_CONFIGS[0])
                        next[i] = { ...next[i], from: e.target.value }
                        return next
                      })}
                      className="flex-1 bg-[rgba(0,255,170,0.04)] border border-[rgba(0,255,170,0.2)] rounded-[10px] px-2 py-2 text-[13px] font-bold text-[#00ffaa] outline-none focus:border-[rgba(0,255,170,0.5)] transition-all" />
                    <span className="text-[10px] text-[rgba(255,255,255,0.3)] flex-shrink-0">до</span>
                    <input type="time" value={cfg.to} style={{ colorScheme: 'dark' }}
                      onChange={e => setPostTimeConfigs(prev => {
                        const next = [...prev]
                        while (next.length <= i) next.push(DEFAULT_TIME_CONFIGS[next.length] ?? DEFAULT_TIME_CONFIGS[0])
                        next[i] = { ...next[i], to: e.target.value }
                        return next
                      })}
                      className="flex-1 bg-[rgba(0,255,170,0.04)] border border-[rgba(0,255,170,0.2)] rounded-[10px] px-2 py-2 text-[13px] font-bold text-[#00ffaa] outline-none focus:border-[rgba(0,255,170,0.5)] transition-all" />
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[rgba(255,255,255,0.3)] flex-shrink-0">время</span>
                    <input type="time" value={cfg.fixed} style={{ colorScheme: 'dark' }}
                      onChange={e => setPostTimeConfigs(prev => {
                        const next = [...prev]
                        while (next.length <= i) next.push(DEFAULT_TIME_CONFIGS[next.length] ?? DEFAULT_TIME_CONFIGS[0])
                        next[i] = { ...next[i], fixed: e.target.value }
                        return next
                      })}
                      className="flex-1 bg-[rgba(0,255,170,0.04)] border border-[rgba(0,255,170,0.2)] rounded-[10px] px-2 py-2 text-[13px] font-bold text-[#00ffaa] outline-none focus:border-[rgba(0,255,170,0.5)] transition-all" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </BottomSheet>
    </div>
  )
}
