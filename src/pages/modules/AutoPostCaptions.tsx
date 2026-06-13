import { useState, useRef } from 'react'
import { useApp } from '../../store/app'
import { useLang } from '../../store/lang'
import { IconBack, IconZap, IconPlus, IconTrash, IconCheck, IconRefresh, IconFlame, IconEdit, IconLink, IconSparkle } from '../../components/Icons'
import Button from '../../components/Button'
import BottomSheet from '../../components/BottomSheet'
import api from '../../api/client'

type Lang = 'en' | 'ru' | 'tr'
type Preset = 'hot' | 'custom'

function renderPreview(raw: string, emojis: { label: string }[]): string {
  if (!raw.trim()) return ''
  let s = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  s = s.replace(/\*_(.+?)_\*/gs, '<b><i>$1</i></b>')
  s = s.replace(/_\*(.+?)\*_/gs, '<b><i>$1</i></b>')
  s = s.replace(/\*(.+?)\*/gs, '<b>$1</b>')
  s = s.replace(/_(.+?)_/gs, '<i>$1</i>')
  s = s.replace(/\[([^\]]*)\]\(([^)]*)\)/g, (_, t, u) => {
    const safe = /^(https?:\/\/|tg:\/\/|t\.me\/)/.test(u) ? u : '#'
    return `<a href="${safe}" style="color:#5aaaff;text-decoration:underline">${t}</a>`
  })
  s = s.replace(/\{([^{}]{1,60})\}/g, (_, raw) => {
    // Support both {label} and {label:id} formats
    const label = raw.includes(':') ? raw.split(':')[0] : raw
    return emojis.some(e => e.label === label)
      ? `<span style="color:#00ffaa">✨</span>`
      : `<span style="color:rgba(0,255,170,0.35)">{${raw}}</span>`
  })
  return s.replace(/\n/g, '<br>')
}

const HOT_TEXT: Record<Lang, string> = {
  en: "You can't handle what's coming tonight 🔥 VIP drop — first come first served.",
  ru: "Ты не готов к тому, что будет ночью 🔥 Эксклюзив в VIP — кто первый, того и тапки.",
  tr: "Bu gece hazır değilsin 🔥 VIP'te özel içerik.",
}
function SL({ children }: { children: string }) {
  return <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,170,0.55)] mb-2">{children}</p>
}

