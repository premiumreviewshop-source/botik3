import { useState, useRef } from 'react'
import { type ReactNode } from 'react'
import { useApp } from '../../store/app'
import { IconBack, IconZap, IconPlus, IconCheck, IconUpload, IconFileText, IconImage, IconStar, IconPin, IconEdit, IconInfo, IconGallery } from '../../components/Icons'
import Button from '../../components/Button'
import BottomSheet from '../../components/BottomSheet'
import Input from '../../components/Input'
import AutoPostPlanTab from './AutoPostPlanTab'
import type { ReadyPost, PlanItem } from '../../types'

type Category = 'free' | 'paid' | 'fix'
interface CatPost { post: ReadyPost; price?: number }

const CAT_INFO = {
  free: { label: 'Обычный',   Icon: IconImage, desc: 'Бесплатный контент' },
  paid: { label: 'Платный',   Icon: IconStar,  desc: 'PPV — платный контент' },
  fix:  { label: 'Фикс пост', Icon: IconPin,   desc: 'Закреплённый пост' },
}
const PLAN_TIMES = ['09:00', '11:30', '14:00', '17:00', '19:30', '21:00']

function SL({ children }: { children: ReactNode }) {
  return <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,136,0.55)] mb-2">{children}</p>
}

function buildSmartPlan(
  catPosts: Record<Category, CatPost[]>,
  seq: Category[],
  perDay: number,
  start: string
): PlanItem[] {
  if (!seq.length || !start) return []
  const q: Record<Category, CatPost[]> = { free: [...catPosts.free], paid: [...catPosts.paid], fix: [...catPosts.fix] }
  const result: PlanItem[] = []
  let si = 0, empty = 0
  const base = new Date(start)
  while (empty < seq.length) {
    const cat = seq[si % seq.length]; si++
    if (q[cat].length > 0) {
      const cp = q[cat].shift()!
      const dayIdx = Math.floor(result.length / perDay)
      const d = new Date(base); d.setDate(base.getDate() + dayIdx)
      result.push({
        id: `p${Date.now()}${result.length}`,
        date: d.toLocaleDateString('ru', { day: 'numeric', month: 'short', weekday: 'short' }),
        dateObj: d.toISOString().slice(0, 10),
        time: PLAN_TIMES[result.length % Math.max(perDay, 1) % PLAN_TIMES.length],
        category: cat,
        postId: cp.post.id,
        postUrl: cp.post.url,
        postCaption: cp.post.caption,
        price: cp.price,
        status: 'scheduled',
        editing: false,
      })
      empty = 0
    } else { empty++ }
  }
  return result
}

