import { useState, useRef } from 'react'
import { useApp } from '../../store/app'
import { IconZap, IconCheck, IconTrash, IconRefresh, IconSparkle, IconEdit, IconChevronRight, IconPlus, IconSettings, IconLink } from '../../components/Icons'
import Button from '../../components/Button'
import BottomSheet from '../../components/BottomSheet'
import api from '../../api/client'
import type { AIModel, ReadyPost } from '../../types'

type Lang = 'ru' | 'en' | 'tr'
type Preset = 'hot' | 'custom'

const HOT_TEXT: Record<Lang, string> = {
  en: "You can't handle what's coming tonight 🔥 VIP drop — first come first served.",
  ru: "Ты не готов к тому, что будет ночью 🔥 Эксклюзив в VIP — кто первый, того и тапки.",
  tr: "Bu gece hazır değilsin 🔥 VIP'te özel içerik.",
}

function renderPreview(raw: string): string {
  if (!raw.trim()) return ''
  let s = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  s = s.replace(/\*_(.+?)_\*/gs, '<b><i>$1</i></b>')
  s = s.replace(/\*(.+?)\*/gs, '<b>$1</b>')
  s = s.replace(/_(.+?)_/gs, '<i>$1</i>')
  s = s.replace(/\{([^{}]{1,60})\}/g, () => `<span style="color:#00ffaa">✨</span>`)
  return s.replace(/\n/g, '<br>')
}

