import { useState, useRef } from 'react'
import { type ReactNode } from 'react'
import { useApp } from '../../store/app'
import { IconBack, IconZap, IconPlus, IconCheck, IconUpload } from '../../components/Icons'
import Button from '../../components/Button'
import BottomSheet from '../../components/BottomSheet'
import Input from '../../components/Input'
import type { ReadyPost } from '../../types'

type Category = 'free' | 'paid' | 'fix'
interface CatPost { post: ReadyPost; price?: number }
interface PlanPost { id: string; date: string; time: string; category: Category; editing: boolean }

const CAT_INFO: Record<Category, { label: string; emoji: string; desc: string }> = {
  free: { label: 'Обычный', emoji: '📸', desc: 'Бесплатный контент' },
  paid: { label: 'Платный', emoji: '💎', desc: 'PPV — платный контент' },
  fix:  { label: 'Фикс пост', emoji: '📌', desc: 'Закреплённый пост' },
}
const TIMES = ['09:00','11:30','13:00','15:30','17:00','19:00','20:30','22:00']

function SL({ children }: { children: ReactNode }) {
  return <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,136,0.55)] mb-2">{children}</p>
}

export default function AutoPostSchedule() {
  const { goBack, bots, readyPosts, setReadyPosts, uploads, setUploads, gallery } = useApp()

  const [channelName, setChannelName] = useState('')
  const [botId, setBotId] = useState(bots[0]?.id ?? '')
  const [setupDone, setSetupDone] = useState(false)

  const [catPosts, setCatPosts] = useState<Record<Category, CatPost[]>>({ free: [], paid: [], fix: [] })
  const [postsPerDay, setPostsPerDay] = useState(2)
  const [sequence, setSequence] = useState<Category[]>(['free', 'paid'])
  const [startDate, setStartDate] = useState('')
  const [plan, setPlan] = useState<PlanPost[] | null>(null)
  const [planLoading, setPlanLoading] = useState(false)
  const [autoActive, setAutoActive] = useState(false)

  const [editingPost, setEditingPost] = useState<{ postId: string; cat: Category } | null>(null)
  const [editCaption, setEditCaption] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [pickerCat, setPickerCat] = useState<Category | null>(null)
  const [pickerSource, setPickerSource] = useState<'ready' | 'storage' | 'device'>('ready')
  const deviceInputRef = useRef<HTMLInputElement>(null)

  const connectedBot = bots.find(b => b.id === botId)

  const generatePlan = async () => {
    if (!startDate || sequence.length === 0) return
    setPlanLoading(true)
    await new Promise(r => setTimeout(r, 1300))
    const base = new Date(startDate)
    const total = Object.values(catPosts).flat().length
    const days = Math.max(7, total > 0 ? Math.ceil(total / postsPerDay) : 7)
    const items: PlanPost[] = []
    let si = 0
    for (let d = 0; d < days; d++) {
      const day = new Date(base); day.setDate(base.getDate() + d)
      const label = day.toLocaleDateString('ru', { day: 'numeric', month: 'short', weekday: 'short' })
      const times = [...TIMES].sort(() => Math.random() - 0.5).slice(0, postsPerDay).sort()
      for (let p = 0; p < postsPerDay; p++) {
        items.push({ id: `${d}-${p}`, date: label, time: times[p] ?? '12:00', category: sequence[si % sequence.length], editing: false })
        si++
      }
    }
    setPlan(items); setPlanLoading(false)
  }

  const openEdit = (postId: string, cat: Category) => {
    const cp = catPosts[cat].find(x => x.post.id === postId)
    if (!cp) return
    setEditingPost({ postId, cat }); setEditCaption(cp.post.caption); setEditPrice(cp.price?.toString() ?? '')
  }

  const saveEdit = () => {
    if (!editingPost) return
    const { postId, cat } = editingPost
    setCatPosts(prev => ({
      ...prev,
      [cat]: prev[cat].map(cp => cp.post.id === postId
        ? { ...cp, post: { ...cp.post, caption: editCaption }, price: editPrice ? Number(editPrice) : undefined }
        : cp),
    }))
    setEditingPost(null)
  }

  const addFromReady = (post: ReadyPost, cat: Category) => {
    setCatPosts(prev => ({ ...prev, [cat]: [...prev[cat], { post }] }))
    setPickerCat(null)
  }

  const addFromUrl = (url: string, cat: Category) => {
    const post: ReadyPost = { id: Date.now().toString(), url, caption: '', createdAt: new Date().toLocaleDateString('ru') }
    setCatPosts(prev => ({ ...prev, [cat]: [...prev[cat], { post }] }))
    setPickerCat(null)
  }

  const handleDeviceFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !pickerCat) return
    const url = URL.createObjectURL(file)
    setUploads([url, ...uploads])
    addFromUrl(url, pickerCat)
    e.target.value = ''
  }

  const removeFromCat = (cat: Category, postId: string) =>
    setCatPosts(prev => ({ ...prev, [cat]: prev[cat].filter(x => x.post.id !== postId) }))

  // Setup gate
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
            <p className="text-[12px] font-bold text-amber-400 mb-1.5">⚠️ Обязательно</p>
            <p className="text-[12px] text-[rgba(255,255,255,0.5)] leading-relaxed">
              Добавь нашего бота как <span className="text-white font-bold">администратора</span> в канал с правом публикации постов. Без этого автопостинг не запустится.
            </p>
            {connectedBot && <p className="text-[11px] text-amber-400 mt-2 font-bold">Добавь: {connectedBot.handle}</p>}
          </div>
          <div>
            <SL>Бот для постинга</SL>
            <div className="flex flex-col gap-1.5">
              {bots.map(b => (
                <button key={b.id} onClick={() => setBotId(b.id)}
                  className={`flex items-center gap-3 p-3 rounded-[12px] border transition-all text-left ${botId === b.id ? 'border-[rgba(0,255,136,0.4)] bg-[rgba(0,255,136,0.06)]' : 'border-[rgba(0,255,136,0.1)] hover:border-[rgba(0,255,136,0.25)]'}`}>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${b.isActive ? 'bg-[#00ff88]' : 'bg-[rgba(255,255,255,0.2)]'}`} style={b.isActive ? { boxShadow: '0 0 5px rgba(0,255,136,1)' } : {}} />
                  <span className="text-[13px] font-bold flex-1">{b.name}</span>
                  <span className="text-[11px] text-[rgba(255,255,255,0.3)]">{b.handle}</span>
                  {botId === b.id && <IconCheck size={13} color="#00ff88" />}
                </button>
              ))}
            </div>
          </div>
          <Button fullWidth disabled={!channelName.trim() || !botId} onClick={() => setSetupDone(true)}>
            <IconCheck size={17} /> Сохранить и продолжить →
          </Button>
        </div>
      </div>
    )
  }

  // Main content
  return (
    <div className="flex flex-col gap-5 pt-4">
      <div className="flex items-center gap-3 px-5">
        <button onClick={goBack} className="w-9 h-9 rounded-full bg-[rgba(0,255,136,0.06)] border border-[rgba(0,255,136,0.2)] flex items-center justify-center hover:bg-[rgba(0,255,136,0.12)] transition-colors">
          <IconBack size={20} color="#00ff88" />
        </button>
        <div className="flex-1">
          <p className="text-[9px] font-black uppercase tracking-[2px] text-[rgba(0,255,136,0.5)]">Посты + Автопостинг</p>
          <h1 className="text-[20px] font-black tracking-tight">Автопостинг</h1>
        </div>
        <button onClick={() => setSetupDone(false)} className="text-[10px] text-[rgba(0,255,136,0.5)] hover:text-[#00ff88] transition-colors">{channelName} ✎</button>
      </div>

      {/* ── Готовые посты ── */}
      <div className="px-5">
        <div className="flex items-center justify-between mb-3">
          <SL>Готовые посты ({readyPosts.length})</SL>
        </div>
        {readyPosts.length === 0 ? (
          <div className="p-4 bg-[#080808] border border-[rgba(0,255,136,0.08)] rounded-[14px] text-center">
            <p className="text-[13px] text-[rgba(255,255,255,0.3)]">Нет готовых постов — сначала сгенерируй описания</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {readyPosts.map(post => (
              <div key={post.id} className="flex gap-3 p-3 bg-[#080808] border border-[rgba(0,255,136,0.1)] rounded-[14px]">
                <img src={post.url} className="w-14 h-14 rounded-[10px] object-cover flex-shrink-0" alt="" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-[rgba(255,255,255,0.6)] leading-snug line-clamp-2">{post.caption}</p>
                  <p className="text-[10px] text-[rgba(255,255,255,0.25)] mt-0.5">{post.createdAt}</p>
                </div>
                <button onClick={() => setReadyPosts(readyPosts.filter(x => x.id !== post.id))} className="text-[rgba(255,80,80,0.5)] hover:text-[rgba(255,80,80,0.9)] transition-colors text-[16px] self-start">×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Категории ── */}
      <div className="px-5 flex flex-col gap-3">
        <SL>Категории постов</SL>
        {(['free', 'paid', 'fix'] as Category[]).map(cat => {
          const info = CAT_INFO[cat]; const cps = catPosts[cat]
          return (
            <div key={cat} className="p-4 bg-[#080808] border border-[rgba(0,255,136,0.1)] rounded-[16px]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2"><span className="text-[18px]">{info.emoji}</span><div><p className="text-[13px] font-bold">{info.label}</p><p className="text-[10px] text-[rgba(255,255,255,0.3)]">{info.desc} · {cps.length} постов</p></div></div>
                <button onClick={() => { setPickerCat(cat); setPickerSource('ready') }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-[9px] border border-[rgba(0,255,136,0.25)] hover:bg-[rgba(0,255,136,0.07)] text-[11px] font-bold text-[rgba(0,255,136,0.7)] transition-all">
                  <IconPlus size={11} color="rgba(0,255,136,0.7)" /> Добавить
                </button>
              </div>
              {cps.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {cps.map(cp => (
                    <div key={cp.post.id} className="flex items-center gap-2 p-2 bg-[rgba(0,255,136,0.03)] border border-[rgba(0,255,136,0.08)] rounded-[10px]">
                      <img src={cp.post.url} className="w-8 h-8 rounded-[6px] object-cover flex-shrink-0" alt="" />
                      <p className="flex-1 text-[11px] text-[rgba(255,255,255,0.5)] truncate">{cp.post.caption}</p>
                      {cp.price && <span className="text-[10px] font-black text-amber-400">⭐{cp.price}</span>}
                      <button onClick={() => openEdit(cp.post.id, cat)} className="text-[10px] text-[rgba(0,255,136,0.6)] hover:text-[#00ff88]">✎</button>
                      <button onClick={() => removeFromCat(cat, cp.post.id)} className="text-[rgba(255,80,80,0.5)] hover:text-[rgba(255,80,80,0.9)] text-[14px]">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Расписание ── */}
      <div className="px-5 flex flex-col gap-4">
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
              : sequence.map((cat, i) => <span key={i} className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-[rgba(0,255,136,0.07)] border border-[rgba(0,255,136,0.25)] text-[#00ff88]">{i+1}. {CAT_INFO[cat].emoji} {CAT_INFO[cat].label}</span>)}
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
        {!plan ? (
          <Button fullWidth disabled={!startDate || sequence.length === 0 || planLoading} onClick={generatePlan}>
            {planLoading ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />Создаю план...</span> : <><IconZap size={17} /> Создать план AI</>}
          </Button>
        ) : (
          <>
            <div>
              <div className="flex items-center justify-between mb-2"><SL>План ({plan.length} постов)</SL><button onClick={() => { setPlan(null); setAutoActive(false) }} className="text-[10px] text-[rgba(255,255,255,0.3)] hover:text-white transition-colors -mt-2">Пересоздать</button></div>
              <div className="flex flex-col gap-1.5">
                {plan.map(post => (
                  <div key={post.id} className="flex items-center gap-3 p-3 bg-[#080808] border border-[rgba(0,255,136,0.08)] rounded-[12px]">
                    <span className="text-[15px] flex-shrink-0">{CAT_INFO[post.category].emoji}</span>
                    <div className="flex-1 min-w-0"><p className="text-[12px] font-bold">{post.date}</p><p className="text-[10px] text-[rgba(255,255,255,0.35)]">{CAT_INFO[post.category].label}</p></div>
                    {post.editing ? (
                      <input type="time" defaultValue={post.time} autoFocus onBlur={e => setPlan(p => p ? p.map(x => x.id === post.id ? { ...x, time: e.target.value, editing: false } : x) : p)} style={{ colorScheme: 'dark' }}
                        className="bg-transparent border border-[rgba(0,255,136,0.4)] rounded-[8px] px-2 py-1 text-[12px] text-[#00ff88] outline-none w-[76px]" />
                    ) : (
                      <button onClick={() => setPlan(p => p ? p.map(x => x.id === post.id ? { ...x, editing: true } : x) : p)} className="text-[12px] font-bold text-[rgba(0,255,136,0.7)] hover:text-[#00ff88] transition-colors w-[46px] text-right">{post.time}</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <Button fullWidth onClick={() => setAutoActive(v => !v)}>
              {autoActive ? <><IconCheck size={17} /> Автопостинг активен</> : <><IconZap size={17} /> Запустить автопостинг</>}
            </Button>
            {autoActive && (
              <div className="flex items-center gap-2 p-3 bg-[rgba(0,255,136,0.06)] border border-[rgba(0,255,136,0.25)] rounded-[12px]">
                <span className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse flex-shrink-0" style={{ boxShadow: '0 0 6px rgba(0,255,136,1)' }} />
                <p className="text-[12px] font-bold text-[rgba(0,255,136,0.85)]">AI публикует в {channelName} по расписанию</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Category picker sheet */}
      <BottomSheet isOpen={!!pickerCat} onClose={() => setPickerCat(null)} title={pickerCat ? `Добавить в "${CAT_INFO[pickerCat].label}"` : ''}>
        <input ref={deviceInputRef} type="file" accept="image/*" className="hidden" onChange={handleDeviceFile} />
        {/* Source tabs */}
        <div className="flex gap-1.5 -mt-1">
          {(['ready', 'storage', 'device'] as const).map(src => (
            <button key={src} onClick={() => setPickerSource(src)}
              className={`flex-1 py-2 rounded-[10px] text-[10px] font-black border transition-all
                ${pickerSource === src ? 'bg-[#00ff88] border-[#00ff88] text-black' : 'border-[rgba(0,255,136,0.2)] text-[rgba(255,255,255,0.4)] hover:border-[rgba(0,255,136,0.4)]'}`}>
              {src === 'ready' ? '📋 Готовые' : src === 'storage' ? '🗂 Хранилище' : '📱 Устройство'}
            </button>
          ))}
        </div>

        {pickerSource === 'ready' && (
          <div className="flex flex-col gap-2">
            {readyPosts.length === 0
              ? <p className="text-[12px] text-[rgba(255,255,255,0.3)] text-center py-4">Нет готовых постов — сначала сгенерируй описания</p>
              : readyPosts.map(post => (
                <button key={post.id} onClick={() => pickerCat && addFromReady(post, pickerCat)}
                  className="flex gap-3 p-3 bg-[rgba(0,255,136,0.04)] border border-[rgba(0,255,136,0.12)] rounded-[12px] text-left hover:border-[rgba(0,255,136,0.35)] transition-all">
                  <img src={post.url} className="w-12 h-12 rounded-[8px] object-cover flex-shrink-0" alt="" />
                  <div className="flex-1 min-w-0"><p className="text-[12px] text-[rgba(255,255,255,0.7)] leading-snug line-clamp-3">{post.caption}</p></div>
                </button>
              ))
            }
          </div>
        )}

        {pickerSource === 'storage' && (() => {
          const storagePhotos = [...uploads, ...gallery.map(g => g.url)]
          return storagePhotos.length === 0
            ? <p className="text-[12px] text-[rgba(255,255,255,0.3)] text-center py-4">Хранилище пусто — загрузи фото через устройство</p>
            : <div className="grid grid-cols-3 gap-2">
                {storagePhotos.map((url, i) => (
                  <button key={i} onClick={() => pickerCat && addFromUrl(url, pickerCat)}
                    className="aspect-[3/4] rounded-[10px] overflow-hidden border-2 border-transparent hover:border-[#00ff88] bg-[#050505] transition-all">
                    <img src={url} className="w-full h-full object-contain" alt="" />
                  </button>
                ))}
              </div>
        })()}

        {pickerSource === 'device' && (
          <button onClick={() => deviceInputRef.current?.click()}
            className="flex items-center justify-center gap-2 w-full py-10 rounded-[14px] border-2 border-dashed border-[rgba(0,255,136,0.3)] bg-[rgba(0,255,136,0.03)] hover:bg-[rgba(0,255,136,0.07)] transition-all">
            <IconUpload size={22} color="#00ff88" />
            <span className="text-[14px] font-bold text-[#00ff88]">Загрузить с телефона</span>
          </button>
        )}
      </BottomSheet>

      {/* Edit post sheet */}
      <BottomSheet isOpen={!!editingPost} onClose={() => setEditingPost(null)} title="Редактировать пост">
        <div className="flex flex-col gap-3">
          <div>
            <SL>Описание</SL>
            <textarea value={editCaption} onChange={e => setEditCaption(e.target.value)} rows={4}
              className="w-full bg-[#080808] border border-[rgba(0,255,136,0.2)] rounded-[12px] px-4 py-3 text-[13px] text-white resize-none outline-none focus:border-[rgba(0,255,136,0.5)] transition-all" />
          </div>
          {editingPost?.cat === 'paid' && (
            <div>
              <SL>Цена (⭐ Stars)</SL>
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
