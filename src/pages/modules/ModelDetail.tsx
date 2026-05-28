import { useState, useRef } from 'react'
import { useApp } from '../../store/app'
import { IconBack, IconPlus, IconCheck, IconTrash, IconRefresh, IconImage } from '../../components/Icons'
import Button from '../../components/Button'

type GenStatus = 'idle' | 'processing' | 'done'

const STORAGE_TEMPLATES = [
  { id: 't1', url: 'https://picsum.photos/seed/beach1/200/260', label: 'Пляж' },
  { id: 't2', url: 'https://picsum.photos/seed/studio2/200/260', label: 'Студия' },
  { id: 't3', url: 'https://picsum.photos/seed/city3/200/260', label: 'Город' },
  { id: 't4', url: 'https://picsum.photos/seed/luxury4/200/260', label: 'Luxury' },
  { id: 't5', url: 'https://picsum.photos/seed/nature5/200/260', label: 'Природа' },
  { id: 't6', url: 'https://picsum.photos/seed/office6/200/260', label: 'Офис' },
]

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-[#00ff88] text-[10px]" style={{ textShadow: '0 0 8px rgba(0,255,136,0.9)' }}>◆</span>
      <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.38)]">{children}</p>
    </div>
  )
}

export default function ModelDetail() {
  const { goBack, models, selectedModelId, bots, setBots, gallery, setGallery, uploads, setUploads, navigate } = useApp()

  const model = models.find(m => m.id === selectedModelId)

  // Bot connection
  const [connectedBotId, setConnectedBotId] = useState<string>(bots[0]?.id ?? '')

  // Photo source: own photos (4 slots) or templates (multi-select)
  type PhotoSource = 'own' | 'templates'
  const [source, setSource] = useState<PhotoSource>('own')

  // Own photo slots
  const [ownPhotos, setOwnPhotos] = useState<(string | null)[]>([null, null, null, null])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingSlot, setPendingSlot] = useState<number | null>(null)

  // Selected templates (multi-select)
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([])

  // Generation state
  const [genStatus, setGenStatus] = useState<GenStatus>('idle')
  const [genProgress, setGenProgress] = useState(0)
  const [results, setResults] = useState<string[]>([])
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())

  if (!model) return null

  const modelGallery = gallery.filter(g => g.modelId === model.id)

  const openSlotPicker = (idx: number) => {
    setPendingSlot(idx)
    fileInputRef.current?.click()
  }
  const handleSlotFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || pendingSlot === null) return
    const reader = new FileReader()
    reader.onload = ev => {
      const url = ev.target?.result as string
      setOwnPhotos(p => p.map((v, i) => i === pendingSlot ? url : v))
      setUploads([url, ...uploads])
    }
    reader.readAsDataURL(file)
    e.target.value = ''
    setPendingSlot(null)
  }
  const removeOwnPhoto = (idx: number) => setOwnPhotos(p => p.map((v, i) => i === idx ? null : v))

  const toggleTemplate = (id: string) => {
    setSelectedTemplates(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const photoCount = source === 'own'
    ? ownPhotos.filter(Boolean).length
    : selectedTemplates.length

  const canGenerate = genStatus === 'idle' && photoCount > 0

  const generate = async () => {
    setGenStatus('processing')
    setResults([])
    for (let i = 0; i <= 100; i += 5) {
      await new Promise(r => setTimeout(r, 120))
      setGenProgress(i)
    }
    const generated = Array.from({ length: photoCount }, (_, i) =>
      `https://picsum.photos/seed/gen${Date.now() + i * 7}/400/520`
    )
    setResults(generated)
    setGenStatus('done')
  }

  const reset = () => {
    setGenStatus('idle')
    setGenProgress(0)
    setResults([])
    setSavedIds(new Set())
  }

  const saveAll = () => {
    const newPhotos = results.map((url, i) => ({
      id: `${Date.now()}-${i}`,
      modelId: model.id,
      modelName: model.name,
      url,
      createdAt: new Date().toLocaleDateString('ru'),
    }))
    setGallery([...gallery, ...newPhotos])
    setSavedIds(new Set(results))
    reset()
  }

  const saveOne = (url: string, resultIdx: number) => {
    if (savedIds.has(url)) return
    setGallery([...gallery, {
      id: `${Date.now()}-${resultIdx}`,
      modelId: model.id,
      modelName: model.name,
      url,
      createdAt: new Date().toLocaleDateString('ru'),
    }])
    setSavedIds(prev => new Set([...prev, url]))
  }

  const connectedBot = bots.find(b => b.id === connectedBotId)
  const availableBots = bots.filter(b => b.modules.length === 0 || b.modules.includes('AI Models'))

  return (
    <div className="flex flex-col gap-5 pt-4">
      {/* Header */}
      <div className="flex items-center gap-3 px-5">
        <button onClick={goBack}
          className="w-9 h-9 rounded-full bg-[rgba(0,255,136,0.06)] border border-[rgba(0,255,136,0.2)] flex items-center justify-center hover:bg-[rgba(0,255,136,0.12)] transition-colors">
          <IconBack size={20} color="#00ff88" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[2px] text-[rgba(0,255,136,0.5)]">AI Модель</p>
          <h1 className="text-[20px] font-black tracking-tight truncate">{model.name}</h1>
        </div>
        {model.previewUrl && (
          <div className="w-10 h-10 rounded-[12px] overflow-hidden border border-[rgba(0,255,136,0.3)] flex-shrink-0">
            <img src={model.previewUrl} className="w-full h-full object-cover" alt="" />
          </div>
        )}
      </div>

      {/* ── Генерация фото ── */}
      <div className="px-5">
        <SectionLabel>Генерация фото</SectionLabel>

        {/* Source toggle */}
        <div className="flex gap-2 mb-4">
          <button onClick={() => setSource('own')}
            className={`flex-1 py-2.5 rounded-[12px] text-[12px] font-bold border transition-all duration-200
              ${source === 'own'
                ? 'border-[#00ff88] bg-[rgba(0,255,136,0.08)] text-[#00ff88]'
                : 'border-[rgba(0,255,136,0.15)] text-[rgba(255,255,255,0.45)] hover:border-[rgba(0,255,136,0.3)]'}`}>
            Свои фото
          </button>
          <button onClick={() => setSource('templates')}
            className={`flex-1 py-2.5 rounded-[12px] text-[12px] font-bold border transition-all duration-200
              ${source === 'templates'
                ? 'border-[#00ff88] bg-[rgba(0,255,136,0.08)] text-[#00ff88]'
                : 'border-[rgba(0,255,136,0.15)] text-[rgba(255,255,255,0.45)] hover:border-[rgba(0,255,136,0.3)]'}`}>
            Шаблоны
          </button>
        </div>

        {/* Own photos grid */}
        {source === 'own' && genStatus === 'idle' && (
          <>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleSlotFile} />
            <p className="text-[11px] text-[rgba(255,255,255,0.3)] mb-3">Добавь свои фото — каждое будет отдельной генерацией</p>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {ownPhotos.map((photo, idx) => (
                <div key={idx} className="aspect-[3/4] relative">
                  {photo ? (
                    <div className="w-full h-full rounded-[12px] overflow-hidden border border-[rgba(0,255,136,0.3)] relative bg-[#050505]">
                      <img src={photo} className="w-full h-full object-contain" alt="" />
                      <button onClick={() => removeOwnPhoto(idx)}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center">
                        <IconTrash size={10} color="#00ff88" />
                      </button>
                      <div className="absolute bottom-1 left-1 w-4 h-4 rounded-full bg-[#00ff88] flex items-center justify-center"
                        style={{ boxShadow: '0 0 5px rgba(0,255,136,0.8)' }}>
                        <IconCheck size={9} color="black" />
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => openSlotPicker(idx)}
                      className="w-full h-full rounded-[12px] border-2 border-dashed border-[rgba(0,255,136,0.15)] bg-[#080808]
                        hover:border-[rgba(0,255,136,0.4)] hover:bg-[rgba(0,255,136,0.04)] transition-all duration-200
                        flex flex-col items-center justify-center gap-1">
                      <div className="w-7 h-7 rounded-full bg-[rgba(0,255,136,0.07)] flex items-center justify-center">
                        <IconPlus size={14} color="rgba(0,255,136,0.4)" />
                      </div>
                      <p className="text-[9px] text-[rgba(255,255,255,0.2)]">Фото {idx + 1}</p>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Templates grid */}
        {source === 'templates' && genStatus === 'idle' && (
          <>
            <p className="text-[11px] text-[rgba(255,255,255,0.3)] mb-3">Выбери шаблоны — AI применит твою модель к каждому</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {STORAGE_TEMPLATES.map(t => {
                const selected = selectedTemplates.includes(t.id)
                return (
                  <button key={t.id} onClick={() => toggleTemplate(t.id)}
                    className={`relative aspect-[3/4] rounded-[10px] overflow-hidden border-2 transition-all duration-150
                      ${selected ? 'border-[#00ff88]' : 'border-transparent'}`}
                    style={selected ? { boxShadow: '0 0 10px rgba(0,255,136,0.4)' } : {}}>
                    <img src={t.url} className="w-full h-full object-cover" alt={t.label} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <span className="absolute bottom-1.5 left-0 right-0 text-center text-[9px] font-black text-white">{t.label}</span>
                    {selected && (
                      <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#00ff88] flex items-center justify-center">
                        <IconCheck size={10} color="black" />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        )}

        {/* Progress */}
        {genStatus === 'processing' && (
          <div className="p-4 bg-[#080808] border border-[rgba(0,255,136,0.2)] rounded-[14px] mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[13px] font-bold">Генерация {photoCount} фото...</p>
              <p className="text-[13px] font-black text-[#00ff88]"
                style={{ textShadow: '0 0 8px rgba(0,255,136,0.5)' }}>{genProgress}%</p>
            </div>
            <div className="h-[3px] bg-[rgba(0,255,136,0.08)] rounded-full overflow-hidden">
              <div className="h-full bg-[#00ff88] rounded-full transition-all duration-200"
                style={{ width: `${genProgress}%`, boxShadow: '0 0 8px rgba(0,255,136,0.7)' }} />
            </div>
            <p className="text-[11px] text-[rgba(255,255,255,0.28)] mt-2">AI рендер + FaceSwap…</p>
          </div>
        )}

        {/* Results */}
        {genStatus === 'done' && results.length > 0 && (
          <div className="mb-4">
            <p className="text-[11px] font-black uppercase tracking-[1px] text-[rgba(0,255,136,0.5)] mb-2">
              Готово — {results.length} фото
            </p>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {results.map((url, i) => {
                const saved = savedIds.has(url)
                return (
                  <div key={i} className="relative aspect-[3/4] rounded-[12px] overflow-hidden border border-[rgba(0,255,136,0.2)] bg-[#050505]">
                    <img src={url} className="w-full h-full object-contain" alt="" />
                    <button onClick={() => saveOne(url, i)}
                      className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center border transition-all
                        ${saved
                          ? 'bg-[#00ff88] border-[#00ff88]'
                          : 'bg-black/60 border-[rgba(0,255,136,0.5)] hover:bg-[rgba(0,255,136,0.2)]'}`}>
                      <IconCheck size={11} color={saved ? 'black' : '#00ff88'} />
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={reset}>
                <IconRefresh size={16} />
                Заново
              </Button>
              <Button className="flex-1" onClick={saveAll}
                disabled={savedIds.size === results.length}>
                <IconCheck size={16} />
                {savedIds.size === results.length ? 'Сохранено' : `Сохранить все (${results.length})`}
              </Button>
            </div>
          </div>
        )}

        {/* Generate button */}
        {genStatus === 'idle' && (
          <Button fullWidth disabled={!canGenerate} onClick={generate}>
            Сгенерировать {photoCount > 0 ? `(${photoCount} фото)` : ''}
          </Button>
        )}
      </div>

      {/* ── Хранилище модели ── */}
      <div className="px-5">
        <SectionLabel>Хранилище модели</SectionLabel>
        {modelGallery.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center bg-[#080808] border border-[rgba(0,255,136,0.08)] rounded-[16px]">
            <IconImage size={32} color="rgba(0,255,136,0.25)" />
            <p className="text-[13px] text-[rgba(255,255,255,0.3)]">Здесь будут сгенерированные фото</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {modelGallery.map(g => (
              <div key={g.id} className="aspect-[3/4] rounded-[12px] overflow-hidden border border-[rgba(0,255,136,0.15)] bg-[#050505]">
                <img src={g.url} className="w-full h-full object-contain" alt="" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Подключённый бот ── */}
      <div className="px-5">
        <SectionLabel>Подключённый бот</SectionLabel>
        {availableBots.length === 0 ? (
          <div className="p-3 bg-[rgba(251,191,36,0.05)] border border-[rgba(251,191,36,0.2)] rounded-[12px]">
            <p className="text-[12px] text-amber-400 font-bold mb-1">Нет доступных ботов</p>
            <p className="text-[11px] text-[rgba(255,255,255,0.4)]">Все боты заняты. <button onClick={() => navigate('bots')} className="text-[rgba(0,255,136,0.7)] underline">Перейди в Боты</button> и сбрось нужный.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {availableBots.map(b => (
              <button key={b.id} onClick={() => {
                setConnectedBotId(b.id)
                setBots(bots.map(x => x.id === b.id ? { ...x, modules: [...new Set([...x.modules, 'AI Models'])] } : x))
              }}
                className={`flex items-center gap-3 p-3.5 rounded-[14px] border transition-all duration-150 text-left
                  ${connectedBotId === b.id
                    ? 'border-[rgba(0,255,136,0.4)] bg-[rgba(0,255,136,0.06)]'
                    : 'border-[rgba(0,255,136,0.1)] bg-[#080808] hover:border-[rgba(0,255,136,0.25)]'}`}>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${b.isActive ? 'bg-[#00ff88]' : 'bg-[rgba(255,255,255,0.2)]'}`}
                  style={b.isActive ? { boxShadow: '0 0 5px rgba(0,255,136,1)' } : {}} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold">{b.name}</p>
                  <p className="text-[11px] text-[rgba(255,255,255,0.28)]">{b.handle}</p>
                </div>
                {connectedBotId === b.id && (
                  <span className="text-[10px] font-black text-[#00ff88] bg-[rgba(0,255,136,0.08)] border border-[rgba(0,255,136,0.3)] rounded-full px-2.5 py-0.5 uppercase tracking-[0.5px]">
                    Активен
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        {connectedBot && (
          <p className="text-[11px] text-[rgba(255,255,255,0.3)] mt-2 pl-1">
            Фото из хранилища будут доступны в боте <span className="text-[rgba(0,255,136,0.6)]">{connectedBot.handle}</span>
          </p>
        )}
      </div>
    </div>
  )
}