function EmojiBar({ emojis, onInsert, onGoToSettings }: {
  emojis: { id: string; stickerId: string; label: string }[]
  onInsert: (stickerId: string, label: string) => void
  onGoToSettings: () => void
}) {
  if (emojis.length === 0) return (
    <button onClick={onGoToSettings}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[11px] font-bold transition-all active:scale-95"
      style={{ background: 'rgba(0,255,170,0.06)', border: '1px solid rgba(0,255,170,0.2)', color: 'rgba(0,255,170,0.7)' }}>
      <IconSettings size={12} color="rgba(0,255,170,0.7)" /> Добавить Premium Emoji
    </button>
  )
  return (
    <div className="flex flex-wrap gap-1.5">
      {emojis.map(e => (
        <button key={e.id} onClick={() => onInsert(e.stickerId, e.label)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-[8px] text-[10px] font-bold transition-all active:scale-95"
          style={{ background: 'rgba(0,255,170,0.07)', border: '1px solid rgba(0,255,170,0.18)', color: 'rgba(0,255,170,0.8)' }}>
          <IconSparkle size={10} color="rgba(0,255,170,0.8)" /> {e.label}
        </button>
      ))}
    </div>
  )
}

// ── Edit post sheet ───────────────────────────────────────────────────────────

function EditPostSheet({ post, onSave, onClose }: {
  post: ReadyPost; onSave: (caption: string) => void; onClose: () => void
}) {
  const { savedEmojis, navigate } = useApp()
  const [draft, setDraft] = useState(post.caption)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const insertEmoji = (stickerId: string, label: string) => {
    const token = `{${label}:${stickerId}}`
    const el = taRef.current
    if (el) {
      const pos = el.selectionStart
      setDraft(d => d.slice(0, pos) + token + d.slice(el.selectionEnd))
      setTimeout(() => { el.focus(); el.selectionStart = el.selectionEnd = pos + token.length }, 0)
    } else setDraft(d => d + token)
  }

  return (
    <BottomSheet isOpen onClose={onClose} title="Редактировать пост"
      footer={<Button fullWidth onClick={() => { onSave(draft); onClose() }}><IconCheck size={16} /> Сохранить</Button>}>
      <div className="flex flex-col gap-3 pb-2">
        {post.url && <img src={post.url} alt="" className="w-full h-36 object-cover rounded-[14px]"
          style={{ border: '1px solid rgba(255,255,255,0.07)' }} />}
        <textarea ref={taRef} value={draft} onChange={e => setDraft(e.target.value)} rows={6}
          className="w-full bg-[rgba(255,255,255,0.03)] rounded-[14px] px-4 py-3 text-[13px] leading-relaxed text-white resize-none outline-none transition-all"
          style={{ border: '1px solid rgba(0,255,170,0.2)' }} />
        {draft.trim() && (
          <div className="px-3 py-2 rounded-[12px]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-[9px] font-black uppercase tracking-[1px] text-[rgba(255,255,255,0.2)] mb-1">Предпросмотр</p>
            <p className="text-[12px] leading-relaxed text-white" dangerouslySetInnerHTML={{ __html: renderPreview(draft) }} />
          </div>
        )}
        <EmojiBar emojis={savedEmojis} onInsert={insertEmoji} onGoToSettings={() => { onClose(); navigate('settings') }} />
      </div>
    </BottomSheet>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ModelCaptionsTab({ model }: { model: AIModel }) {
  const { gallery, uploads, setUploads, readyPosts, setReadyPosts, savedEmojis, savedFooters, navigate } = useApp()

  // Single-photo mode
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null)
  // Bulk mode
  const [bulkPhotos, setBulkPhotos] = useState<string[]>([])
  const [bulkMode, setBulkMode] = useState<'separate' | 'pack'>('separate')
  const [bulkGenerating, setBulkGenerating] = useState(false)
  const [bulkProgress, setBulkProgress] = useState(0)

  const [preset, setPreset] = useState<Preset>('hot')
  const [customText, setCustomText] = useState('')
  const [lang, setLang] = useState<Lang>('ru')
  const [caption, setCaption] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Footer
  const [useFooter, setUseFooter] = useState(false)
  const [footerText, setFooterText] = useState('')
  const [gapLines, setGapLines] = useState(1)
  const [linkEntries, setLinkEntries] = useState([{ text: '', url: '' }])
  const [linkBold, setLinkBold] = useState(false)
  const [showLinkForm, setShowLinkForm] = useState(false)
  const footerRef = useRef<HTMLTextAreaElement>(null)

  // Picker state
  const [showPhotoPicker, setShowPhotoPicker] = useState(false)
  const [pickerSelection, setPickerSelection] = useState<string[]>([])

  // Storage state
  const [showAllPosts, setShowAllPosts] = useState(false)
  const [editingPost, setEditingPost] = useState<ReadyPost | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)
  const isBulk = bulkPhotos.length > 0
  const isPackMode = isBulk && bulkMode === 'pack'
  const isSeparateMode = isBulk && bulkMode === 'separate'

  const modelPhotos = [
    ...(model.previewUrl ? [model.previewUrl] : []),
    ...gallery.filter(g => g.modelId === model.id).map(g => g.url),
    ...uploads,
  ].filter(Boolean) as string[]

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    Promise.all(files.map(f => new Promise<string>(res => { const r = new FileReader(); r.onload = ev => res(ev.target?.result as string); r.readAsDataURL(f) }))).then(urls => {
      setUploads([...urls, ...uploads])
      if (showPhotoPicker) setPickerSelection(s => [...s, ...urls])
      else { setSelectedPhoto(urls[0]); setShowPhotoPicker(false) }
    })
    e.target.value = ''
  }

  const confirmPickerSelection = () => {
    if (!pickerSelection.length) return
    if (pickerSelection.length === 1) { setSelectedPhoto(pickerSelection[0]); setBulkPhotos([]) }
    else { setBulkPhotos(pickerSelection); setSelectedPhoto(null); setCaption(''); setBulkMode('separate') }
    setPickerSelection([]); setShowPhotoPicker(false)
  }

  const wrapFooterText = (marker: string) => {
    const el = footerRef.current; if (!el) return
    const s = el.selectionStart, e = el.selectionEnd
    const sel = footerText.slice(s, e)
    const inner = sel || (marker === '*' ? 'жирный' : 'курсив')
    const next = footerText.slice(0, s) + `${marker}${inner}${marker}` + footerText.slice(e)
    setFooterText(next)
    setTimeout(() => { el.focus(); el.selectionStart = s + marker.length; el.selectionEnd = s + marker.length + inner.length }, 0)
  }

  const insertLink = () => {
    const valid = linkEntries.filter(e => e.text.trim() && e.url.trim())
    if (!valid.length) return
    const chunk = valid.map(e => {
      const url = /^(https?:\/\/|tg:\/\/)/.test(e.url) ? e.url : `https://${e.url}`
      const inner = `[${e.text}](${url})`
      return linkBold ? `*${inner}*` : inner
    }).join(' - ')
    setFooterText(t => t ? `${t}${chunk}` : chunk)
    setLinkEntries([{ text: '', url: '' }])
    setShowLinkForm(false)
  }

  const combineWithFooter = (cap: string) =>
    useFooter && footerText.trim() ? `${cap}${'\n'.repeat(gapLines + 1)}${footerText}` : cap

  const generate = async () => {
    setLoading(true); setError(null)
    try {
      const r = await api.captions.generate({ prompt: customText, lang, type: preset, imageUrl: isPackMode ? bulkPhotos[0] : (selectedPhoto ?? undefined) })
      setCaption(r.caption)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('Недостаточно') || msg.includes('insufficient')) setError(msg)
      else setCaption(preset === 'custom' ? (customText || HOT_TEXT[lang]) : HOT_TEXT[lang])
    } finally { setLoading(false) }
  }

  const generateBulk = async () => {
    setBulkGenerating(true); setBulkProgress(0); setError(null)
    const newPosts: ReadyPost[] = []
    for (let i = 0; i < bulkPhotos.length; i++) {
      let captionText = ''
      try {
        const r = await api.captions.generate({ prompt: customText, lang, type: preset, imageUrl: bulkPhotos[i] })
        captionText = combineWithFooter(r.caption)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('Недостаточно') || msg.includes('insufficient')) { setError(msg); setBulkGenerating(false); setBulkProgress(0); return }
        captionText = combineWithFooter(preset === 'custom' ? (customText || HOT_TEXT[lang]) : HOT_TEXT[lang])
      }
      newPosts.push({ id: `${Date.now()}_${i}`, url: bulkPhotos[i], caption: captionText, createdAt: new Date().toLocaleDateString('ru') })
      setBulkProgress(i + 1)
    }
    setReadyPosts([...readyPosts, ...newPosts]); setBulkPhotos([]); setBulkGenerating(false)
  }

  const addToReady = () => {
    if (!caption.trim()) return
    const full = combineWithFooter(caption)
    const post: ReadyPost = isPackMode
      ? { id: Date.now().toString(), url: bulkPhotos[0], extraUrls: bulkPhotos.slice(1), caption: full, createdAt: new Date().toLocaleDateString('ru') }
      : { id: Date.now().toString(), url: selectedPhoto ?? undefined, caption: full, createdAt: new Date().toLocaleDateString('ru') }
    setReadyPosts([...readyPosts, post]); setCaption('')
    if (isPackMode) setBulkPhotos([])
    else setSelectedPhoto(null)
  }

  const deletePost = (id: string) => setReadyPosts(readyPosts.filter(p => p.id !== id))
  const updateCaption = (id: string, cap: string) => setReadyPosts(readyPosts.map(p => p.id === id ? { ...p, caption: cap } : p))
  const visiblePosts = showAllPosts ? readyPosts : readyPosts.slice(0, 3)

  const insertEmojiInCaption = (stickerId: string, label: string) => setCaption(c => c + `{${label}:${stickerId}}`)

  return (
    <div className="flex flex-col gap-4 pb-2">

      {/* ── Photo selector ── */}
      <div className="px-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,170,0.55)]">
            {isBulk ? `${bulkMode === 'pack' ? '📦 Пак' : 'Раздельно'}: ${bulkPhotos.length} фото` : 'Фото для описания'}
          </p>
          <button onClick={() => { setPickerSelection([]); setShowPhotoPicker(true) }}
            className="flex items-center gap-1 text-[10px] font-bold" style={{ color: 'rgba(0,255,170,0.7)' }}>
            <IconPlus size={11} color="rgba(0,255,170,0.7)" /> {isBulk ? 'Изменить' : 'Выбрать'}
          </button>
        </div>

        {isBulk ? (
          <div className="flex flex-col gap-2">
            <div className="flex gap-1 p-1 rounded-[12px]" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {(['separate', 'pack'] as const).map(m => (
                <button key={m} onClick={() => { setBulkMode(m); setCaption('') }}
                  className={`flex-1 py-1.5 rounded-[9px] text-[11px] font-black transition-all ${bulkMode === m ? 'bg-[rgba(0,255,170,0.15)] text-[#00ffaa]' : 'text-[rgba(255,255,255,0.3)]'}`}>
                  {m === 'separate' ? `Раздельно (${bulkPhotos.length})` : '📦 Пак (1 пост)'}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {bulkPhotos.map((url, i) => (
                <div key={i} className="relative flex-shrink-0 w-14 h-14 rounded-[11px] overflow-hidden"
                  style={{ border: `1px solid ${isPackMode && i === 0 ? 'rgba(0,255,170,0.5)' : 'rgba(0,255,170,0.25)'}` }}>
                  <img src={url} className="w-full h-full object-cover" />
                  {isPackMode && i === 0 && <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[7px] text-[#00ffaa] font-black text-center py-0.5">главное</div>}
                  <button onClick={() => setBulkPhotos(p => p.filter((_, j) => j !== i))}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 flex items-center justify-center text-[8px] text-white">✕</button>
                </div>
              ))}
              <button onClick={() => { setPickerSelection([...bulkPhotos]); setShowPhotoPicker(true) }}
                className="flex-shrink-0 w-14 h-14 rounded-[11px] flex items-center justify-center text-[20px]"
                style={{ border: '1px dashed rgba(0,255,170,0.25)', background: 'rgba(0,255,170,0.04)' }}>+</button>
            </div>
          </div>
        ) : (
          <button onClick={() => { setPickerSelection(selectedPhoto ? [selectedPhoto] : []); setShowPhotoPicker(true) }}
            className="w-full flex items-center gap-3 p-2.5 rounded-[14px] transition-all active:scale-[0.98]"
            style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${selectedPhoto ? 'rgba(0,255,170,0.25)' : 'rgba(255,255,255,0.07)'}` }}>
            <div className="w-12 h-12 rounded-[10px] overflow-hidden flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {selectedPhoto ? <img src={selectedPhoto} className="w-full h-full object-cover" /> : <span className="text-[20px]">📷</span>}
            </div>
            <p className="text-[12px] text-[rgba(255,255,255,0.45)] leading-snug flex-1 text-left">
              {selectedPhoto ? 'Фото выбрано — нажми чтобы сменить' : 'Нажми чтобы выбрать фото (необязательно)'}
            </p>
            {selectedPhoto && <button onClick={e => { e.stopPropagation(); setSelectedPhoto(null) }} className="text-[10px] text-[rgba(255,80,80,0.5)] flex-shrink-0 px-1">✕</button>}
          </button>
        )}
      </div>

      {/* ── Language + preset ── */}
      <div className="px-5 flex gap-3">
        <div className="flex-1">
          <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(255,255,255,0.3)] mb-1.5">Язык</p>
          <div className="flex gap-1">
            {(['ru', 'en', 'tr'] as Lang[]).map(l => (
              <button key={l} onClick={() => setLang(l)}
                className={`flex-1 py-2 rounded-[10px] text-[11px] font-black border transition-all
                  ${lang === l ? 'bg-[rgba(0,255,170,0.12)] border-[rgba(0,255,170,0.4)] text-[#00ffaa]' : 'bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.07)] text-[rgba(255,255,255,0.3)]'}`}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1">
          <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(255,255,255,0.3)] mb-1.5">Стиль</p>
          <div className="flex gap-1">
            {(['hot', 'custom'] as Preset[]).map(p => (
              <button key={p} onClick={() => setPreset(p)}
                className={`flex-1 py-2 rounded-[10px] text-[11px] font-black border transition-all
                  ${preset === p ? 'bg-[rgba(0,255,170,0.12)] border-[rgba(0,255,170,0.4)] text-[#00ffaa]' : 'bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.07)] text-[rgba(255,255,255,0.3)]'}`}>
                {p === 'hot' ? '🔥 Hot' : '✏️ Своё'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {preset === 'custom' && (
        <div className="px-5">
          <textarea value={customText} onChange={e => setCustomText(e.target.value)}
            placeholder="Напиши инструкцию для AI..." rows={3}
            className="w-full bg-[rgba(255,255,255,0.02)] rounded-[14px] px-4 py-3 text-[13px] text-white resize-none outline-none transition-all"
            style={{ border: '1px solid rgba(0,255,170,0.2)' }} />
        </div>
      )}

      {/* ── Footer section ── */}
      <div className="px-5">
        <div className="rounded-[16px] p-3.5" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] font-bold text-[rgba(255,255,255,0.45)]">📎 Футер</p>
            <button onClick={() => setUseFooter(v => !v)}
              className={`relative w-9 h-5 rounded-full border transition-all ${useFooter ? 'border-[#00ffaa]' : 'bg-[rgba(255,255,255,0.06)] border-[rgba(255,255,255,0.1)]'}`}
              style={useFooter ? { background: '#00ffaa', boxShadow: '0 0 8px rgba(0,255,170,0.4)' } : {}}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${useFooter ? 'left-4 bg-black' : 'left-0.5 bg-[rgba(255,255,255,0.4)]'}`} />
            </button>
          </div>
          {useFooter ? (
            <div className="flex flex-col gap-2 mt-1">
              {/* Saved footer chips */}
              {savedFooters.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {savedFooters.map(f => (
                    <button key={f.id} onClick={() => { setFooterText(f.text); setGapLines(f.gapLines ?? 1) }}
                      className={`flex-shrink-0 px-2.5 py-1 rounded-[8px] text-[10px] font-bold whitespace-nowrap transition-all
                        ${footerText === f.text ? 'bg-[rgba(0,255,170,0.15)] border border-[rgba(0,255,170,0.4)] text-[#00ffaa]' : 'bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.1)] text-[rgba(255,255,255,0.45)]'}`}>
                      {f.name}
                    </button>
                  ))}
                </div>
              )}
              {/* Textarea */}
              <textarea ref={footerRef} value={footerText} onChange={e => setFooterText(e.target.value)}
                placeholder="Текст футера..." rows={2}
                className="w-full bg-[rgba(255,255,255,0.02)] rounded-[12px] px-3 py-2.5 text-[12px] text-white resize-none outline-none transition-all"
                style={{ border: '1px solid rgba(0,255,170,0.18)' }} />
              {/* Preview */}
              {footerText.trim() && (
                <div className="px-3 py-2 rounded-[10px]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <p className="text-[8px] font-black uppercase tracking-[1px] text-[rgba(255,255,255,0.18)] mb-1">Предпросмотр</p>
                  <p className="text-[12px] leading-relaxed text-white" dangerouslySetInnerHTML={{ __html: renderPreview(footerText) }} />
                </div>
              )}
              {/* Format tools */}
              <div>
                <p className="text-[9px] text-[rgba(255,255,255,0.2)] mb-1.5">Выдели текст → нажми кнопку</p>
                <div className="flex gap-1.5 flex-wrap">
                  <button onClick={() => wrapFooterText('*')}
                    className="flex items-center gap-1 px-2.5 h-7 rounded-[7px] text-[12px] font-black text-[rgba(255,255,255,0.6)] transition-all active:scale-95"
                    style={{ border: '1px solid rgba(0,255,170,0.2)' }}>
                    B <span className="text-[9px] font-normal text-[rgba(255,255,255,0.3)]">жир</span>
                  </button>
                  <button onClick={() => wrapFooterText('_')}
                    className="flex items-center gap-1 px-2.5 h-7 rounded-[7px] text-[12px] italic font-bold text-[rgba(255,255,255,0.6)] transition-all active:scale-95"
                    style={{ border: '1px solid rgba(0,255,170,0.2)' }}>
                    I <span className="text-[9px] font-normal not-italic text-[rgba(255,255,255,0.3)]">курс</span>
                  </button>
                  <button onClick={() => setShowLinkForm(v => !v)}
                    className={`flex items-center gap-1 px-2.5 h-7 rounded-[7px] text-[11px] transition-all active:scale-95 ${showLinkForm ? 'bg-[rgba(0,255,170,0.12)] text-[#00ffaa]' : 'text-[rgba(0,255,170,0.7)]'}`}
                    style={{ border: '1px solid rgba(0,255,170,0.2)' }}>
                    <IconLink size={11} color={showLinkForm ? '#00ffaa' : 'rgba(0,255,170,0.7)'} /> Ссылка
                  </button>
                  <button onClick={() => setFooterText(t => t + '\n')}
                    className="px-2.5 h-7 rounded-[7px] text-[11px] text-[rgba(255,255,255,0.4)] transition-all active:scale-95"
                    style={{ border: '1px solid rgba(0,255,170,0.2)' }}>↵</button>
                  <EmojiBar emojis={savedEmojis} onInsert={(s, l) => setFooterText(t => t + `{${l}:${s}}`)} onGoToSettings={() => navigate('settings')} />
                </div>
              </div>
              {/* Link form */}
              {showLinkForm && (
                <div className="p-3 rounded-[12px] flex flex-col gap-2.5" style={{ background: 'rgba(0,255,170,0.04)', border: '1px solid rgba(0,255,170,0.15)' }}>
                  {linkEntries.map((entry, i) => (
                    <div key={i} className="flex flex-col gap-1.5">
                      {i > 0 && (
                        <div className="flex items-center gap-2 text-[rgba(255,255,255,0.2)] text-[10px] pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                          <span>— ссылка {i + 1}</span>
                          <button onClick={() => setLinkEntries(es => es.filter((_, j) => j !== i))} className="ml-auto text-[rgba(255,80,80,0.5)] text-[12px]">✕</button>
                        </div>
                      )}
                      <input value={entry.text} onChange={e => setLinkEntries(es => es.map((x, j) => j === i ? { ...x, text: e.target.value } : x))}
                        placeholder="Текст ссылки" className="w-full bg-[rgba(255,255,255,0.02)] rounded-[8px] px-3 py-2 text-[12px] text-white outline-none"
                        style={{ border: '1px solid rgba(0,255,170,0.2)' }} />
                      <input value={entry.url} onChange={e => setLinkEntries(es => es.map((x, j) => j === i ? { ...x, url: e.target.value } : x))}
                        placeholder="https://t.me/..." className="w-full bg-[rgba(255,255,255,0.02)] rounded-[8px] px-3 py-2 text-[12px] text-white outline-none"
                        style={{ border: '1px solid rgba(0,255,170,0.2)' }} />
                    </div>
                  ))}
                  {linkEntries.some(e => e.text || e.url) && (
                    <p className="text-[10px] text-[rgba(0,255,170,0.65)] font-mono bg-[rgba(0,0,0,0.3)] rounded-[8px] px-2.5 py-2 break-all leading-relaxed">
                      {linkEntries.filter(e => e.text || e.url).map(e => { const inner = `[${e.text}](${e.url})`; return linkBold ? `*${inner}*` : inner }).join(' - ')}
                    </p>
                  )}
                  <div className="flex gap-2 items-center">
                    <button onClick={() => setLinkBold(v => !v)}
                      className={`px-3 py-2 rounded-[8px] text-[12px] font-black transition-all ${linkBold ? 'bg-[rgba(0,255,170,0.15)] text-[#00ffaa]' : 'text-[rgba(255,255,255,0.4)]'}`}
                      style={{ border: '1px solid rgba(0,255,170,0.2)' }}>B</button>
                    <button onClick={() => setLinkEntries(es => [...es, { text: '', url: '' }])}
                      className="flex-1 py-2 rounded-[8px] text-[11px] text-[rgba(0,255,170,0.7)] transition-all"
                      style={{ border: '1px solid rgba(0,255,170,0.2)' }}>+ Ещё ссылку</button>
                    <button onClick={insertLink} className="flex-1 py-2 rounded-[8px] text-[12px] font-black"
                      style={{ background: '#00ffaa', color: '#000' }}>Вставить</button>
                  </div>
                </div>
              )}
              {/* Gap lines */}
              <div className="flex items-center gap-2">
                <p className="text-[10px] text-[rgba(255,255,255,0.3)] flex-1">Отступ между текстом и футером</p>
                <button onClick={() => setGapLines(g => Math.max(0, g - 1))} className="w-6 h-6 rounded-full flex items-center justify-center text-[#00ffaa] text-[14px]" style={{ border: '1px solid rgba(0,255,170,0.25)' }}>−</button>
                <span className="text-[13px] font-black text-[#00ffaa] w-4 text-center">{gapLines}</span>
                <button onClick={() => setGapLines(g => Math.min(5, g + 1))} className="w-6 h-6 rounded-full flex items-center justify-center text-[#00ffaa] text-[14px]" style={{ border: '1px solid rgba(0,255,170,0.25)' }}>+</button>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-[rgba(255,255,255,0.2)] mt-1">Добавляется после каждого описания</p>
          )}
        </div>
      </div>

      {error && (
        <div className="px-5">
          <div className="p-3 bg-[rgba(239,68,68,0.06)] border border-[rgba(239,68,68,0.2)] rounded-[12px]">
            <p className="text-[12px] text-red-400">{error}</p>
          </div>
        </div>
      )}

      {/* ── Generate button ── */}
      <div className="px-5">
        {bulkGenerating ? (
          <div className="flex flex-col gap-2">
            <p className="text-[12px] text-[rgba(255,255,255,0.6)] text-center">Генерирую {bulkProgress} / {bulkPhotos.length}...</p>
            <div className="w-full bg-[rgba(255,255,255,0.06)] rounded-full h-1.5">
              <div className="bg-[#00ffaa] h-1.5 rounded-full transition-all duration-300" style={{ width: `${(bulkProgress / bulkPhotos.length) * 100}%` }} />
            </div>
          </div>
        ) : (
          <>
            <Button fullWidth onClick={isSeparateMode ? generateBulk : generate}
              disabled={loading || (preset === 'custom' && !customText.trim())}>
              {loading
                ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> Генерирую...</span>
                : isSeparateMode ? <><IconZap size={17} /> Раздельно для всех ({bulkPhotos.length})</>
                : isPackMode ? <><IconZap size={17} /> Описание пака</>
                : <><IconZap size={17} /> Сгенерировать описание</>
              }
            </Button>
            <p className="text-[10px] text-[rgba(255,255,255,0.25)] text-center mt-1.5">
              {isSeparateMode ? `$0.025 × ${bulkPhotos.length} = $${(0.025 * bulkPhotos.length).toFixed(3)}` : 'генерация $0.025'}
            </p>
          </>
        )}
      </div>

      {/* ── Caption result ── */}
      {(!isBulk || isPackMode) && caption && (
        <div className="px-5 flex flex-col gap-2">
          <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={4}
            className="w-full bg-[rgba(255,255,255,0.02)] rounded-[14px] px-4 py-3 text-[13px] leading-relaxed text-white resize-none outline-none transition-all"
            style={{ border: '1px solid rgba(0,255,170,0.2)' }} />
          <EmojiBar emojis={savedEmojis} onInsert={insertEmojiInCaption} onGoToSettings={() => navigate('settings')} />
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => { setCaption(''); generate() }}>
              <IconRefresh size={15} /> Другое
            </Button>
            <Button className="flex-1" onClick={addToReady} disabled={!caption.trim()}>
              <IconCheck size={15} /> В готовые
            </Button>
          </div>
        </div>
      )}

      {/* ── Ready posts panel ── */}
      {readyPosts.length > 0 && (
        <div className="px-4 mt-1">
          <div style={{ background: 'rgba(255,255,255,0.025)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.07)', padding: '14px' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,170,0.55)]">Готовые посты ({readyPosts.length})</p>
              <div className="flex items-center gap-3">
                {readyPosts.length > 3 && (
                  <button onClick={() => setShowAllPosts(v => !v)} className="flex items-center gap-1 text-[10px] font-bold text-[rgba(0,255,170,0.7)]">
                    {showAllPosts ? 'Свернуть' : `Все ${readyPosts.length}`}<IconChevronRight size={12} color="rgba(0,255,170,0.7)" />
                  </button>
                )}
                <button onClick={() => setReadyPosts([])} className="text-[10px] font-bold text-[rgba(255,80,80,0.5)]">Очистить</button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {visiblePosts.map(post => (
                <div key={post.id} className="flex gap-2.5 p-2.5 rounded-[14px]"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  {post.url && (
                    <div className="relative flex-shrink-0">
                      <img src={post.url} alt="" className="w-12 h-12 rounded-[9px] object-cover" style={{ border: '1px solid rgba(255,255,255,0.08)' }} />
                      {post.extraUrls && post.extraUrls.length > 0 && (
                        <div className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-[6px] text-[8px] font-black"
                          style={{ background: 'rgba(0,255,170,0.9)', color: '#000' }}>
                          📦{post.extraUrls.length + 1}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-[rgba(255,255,255,0.22)] mb-0.5">{post.createdAt}</p>
                    <p className="text-[11px] text-[rgba(255,255,255,0.5)] leading-snug line-clamp-2"
                      dangerouslySetInnerHTML={{ __html: renderPreview(post.caption) }} />
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button onClick={() => setEditingPost(post)} className="w-7 h-7 rounded-[8px] flex items-center justify-center transition-all active:scale-90"
                      style={{ background: 'rgba(0,255,170,0.07)', border: '1px solid rgba(0,255,170,0.18)' }}>
                      <IconEdit size={12} color="rgba(0,255,170,0.7)" />
                    </button>
                    <button onClick={() => deletePost(post.id)} className="w-7 h-7 rounded-[8px] flex items-center justify-center transition-all active:scale-90"
                      style={{ background: 'rgba(255,80,80,0.06)', border: '1px solid rgba(255,80,80,0.15)' }}>
                      <IconTrash size={12} color="rgba(255,80,80,0.6)" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Photo picker sheet ── */}
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} />
      <BottomSheet
        isOpen={showPhotoPicker} onClose={() => { setShowPhotoPicker(false); setPickerSelection([]) }}
        title={pickerSelection.length > 1 ? `Выбрано: ${pickerSelection.length}` : 'Выбрать фото'}
        footer={
          <div className="flex flex-col gap-2">
            {pickerSelection.length > 0 && (
              <Button fullWidth onClick={confirmPickerSelection}>
                <IconCheck size={16} />
                {pickerSelection.length > 1 ? `Готово — ${pickerSelection.length} фото` : 'Выбрать'}
              </Button>
            )}
            <button onClick={() => fileRef.current?.click()}
              className="w-full py-2.5 rounded-[14px] text-[13px] font-bold"
              style={{ background: 'rgba(0,255,170,0.06)', border: '1px solid rgba(0,255,170,0.2)', color: '#00ffaa' }}>
              + Загрузить с устройства
            </button>
          </div>
        }>
        {modelPhotos.length > 0 ? (
          <>
            <p className="text-[10px] text-[rgba(255,255,255,0.3)] mb-2">1 фото — одиночный · несколько — пак или раздельно</p>
            <div className="grid grid-cols-3 gap-2 pb-2">
              {modelPhotos.map((url, i) => {
                const sel = pickerSelection.includes(url); const selIdx = pickerSelection.indexOf(url)
                return (
                  <button key={i} onClick={() => setPickerSelection(s => s.includes(url) ? s.filter(u => u !== url) : [...s, url])}
                    className="aspect-square rounded-[12px] overflow-hidden relative transition-all active:scale-95">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    {sel ? (
                      <div className="absolute inset-0 bg-[rgba(0,255,170,0.25)] flex items-center justify-center">
                        <div className="w-6 h-6 rounded-full bg-[#00ffaa] flex items-center justify-center text-black text-[11px] font-black">{selIdx + 1}</div>
                      </div>
                    ) : <div className="absolute top-1 right-1 w-5 h-5 rounded-full border-2 border-white/40 bg-black/30" />}
                  </button>
                )
              })}
            </div>
          </>
        ) : (
          <p className="text-[12px] text-[rgba(255,255,255,0.3)] text-center py-6">Фото появятся после генераций или загрузи своё</p>
        )}
      </BottomSheet>

      {editingPost && (
        <EditPostSheet post={editingPost} onSave={cap => updateCaption(editingPost.id, cap)} onClose={() => setEditingPost(null)} />
      )}
    </div>
  )
}