export default function AutoPostSchedule() {
  const { goBack, bots, setBots, readyPosts, setReadyPosts, uploads, setUploads, gallery, contentPlan, setContentPlan } = useApp()

  const [channelName, setChannelName] = useState('@mychannel')
  const [botId, setBotId] = useState(bots[0]?.id ?? '')
  const [setupDone, setSetupDone] = useState(true)
  const [tab, setTab] = useState<'setup' | 'plan'>('setup')

  const [catPosts, setCatPosts] = useState<Record<Category, CatPost[]>>({ free: [], paid: [], fix: [] })
  const [postsPerDay, setPostsPerDay] = useState(2)
  const [sequence, setSequence] = useState<Category[]>(['free', 'paid'])
  const [startDate, setStartDate] = useState('')
  const [planLoading, setPlanLoading] = useState(false)
  const [autoActive, setAutoActive] = useState(false)

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

  const connectedBot = bots.find(b => b.id === botId)

  const generatePlan = async () => {
    if (!startDate || sequence.length === 0) return
    setPlanLoading(true)
    await new Promise(r => setTimeout(r, 1000))
    const newPlan = buildSmartPlan(catPosts, sequence, postsPerDay, startDate)
    setContentPlan(newPlan)
    setPlanLoading(false)
    setTab('plan')
  }

  const extendPlan = () => {
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
    const newItems = buildSmartPlan(remaining, sequence, postsPerDay, next.toISOString().slice(0, 10))
    if (newItems.length) setContentPlan([...contentPlan, ...newItems])
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
    setEditingPost(null)
  }

  const addFromReady = (post: ReadyPost, cat: Category) => { setCatPosts(prev => ({ ...prev, [cat]: [...prev[cat], { post }] })); setPickerCat(null) }
  const addFromUrl = (url: string, cat: Category) => {
    const post: ReadyPost = { id: Date.now().toString(), url, caption: '', createdAt: new Date().toLocaleDateString('ru') }
    setCatPosts(prev => ({ ...prev, [cat]: [...prev[cat], { post }] })); setPickerCat(null)
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

  if (!setupDone) {
    return (
      <div className="flex flex-col gap-5 pt-4">
        <div className="flex items-center gap-3 px-5">
          <button onClick={goBack} className="w-9 h-9 rounded-full bg-[rgba(0,255,136,0.06)] border border-[rgba(0,255,136,0.2)] flex items-center justify-center hover:bg-[rgba(0,255,136,0.12)] transition-colors">
            <IconBack size={20} color="#00ff88" />
          </button>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[2px] text-[rgba(0,255,136,0.5)]">Посты + Автопостинг</p>
            <h1 className="text-[20px] font-black tracking-tight">Настройка канала</h1>
          </div>
        </div>
        <div className="px-5 flex flex-col gap-4">
          <p className="text-[13px] text-[rgba(255,255,255,0.4)]">Для запуска автопостинга нужно подключить твой Telegram-канал</p>
          <Input label="Username канала" value={channelName} onChange={setChannelName} placeholder="@mychannel" />
          <div className="p-4 bg-[rgba(251,191,36,0.05)] border border-[rgba(251,191,36,0.2)] rounded-[14px]">
            <div className="flex items-center gap-1.5 text-[12px] font-bold text-amber-400 mb-1.5"><IconInfo size={13} color="rgb(251,191,36)" /> Обязательно</div>
            <p className="text-[12px] text-[rgba(255,255,255,0.5)] leading-relaxed">Добавь нашего бота как <span className="text-white font-bold">администратора</span> в канал с правом публикации постов.</p>
            {connectedBot && <p className="text-[11px] text-amber-400 mt-2 font-bold">Добавь: {connectedBot.handle}</p>}
          </div>
          <div>
            <SL>Бот для постинга</SL>
            <div className="flex flex-col gap-1.5">
              {bots.map(b => {
                const occupied = b.modules.length > 0 && !b.modules.includes('Автопостинг')
                return (
                  <button key={b.id} onClick={() => !occupied && setBotId(b.id)} disabled={occupied}
                    className={`flex items-center gap-3 p-3 rounded-[12px] border transition-all text-left ${occupied ? 'opacity-50 cursor-not-allowed border-[rgba(255,255,255,0.06)]' : botId === b.id ? 'border-[rgba(0,255,136,0.4)] bg-[rgba(0,255,136,0.06)]' : 'border-[rgba(0,255,136,0.1)] hover:border-[rgba(0,255,136,0.25)]'}`}>
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${b.isActive ? 'bg-[#00ff88]' : 'bg-[rgba(255,255,255,0.2)]'}`} style={b.isActive ? { boxShadow: '0 0 5px rgba(0,255,136,1)' } : {}} />
                    <div className="flex-1 min-w-0"><span className="text-[13px] font-bold">{b.name}</span>{occupied && <p className="text-[10px] text-amber-400 mt-0.5">занят: {b.modules.join(', ')}</p>}</div>
                    <span className="text-[11px] text-[rgba(255,255,255,0.3)]">{b.handle}</span>
                    {botId === b.id && <IconCheck size={13} color="#00ff88" />}
                  </button>
                )
              })}
            </div>
          </div>
          <Button fullWidth disabled={!channelName.trim() || !botId} onClick={() => { setBots(bots.map(b => b.id === botId ? { ...b, modules: [...new Set([...b.modules, 'Автопостинг'])] } : b)); setSetupDone(true) }}>
            <IconCheck size={17} /> Сохранить и продолжить →
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0 pt-4">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 mb-4">
        <button onClick={goBack} className="w-9 h-9 rounded-full bg-[rgba(0,255,136,0.06)] border border-[rgba(0,255,136,0.2)] flex items-center justify-center hover:bg-[rgba(0,255,136,0.12)] transition-colors">
          <IconBack size={20} color="#00ff88" />
        </button>
        <div className="flex-1">
          <p className="text-[9px] font-black uppercase tracking-[2px] text-[rgba(0,255,136,0.5)]">Посты + Автопостинг</p>
          <h1 className="text-[20px] font-black tracking-tight">Автопостинг</h1>
        </div>
        <button onClick={() => setSetupDone(false)} className="flex items-center gap-1 text-[10px] text-[rgba(0,255,136,0.5)] hover:text-[#00ff88] transition-colors">{channelName} <IconEdit size={10} color="currentColor" /></button>
      </div>

      {/* Tabs */}
      <div className="flex px-5 border-b border-[rgba(0,255,136,0.1)] mb-4">
        {([['setup', 'Настройка'], ['plan', `Планы${contentPlan ? ` (${contentPlan.filter(p => p.status !== 'cancelled').length})` : ''}`]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`pb-3 mr-6 text-[12px] font-black tracking-wide transition-all border-b-2 ${tab === key ? 'text-[#00ff88] border-[#00ff88]' : 'text-[rgba(255,255,255,0.35)] border-transparent hover:text-[rgba(255,255,255,0.6)]'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── ПЛАН TAB ── */}
      {tab === 'plan' && (
        <AutoPostPlanTab
          plan={contentPlan ?? []}
          onUpdate={setContentPlan}
          onExtend={extendPlan}
          autoActive={autoActive}
          onToggleAuto={() => setAutoActive(v => !v)}
          channelName={channelName}
        />
      )}

      {/* ── НАСТРОЙКА TAB ── */}
      {tab === 'setup' && (
        <div className="flex flex-col gap-5 px-5 pb-8 animate-fade-up">

          {/* Usage stats */}
          {(contentPlan || Object.values(catPosts).some(l => l.length > 0)) && (
            <div className="bg-[#080808] border border-[rgba(0,255,136,0.1)] rounded-[14px] p-3 animate-glow-in">
              <div className="flex items-center justify-between mb-2">
                <SL>Использование постов</SL>
                {publishedIds.size > 0 && (
                  <button onClick={deleteUsedPosts} className="text-[10px] text-[rgba(255,80,80,0.6)] hover:text-[rgba(255,80,80,0.9)] transition-colors -mt-2">Удалить использованные</button>
                )}
              </div>
              <div className="flex gap-2">
                {(['free', 'paid', 'fix'] as Category[]).map(cat => {
                  const total = catPosts[cat].length
                  const inPlan = catPosts[cat].filter(cp => plannedIds.has(cp.post.id)).length
                  const CatIcon = CAT_INFO[cat].Icon
                  return (
                    <div key={cat} className="flex-1 p-2 bg-[rgba(0,255,136,0.03)] border border-[rgba(0,255,136,0.08)] rounded-[10px]">
                      <div className="flex items-center gap-1 mb-1"><CatIcon size={11} color="rgba(0,255,136,0.6)" /><span className="text-[9px] text-[rgba(255,255,255,0.3)] truncate">{CAT_INFO[cat].label}</span></div>
                      <p className="text-[14px] font-black text-[#00ff88]">{inPlan}<span className="text-[10px] text-[rgba(255,255,255,0.3)] font-normal">/{total}</span></p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Ready posts */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <SL>Готовые посты ({readyPosts.length})</SL>
              <button onClick={() => setShowAddCustom(true)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-[9px] border border-[rgba(0,255,136,0.25)] hover:bg-[rgba(0,255,136,0.07)] text-[11px] font-bold text-[rgba(0,255,136,0.7)] transition-all -mt-2">
                <IconPlus size={11} color="rgba(0,255,136,0.7)" /> Свой пост
              </button>
            </div>
            {readyPosts.length === 0 ? (
              <div className="p-4 bg-[#080808] border border-[rgba(0,255,136,0.08)] rounded-[14px] text-center">
                <p className="text-[13px] text-[rgba(255,255,255,0.3)]">Нет готовых постов — сначала сгенерируй описания</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {readyPosts.map(post => {
                  const packCount = post.extraUrls?.length ?? 0
                  return (
                    <div key={post.id} className="flex gap-3 p-3 bg-[#080808] border border-[rgba(0,255,136,0.1)] rounded-[14px]">
                      <div className="relative flex-shrink-0">
                        {post.url ? <img src={post.url} className="w-14 h-14 rounded-[10px] object-cover" alt="" />
                          : <div className="w-14 h-14 rounded-[10px] bg-[rgba(0,255,136,0.06)] border border-[rgba(0,255,136,0.15)] flex items-center justify-center"><IconFileText size={22} color="rgba(0,255,136,0.4)" /></div>}
                        {packCount > 0 && (
                          <button onClick={() => setViewingPackPost(post)} className="absolute -bottom-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-[#00ff88] text-black text-[9px] font-black flex items-center justify-center" style={{ boxShadow: '0 0 6px rgba(0,255,136,0.7)' }}>+{packCount}</button>
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
              </div>
            )}
          </div>

          {/* Categories */}
          <div className="flex flex-col gap-3">
            <SL>Категории постов</SL>
            {(['free', 'paid', 'fix'] as Category[]).map(cat => {
              const info = CAT_INFO[cat]; const cps = catPosts[cat]
              return (
                <div key={cat} className="p-4 bg-[#080808] border border-[rgba(0,255,136,0.1)] rounded-[16px]">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-[8px] bg-[rgba(0,255,136,0.08)] flex items-center justify-center"><info.Icon size={16} color="rgba(0,255,136,0.8)" /></div>
                      <div><p className="text-[13px] font-bold">{info.label}</p><p className="text-[10px] text-[rgba(255,255,255,0.3)]">{info.desc} · {cps.length} постов</p></div>
                    </div>
                    <button onClick={() => { setPickerCat(cat); setPickerSource('ready') }} className="flex items-center gap-1 px-2.5 py-1.5 rounded-[9px] border border-[rgba(0,255,136,0.25)] hover:bg-[rgba(0,255,136,0.07)] text-[11px] font-bold text-[rgba(0,255,136,0.7)] transition-all">
                      <IconPlus size={11} color="rgba(0,255,136,0.7)" /> Добавить
                    </button>
                  </div>
                  {cps.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {cps.map(cp => (
                        <div key={cp.post.id} className="flex items-center gap-2 p-2 bg-[rgba(0,255,136,0.03)] border border-[rgba(0,255,136,0.08)] rounded-[10px]">
                          {cp.post.url ? <img src={cp.post.url} className="w-8 h-8 rounded-[6px] object-cover flex-shrink-0" alt="" /> : <div className="w-8 h-8 rounded-[6px] bg-[rgba(0,255,136,0.06)] border border-[rgba(0,255,136,0.15)] flex items-center justify-center flex-shrink-0"><IconFileText size={14} color="rgba(0,255,136,0.4)" /></div>}
                          <p className="flex-1 text-[11px] text-[rgba(255,255,255,0.5)] truncate">{cp.post.caption}</p>
                          {cp.price && <span className="inline-flex items-center gap-0.5 text-[10px] font-black text-amber-400"><IconStar size={9} color="rgb(251,191,36)" />{cp.price}</span>}
                          <button onClick={() => openEdit(cp.post.id, cat)} className="w-8 h-8 rounded-[8px] bg-[rgba(0,255,136,0.07)] border border-[rgba(0,255,136,0.2)] flex items-center justify-center hover:bg-[rgba(0,255,136,0.15)] transition-all flex-shrink-0"><IconEdit size={13} color="rgba(0,255,136,0.7)" /></button>
                          <button onClick={() => removeFromCat(cat, cp.post.id)} className="w-8 h-8 rounded-[8px] bg-[rgba(255,80,80,0.07)] border border-[rgba(255,80,80,0.2)] flex items-center justify-center text-[16px] text-[rgba(255,80,80,0.6)] hover:bg-[rgba(255,80,80,0.15)] hover:text-[rgba(255,80,80,1)] transition-all flex-shrink-0">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Schedule settings */}
          <div className="flex flex-col gap-4">
            <SL>Расписание</SL>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,136,0.45)] mb-2">Постов в день</p>
              <div className="flex gap-2">
                {[1,2,3,4].map(n => (
                  <button key={n} onClick={() => setPostsPerDay(n)}
                    className={`flex-1 py-2.5 rounded-[12px] text-[16px] font-black border transition-all ${postsPerDay === n ? 'bg-[#00ff88] border-[#00ff88] text-black shadow-[0_0_12px_rgba(0,255,136,0.4)]' : 'border-[rgba(0,255,136,0.2)] text-[rgba(255,255,255,0.5)] hover:border-[rgba(0,255,136,0.4)]'}`}>{n}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,136,0.45)] mb-2">Очерёдность</p>
              <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
                {sequence.length === 0 ? <p className="text-[12px] text-[rgba(255,255,255,0.2)]">Добавь категории</p>
                  : sequence.map((cat, i) => {
                      const CatIcon = CAT_INFO[cat].Icon
                      return <span key={i} className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-[rgba(0,255,136,0.07)] border border-[rgba(0,255,136,0.25)] text-[#00ff88] inline-flex items-center gap-1">{i+1}. <CatIcon size={10} color="#00ff88" /> {CAT_INFO[cat].label}</span>
                    })}
              </div>
              <div className="flex gap-2 mb-1">
                {(['free','paid','fix'] as Category[]).map(cat => (
                  <button key={cat} onClick={() => setSequence(s => [...s, cat])} className="flex-1 py-1.5 rounded-[9px] text-[11px] font-bold border border-[rgba(0,255,136,0.18)] hover:bg-[rgba(0,255,136,0.05)] text-[rgba(255,255,255,0.5)] transition-all">+ {CAT_INFO[cat].label}</button>
                ))}
              </div>
              {sequence.length > 0 && <button onClick={() => setSequence(s => s.slice(0,-1))} className="text-[11px] text-[rgba(255,80,80,0.6)] hover:text-[rgba(255,80,80,0.9)] transition-colors">← Удалить последний</button>}
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,136,0.45)] mb-2">Дата начала</p>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ colorScheme: 'dark' }}
                className="w-full bg-[#080808] border border-[rgba(0,255,136,0.2)] rounded-[12px] px-4 py-3 text-[14px] text-white outline-none focus:border-[rgba(0,255,136,0.5)] transition-all" />
            </div>
          </div>

          {/* Generate */}
          <Button fullWidth disabled={!startDate || sequence.length === 0 || planLoading} onClick={generatePlan}>
            {planLoading
              ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />Создаю план...</span>
              : <><IconZap size={17} /> {contentPlan ? 'Пересоздать план' : 'Создать план AI'}</>}
          </Button>
          {contentPlan && (
            <p className="text-[11px] text-[rgba(255,255,255,0.3)] text-center -mt-3">
              Активный план: <span className="text-[rgba(0,255,136,0.7)]">{contentPlan.filter(p => p.status !== 'cancelled').length} постов</span> →{' '}
              <button onClick={() => setTab('plan')} className="text-[#00ff88] font-bold hover:underline">Посмотреть</button>
            </p>
          )}
        </div>
      )}

      {/* ── BOTTOM SHEETS ── */}
      <BottomSheet isOpen={!!pickerCat} onClose={() => setPickerCat(null)} title={pickerCat ? `Добавить в "${CAT_INFO[pickerCat].label}"` : ''}>
        <input ref={deviceInputRef} type="file" accept="image/*" className="hidden" onChange={handleDeviceFile} />
        <div className="flex gap-1.5 -mt-1">
          {(['ready', 'storage', 'device'] as const).map(src => (
            <button key={src} onClick={() => setPickerSource(src)}
              className={`flex-1 py-2 rounded-[10px] text-[10px] font-black border transition-all ${pickerSource === src ? 'bg-[#00ff88] border-[#00ff88] text-black' : 'border-[rgba(0,255,136,0.2)] text-[rgba(255,255,255,0.4)] hover:border-[rgba(0,255,136,0.4)]'}`}>
              <span className="flex items-center justify-center gap-1">
                {src === 'ready' ? <IconFileText size={11} color="currentColor" /> : src === 'storage' ? <IconGallery size={11} color="currentColor" /> : <IconUpload size={11} color="currentColor" />}
                {src === 'ready' ? 'Готовые' : src === 'storage' ? 'Хранилище' : 'Устройство'}
              </span>
            </button>
          ))}
        </div>
        {pickerSource === 'ready' && (
          <div className="flex flex-col gap-2">
            {readyPosts.length === 0
              ? <p className="text-[12px] text-[rgba(255,255,255,0.3)] text-center py-4">Нет готовых постов</p>
              : readyPosts.map(post => (
                <button key={post.id} onClick={() => pickerCat && addFromReady(post, pickerCat)}
                  className="flex gap-3 p-3 bg-[rgba(0,255,136,0.04)] border border-[rgba(0,255,136,0.12)] rounded-[12px] text-left hover:border-[rgba(0,255,136,0.35)] transition-all">
                  {post.url ? <img src={post.url} className="w-12 h-12 rounded-[8px] object-cover flex-shrink-0" alt="" /> : <div className="w-12 h-12 rounded-[8px] bg-[rgba(0,255,136,0.06)] border border-[rgba(0,255,136,0.15)] flex items-center justify-center flex-shrink-0"><IconFileText size={20} color="rgba(0,255,136,0.4)" /></div>}
                  <div className="flex-1 min-w-0"><p className="text-[12px] text-[rgba(255,255,255,0.7)] leading-snug line-clamp-3">{post.caption}</p></div>
                </button>
              ))}
          </div>
        )}
        {pickerSource === 'storage' && (() => {
          const photos = [...uploads, ...gallery.map(g => g.url)]
          return photos.length === 0
            ? <p className="text-[12px] text-[rgba(255,255,255,0.3)] text-center py-4">Хранилище пусто</p>
            : <div className="grid grid-cols-3 gap-2">
                {photos.map((url, i) => (
                  <button key={i} onClick={() => pickerCat && addFromUrl(url, pickerCat)} className="aspect-[3/4] rounded-[10px] overflow-hidden border-2 border-transparent hover:border-[#00ff88] bg-[#050505] transition-all">
                    <img src={url} className="w-full h-full object-contain" alt="" />
                  </button>
                ))}
              </div>
        })()}
        {pickerSource === 'device' && (
          <button onClick={() => deviceInputRef.current?.click()} className="flex items-center justify-center gap-2 w-full py-10 rounded-[14px] border-2 border-dashed border-[rgba(0,255,136,0.3)] bg-[rgba(0,255,136,0.03)] hover:bg-[rgba(0,255,136,0.07)] transition-all">
            <IconUpload size={22} color="#00ff88" /><span className="text-[14px] font-bold text-[#00ff88]">Загрузить с телефона</span>
          </button>
        )}
      </BottomSheet>

      <BottomSheet isOpen={!!viewingPackPost} onClose={() => setViewingPackPost(null)} title={viewingPackPost ? `Пак · ${(viewingPackPost.extraUrls?.length ?? 0) + 1} фото` : ''}>
        {viewingPackPost && (
          <div className="grid grid-cols-2 gap-2">
            {[viewingPackPost.url, ...(viewingPackPost.extraUrls ?? [])].map((url, i) => (
              <div key={i} className="relative aspect-[3/4] rounded-[12px] overflow-hidden bg-[#050505] border border-[rgba(0,255,136,0.15)]">
                <img src={url} className="w-full h-full object-contain" alt="" />
                {i === 0 && <span className="absolute bottom-1.5 left-1.5 text-[9px] font-black text-[#00ff88] bg-black/60 px-1.5 py-0.5 rounded">обложка</span>}
              </div>
            ))}
          </div>
        )}
      </BottomSheet>

      <BottomSheet isOpen={showAddCustom} onClose={() => { setShowAddCustom(false); setCustomPhoto(null); setCustomCaption('') }} title="Добавить свой пост">
        <input ref={customPhotoRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleCustomPhotoFile} />
        {customPhoto ? (
          <div className="relative rounded-[14px] overflow-hidden border border-[rgba(0,255,136,0.2)] bg-black flex items-center justify-center">
            <img src={customPhoto} className="max-w-full max-h-[45vh] w-auto h-auto block" alt="" />
            <button onClick={() => setCustomPhoto(null)} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 border border-[rgba(255,80,80,0.4)] flex items-center justify-center text-[14px] text-[rgba(255,80,80,0.8)]">×</button>
          </div>
        ) : (
          <button onClick={() => customPhotoRef.current?.click()} className="flex flex-col items-center justify-center gap-3 w-full py-10 rounded-[14px] border-2 border-dashed border-[rgba(0,255,136,0.25)] bg-[rgba(0,255,136,0.02)] hover:bg-[rgba(0,255,136,0.06)] transition-all">
            <IconUpload size={24} color="#00ff88" /><span className="text-[13px] font-bold text-[rgba(0,255,136,0.8)]">Выбрать фото или видео</span>
          </button>
        )}
        <div>
          <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,136,0.55)] mb-2">Описание</p>
          <textarea value={customCaption} onChange={e => setCustomCaption(e.target.value)} placeholder="Напиши описание вручную..." rows={4}
            className="w-full bg-[#080808] border border-[rgba(0,255,136,0.2)] rounded-[12px] px-4 py-3 text-[13px] text-white resize-none outline-none focus:border-[rgba(0,255,136,0.5)] transition-all" />
        </div>
        <Button fullWidth disabled={!customPhoto && !customCaption.trim()} onClick={saveCustomPost}><IconCheck size={17} /> Добавить в готовые посты</Button>
      </BottomSheet>

      <BottomSheet isOpen={!!editingPost} onClose={() => setEditingPost(null)} title="Редактировать пост">
        <div className="flex flex-col gap-3">
          <div>
            <SL>Описание</SL>
            <textarea value={editCaption} onChange={e => setEditCaption(e.target.value)} rows={4}
              className="w-full bg-[#080808] border border-[rgba(0,255,136,0.2)] rounded-[12px] px-4 py-3 text-[13px] text-white resize-none outline-none focus:border-[rgba(0,255,136,0.5)] transition-all" />
          </div>
          {editingPost?.cat === 'paid' && (
            <div>
              <SL><span className="inline-flex items-center gap-1">Цена (<IconStar size={9} color="rgba(0,255,136,0.6)" /> Stars)</span></SL>
              <input type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)} placeholder="250" min="1" style={{ colorScheme: 'dark' }}
                className="w-full bg-[#080808] border border-[rgba(0,255,136,0.2)] rounded-[12px] px-4 py-3 text-[14px] text-white outline-none focus:border-[rgba(0,255,136,0.5)] transition-all" />
            </div>
          )}
          <Button fullWidth onClick={saveEdit}><IconCheck size={17} /> Сохранить</Button>
        </div>
      </BottomSheet>
    </div>
  )
}