export default function AutoPostCaptions() {
  const { goBack, gallery, uploads, setUploads, readyPosts, setReadyPosts, savedPrompts, setSavedPrompts, savedFooters, setSavedFooters, savedEmojis } = useApp()
  const { t } = useLang()

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
  const [linkBold, setLinkBold] = useState(false)
  const [showLinkForm, setShowLinkForm] = useState(false)

  const [showPhotoPicker, setShowPhotoPicker] = useState(false)
  const [showSavedPrompts, setShowSavedPrompts] = useState(false)
  const [showSavedFooters, setShowSavedFooters] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [emojiTarget, setEmojiTarget] = useState<'footer' | 'caption'>('footer')
  const [isPackMode, setIsPackMode] = useState(false)
  const [packPhotos, setPackPhotos] = useState<string[]>([])
  const [pickerSelection, setPickerSelection] = useState<string[]>([])
  const [isBulkMode, setIsBulkMode] = useState(false)
  const [bulkPhotos, setBulkPhotos] = useState<string[]>([])
  const [bulkGenerating, setBulkGenerating] = useState(false)
  const [bulkProgress, setBulkProgress] = useState(0)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const footerRef = useRef<HTMLTextAreaElement>(null)

  const [captionBold, setCaptionBold] = useState(() => localStorage.getItem('captionBold') === 'true')
  const [captionItalic, setCaptionItalic] = useState(() => localStorage.getItem('captionItalic') === 'true')

  const toggleCaptionBold = () => { const v = !captionBold; setCaptionBold(v); localStorage.setItem('captionBold', String(v)) }
  const toggleCaptionItalic = () => { const v = !captionItalic; setCaptionItalic(v); localStorage.setItem('captionItalic', String(v)) }

  const wrapFooterText = (marker: string) => {
    const el = footerRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = footerText.slice(start, end)
    const inner = selected || (marker === '*' ? 'жирный' : 'курсив')
    const newVal = footerText.slice(0, start) + `${marker}${inner}${marker}` + footerText.slice(end)
    setFooterText(newVal)
    setTimeout(() => {
      el.focus()
      el.selectionStart = start + marker.length
      el.selectionEnd = start + marker.length + inner.length
    }, 0)
  }

  const openPicker = () => { setPickerSelection([]); setShowPhotoPicker(true) }

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const url = ev.target?.result as string
      setUploads([url, ...uploads])
      if (isPackMode || isBulkMode) {
        setPickerSelection(s => [...s, url])
      } else {
        setSelectedPhoto(url)
        setShowPhotoPicker(false)
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const generateBulk = async () => {
    if (bulkPhotos.length === 0) return
    setBulkGenerating(true)
    setBulkProgress(0)
    const newPosts: typeof readyPosts = []
    for (let i = 0; i < bulkPhotos.length; i++) {
      const photoUrl = bulkPhotos[i]
      let captionText = ''
      try {
        const result = await api.captions.generate({
          prompt: customText,
          lang,
          type: preset,
          footerText: useFooter && footerText.trim() ? footerText : undefined,
          gapLines,
          imageUrl: photoUrl,
        })
        captionText = result.caption
      } catch {
        captionText = preset === 'custom'
          ? (customText || HOT_TEXT[lang])
          : HOT_TEXT[lang]
        if (useFooter && footerText.trim()) captionText = `${captionText}${'\n'.repeat(gapLines + 1)}${footerText}`
      }
      newPosts.push({
        id: `${Date.now()}_${i}`,
        url: photoUrl,
        caption: captionText,
        createdAt: new Date().toLocaleDateString('ru'),
      })
      setBulkProgress(i + 1)
    }
    setReadyPosts([...readyPosts, ...newPosts])
    setBulkPhotos([])
    setBulkGenerating(false)
  }

  const pickerPhotos = [...uploads, ...gallery.map(g => g.url)]

  const insertSavedEmoji = (stickerId: string, label: string, target: 'footer' | 'caption') => {
    // Embed sticker_id so compileForTelegram resolves it directly, independent of DB lookup
    const token = `{${label}:${stickerId}}`
    if (target === 'footer') setFooterText(t => `${t}${token}`)
    else setCaption(t => `${t}${token}`)
    setShowEmojiPicker(false)
  }

  const generate = async () => {
    setLoading(true)
    const photoUrl = isPackMode ? packPhotos[0] : selectedPhoto ?? undefined
    try {
      const result = await api.captions.generate({
        prompt: customText,
        lang,
        type: preset,
        footerText: useFooter && footerText.trim() ? footerText : undefined,
        gapLines,
        imageUrl: photoUrl,
      })
      setCaption(result.caption)
    } catch {
      // fallback to local template if API unavailable
      let text = preset === 'custom'
        ? `${customText}\n\n[Добавь ключ XAI_API_KEY для AI генерации]`
        : HOT_TEXT[lang]
      if (useFooter && footerText.trim()) text = `${text}${'\n'.repeat(gapLines + 1)}${footerText}`
      setCaption(text)
    } finally {
      setLoading(false)
    }
  }

  const insertLink = () => {
    const valid = linkEntries.filter(e => e.text.trim() && e.url.trim())
    if (!valid.length) return
    const parts = valid.map(e => {
      // e1/e2 go OUTSIDE the brackets so {token} emoji markers are processed normally
      const url = /^(https?:\/\/|tg:\/\/)/.test(e.url) ? e.url : `https://${e.url}`
      const inner = `${e.e1}[${e.text}](${url})${e.e2}`
      return linkBold ? `*${inner}*` : inner
    })
    const chunk = parts.join(' - ')
    setFooterText(t => t ? `${t}${chunk}` : chunk)
    setLinkEntries([{ e1: '', text: '', url: '', e2: '' }])
    setShowLinkForm(false)
  }


  const savePrompt = async () => {
    if (!promptName.trim() || !customText.trim()) return
    try {
      const result = await api.prompts.add({ name: promptName.trim(), text: customText })
      setSavedPrompts([...savedPrompts, { id: result.id, name: promptName.trim(), text: customText }])
    } catch {
      setSavedPrompts([...savedPrompts, { id: Date.now().toString(), name: promptName.trim(), text: customText }])
    }
    setPromptName(''); setShowSavePrompt(false)
  }

  const saveFooter = async () => {
    if (!footerName.trim() || !footerText.trim()) return
    try {
      const result = await api.footers.add({ name: footerName.trim(), text: footerText, gapLines })
      setSavedFooters([...savedFooters, { id: result.id, name: footerName.trim(), text: footerText, gapLines }])
    } catch {
      setSavedFooters([...savedFooters, { id: Date.now().toString(), name: footerName.trim(), text: footerText, gapLines }])
    }
    setFooterName(''); setShowSaveFooter(false)
  }

  const addToReady = () => {
    if (!caption) return
    // Separate AI body from footer before applying bold/italic wrapping.
    // Footer often contains *[link](url)* which conflicts with outer *...* bold markers.
    let body = caption
    let footerSuffix = ''
    if (useFooter && footerText.trim() && caption.endsWith(footerText)) {
      const bodyPart = caption.slice(0, caption.length - footerText.length)
      const trimmedBody = bodyPart.trimEnd()
      footerSuffix = bodyPart.slice(trimmedBody.length) + footerText
      body = trimmedBody
    }
    if (captionBold && captionItalic) body = `*_${body}_*`
    else if (captionBold) body = `*${body}*`
    else if (captionItalic) body = `_${body}_`
    const compiled = body + footerSuffix
    if (isPackMode) {
      if (packPhotos.length === 0) return
      setReadyPosts([...readyPosts, { id: Date.now().toString(), url: packPhotos[0], extraUrls: packPhotos.slice(1), caption: compiled, createdAt: new Date().toLocaleDateString('ru') }])
      setCaption(''); setPackPhotos([])
    } else {
      if (!selectedPhoto) return
      setReadyPosts([...readyPosts, { id: Date.now().toString(), url: selectedPhoto, caption: compiled, createdAt: new Date().toLocaleDateString('ru') }])
      setCaption(''); setSelectedPhoto(null)
    }
  }

  return (
    <div className="flex flex-col gap-5 pt-4">
      <div className="flex items-center gap-3 px-5">
        <button onClick={goBack} className="w-10 h-10 rounded-[14px] flex items-center justify-center transition-all duration-200 active:scale-[0.92]" style={{ background: 'rgba(0,255,170,0.06)', border: '1px solid rgba(0,255,170,0.2)' }}>
          <IconBack size={20} color="#00ffaa" />
        </button>
        <div className="flex-1">
          <p className="text-[9px] font-black uppercase tracking-[2px] text-[rgba(0,255,170,0.5)]">{t.mods.autoPostHubTitle}</p>
          <h1 className="text-[20px] font-black tracking-tight">{t.mods.captionGenTitle}</h1>
        </div>
      </div>

      <div className="px-5 flex flex-col gap-4">
        {/* Photo */}
        <div>
          <SL>{t.mods.photoForPost}</SL>
          <div className="flex gap-2 mb-2">
            <button onClick={() => { setIsPackMode(false); setIsBulkMode(false); setPackPhotos([]); openPicker() }}
              className="flex-1 flex items-center gap-2 px-4 py-3 rounded-[12px] border-2 border-dashed border-[rgba(0,255,170,0.22)] hover:border-[rgba(0,255,170,0.45)] bg-[rgba(0,255,170,0.02)] hover:bg-[rgba(0,255,170,0.06)] text-[12px] font-bold text-[rgba(255,255,255,0.45)] hover:text-[rgba(0,255,170,0.9)] transition-all">
              <IconPlus size={14} color="rgba(0,255,170,0.5)" /> {t.mods.selectPhoto}
            </button>
            <button onClick={() => { setIsPackMode(true); setIsBulkMode(false); setSelectedPhoto(null); openPicker() }}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-3 rounded-[12px] border border-[rgba(0,255,170,0.25)] bg-[rgba(0,255,170,0.04)] hover:bg-[rgba(0,255,170,0.1)] hover:border-[rgba(0,255,170,0.5)] text-[11px] font-bold text-[rgba(0,255,170,0.7)] hover:text-[#00ffaa] transition-all">
              <IconPlus size={13} color="rgba(0,255,170,0.7)" /> {t.mods.packLabel}
            </button>
            <button onClick={() => { setIsBulkMode(true); setIsPackMode(false); setSelectedPhoto(null); setPickerSelection([]); setShowPhotoPicker(true) }}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-3 rounded-[12px] border border-[rgba(157,143,255,0.3)] bg-[rgba(157,143,255,0.05)] hover:bg-[rgba(157,143,255,0.12)] hover:border-[rgba(157,143,255,0.55)] text-[11px] font-bold text-[rgba(157,143,255,0.8)] hover:text-[#9d8fff] transition-all"
              title="Генерация для нескольких фото — отдельное описание под каждое">
              <IconZap size={13} color="rgba(157,143,255,0.8)" /> Пакет
            </button>
          </div>
          {selectedPhoto && !isPackMode && (
            <div className="relative w-24 h-32 rounded-[14px] overflow-hidden border border-[rgba(0,255,170,0.35)] bg-[#050505]">
              <img src={selectedPhoto} className="w-full h-full object-contain" alt="" />
              <button onClick={() => setSelectedPhoto(null)} className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center"><IconTrash size={9} color="#ff5555" /></button>
            </div>
          )}
          {isPackMode && packPhotos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {packPhotos.map((url, i) => (
                <div key={i} className="relative w-20 h-28 flex-shrink-0 rounded-[10px] overflow-hidden border border-[rgba(0,255,170,0.35)] bg-[#050505]">
                  <img src={url} className="w-full h-full object-contain" alt="" />
                  <button onClick={() => setPackPhotos(p => p.filter((_, j) => j !== i))} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center"><IconTrash size={8} color="#ff5555" /></button>
                  {i === 0 && <span className="absolute bottom-1 left-1 text-[8px] font-black text-[#00ffaa] bg-black/60 px-1 rounded">{t.mods.coverLabel}</span>}
                </div>
              ))}
              <button onClick={() => openPicker()}
                className="w-20 h-28 flex-shrink-0 rounded-[10px] border-2 border-dashed border-[rgba(0,255,170,0.15)] hover:border-[rgba(0,255,170,0.4)] bg-[rgba(255,255,255,0.02)] flex flex-col items-center justify-center gap-1 transition-all">
                <IconPlus size={18} color="rgba(0,255,170,0.4)" />
                <p className="text-[9px] text-[rgba(255,255,255,0.2)]">Ещё</p>
              </button>
            </div>
          )}
          {isBulkMode && bulkPhotos.length > 0 && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] font-black uppercase tracking-[1px] text-[rgba(157,143,255,0.65)]">Пакет · {bulkPhotos.length} фото</p>
                <button onClick={() => setBulkPhotos([])} className="text-[rgba(255,255,255,0.25)] text-[11px] hover:text-[rgba(255,80,80,0.7)] transition-colors">✕</button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {bulkPhotos.map((url, i) => (
                  <div key={i} className="relative w-16 h-24 flex-shrink-0 rounded-[10px] overflow-hidden border border-[rgba(157,143,255,0.3)] bg-[#050505]">
                    <img src={url} className="w-full h-full object-contain" alt="" />
                    <button onClick={() => setBulkPhotos(p => p.filter((_, j) => j !== i))} className="absolute top-1 right-1 w-4 h-4 rounded-full bg-black/70 flex items-center justify-center"><IconTrash size={7} color="#ff5555" /></button>
                  </div>
                ))}
                <button onClick={() => { setIsBulkMode(true); setIsPackMode(false); setPickerSelection([]); setShowPhotoPicker(true) }}
                  className="w-16 h-24 flex-shrink-0 rounded-[10px] border-2 border-dashed border-[rgba(157,143,255,0.2)] hover:border-[rgba(157,143,255,0.5)] bg-[rgba(255,255,255,0.02)] flex flex-col items-center justify-center gap-1 transition-all">
                  <IconPlus size={16} color="rgba(157,143,255,0.5)" />
                  <p className="text-[8px] text-[rgba(255,255,255,0.2)]">Ещё</p>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Unified prompt panel */}
        <div>
          <SL>{t.mods.promptLabel}</SL>
          <div className="flex rounded-[12px] bg-[rgba(0,255,170,0.06)] border border-[rgba(0,255,170,0.15)] p-1 mb-3">
            <button onClick={() => setPreset('hot')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[9px] text-[12px] font-black transition-all ${preset === 'hot' ? 'bg-[#00ffaa] text-black shadow-[0_0_10px_rgba(0,255,170,0.3)]' : 'text-[rgba(255,255,255,0.45)] hover:text-white'}`}>
              <IconFlame size={13} color={preset === 'hot' ? 'black' : 'rgba(255,160,50,0.8)'} /> {t.mods.presetHot}
            </button>
            <button onClick={() => setPreset('custom')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[9px] text-[12px] font-black transition-all ${preset === 'custom' ? 'bg-[#00ffaa] text-black shadow-[0_0_10px_rgba(0,255,170,0.3)]' : 'text-[rgba(255,255,255,0.45)] hover:text-white'}`}>
              <IconEdit size={13} color={preset === 'custom' ? 'black' : 'rgba(255,255,255,0.5)'} /> {t.mods.presetCustom}
            </button>
          </div>

          {preset === 'hot' && (
            <div className="p-4 bg-[rgba(255,255,255,0.02)] border border-[rgba(0,255,170,0.18)] rounded-[12px]">
              <div className="flex items-center gap-2 mb-1.5">
                <IconFlame size={15} color="#00ffaa" />
                <p className="text-[13px] font-bold text-[#00ffaa]">{t.mods.hotDescLabel}</p>
              </div>
              <p className="text-[11px] text-[rgba(255,255,255,0.3)] leading-relaxed">{HOT_TEXT[lang].slice(0, 80)}…</p>
            </div>
          )}

          {preset === 'custom' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                {savedPrompts.length > 0
                  ? <button onClick={() => setShowSavedPrompts(true)} className="text-[11px] text-[rgba(0,255,170,0.6)] hover:text-[#00ffaa] transition-colors font-bold">{t.mods.myPrompts} →</button>
                  : <span />}
                {!showSavePrompt && customText.trim() && (
                  <button onClick={() => setShowSavePrompt(true)} className="text-[11px] text-[rgba(0,255,170,0.55)] hover:text-[#00ffaa] transition-colors">{t.mods.savePlus}</button>
                )}
              </div>
              <textarea value={customText} onChange={e => setCustomText(e.target.value)} placeholder="Напиши свой промпт для AI..." rows={4}
                className="w-full bg-[rgba(255,255,255,0.02)] border border-[rgba(0,255,170,0.2)] rounded-[12px] px-4 py-3 text-[13px] text-white resize-none outline-none focus:border-[rgba(0,255,170,0.5)] transition-all" />
              {showSavePrompt && (
                <div className="flex gap-2">
                  <input value={promptName} onChange={e => setPromptName(e.target.value)} placeholder="Название промпта..."
                    className="flex-1 bg-[rgba(255,255,255,0.02)] border border-[rgba(0,255,170,0.2)] rounded-[10px] px-3 py-2 text-[12px] text-white outline-none focus:border-[rgba(0,255,170,0.5)] transition-all" />
                  <button onClick={savePrompt} className="px-3 py-2 rounded-[10px] bg-[#00ffaa] text-black text-[12px] font-black">{t.common.save}</button>
                  <button onClick={() => setShowSavePrompt(false)} className="px-3 py-2 text-[rgba(255,255,255,0.35)] text-[12px]">✕</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Language — only for готовый */}
        {preset === 'hot' && (
          <div>
            <SL>Язык</SL>
            <div className="flex gap-2">
              {(['en', 'ru', 'tr'] as Lang[]).map(l => (
                <button key={l} onClick={() => setLang(l)}
                  className={`flex-1 py-2 rounded-[10px] text-[12px] font-bold border transition-all ${lang === l ? 'bg-[#00ffaa] border-[#00ffaa] text-black' : 'border-[rgba(0,255,170,0.2)] text-[rgba(255,255,255,0.5)] hover:border-[rgba(0,255,170,0.4)]'}`}>
                  {l === 'en' ? 'English' : l === 'ru' ? 'Russian' : 'Turkish'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Caption formatting */}
        <div>
          <SL>{t.mods.captionFormatLabel}</SL>
          <div className="flex gap-2">
            <button onClick={toggleCaptionBold}
              className={`flex-1 py-2.5 rounded-[10px] border text-[13px] font-black transition-all ${captionBold ? 'bg-[rgba(0,255,170,0.12)] border-[rgba(0,255,170,0.55)] text-[#00ffaa]' : 'border-[rgba(0,255,170,0.15)] text-[rgba(255,255,255,0.4)] hover:border-[rgba(0,255,170,0.35)]'}`}>
              <span className="font-black">B</span> {t.mods.boldLabel}
            </button>
            <button onClick={toggleCaptionItalic}
              className={`flex-1 py-2.5 rounded-[10px] border text-[13px] font-bold transition-all ${captionItalic ? 'bg-[rgba(0,255,170,0.12)] border-[rgba(0,255,170,0.55)] text-[#00ffaa]' : 'border-[rgba(0,255,170,0.15)] text-[rgba(255,255,255,0.4)] hover:border-[rgba(0,255,170,0.35)]'}`}>
              <span className="italic">I</span> {t.mods.italicLabel}
            </button>
          </div>
          {(captionBold || captionItalic) && (
            <p className="text-[10px] text-[rgba(0,255,170,0.5)] mt-1.5">
              Описание будет опубликовано {captionBold && captionItalic ? 'жирным курсивом' : captionBold ? 'жирным шрифтом' : 'курсивом'}
            </p>
          )}
        </div>

        {/* Footer */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <SL>{t.mods.footerLabel}</SL>
            <div className="flex items-center gap-2 -mt-2">
              <button onClick={() => setShowSavedFooters(true)} className="text-[10px] text-[rgba(0,255,170,0.55)] hover:text-[#00ffaa] transition-colors">{t.mods.myFooters}</button>
              <button onClick={() => setUseFooter(v => !v)}
                className={`relative w-10 h-5 rounded-full border transition-all ${useFooter ? 'bg-[#00ffaa] border-[#00ffaa]' : 'bg-[rgba(255,255,255,0.06)] border-[rgba(255,255,255,0.1)]'}`}
                style={useFooter ? { boxShadow: '0 0 8px rgba(0,255,170,0.4)' } : {}}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${useFooter ? 'left-5 bg-black' : 'left-0.5 bg-[rgba(255,255,255,0.4)]'}`} />
              </button>
            </div>
          </div>
          {useFooter && (
            <div className="flex flex-col gap-2">
              <textarea ref={footerRef} value={footerText} onChange={e => setFooterText(e.target.value)} placeholder="Текст футера..." rows={3}
                className="w-full bg-[rgba(255,255,255,0.02)] border border-[rgba(0,255,170,0.2)] rounded-[12px] px-4 py-3 text-[12px] text-white resize-none outline-none focus:border-[rgba(0,255,170,0.5)] transition-all" />

              {/* Live preview */}
              {footerText.trim() && (
                <div className="px-3.5 py-2.5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-[12px]">
                  <p className="text-[9px] font-black uppercase tracking-[1px] text-[rgba(255,255,255,0.2)] mb-1.5">Предпросмотр</p>
                  <p className="text-[13px] leading-relaxed text-white"
                    dangerouslySetInnerHTML={{ __html: renderPreview(footerText, savedEmojis) }} />
                </div>
              )}

              {/* Tools row */}
              <div className="flex flex-col gap-1.5">
                <p className="text-[10px] text-[rgba(255,255,255,0.22)]">Выдели текст в поле выше → нажми кнопку форматирования</p>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => wrapFooterText('*')}
                    className="flex items-center gap-1 px-2.5 h-7 rounded-[7px] border border-[rgba(0,255,170,0.2)] text-[12px] font-black text-[rgba(255,255,255,0.6)] hover:bg-[rgba(0,255,170,0.08)] hover:text-white transition-all">B <span className="text-[9px] font-normal text-[rgba(255,255,255,0.3)]">жир</span></button>
                  <button onClick={() => wrapFooterText('_')}
                    className="flex items-center gap-1 px-2.5 h-7 rounded-[7px] border border-[rgba(0,255,170,0.2)] text-[12px] italic font-bold text-[rgba(255,255,255,0.6)] hover:bg-[rgba(0,255,170,0.08)] hover:text-white transition-all">I <span className="text-[9px] font-normal not-italic text-[rgba(255,255,255,0.3)]">курс</span></button>
                  <button onClick={() => setShowLinkForm(v => !v)} className="flex items-center gap-1 px-3 py-1.5 rounded-[8px] border border-[rgba(0,255,170,0.2)] text-[11px] text-[rgba(0,255,170,0.7)] hover:bg-[rgba(0,255,170,0.07)] transition-all"><IconLink size={12} color="rgba(0,255,170,0.7)" /> {t.mods.linkLabel}</button>
                  <button onClick={() => setFooterText(t => t + '\n')} className="px-3 py-1.5 rounded-[8px] border border-[rgba(0,255,170,0.2)] text-[11px] text-[rgba(255,255,255,0.4)] hover:bg-[rgba(0,255,170,0.05)] transition-all">↵</button>
                  {savedEmojis.length > 0 && (
                    <button onClick={() => { setEmojiTarget('footer'); setShowEmojiPicker(true) }} className="flex items-center gap-1 px-3 py-1.5 rounded-[8px] border border-[rgba(0,255,170,0.2)] text-[11px] text-[rgba(0,255,170,0.7)] hover:bg-[rgba(0,255,170,0.07)] transition-all"><IconSparkle size={12} color="rgba(0,255,170,0.7)" /> Emoji</button>
                  )}
                </div>
              </div>
              {showLinkForm && (
                <div className="p-3 bg-[rgba(0,255,170,0.04)] border border-[rgba(0,255,170,0.15)] rounded-[12px] flex flex-col gap-3">
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
                          placeholder="✍" className="w-10 bg-[rgba(255,255,255,0.02)] border border-[rgba(0,255,170,0.2)] rounded-[8px] px-1 py-2 text-[14px] text-center text-white outline-none flex-shrink-0" />
                        <input value={entry.text} onChange={e => setLinkEntries(es => es.map((x, j) => j === i ? { ...x, text: e.target.value } : x))}
                          placeholder="Текст ссылки" className="flex-1 min-w-0 bg-[rgba(255,255,255,0.02)] border border-[rgba(0,255,170,0.2)] rounded-[8px] px-3 py-2 text-[12px] text-white outline-none" />
                        <input value={entry.e2} onChange={e => setLinkEntries(es => es.map((x, j) => j === i ? { ...x, e2: e.target.value } : x))}
                          placeholder="✍" className="w-10 bg-[rgba(255,255,255,0.02)] border border-[rgba(0,255,170,0.2)] rounded-[8px] px-1 py-2 text-[14px] text-center text-white outline-none flex-shrink-0" />
                      </div>
                      <input value={entry.url} onChange={e => setLinkEntries(es => es.map((x, j) => j === i ? { ...x, url: e.target.value } : x))}
                        placeholder="https://t.me/..." className="w-full bg-[rgba(255,255,255,0.02)] border border-[rgba(0,255,170,0.2)] rounded-[8px] px-3 py-2 text-[12px] text-white outline-none" />
                    </div>
                  ))}
                  {linkEntries.some(e => e.text || e.url) && (
                    <p className="text-[10px] text-[rgba(0,255,170,0.65)] font-mono bg-[rgba(0,0,0,0.35)] rounded-[8px] px-2.5 py-2 break-all leading-relaxed">
                      {linkEntries.filter(e => e.text || e.url).map(e => { const inner = `${e.e1}[${e.text}](${e.url})${e.e2}`; return linkBold ? `*${inner}*` : inner }).join(' - ')}
                    </p>
                  )}
                  <div className="flex gap-2 items-center">
                    <button onClick={() => setLinkBold(v => !v)}
                      className={`px-3 py-2 rounded-[8px] border text-[12px] font-black transition-all ${linkBold ? 'bg-[rgba(0,255,170,0.15)] border-[rgba(0,255,170,0.5)] text-[#00ffaa]' : 'border-[rgba(0,255,170,0.2)] text-[rgba(255,255,255,0.4)]'}`}>
                      B
                    </button>
                    <button onClick={() => setLinkEntries(es => [...es, { e1: '', text: '', url: '', e2: '' }])}
                      className="flex-1 py-2 rounded-[8px] border border-[rgba(0,255,170,0.2)] text-[11px] text-[rgba(0,255,170,0.7)] hover:bg-[rgba(0,255,170,0.06)] transition-all">
                      {t.mods.addMoreLink}
                    </button>
                    <button onClick={insertLink} className="flex-1 py-2 rounded-[8px] bg-[#00ffaa] text-black text-[12px] font-black">{t.mods.insertLinkBtn}</button>
                  </div>
                </div>
              )}
              {/* Gap + save */}
              <div className="flex items-center gap-3">
                <p className="text-[11px] text-[rgba(255,255,255,0.4)]">{t.mods.gapLabel}</p>
                <div className="flex items-center gap-2 ml-auto">
                  <button onClick={() => setGapLines(g => Math.max(0, g-1))} className="w-7 h-7 rounded-full border border-[rgba(0,255,170,0.2)] text-[#00ffaa] text-[14px] flex items-center justify-center hover:bg-[rgba(0,255,170,0.08)]">−</button>
                  <span className="text-[13px] font-black text-[#00ffaa] w-4 text-center">{gapLines}</span>
                  <button onClick={() => setGapLines(g => Math.min(5, g+1))} className="w-7 h-7 rounded-full border border-[rgba(0,255,170,0.2)] text-[#00ffaa] text-[14px] flex items-center justify-center hover:bg-[rgba(0,255,170,0.08)]">+</button>
                </div>
              </div>
              {!showSaveFooter ? (
                <button onClick={() => setShowSaveFooter(true)} className="text-[11px] text-[rgba(0,255,170,0.55)] hover:text-[#00ffaa] transition-colors">{t.mods.saveFooterTemplate}</button>
              ) : (
                <div className="flex gap-2">
                  <input value={footerName} onChange={e => setFooterName(e.target.value)} placeholder="Название шаблона..."
                    className="flex-1 bg-[rgba(255,255,255,0.02)] border border-[rgba(0,255,170,0.2)] rounded-[10px] px-3 py-2 text-[12px] text-white outline-none focus:border-[rgba(0,255,170,0.5)] transition-all" />
                  <button onClick={saveFooter} className="px-3 py-2 rounded-[10px] bg-[#00ffaa] text-black text-[12px] font-black">{t.common.save}</button>
                  <button onClick={() => setShowSaveFooter(false)} className="px-3 py-2 text-[rgba(255,255,255,0.35)] text-[12px]">✕</button>
                </div>
              )}
            </div>
          )}
        </div>

        {bulkGenerating ? (
          <div className="flex flex-col gap-2 py-1">
            <p className="text-[12px] text-[rgba(255,255,255,0.6)] text-center">Генерирую {bulkProgress} / {bulkPhotos.length}...</p>
            <div className="w-full bg-[rgba(255,255,255,0.06)] rounded-full h-1.5">
              <div className="bg-[#9d8fff] h-1.5 rounded-full transition-all duration-300" style={{ width: `${(bulkProgress / bulkPhotos.length) * 100}%` }} />
            </div>
          </div>
        ) : (
          <>
            <Button fullWidth
              onClick={bulkPhotos.length > 0 ? generateBulk : generate}
              disabled={(bulkPhotos.length > 0 ? false : loading) || (preset === 'custom' && !customText.trim())}>
              {loading && bulkPhotos.length === 0
                ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />{t.mods.generatingLabel}</span>
                : bulkPhotos.length > 0
                  ? <><IconZap size={17} /> Сгенерировать описание для всех ({bulkPhotos.length})</>
                  : <><IconZap size={17} /> {t.mods.generateCaptionBtn}</>
              }
            </Button>
            <p className="text-[10px] text-[rgba(255,255,255,0.25)] text-center mt-1.5">
              {bulkPhotos.length > 1 ? `генерация $0.025 × ${bulkPhotos.length} = $${(0.025 * bulkPhotos.length).toFixed(3)}` : 'генерация $0.025'}
            </p>
          </>
        )}

        {caption && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <SL>{t.mods.resultLabel}</SL>
              {savedEmojis.length > 0 && (
                <button onClick={() => { setEmojiTarget('caption'); setShowEmojiPicker(true) }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-[7px] border border-[rgba(0,255,170,0.2)] text-[10px] text-[rgba(0,255,170,0.7)] hover:bg-[rgba(0,255,170,0.07)] transition-all -mt-2">
                  <IconSparkle size={11} color="rgba(0,255,170,0.7)" /> Emoji
                </button>
              )}
            </div>
            <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={5}
              className="w-full bg-[rgba(255,255,255,0.02)] border border-[rgba(0,255,170,0.2)] rounded-[14px] px-4 py-3 text-[13px] leading-relaxed text-white resize-none outline-none focus:border-[rgba(0,255,170,0.5)] transition-all" />
            {caption.trim() && (
              <div className="mt-2 px-3.5 py-2.5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-[12px] mb-2">
                <p className="text-[9px] font-black uppercase tracking-[1px] text-[rgba(255,255,255,0.2)] mb-1.5">{t.mods.tgPreviewLabel}</p>
                <p className="text-[13px] leading-relaxed text-white"
                  dangerouslySetInnerHTML={{ __html: renderPreview(caption, savedEmojis) }} />
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => { setCaption(''); generate() }}><IconRefresh size={15} /> {t.mods.anotherBtn}</Button>
              <Button className="flex-1" onClick={addToReady} disabled={isPackMode ? packPhotos.length === 0 : !selectedPhoto}>
                <IconCheck size={15} /> {t.mods.addToReadyBtn}
              </Button>
            </div>
            {(isPackMode ? packPhotos.length === 0 : !selectedPhoto) && <p className="text-[11px] text-[rgba(255,100,100,0.7)] mt-1.5">{isPackMode ? 'Добавь хотя бы одно фото в пак' : 'Выбери фото выше, чтобы добавить в готовые посты'}</p>}
          </div>
        )}
      </div>

      {/* Ready posts */}
      {readyPosts.length > 0 && (
        <div className="px-4 mt-2 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,170,0.55)]">
              Готовые посты ({readyPosts.length})
            </p>
            <button
              onClick={() => setReadyPosts([])}
              className="text-[10px] font-bold text-[rgba(255,80,80,0.5)] hover:text-[rgba(255,80,80,0.8)] transition-all"
            >
              Очистить все
            </button>
          </div>
          <div className="flex flex-col gap-2.5">
            {readyPosts.map((post) => (
              <div
                key={post.id}
                className="rounded-[18px] overflow-hidden"
                style={{
                  background: 'rgba(255,255,255,0.025)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}
              >
                <div className="flex gap-3 p-3">
                  {post.url && (
                    <img
                      src={post.url}
                      alt=""
                      className="w-14 h-14 rounded-[10px] object-cover flex-shrink-0"
                      style={{ border: '1px solid rgba(255,255,255,0.08)' }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-[rgba(255,255,255,0.25)] mb-1">{post.createdAt}</p>
                    <p
                      className="text-[12px] text-[rgba(255,255,255,0.55)] leading-relaxed line-clamp-3"
                      dangerouslySetInnerHTML={{ __html: renderPreview(post.caption, savedEmojis) }}
                    />
                  </div>
                  <button
                    onClick={() => setReadyPosts(readyPosts.filter(p => p.id !== post.id))}
                    className="w-6 h-6 flex items-center justify-center flex-shrink-0 self-start"
                  >
                    <IconTrash size={13} color="rgba(255,80,80,0.5)" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Photo picker sheet */}
      <BottomSheet
        isOpen={showPhotoPicker}
        onClose={() => { setShowPhotoPicker(false); if (isBulkMode) setIsBulkMode(false) }}
        title={isBulkMode ? 'Пакетная генерация — выбрать фото' : isPackMode ? 'Выбрать фото (пак)' : 'Выбрать фото'}
        footer={(isPackMode || isBulkMode) ? (
          <Button fullWidth disabled={pickerSelection.length === 0} onClick={() => {
            if (isBulkMode) {
              setBulkPhotos(p => [...p, ...pickerSelection])
              setIsBulkMode(false)
            } else {
              setPackPhotos(p => [...p, ...pickerSelection])
            }
            setPickerSelection([])
            setShowPhotoPicker(false)
          }}>
            <IconCheck size={16} /> Готово ({pickerSelection.length} фото)
          </Button>
        ) : undefined}
      >
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
        <button onClick={() => fileInputRef.current?.click()}
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-[14px] border-2 border-dashed border-[rgba(0,255,170,0.35)] bg-[rgba(0,255,170,0.04)] hover:bg-[rgba(0,255,170,0.08)] transition-all mb-3">
          <IconPlus size={18} color="#00ffaa" />
          <span className="text-[13px] font-bold text-[#00ffaa]">{t.mods.uploadFromPhone}</span>
        </button>
        {pickerPhotos.length > 0 ? (
          <div className="grid grid-cols-4 gap-2">
            {pickerPhotos.map((url, i) => {
              const isSelected = pickerSelection.includes(url)
              const selIdx = pickerSelection.indexOf(url)
              return (
                <button key={i} onClick={() => {
                  if (!isPackMode && !isBulkMode) { setSelectedPhoto(url); setShowPhotoPicker(false); return }
                  setPickerSelection(s => isSelected ? s.filter(x => x !== url) : [...s, url])
                }}
                  className={`relative aspect-[3/4] rounded-[10px] overflow-hidden border-2 transition-all ${(isPackMode || isBulkMode) && isSelected ? (isBulkMode ? 'border-[#9d8fff]' : 'border-[#00ffaa]') : 'border-transparent hover:border-[rgba(0,255,170,0.5)]'}`}>
                  <img src={url} className="w-full h-full object-cover" alt="" />
                  {(isPackMode || isBulkMode) && isSelected && (
                    <div className="absolute inset-0" style={{ background: isBulkMode ? 'rgba(157,143,255,0.18)' : 'rgba(0,255,170,0.18)' }} />
                  )}
                  {(isPackMode || isBulkMode) && isSelected && (
                    <div className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-black"
                      style={{ background: isBulkMode ? '#9d8fff' : '#00ffaa' }}>
                      {selIdx + 1}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        ) : (
          <p className="text-[12px] text-[rgba(255,255,255,0.3)] text-center py-4">{t.mods.noPhotosUploaded}</p>
        )}
      </BottomSheet>

      {/* Saved prompts sheet */}
      <BottomSheet isOpen={showSavedPrompts} onClose={() => setShowSavedPrompts(false)} title={t.mods.myPrompts}>
        <div className="flex flex-col gap-2">
          {savedPrompts.map(p => (
            <div key={p.id} className="flex items-center gap-3 p-3 bg-[rgba(0,255,170,0.04)] border border-[rgba(0,255,170,0.15)] rounded-[12px]">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold">{p.name}</p>
                <p className="text-[11px] text-[rgba(255,255,255,0.35)] truncate">{p.text.slice(0, 60)}...</p>
              </div>
              <button onClick={() => { setPreset('custom'); setCustomText(p.text); setShowSavedPrompts(false) }}
                className="px-3 py-1.5 rounded-[8px] bg-[rgba(0,255,170,0.1)] border border-[rgba(0,255,170,0.3)] text-[11px] font-bold text-[#00ffaa]">{t.mods.loadTemplate}</button>
              <button onClick={() => { setSavedPrompts(savedPrompts.filter(x => x.id !== p.id)); api.prompts.remove(p.id).catch(() => {}) }} className="w-6 h-6 flex items-center justify-center"><IconTrash size={12} color="rgba(255,80,80,0.6)" /></button>
            </div>
          ))}
        </div>
      </BottomSheet>

      {/* Emoji picker sheet */}
      <BottomSheet isOpen={showEmojiPicker} onClose={() => setShowEmojiPicker(false)} title="Premium Emoji">
        <div className="flex flex-col gap-2 pb-2">
          {savedEmojis.map(e => (
            <button key={e.id}
              onClick={() => insertSavedEmoji(e.stickerId, e.label, emojiTarget)}
              className="flex items-center gap-3 p-3 bg-[rgba(0,255,170,0.04)] border border-[rgba(0,255,170,0.15)] rounded-[12px] text-left hover:bg-[rgba(0,255,170,0.09)] hover:border-[rgba(0,255,170,0.35)] transition-all">
              <div className="w-9 h-9 rounded-[10px] bg-[rgba(0,255,170,0.07)] border border-[rgba(0,255,170,0.2)] flex items-center justify-center flex-shrink-0">
                <span className="text-[16px]">✨</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold">{e.label}</p>
                <p className="text-[10px] text-[rgba(255,255,255,0.3)] font-mono truncate">{e.stickerId}</p>
              </div>
              <span className="text-[11px] text-[rgba(0,255,170,0.6)] font-bold">{t.mods.insertEmojiBtn}</span>
            </button>
          ))}
        </div>
      </BottomSheet>

      {/* Saved footers sheet */}
      <BottomSheet isOpen={showSavedFooters} onClose={() => setShowSavedFooters(false)} title={t.mods.myFooters}>
        <div className="flex flex-col gap-2">
          {savedFooters.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8">
              <p className="text-[28px]">📋</p>
              <p className="text-[13px] font-bold text-[rgba(255,255,255,0.4)]">{t.mods.noSavedFooters}</p>
              <p className="text-[11px] text-[rgba(255,255,255,0.25)] text-center px-4 leading-relaxed">{t.mods.noSavedFootersDesc}</p>
            </div>
          ) : savedFooters.map(f => (
            <div key={f.id} className="flex items-center gap-3 p-3 bg-[rgba(0,255,170,0.04)] border border-[rgba(0,255,170,0.15)] rounded-[12px]">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold">{f.name}</p>
                <p className="text-[11px] text-[rgba(255,255,255,0.35)] truncate">{f.text.slice(0, 60)}</p>
              </div>
              <button onClick={() => { setFooterText(f.text); setGapLines(f.gapLines); setUseFooter(true); setShowSavedFooters(false) }}
                className="px-3 py-1.5 rounded-[8px] bg-[rgba(0,255,170,0.1)] border border-[rgba(0,255,170,0.3)] text-[11px] font-bold text-[#00ffaa]">{t.mods.loadTemplate}</button>
              <button onClick={() => { setSavedFooters(savedFooters.filter(x => x.id !== f.id)); api.footers.remove(f.id).catch(() => {}) }} className="w-6 h-6 flex items-center justify-center"><IconTrash size={12} color="rgba(255,80,80,0.6)" /></button>
            </div>
          ))}
        </div>
      </BottomSheet>
    </div>
  )
}
