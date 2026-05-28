import { useState, useRef } from 'react'
import { useApp } from '../../store/app'
import { IconBack, IconZap, IconPlus, IconTrash, IconCheck, IconRefresh } from '../../components/Icons'
import Button from '../../components/Button'
import BottomSheet from '../../components/BottomSheet'

type Lang = 'en' | 'ru' | 'tr'
type Preset = 'hot' | 'romantic' | 'playful' | 'mystery' | 'custom'

const PRESETS: Record<Exclude<Preset,'custom'>, { label: string; emoji: string; text: Record<Lang,string> }> = {
  hot:     { label: 'Горячее описание', emoji: '🔥', text: { en: "You can't handle what's coming tonight 🔥 VIP drop — first come first served.", ru: "Ты не готов к тому, что будет ночью 🔥 Эксклюзив в VIP — кто первый, того и тапки.", tr: "Bu gece hazır değilsin 🔥 VIP'te özel içerik." } },
  romantic:{ label: 'Романтичное',      emoji: '💕', text: { en: "Every message makes my heart skip 💕 Thinking about you all day...", ru: "Каждое сообщение заставляет сердце биться 💕 Думала о тебе весь день...", tr: "Her mesaj kalbimi hızlandırıyor 💕 Seni bütün gün düşündüm..." } },
  playful: { label: 'Игривое',          emoji: '😏', text: { en: "Guess what I'm hiding tonight 😏 Tip to unlock the full set~", ru: "Угадай, что прячу 😏 Тип для доступа к полному сету~", tr: "Ne sakladığımı tahmin et 😏 Bugün tam sete erişim~" } },
  mystery: { label: 'Загадочное',       emoji: '✨', text: { en: "There's a version of me you haven't seen yet ✨ Tonight you find out.", ru: "Есть версия меня, которую ещё не видел ✨ Сегодня ночью узнаешь.", tr: "Henüz görmediğin bir ben var ✨ Bu gece öğreniyorsun." } },
}
function SL({ children }: { children: string }) {
  return <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,136,0.55)] mb-2">{children}</p>
}

export default function AutoPostCaptions() {
  const { goBack, gallery, uploads, setUploads, readyPosts, setReadyPosts, savedPrompts, setSavedPrompts, savedFooters, setSavedFooters } = useApp()

  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null)
  const [preset, setPreset] = useState<Preset>('hot')
  const [customText, setCustomText] = useState('')
  const [lang, setLang] = useState<Lang>('ru')
  const [caption, setCaption] = useState('')
  const [loading, setLoading] = useState(false)

  const [useFooter, setUseFooter] = useState(false)
  const [footerText, setFooterText] = useState('')
  const [gapLines, setGapLines] = useState(1)
  const [footerName, setFooterName] = useState('')
  const [showSaveFooter, setShowSaveFooter] = useState(false)

  const [promptName, setPromptName] = useState('')
  const [showSavePrompt, setShowSavePrompt] = useState(false)

  const [linkEntries, setLinkEntries] = useState([{ e1: '', text: '', url: '', e2: '' }])
  const [showLinkForm, setShowLinkForm] = useState(false)
  const [emojiId, setEmojiId] = useState('')

  const [showPhotoPicker, setShowPhotoPicker] = useState(false)
  const [showSavedPrompts, setShowSavedPrompts] = useState(false)
  const [showSavedFooters, setShowSavedFooters] = useState(false)
  const [isPackMode, setIsPackMode] = useState(false)
  const [packPhotos, setPackPhotos] = useState<string[]>([])
  const [pickerSelection, setPickerSelection] = useState<string[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)

  const openPicker = () => { setPickerSelection([]); setShowPhotoPicker(true) }

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const url = ev.target?.result as string
      setUploads([url, ...uploads])
      if (isPackMode) {
        setPackPhotos(p => [...p, url])
      } else {
        setSelectedPhoto(url)
        setShowPhotoPicker(false)
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const pickerPhotos = [...uploads, ...gallery.map(g => g.url)]

  const generate = async () => {
    setLoading(true)
    await new Promise(r => setTimeout(r, 1300))
    let text = preset === 'custom'
      ? `${customText}\n\n[AI сгенерировал описание на основе промпта]`
      : (PRESETS[preset as Exclude<Preset,'custom'>]?.text[lang] ?? '')
    if (useFooter && footerText.trim()) {
      const gap = '\n'.repeat(gapLines + 1)
      text = `${text}${gap}${footerText}`
    }
    setCaption(text)
    setLoading(false)
  }

  const insertLink = () => {
    const valid = linkEntries.filter(e => e.text.trim() && e.url.trim())
    if (!valid.length) return
    const chunk = valid.map(e => `[${e.e1}${e.text}${e.e2}](${e.url})`).join(' - ')
    setFooterText(t => t ? `${t}${chunk}` : chunk)
    setLinkEntries([{ e1: '', text: '', url: '', e2: '' }])
    setShowLinkForm(false)
  }

  const insertEmoji = () => {
    if (!emojiId.trim()) return
    setFooterText(t => `${t}![🔥](tg://emoji?id=${emojiId})`)
    setEmojiId('')
  }

  const savePrompt = () => {
    if (!promptName.trim() || !customText.trim()) return
    setSavedPrompts([...savedPrompts, { id: Date.now().toString(), name: promptName, text: customText }])
    setPromptName(''); setShowSavePrompt(false)
  }

  const saveFooter = () => {
    if (!footerName.trim() || !footerText.trim()) return
    setSavedFooters([...savedFooters, { id: Date.now().toString(), name: footerName, text: footerText, gapLines }])
    setFooterName(''); setShowSaveFooter(false)
  }

  const addToReady = () => {
    if (!caption) return
    if (isPackMode) {
      if (packPhotos.length === 0) return
      setReadyPosts([...readyPosts, { id: Date.now().toString(), url: packPhotos[0], extraUrls: packPhotos.slice(1), caption, createdAt: new Date().toLocaleDateString('ru') }])
      setCaption(''); setPackPhotos([])
    } else {
      if (!selectedPhoto) return
      setReadyPosts([...readyPosts, { id: Date.now().toString(), url: selectedPhoto, caption, createdAt: new Date().toLocaleDateString('ru') }])
      setCaption(''); setSelectedPhoto(null)
    }
  }

  return (
    <div className="flex flex-col gap-5 pt-4">
      <div className="flex items-center gap-3 px-5">
        <button onClick={goBack} className="w-9 h-9 rounded-full bg-[rgba(0,255,136,0.06)] border border-[rgba(0,255,136,0.2)] flex items-center justify-center hover:bg-[rgba(0,255,136,0.12)] transition-colors">
          <IconBack size={20} color="#00ff88" />
        </button>
        <div className="flex-1">
          <p className="text-[9px] font-black uppercase tracking-[2px] text-[rgba(0,255,136,0.5)]">Посты + Автопостинг</p>
          <h1 className="text-[20px] font-black tracking-tight">Генерация описаний</h1>
        </div>
      </div>

      <div className="px-5 flex flex-col gap-4">
        {/* Photo */}
        <div>
          <SL>Фото для поста</SL>
          <div className="flex gap-2 mb-2">
            <button onClick={() => { setIsPackMode(false); setPackPhotos([]); openPicker() }}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-[12px] border-2 border-dashed border-[rgba(0,255,136,0.22)] hover:border-[rgba(0,255,136,0.45)] bg-[rgba(0,255,136,0.02)] hover:bg-[rgba(0,255,136,0.06)] text-[12px] font-bold text-[rgba(255,255,255,0.45)] hover:text-[rgba(0,255,136,0.9)] transition-all">
              <IconPlus size={14} color="rgba(0,255,136,0.5)" /> Фото
            </button>
            <button onClick={() => { setIsPackMode(true); setSelectedPhoto(null); openPicker() }}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-[12px] border-2 border-dashed border-[rgba(0,255,136,0.22)] hover:border-[rgba(0,255,136,0.45)] bg-[rgba(0,255,136,0.02)] hover:bg-[rgba(0,255,136,0.06)] text-[12px] font-bold text-[rgba(255,255,255,0.45)] hover:text-[rgba(0,255,136,0.9)] transition-all">
              <IconPlus size={14} color="rgba(0,255,136,0.5)" /> Пак фото
            </button>
          </div>
          {selectedPhoto && !isPackMode && (
            <div className="relative w-24 h-32 rounded-[14px] overflow-hidden border border-[rgba(0,255,136,0.35)] bg-[#050505]">
              <img src={selectedPhoto} className="w-full h-full object-contain" alt="" />
              <button onClick={() => setSelectedPhoto(null)} className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center"><IconTrash size={9} color="#ff5555" /></button>
            </div>
          )}
          {isPackMode && packPhotos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {packPhotos.map((url, i) => (
                <div key={i} className="relative w-20 h-28 flex-shrink-0 rounded-[10px] overflow-hidden border border-[rgba(0,255,136,0.35)] bg-[#050505]">
                  <img src={url} className="w-full h-full object-contain" alt="" />
                  <button onClick={() => setPackPhotos(p => p.filter((_, j) => j !== i))} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center"><IconTrash size={8} color="#ff5555" /></button>
                  {i === 0 && <span className="absolute bottom-1 left-1 text-[8px] font-black text-[#00ff88] bg-black/60 px-1 rounded">обложка</span>}
                </div>
              ))}
              <button onClick={() => openPicker()}
                className="w-20 h-28 flex-shrink-0 rounded-[10px] border-2 border-dashed border-[rgba(0,255,136,0.15)] hover:border-[rgba(0,255,136,0.4)] bg-[#080808] flex flex-col items-center justify-center gap-1 transition-all">
                <IconPlus size={18} color="rgba(0,255,136,0.4)" />
                <p className="text-[9px] text-[rgba(255,255,255,0.2)]">Ещё</p>
              </button>
            </div>
          )}
        </div>

        {/* Prompt presets */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <SL>Готовый промпт</SL>
            {savedPrompts.length > 0 && (
              <button onClick={() => setShowSavedPrompts(true)} className="text-[10px] text-[rgba(0,255,136,0.55)] hover:text-[#00ff88] transition-colors -mt-2">Мои промпты →</button>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            {(Object.keys(PRESETS) as Exclude<Preset,'custom'>[]).map(id => {
              const p = PRESETS[id]
              return (
                <button key={id} onClick={() => setPreset(id)}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-[12px] border text-left transition-all ${preset === id ? 'border-[rgba(0,255,136,0.45)] bg-[rgba(0,255,136,0.07)]' : 'border-[rgba(0,255,136,0.1)] hover:border-[rgba(0,255,136,0.28)]'}`}>
                  <span className="text-[17px]">{p.emoji}</span>
                  <span className={`text-[13px] font-bold flex-1 ${preset === id ? 'text-[#00ff88]' : 'text-[rgba(255,255,255,0.65)]'}`}>{p.label}</span>
                  {preset === id && <IconCheck size={14} color="#00ff88" />}
                </button>
              )
            })}
            <button onClick={() => setPreset('custom')}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-[12px] border text-left transition-all ${preset === 'custom' ? 'border-[rgba(0,255,136,0.45)] bg-[rgba(0,255,136,0.07)]' : 'border-[rgba(0,255,136,0.1)] hover:border-[rgba(0,255,136,0.28)]'}`}>
              <span className="text-[17px]">✍️</span>
              <span className={`text-[13px] font-bold flex-1 ${preset === 'custom' ? 'text-[#00ff88]' : 'text-[rgba(255,255,255,0.65)]'}`}>Свой промпт</span>
              {preset === 'custom' && <IconCheck size={14} color="#00ff88" />}
            </button>
          </div>
          {preset === 'custom' && (
            <div className="mt-2">
              <textarea value={customText} onChange={e => setCustomText(e.target.value)} placeholder="Напиши свой промпт для AI..." rows={3}
                className="w-full bg-[#080808] border border-[rgba(0,255,136,0.2)] rounded-[12px] px-4 py-3 text-[13px] text-white resize-none outline-none focus:border-[rgba(0,255,136,0.5)] transition-all mb-2" />
              {!showSavePrompt ? (
                <button onClick={() => setShowSavePrompt(true)} className="text-[11px] text-[rgba(0,255,136,0.55)] hover:text-[#00ff88] transition-colors">+ Сохранить промпт</button>
              ) : (
                <div className="flex gap-2">
                  <input value={promptName} onChange={e => setPromptName(e.target.value)} placeholder="Название промпта..."
                    className="flex-1 bg-[#080808] border border-[rgba(0,255,136,0.2)] rounded-[10px] px-3 py-2 text-[12px] text-white outline-none focus:border-[rgba(0,255,136,0.5)] transition-all" />
                  <button onClick={savePrompt} className="px-3 py-2 rounded-[10px] bg-[#00ff88] text-black text-[12px] font-black">Сохранить</button>
                  <button onClick={() => setShowSavePrompt(false)} className="px-3 py-2 text-[rgba(255,255,255,0.35)] text-[12px]">✕</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Language */}
        <div>
          <SL>Язык</SL>
          <div className="flex gap-2">
            {(['en', 'ru', 'tr'] as Lang[]).map(l => (
              <button key={l} onClick={() => setLang(l)}
                className={`flex-1 py-2 rounded-[10px] text-[12px] font-bold border transition-all ${lang === l ? 'bg-[#00ff88] border-[#00ff88] text-black' : 'border-[rgba(0,255,136,0.2)] text-[rgba(255,255,255,0.5)] hover:border-[rgba(0,255,136,0.4)]'}`}>
                {l === 'en' ? 'English' : l === 'ru' ? 'Russian' : 'Turkish'}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <SL>Футер под описание</SL>
            <div className="flex items-center gap-2 -mt-2">
              {savedFooters.length > 0 && <button onClick={() => setShowSavedFooters(true)} className="text-[10px] text-[rgba(0,255,136,0.55)] hover:text-[#00ff88] transition-colors">Мои футеры</button>}
              <button onClick={() => setUseFooter(v => !v)}
                className={`relative w-10 h-5 rounded-full border transition-all ${useFooter ? 'bg-[#00ff88] border-[#00ff88]' : 'bg-[rgba(255,255,255,0.06)] border-[rgba(255,255,255,0.1)]'}`}
                style={useFooter ? { boxShadow: '0 0 8px rgba(0,255,136,0.4)' } : {}}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${useFooter ? 'left-5 bg-black' : 'left-0.5 bg-[rgba(255,255,255,0.4)]'}`} />
              </button>
            </div>
          </div>
          {useFooter && (
            <div className="flex flex-col gap-2">
              <textarea value={footerText} onChange={e => setFooterText(e.target.value)} placeholder="Текст футера..." rows={3}
                className="w-full bg-[#080808] border border-[rgba(0,255,136,0.2)] rounded-[12px] px-4 py-3 text-[12px] text-white resize-none outline-none focus:border-[rgba(0,255,136,0.5)] transition-all" />
              {/* Tools row */}
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => setShowLinkForm(v => !v)} className="px-3 py-1.5 rounded-[8px] border border-[rgba(0,255,136,0.2)] text-[11px] text-[rgba(0,255,136,0.7)] hover:bg-[rgba(0,255,136,0.07)] transition-all">🔗 Ссылка</button>
                <button onClick={() => setFooterText(t => t + '\n')} className="px-3 py-1.5 rounded-[8px] border border-[rgba(0,255,136,0.2)] text-[11px] text-[rgba(255,255,255,0.4)] hover:bg-[rgba(0,255,136,0.05)] transition-all">↵ Перенос</button>
              </div>
              {showLinkForm && (
                <div className="p-3 bg-[rgba(0,255,136,0.04)] border border-[rgba(0,255,136,0.15)] rounded-[12px] flex flex-col gap-3">
                  {linkEntries.map((entry, i) => (
                    <div key={i} className="flex flex-col gap-1.5">
                      {i > 0 && (
                        <div className="flex items-center gap-2 text-[rgba(255,255,255,0.2)] text-[10px] font-black pt-1 border-t border-[rgba(255,255,255,0.06)]">
                          <span>— ссылка {i + 1}</span>
                          <button onClick={() => setLinkEntries(es => es.filter((_, j) => j !== i))} className="ml-auto text-[rgba(255,80,80,0.5)] text-[12px] leading-none">✕</button>
                        </div>
                      )}
                      <div className="flex gap-1.5 items-center">
                        <input value={entry.e1} onChange={e => setLinkEntries(es => es.map((x, j) => j === i ? { ...x, e1: e.target.value } : x))}
                          placeholder="✍" className="w-10 bg-[#080808] border border-[rgba(0,255,136,0.2)] rounded-[8px] px-1 py-2 text-[14px] text-center text-white outline-none flex-shrink-0" />
                        <input value={entry.text} onChange={e => setLinkEntries(es => es.map((x, j) => j === i ? { ...x, text: e.target.value } : x))}
                          placeholder="Текст ссылки" className="flex-1 min-w-0 bg-[#080808] border border-[rgba(0,255,136,0.2)] rounded-[8px] px-3 py-2 text-[12px] text-white outline-none" />
                        <input value={entry.e2} onChange={e => setLinkEntries(es => es.map((x, j) => j === i ? { ...x, e2: e.target.value } : x))}
                          placeholder="✍" className="w-10 bg-[#080808] border border-[rgba(0,255,136,0.2)] rounded-[8px] px-1 py-2 text-[14px] text-center text-white outline-none flex-shrink-0" />
                      </div>
                      <input value={entry.url} onChange={e => setLinkEntries(es => es.map((x, j) => j === i ? { ...x, url: e.target.value } : x))}
                        placeholder="https://t.me/..." className="w-full bg-[#080808] border border-[rgba(0,255,136,0.2)] rounded-[8px] px-3 py-2 text-[12px] text-white outline-none" />
                    </div>
                  ))}
                  {linkEntries.some(e => e.text || e.url) && (
                    <p className="text-[10px] text-[rgba(0,255,136,0.65)] font-mono bg-[rgba(0,0,0,0.35)] rounded-[8px] px-2.5 py-2 break-all leading-relaxed">
                      {linkEntries.filter(e => e.text || e.url).map(e => `[${e.e1}${e.text}${e.e2}](${e.url})`).join(' - ')}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => setLinkEntries(es => [...es, { e1: '', text: '', url: '', e2: '' }])}
                      className="flex-1 py-2 rounded-[8px] border border-[rgba(0,255,136,0.2)] text-[11px] text-[rgba(0,255,136,0.7)] hover:bg-[rgba(0,255,136,0.06)] transition-all">
                      + Ещё ссылка
                    </button>
                    <button onClick={insertLink} className="flex-1 py-2 rounded-[8px] bg-[#00ff88] text-black text-[12px] font-black">Вставить</button>
                  </div>
                </div>
              )}
              {/* Animated emoji */}
              <div className="p-3 bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.06)] rounded-[12px]">
                <p className="text-[10px] font-bold text-[rgba(255,255,255,0.4)] mb-0.5">Premium анимированные emoji</p>
                <p className="text-[10px] text-[rgba(255,255,255,0.25)] mb-2">Узнай ID в <span className="text-[rgba(0,255,136,0.6)]">@GetStickerIDs_Bot</span> → вставляется как <span className="font-mono text-[rgba(0,255,136,0.5)]">![🔥](tg://emoji?id=…)</span></p>
                <p className="text-[9px] text-[rgba(255,255,100,0.45)] mb-2">⚠ Работает только вне ссылок — в полях emoji у ссылки используй обычные Unicode 🔥✍</p>
                <div className="flex gap-2">
                  <input value={emojiId} onChange={e => setEmojiId(e.target.value)} placeholder="ID emoji (напр. 5368324170671202286)"
                    className="flex-1 bg-[#080808] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-3 py-1.5 text-[11px] text-white outline-none" />
                  <button onClick={insertEmoji} className="px-3 py-1.5 rounded-[8px] bg-[rgba(0,255,136,0.1)] border border-[rgba(0,255,136,0.3)] text-[11px] font-bold text-[#00ff88]">Вставить</button>
                </div>
              </div>
              {/* Gap + save */}
              <div className="flex items-center gap-3">
                <p className="text-[11px] text-[rgba(255,255,255,0.4)]">Отступ между текстом и футером:</p>
                <div className="flex items-center gap-2 ml-auto">
                  <button onClick={() => setGapLines(g => Math.max(0, g-1))} className="w-7 h-7 rounded-full border border-[rgba(0,255,136,0.2)] text-[#00ff88] text-[14px] flex items-center justify-center hover:bg-[rgba(0,255,136,0.08)]">−</button>
                  <span className="text-[13px] font-black text-[#00ff88] w-4 text-center">{gapLines}</span>
                  <button onClick={() => setGapLines(g => Math.min(5, g+1))} className="w-7 h-7 rounded-full border border-[rgba(0,255,136,0.2)] text-[#00ff88] text-[14px] flex items-center justify-center hover:bg-[rgba(0,255,136,0.08)]">+</button>
                </div>
              </div>
              {!showSaveFooter ? (
                <button onClick={() => setShowSaveFooter(true)} className="text-[11px] text-[rgba(0,255,136,0.55)] hover:text-[#00ff88] transition-colors">+ Сохранить шаблон футера</button>
              ) : (
                <div className="flex gap-2">
                  <input value={footerName} onChange={e => setFooterName(e.target.value)} placeholder="Название шаблона..."
                    className="flex-1 bg-[#080808] border border-[rgba(0,255,136,0.2)] rounded-[10px] px-3 py-2 text-[12px] text-white outline-none focus:border-[rgba(0,255,136,0.5)] transition-all" />
                  <button onClick={saveFooter} className="px-3 py-2 rounded-[10px] bg-[#00ff88] text-black text-[12px] font-black">Сохранить</button>
                  <button onClick={() => setShowSaveFooter(false)} className="px-3 py-2 text-[rgba(255,255,255,0.35)] text-[12px]">✕</button>
                </div>
              )}
            </div>
          )}
        </div>

        <Button fullWidth onClick={generate} disabled={loading || (preset === 'custom' && !customText.trim())}>
          {loading ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />Генерирую...</span> : <><IconZap size={17} /> Сгенерировать описание</>}
        </Button>

        {caption && (
          <div>
            <SL>Результат</SL>
            <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={5}
              className="w-full bg-[#080808] border border-[rgba(0,255,136,0.2)] rounded-[14px] px-4 py-3 text-[13px] leading-relaxed text-white resize-none outline-none focus:border-[rgba(0,255,136,0.5)] transition-all mb-2" />
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => { setCaption(''); generate() }}><IconRefresh size={15} /> Другой</Button>
              <Button className="flex-1" onClick={addToReady} disabled={isPackMode ? packPhotos.length === 0 : !selectedPhoto}>
                <IconCheck size={15} /> В готовые посты
              </Button>
            </div>
            {(isPackMode ? packPhotos.length === 0 : !selectedPhoto) && <p className="text-[11px] text-[rgba(255,100,100,0.7)] mt-1.5">{isPackMode ? 'Добавь хотя бы одно фото в пак' : 'Выбери фото выше, чтобы добавить в готовые посты'}</p>}
          </div>
        )}
      </div>

      {/* Photo picker sheet */}
      <BottomSheet isOpen={showPhotoPicker} onClose={() => setShowPhotoPicker(false)} title={isPackMode ? 'Выбрать фото (пак)' : 'Выбрать фото'}>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
        <button onClick={() => fileInputRef.current?.click()}
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-[14px] border-2 border-dashed border-[rgba(0,255,136,0.35)] bg-[rgba(0,255,136,0.04)] hover:bg-[rgba(0,255,136,0.08)] transition-all mb-3">
          <IconPlus size={18} color="#00ff88" />
          <span className="text-[13px] font-bold text-[#00ff88]">Загрузить с телефона</span>
        </button>
        {pickerPhotos.length > 0 ? (
          <div className="grid grid-cols-4 gap-2">
            {pickerPhotos.map((url, i) => {
              const isSelected = pickerSelection.includes(url)
              const selIdx = pickerSelection.indexOf(url)
              return (
                <button key={i} onClick={() => {
                  if (!isPackMode) { setSelectedPhoto(url); setShowPhotoPicker(false); return }
                  setPickerSelection(s => isSelected ? s.filter(x => x !== url) : [...s, url])
                }}
                  className={`relative aspect-[3/4] rounded-[10px] overflow-hidden border-2 transition-all ${isPackMode && isSelected ? 'border-[#00ff88]' : 'border-transparent hover:border-[rgba(0,255,136,0.5)]'}`}>
                  <img src={url} className="w-full h-full object-cover" alt="" />
                  {isPackMode && isSelected && (
                    <div className="absolute inset-0 bg-[rgba(0,255,136,0.18)]" />
                  )}
                  {isPackMode && isSelected && (
                    <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-[#00ff88] flex items-center justify-center text-[10px] font-black text-black">
                      {selIdx + 1}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        ) : (
          <p className="text-[12px] text-[rgba(255,255,255,0.3)] text-center py-4">Загруженных фото пока нет</p>
        )}
        {isPackMode && (
          <div className="mt-3">
            <Button fullWidth disabled={pickerSelection.length === 0} onClick={() => {
              setPackPhotos(p => [...p, ...pickerSelection])
              setPickerSelection([])
              setShowPhotoPicker(false)
            }}>
              <IconCheck size={16} /> Готово ({pickerSelection.length} фото)
            </Button>
          </div>
        )}
      </BottomSheet>

      {/* Saved prompts sheet */}
      <BottomSheet isOpen={showSavedPrompts} onClose={() => setShowSavedPrompts(false)} title="Мои промпты">
        <div className="flex flex-col gap-2">
          {savedPrompts.map(p => (
            <div key={p.id} className="flex items-center gap-3 p-3 bg-[rgba(0,255,136,0.04)] border border-[rgba(0,255,136,0.15)] rounded-[12px]">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold">{p.name}</p>
                <p className="text-[11px] text-[rgba(255,255,255,0.35)] truncate">{p.text.slice(0, 60)}...</p>
              </div>
              <button onClick={() => { setPreset('custom'); setCustomText(p.text); setShowSavedPrompts(false) }}
                className="px-3 py-1.5 rounded-[8px] bg-[rgba(0,255,136,0.1)] border border-[rgba(0,255,136,0.3)] text-[11px] font-bold text-[#00ff88]">Загрузить</button>
              <button onClick={() => setSavedPrompts(savedPrompts.filter(x => x.id !== p.id))} className="w-6 h-6 flex items-center justify-center"><IconTrash size={12} color="rgba(255,80,80,0.6)" /></button>
            </div>
          ))}
        </div>
      </BottomSheet>

      {/* Saved footers sheet */}
      <BottomSheet isOpen={showSavedFooters} onClose={() => setShowSavedFooters(false)} title="Мои футеры">
        <div className="flex flex-col gap-2">
          {savedFooters.map(f => (
            <div key={f.id} className="flex items-center gap-3 p-3 bg-[rgba(0,255,136,0.04)] border border-[rgba(0,255,136,0.15)] rounded-[12px]">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold">{f.name}</p>
                <p className="text-[11px] text-[rgba(255,255,255,0.35)] truncate">{f.text.slice(0, 60)}</p>
              </div>
              <button onClick={() => { setFooterText(f.text); setGapLines(f.gapLines); setUseFooter(true); setShowSavedFooters(false) }}
                className="px-3 py-1.5 rounded-[8px] bg-[rgba(0,255,136,0.1)] border border-[rgba(0,255,136,0.3)] text-[11px] font-bold text-[#00ff88]">Загрузить</button>
              <button onClick={() => setSavedFooters(savedFooters.filter(x => x.id !== f.id))} className="w-6 h-6 flex items-center justify-center"><IconTrash size={12} color="rgba(255,80,80,0.6)" /></button>
            </div>
          ))}
        </div>
      </BottomSheet>
    </div>
  )
}
