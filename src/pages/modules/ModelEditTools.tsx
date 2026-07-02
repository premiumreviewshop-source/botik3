import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { IconPlus, IconZap } from '../../components/Icons'
import Button from '../../components/Button'
import api, { BalanceError } from '../../api/client'
import type { AIModel, GeneratedPhoto } from '../../types'
import { supabaseUrl, supabaseKey } from '../../lib/supabase'

export type ToolType = 'faceswap' | 'outfit' | 'pose' | 'create' | 'carousel'
type PhotoValue = File | string | null

const SAFE_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
}

async function uploadFile(file: File): Promise<string> {
  const rawExt = (file.name.split('.').pop() ?? 'jpg').toLowerCase()
  const ext = SAFE_MIME[rawExt] ? rawExt : 'jpg'
  const mime = SAFE_MIME[ext] ?? 'image/jpeg'
  const path = `edits/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
  const base = supabaseUrl.replace(/\/$/, '')
  const resp = await fetch(`${base}/storage/v1/object/model-images/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${supabaseKey}`, apikey: supabaseKey, 'Content-Type': mime, 'x-upsert': 'true' },
    body: await file.arrayBuffer(),
  })
  if (!resp.ok) throw new Error(`upload failed: ${resp.status}`)
  return `${base}/storage/v1/object/public/model-images/${path}`
}

async function resolveUrl(value: PhotoValue): Promise<string> {
  if (!value) throw new Error('No photo selected')
  if (typeof value === 'string') return value
  return uploadFile(value)
}

function previewSrc(value: PhotoValue): string | null {
  if (!value) return null
  if (typeof value === 'string') return value
  return URL.createObjectURL(value)
}

// ── Tool icons ─────────────────────────────────────────────────────────────────

function ToolIcon({ id, color, size = 16 }: { id: ToolType; color: string; size?: number }) {
  const s = { stroke: color, strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' }
  if (id === 'faceswap') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="9" cy="9" r="4" {...s} />
      <circle cx="16" cy="15" r="4" {...s} />
      <path d="M5.5 9c0-1.93 1.57-3.5 3.5-3.5s3.5 1.57 3.5 3.5" {...s} strokeOpacity={0.4} />
      <path d="M19.5 15c0 1.93-1.57 3.5-3.5 3.5s-3.5-1.57-3.5-3.5" {...s} strokeOpacity={0.4} />
    </svg>
  )
  if (id === 'outfit') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M8.5 3L6 6l-4 2 2.5 2.5L4 20h16l-.5-9.5L22 8l-4-2-2.5-3" {...s} />
      <path d="M8.5 3Q10 5 12 5t3.5-2" {...s} />
    </svg>
  )
  if (id === 'pose') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="14" rx="2.5" {...s} />
      <path d="M3 17l5-5 4 3 3.5-4.5L21 17" {...s} strokeOpacity={0.45} />
      <path d="M8 21h8M12 17v4" {...s} />
      <path d="M13.5 8l2.5 2.5-5.5 5.5-3 .5.5-3L13.5 8z" {...s} />
    </svg>
  )
  if (id === 'carousel') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="5" y="4" width="14" height="16" rx="2" {...s} />
      <path d="M2 7v10M22 7v10" {...s} strokeOpacity={0.4} />
      <path d="M8 10h8M8 14h5" {...s} strokeOpacity={0.55} />
    </svg>
  )
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2" {...s} strokeOpacity={0.5} />
      <circle cx="12" cy="12" r="4" {...s} />
      <circle cx="12" cy="12" r="1.5" fill={color} stroke="none" opacity={0.7} />
    </svg>
  )
}

// ── Tool definitions ───────────────────────────────────────────────────────────

export const TOOLS: { id: ToolType; label: string; desc: string; longDesc: string; color: string; isNew?: boolean }[] = [
  { id: 'faceswap',      label: 'FaceSwap',  color: '#00ffaa',
    desc: 'Вставь лицо модели в любое фото',
    longDesc: 'Накладывает лицо твоей модели на любое фото. Естественное освещение и текстура кожи сохраняются — контент без фотосессий.' },
  { id: 'carousel',      label: 'Карусель',  color: '#ff6b9d', isNew: true,
    desc: 'Несколько поз из одного фото',
    longDesc: 'Из одного фото нейросеть создаёт несколько уникальных поз. Загрузи фото, выбери количество — получи готовую карусель для постов.' },
  { id: 'outfit',        label: 'Одежда',    color: '#c084fc', isNew: true,
    desc: 'Замени одежду по фото-референсу',
    longDesc: 'Переносит одежду с любого референса на модель. Лицо, тело и поза остаются — меняется только одежда.' },
  { id: 'pose',          label: 'Редактор',  color: '#6bffd9', isNew: true,
    desc: 'Редактируй фото своими промптами',
    longDesc: 'Точное управление через текст: меняй детали, добавляй объекты, изменяй фон. Полный контроль над каждым элементом.' },
  { id: 'create',        label: 'Внедрить модель', color: '#a78bfa', isNew: true,
    desc: 'Внедри модель в любой референс',
    longDesc: 'Берёт фото модели и референс — внедряет твою модель в сцену референса, сохраняя позу, окружение и стиль.' },
]

// ── Tool Selector: active card + bottom sheet picker ──────────────────────────

export function ToolSelector({ selected, onSelect }: { selected: ToolType; onSelect: (t: ToolType) => void }) {
  const [open, setOpen] = useState(false)
  const tool = TOOLS.find(t => t.id === selected)!

  return (
    <div className="px-4">
      <style>{`
        @keyframes toolCarpet{from{opacity:0;transform:translateY(-8px) scaleY(0.95);transform-origin:top}to{opacity:1;transform:translateY(0) scaleY(1)}}
        @keyframes toolFadeIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      {/* Active tool — big card */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-[20px] border transition-all active:scale-[0.97]"
        style={{ background: '#0a0a0a', borderColor: open ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)' }}>
        <div className="w-11 h-11 rounded-[14px] flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <ToolIcon id={tool.id} color="rgba(255,255,255,0.85)" size={22} />
        </div>
        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-black leading-none text-white">{tool.label}</span>
            {tool.isNew && <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wide bg-[rgba(255,255,255,0.1)] text-[rgba(255,255,255,0.5)]">NEW</span>}
          </div>
          <p className="text-[11px] text-[rgba(255,255,255,0.32)] leading-tight mt-1 truncate">{tool.desc}</p>
        </div>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2.5" strokeLinecap="round"
          style={{ transition: 'transform 0.22s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {/* Dropdown — opens downward */}
      {open && (
        <div className="mt-1.5 flex flex-col rounded-[18px] overflow-hidden"
          style={{ background: '#080808', border: '1px solid rgba(255,255,255,0.07)', animation: 'toolCarpet 0.22s cubic-bezier(0.34,1.1,0.64,1) both' }}>
          {TOOLS.filter(t => t.id !== selected).map((t, i) => (
            <button key={t.id}
              onClick={() => { onSelect(t.id); setOpen(false) }}
              className="flex items-center gap-3 px-4 py-3.5 text-left transition-all active:bg-[rgba(255,255,255,0.04)]"
              style={{ animation: `toolFadeIn 0.18s ease ${i * 0.04}s both`, borderBottom: i < TOOLS.length - 2 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
              <div className="w-9 h-9 rounded-[11px] flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}>
                <ToolIcon id={t.id} color="rgba(255,255,255,0.65)" size={17} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-black text-white">{t.label}</span>
                  {t.isNew && <span className="text-[7px] font-black px-1 py-0.5 rounded-full uppercase tracking-wide bg-[rgba(255,255,255,0.08)] text-[rgba(255,255,255,0.4)]">NEW</span>}
                </div>
                <p className="text-[10px] text-[rgba(255,255,255,0.28)] leading-tight truncate">{t.desc}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Gallery bottom sheet ───────────────────────────────────────────────────────

function GallerySheet({ gallery, selected, onPick, onDevice, onClose }: {
  gallery: string[]; selected: PhotoValue
  onPick: (url: string) => void; onDevice: () => void; onClose: () => void
}) {
  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}>
      <div
        className="flex flex-col gap-4 px-4 pt-4 pb-8 rounded-t-[24px]"
        style={{ background: '#0d0d0d', borderTop: '1px solid rgba(255,255,255,0.08)', animation: 'slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1) both' }}
        onClick={e => e.stopPropagation()}>
        <style>{`@keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
        <div className="w-10 h-1 bg-[rgba(255,255,255,0.15)] rounded-full mx-auto" />

        <button
          onClick={() => { onDevice(); onClose() }}
          className="flex items-center gap-3 px-4 py-3.5 rounded-[16px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] text-left transition-all active:scale-[0.98]">
          <div className="w-9 h-9 rounded-[11px] bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.1)] flex items-center justify-center flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.8" strokeLinecap="round">
              <rect x="2" y="6" width="20" height="14" rx="2"/><path d="M7 6V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1"/><circle cx="12" cy="13" r="3"/>
            </svg>
          </div>
          <div>
            <p className="text-[14px] font-bold text-white">С устройства</p>
            <p className="text-[11px] text-[rgba(255,255,255,0.35)]">Загрузить новое фото</p>
          </div>
        </button>

        {gallery.length > 0 && <>
          <p className="text-[11px] font-black uppercase tracking-[1.5px] text-[rgba(255,255,255,0.3)]">Из хранилища — {gallery.length} фото</p>
          <div className="grid grid-cols-3 gap-2 overflow-y-auto" style={{ maxHeight: '45vh' }}>
            {gallery.map((url, i) => (
              <button key={i} onClick={() => { onPick(url); onClose() }}
                className="relative aspect-square rounded-[12px] overflow-hidden border transition-all active:scale-95"
                style={{ borderColor: selected === url ? '#00ffaa' : 'rgba(255,255,255,0.08)', boxShadow: selected === url ? '0 0 0 2px #00ffaa40' : 'none' }}>
                <img src={url} className="w-full h-full object-cover" alt="" />
                {selected === url && (
                  <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#00ffaa] flex items-center justify-center">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3.5"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                )}
              </button>
            ))}
          </div>
        </>}
      </div>
    </div>,
    document.body,
  )
}

// ── Shared ─────────────────────────────────────────────────────────────────────

function PhotoSlot({ label, hint, value, onValue, gallery, disabled, aspect = 'portrait' }: {
  label: string; hint?: string; value: PhotoValue; onValue: (v: PhotoValue) => void
  gallery?: string[]; disabled?: boolean; aspect?: 'square' | 'portrait'
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [showSheet, setShowSheet] = useState(false)
  const preview = previewSrc(value)
  const hasGallery = !!(gallery && gallery.length > 0)

  const handleClick = () => {
    if (disabled) return
    if (hasGallery) setShowSheet(true)
    else ref.current?.click()
  }

  return (
    <div>
      <p className="text-[11px] font-bold text-[rgba(255,255,255,0.45)] mb-1.5">{label}</p>
      <button
        type="button" onClick={handleClick} disabled={disabled}
        className="w-full rounded-[16px] border-2 border-dashed flex items-center justify-center transition-all overflow-hidden"
        style={{
          height: aspect === 'square' ? 90 : 110,
          borderColor: value ? 'rgba(0,255,170,0.4)' : 'rgba(255,255,255,0.1)',
          background: value ? 'transparent' : 'rgba(255,255,255,0.02)',
        }}>
        <input ref={ref} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onValue(f); e.target.value = '' }}
        />
        {preview
          ? <img src={preview} className="w-full h-full object-cover" alt="" />
          : <div className="flex flex-col items-center gap-1.5">
              <IconPlus size={22} color="rgba(255,255,255,0.18)" />
              <span className="text-[11px] text-[rgba(255,255,255,0.22)]">{hint ?? 'Нажми для загрузки'}</span>
            </div>}
      </button>

      {showSheet && (
        <GallerySheet
          gallery={gallery ?? []} selected={value}
          onPick={url => onValue(url)}
          onDevice={() => ref.current?.click()}
          onClose={() => setShowSheet(false)}
        />
      )}
    </div>
  )
}

function ToolInfo({ text }: { text: string }) {
  return (
    <div className="mx-5 p-3.5 rounded-[14px] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)]">
      <p className="text-[11px] text-[rgba(255,255,255,0.32)] leading-relaxed">{text}</p>
    </div>
  )
}

function makePlaceholder(job: { id: string }, model: AIModel): GeneratedPhoto {
  return { id: job.id, modelId: model.id, modelName: model.name, url: '', createdAt: new Date().toISOString(), status: 'processing' }
}

interface EditToolProps { model: AIModel; onNewGen: (g: GeneratedPhoto) => void; gallery: string[] }

type PhotoModelChoice = 'nb' | 'wan'

function PhotoModelSelector({ value, onChange }: { value: PhotoModelChoice; onChange: (v: PhotoModelChoice) => void }) {
  const opts = [
    { id: 'nb' as const, name: 'Nano Banana', desc: 'Качественный · реалистичный' },
    { id: 'wan' as const, name: 'WAN 2.7', desc: 'Интим-контент · работает хорошо' },
  ]
  return (
    <div className="flex gap-2 mt-3">
      {opts.map(o => {
        const active = value === o.id
        return (
          <button key={o.id} onClick={() => onChange(o.id)}
            className="flex-1 flex flex-col gap-1 px-3 py-2.5 rounded-[13px] border transition-all active:scale-[0.97] text-left"
            style={{
              background: active ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.02)',
              borderColor: active ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)',
            }}>
            <span className="text-[12px] font-black" style={{ color: active ? '#fff' : 'rgba(255,255,255,0.5)' }}>{o.name}</span>
            <p className="text-[9px] leading-tight" style={{ color: 'rgba(255,255,255,0.25)' }}>{o.desc}</p>
          </button>
        )
      })}
    </div>
  )
}

// ── Outfit Tool helpers ────────────────────────────────────────────────────────

const OUTFIT_GROK_SYSTEM = `Ты — эксперт по работе с референсами, переносу одежды и точному контролю над генерацией.
Тебе дано два изображения:
• Image 1 — основная модель (референс). Это твоя девушка.
• Image 2 — источник одежды (может быть другая модель в желаемой одежде или отдельное фото одежды).
Твоя задача — не менять модель, а создать максимально точный промт для Nano Banana, который перенесёт одежду со второй фотографии на первую модель.
Этапы работы:
1. Анализ изображений Тщательно проанализируй:
 • Image 1: лицо, фигуру, пропорции тела, позу, ракурс, освещение, выражение лица.
 • Image 2: детали одежды (крой, ткань, посадку, цвет, фактуру, декоративные элементы, длину, силуэт).
2. Перенос одежды Создай один промт, который:
 • Полностью сохраняет внешность модели из Image 1 (лицо, причёску, тело, пропорции, позу, ракурс, освещение).
 • Переносит одежду из Image 2 максимально точно и 1 в 1 (стиль, дизайн, все детали, фактура, цвет).
 • Адаптирует одежду под особенности фигуры модели из Image 1 (правильная посадка, естественные складки, натяжение ткани, соответствие пропорциям груди, талии, бёдер, роста и т.д.).
 • Делает так, чтобы одежда выглядела естественно и идеально сидела именно на этой девушке.
Ключевые требования к результату:
• Лицо, тело и пропорции модели не меняются ни на миллиметр.
• Поза, ракурс и композиция остаются идентичными Image 1.
• Одежда переносится с высокой детализацией и точностью.
• Никаких искажений фигуры, никаких изменений в пропорциях.
• Одежда должна выглядеть так, будто модель изначально была в ней снята.
Формирование промта
Составь детальный, чёткий и оптимизированный промт специально для Nano Banana, который содержит:
• Полное описание модели из Image 1 (лицо, тело, поза, ракурс).
• Точное и подробное описание одежды из Image 2.
• Чёткие инструкции на сохранение оригинальной модели и адаптацию одежды под неё.
• Указания на высокое качество посадки, естественные складки ткани и освещение.
Главное правило: результат должен выглядеть так, будто это та же девушка в той же позе и ракурсе, но уже переодетая в точную копию одежды из второго изображения.`

async function callGrokForOutfit(modelUrl: string, outfitUrl: string): Promise<string> {
  const key = import.meta.env.VITE_XAI_API_KEY
  if (!key) throw new Error('VITE_XAI_API_KEY не настроен')
  const resp = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'grok-4.3',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: OUTFIT_GROK_SYSTEM },
          { type: 'image_url', image_url: { url: modelUrl } },
          { type: 'image_url', image_url: { url: outfitUrl } },
        ],
      }],
      max_tokens: 2000,
    }),
  })
  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`Grok ${resp.status}: ${body.slice(0, 200)}`)
  }
  const data = await resp.json()
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error('Grok вернул пустой ответ')
  return text as string
}


// ── Outfit Tool ────────────────────────────────────────────────────────────────

export function OutfitTool({ model, onNewGen, gallery }: EditToolProps) {
  const [modelPhoto, setModelPhoto] = useState<PhotoValue>(null)
  const [outfitPhoto, setOutfitPhoto] = useState<PhotoValue>(null)
  const [running, setRunning] = useState(false)
  const [stage, setStage] = useState('')
  const [err, setErr] = useState('')
  const [photoModel, setPhotoModel] = useState<PhotoModelChoice>('nb')

  const run = async () => {
    if (!modelPhoto || !outfitPhoto || running) return
    setRunning(true); setErr(''); setStage('Загрузка фото...')
    try {
      const [modelUrl, outfitUrl] = await Promise.all([resolveUrl(modelPhoto), resolveUrl(outfitPhoto)])
      setStage('Нейросеть анализирует одежду...')
      const prompt = await callGrokForOutfit(modelUrl, outfitUrl)
      setStage('Запуск генерации...')
      const job = await api.generate.edit({ type: 'outfit', modelId: model.id, imageUrls: [modelUrl, outfitUrl], prompt, model: photoModel })
      onNewGen(makePlaceholder(job, model))
      setStage('')
    } catch (e) { const _m = e instanceof Error ? e.message : String(e); if (e instanceof BalanceError || _m.includes('Недостаточно') || _m.includes('insufficient')) { window.dispatchEvent(new CustomEvent('balance:insufficient', { detail: _m })) } else { setErr(_m) } setStage('') }
    finally { setRunning(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="px-5 grid grid-cols-2 gap-3">
        <PhotoSlot label="Фото модели" hint="Фото для смены одежды" value={modelPhoto} onValue={setModelPhoto} gallery={gallery} disabled={running} />
        <PhotoSlot label="Фото одежды" hint="Образец одежды" value={outfitPhoto} onValue={setOutfitPhoto} disabled={running} />
      </div>
      <div className="px-5">
        <Button fullWidth disabled={!modelPhoto || !outfitPhoto || running} onClick={run}>
          <IconZap size={16} />{running ? (stage || 'Генерация...') : 'Сменить одежду'}
        </Button>
        <PhotoModelSelector value={photoModel} onChange={setPhotoModel} />
        <p className="text-[10px] text-[rgba(255,255,255,0.25)] text-center mt-2">{photoModel === 'nb' ? '$0.22' : '$0.125'} за генерацию</p>
        {err && <p className="text-[11px] text-red-400 mt-2 text-center">{err}</p>}
      </div>
      <ToolInfo text="Загрузи фото модели и фото с нужной одеждой. Нейросеть перенесёт одежду, сохранив лицо, тело и позу." />
    </div>
  )
}


// ── Carousel Tool ─────────────────────────────────────────────────────────────

const SCENE_TRANSFER_SYSTEM = `Ты — профессиональный Prompt Engineer и эксперт по точному переносу моделей в референсные сцены для AI-генерации (Nano Banana).
Тебе даны два изображения:
• Изображение 1 (первое прикреплённое) — это референс модели (полный рост моей модели). Это основной источник внешности: точные физические параметры тела, формы, пропорции, рост, объёмы (грудь, талия, бёдра, руки, ноги, плечи), кожа, цвет кожи, текстура кожи, точная одежда со всеми деталями, причёска, цвет и текстура волос.
• Изображение 2 (второе прикреплённое) — это референс сцены (поза, ракурс, освещение, композиция, общая атмосфера и настроение).

Твоя задача — создать один максимально детальный, длинный и оптимизированный промт для Nano Banana, который позволит точно внедрить мою модель из Изображения 1 в сцену Изображения 2.

Анализ (выполни мысленно):
• Из Изображения 1 извлеки все точные характеристики моей модели: тело, пропорции, формы, позу на её фото (как ориентир), одежду (крой, ткань, посадка, все складки, детали), волосы, макияж, кожа.
• Из Изображения 2 извлеки: ракурс, угол съёмки, композицию, точную позу (положение тела, рук, ног, пальцев, наклон головы, изгибы), освещение (направление, тип света, тени, блики, температура), общую атмосферу, настроение, стиль пространства.

Требования к результату:
• Моя модель должна быть перенесена полностью идентичной — без каких-либо изменений физических параметров, форм тела, пропорций, объёмов, одежды, причёски, цвета волос.
• Поза, ракурс, угол съёмки, перспектива — взяты точно из Изображения 2.
• Освещение и атмосфера — реализуются в духе Изображения 2, но как новая интерпретация.
• Одежда, тело и все детали модели — строго из Изображения 1.
• Никаких изменений, дополнений, удалений или искажений модели. Идеальная интеграция без артефактов.
• Удаляй татуировки, пирсинг.

Создай один coherent, очень детальный промт для Nano Banana:
Опиши максимально точно:
• Точную позу, ракурс, композицию и перспективу из референса сцены.
• Полное детальное описание тела, форм, пропорций, кожи, освещения и теней моей модели из первого изображения.
• Полное детальное описание одежды моей модели (все детали, ткани, складки, посадка).
• Причёску, волосы, макияж.
• Общий дух, атмосферу, тип пространства и настроение из референса сцены — реализованные как новое оригинальное окружение, не копирующее конкретные детали Изображения 2.
• Идеальное совмещение освещения, теней и цветокоррекции между телом модели и сценой.

В конце промта обязательно добавь сильный блок инструкций:

"Use the body, exact physical proportions, body shape, breast size, waist, hips, limbs, skin tone, skin texture, clothing (every detail), hair color, hair style and all appearance details strictly from the first attached image (model reference). Transfer this exact model into the second reference image. Keep the pose, camera angle, perspective, and lighting mood 100% identical to the second reference image. The background, environment and all surrounding elements must be fully reimagined and recreated from scratch — inspired by the general atmosphere, space type and mood of the second reference image, but not copying any specific detail, object, furniture piece, texture or element. Every background detail must be original and unique. Perform perfect body replacement and seamless integration. High precision, photorealistic blending, natural skin and clothing interaction with light, zero artifacts, no deformations, no additions or removals to the model."

Промт должен быть очень длинным, предельно детальным, профессиональным и готовым к прямому использованию в Nano Banana вместе с двумя прикреплёнными изображениями.

Выводи только готовый финальный промт — без объяснений, без анализа, без лишнего текста. Просто чистый текст, который я смогу скопировать и использовать`


async function callGrokForSceneTransfer(modelUrl: string, refUrl: string): Promise<string> {
  const key = import.meta.env.VITE_XAI_API_KEY
  if (!key) throw new Error('VITE_XAI_API_KEY не настроен')
  const resp = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'grok-4.3',
      messages: [{ role: 'user', content: [
        { type: 'text', text: SCENE_TRANSFER_SYSTEM },
        { type: 'image_url', image_url: { url: modelUrl } },
        { type: 'image_url', image_url: { url: refUrl } },
      ]}],
      max_tokens: 3000,
    }),
  })
  if (!resp.ok) { const b = await resp.text(); throw new Error(`Grok scene ${resp.status}: ${b.slice(0, 200)}`) }
  const data = await resp.json()
  const text: string = data.choices?.[0]?.message?.content ?? ''
  if (!text) throw new Error('Grok вернул пустой ответ')
  return text
}

export function CarouselTool({ model, onNewGen, gallery }: EditToolProps) {
  const [modelPhoto, setModelPhoto] = useState<PhotoValue>(null)
  const [refPhoto, setRefPhoto] = useState<PhotoValue>(null)
  const [count, setCount] = useState(3)
  const [countStr, setCountStr] = useState('3')
  const [running, setRunning] = useState(false)
  const [stage, setStage] = useState('')
  const [err, setErr] = useState('')
  const [photoModel, setPhotoModel] = useState<PhotoModelChoice>('nb')

  const run = async () => {
    if (!modelPhoto || !refPhoto || running || count < 1) return
    setRunning(true); setErr(''); setStage('Загрузка фото...')
    try {
      const [modelUrl, refUrl] = await Promise.all([resolveUrl(modelPhoto), resolveUrl(refPhoto)])

      setStage('Нейросеть анализирует референс...')
      const nanoBananaPrompt = await callGrokForSceneTransfer(modelUrl, refUrl)

      setStage('Запуск генерации...')
      const result = await api.carousel.generate({
        modelUrl, refUrl, nanoBananaPrompt, count,
        modelId: model.id,
        modelPreviewUrl: model.previewUrl,
        model: photoModel,
      })

      for (const id of result.ids) {
        onNewGen({ id, modelId: model.id, modelName: model.name, url: '', createdAt: new Date().toISOString(), status: 'carousel' })
      }
      setStage('')
    } catch (e) { const _m = e instanceof Error ? e.message : String(e); if (e instanceof BalanceError || _m.includes('Недостаточно') || _m.includes('insufficient')) { window.dispatchEvent(new CustomEvent('balance:insufficient', { detail: _m })) } else { setErr(_m) } setStage('') }
    finally { setRunning(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="px-5 grid grid-cols-2 gap-3">
        <PhotoSlot label="Фото модели" hint="Полный рост, нужная одежда" value={modelPhoto} onValue={setModelPhoto} gallery={gallery} disabled={running} />
        <PhotoSlot label="Референс из Instagram" hint="Нужный стиль / поза / сцена" value={refPhoto} onValue={setRefPhoto} disabled={running} />
      </div>
      <div className="px-5">
        <p className="text-[11px] font-bold text-[rgba(255,255,255,0.45)] mb-2">Сколько фото в карусели? (до 10)</p>
        <input
          type="text" inputMode="numeric" pattern="[0-9]*" disabled={running}
          value={countStr}
          onChange={e => {
            const raw = e.target.value.replace(/[^0-9]/g, '')
            setCountStr(raw)
            const n = parseInt(raw)
            if (!isNaN(n)) setCount(Math.min(10, Math.max(1, n)))
          }}
          onBlur={() => {
            const clamped = Math.min(10, Math.max(1, parseInt(countStr) || 1))
            setCount(clamped)
            setCountStr(String(clamped))
          }}
          placeholder="например 5"
          className="w-full px-4 py-3 rounded-[14px] text-[15px] font-black text-white outline-none"
          style={{ background: 'rgba(255,107,157,0.07)', border: '1px solid rgba(255,107,157,0.25)', caretColor: '#ff6b9d' }}
        />
      </div>
      <div className="px-5">
        <Button fullWidth disabled={!modelPhoto || !refPhoto || running || !countStr || count < 1} onClick={run}>
          <IconZap size={16} />{running ? (stage || 'Генерация...') : `Создать карусель (${count} фото)`}
        </Button>
        <PhotoModelSelector value={photoModel} onChange={setPhotoModel} />
        <p className="text-[10px] text-[rgba(255,255,255,0.25)] text-center mt-2">
          {photoModel === 'wan' ? `$0.25 × ${count} = $${(0.25 * count).toFixed(2)}` : `$0.325 × ${count} = $${(0.325 * count).toFixed(2)}`} за {count} фото
        </p>
        {err && <p className="text-[11px] text-red-400 mt-2 text-center">{err}</p>}
      </div>
      <ToolInfo text="Загрузи фото модели (полный рост) и референс из Instagram. Нейросеть перенесёт модель в стиль референса, затем создаст несколько уникальных поз с фейсвапом." />
    </div>
  )
}

// ── Entry card for PhotoEditTool ──────────────────────────────────────────────

type EditEntry = { prompt: string; photo: PhotoValue }

function EntryCard({ index, entry, gallery, disabled, fileRef, onPrompt, onPhoto }: {
  index: number; entry: EditEntry; gallery: string[]; disabled: boolean
  fileRef: (el: HTMLInputElement | null) => void
  onPrompt: (v: string) => void; onPhoto: (v: PhotoValue) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [showSheet, setShowSheet] = useState(false)
  const preview = previewSrc(entry.photo)

  const handleRefClick = () => {
    if (disabled) return
    if (gallery.length > 0) setShowSheet(true)
    else ref.current?.click()
  }

  return (
    <div className="rounded-[16px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] p-3 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-[1.5px] text-[rgba(255,255,255,0.3)]">Вариант {index + 1}</p>
        <input type="file" accept="image/*" className="hidden"
          ref={el => { ref.current = el; fileRef(el) }}
          onChange={ev => { const f = ev.target.files?.[0]; if (f) onPhoto(f); ev.target.value = '' }}
        />
        <button onClick={handleRefClick} disabled={disabled}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[9px] border transition-all"
          style={{
            background: entry.photo ? 'rgba(0,255,170,0.08)' : 'rgba(255,255,255,0.03)',
            borderColor: entry.photo ? 'rgba(0,255,170,0.3)' : 'rgba(255,255,255,0.1)',
          }}>
          {preview
            ? <img src={preview} className="w-4 h-4 rounded-[3px] object-cover" alt="" />
            : <IconPlus size={11} color="rgba(255,255,255,0.3)" />}
          <span className="text-[10px] font-bold" style={{ color: entry.photo ? '#00ffaa' : 'rgba(255,255,255,0.3)' }}>
            {entry.photo ? 'Референс ✓' : 'Референс'}
          </span>
        </button>
      </div>

      {showSheet && (
        <GallerySheet
          gallery={gallery} selected={entry.photo}
          onPick={url => onPhoto(url)}
          onDevice={() => ref.current?.click()}
          onClose={() => setShowSheet(false)}
        />
      )}

      <textarea
        value={entry.prompt}
        onChange={ev => onPrompt(ev.target.value)}
        placeholder="Опиши изменение: поза, одежда, фон, освещение, действие..."
        disabled={disabled}
        className="w-full rounded-[12px] p-3 text-[13px] text-white placeholder-[rgba(255,255,255,0.18)] bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] resize-none focus:border-[rgba(255,215,107,0.3)] focus:outline-none transition-colors"
        rows={2}
      />
    </div>
  )
}

// ── Photo Edit Tool ────────────────────────────────────────────────────────────

export function PhotoEditTool({ model, onNewGen, gallery }: EditToolProps) {
  const [modelPhoto, setModelPhoto] = useState<PhotoValue>(null)
  const [count, setCount] = useState(1)
  const [entries, setEntries] = useState<EditEntry[]>([{ prompt: '', photo: null }])
  const [running, setRunning] = useState(false)
  const [err, setErr] = useState('')
  const [photoModel, setPhotoModel] = useState<PhotoModelChoice>('nb')
  const photoRefs = useRef<(HTMLInputElement | null)[]>([null, null, null, null])

  const updateCount = (n: number) => {
    setCount(n)
    setEntries(prev => {
      const next = [...prev]
      while (next.length < n) next.push({ prompt: '', photo: null })
      return next.slice(0, n)
    })
  }

  const updateEntry = (i: number, patch: Partial<EditEntry>) =>
    setEntries(prev => prev.map((e, idx) => idx === i ? { ...e, ...patch } : e))

  const validEntries = entries.filter(e => e.prompt.trim())
  const allHavePhoto = validEntries.length > 0 && validEntries.every(e => !!e.photo)
  const canRun = (allHavePhoto || !!modelPhoto) && validEntries.length > 0 && !running

  const run = async () => {
    if (!canRun) return
    setRunning(true); setErr('')
    try {
      const mainUrl = modelPhoto ? await resolveUrl(modelPhoto) : null
      const jobs = await Promise.all(
        validEntries.map(async e => {
          const photoUrl = e.photo ? await resolveUrl(e.photo) : mainUrl!
          return api.generate.edit({ type: 'pose', modelId: model.id, imageUrls: [photoUrl], prompt: e.prompt.trim(), model: photoModel })
        })
      )
      jobs.forEach(job => onNewGen(makePlaceholder(job, model)))
    } catch (e) { const _m = e instanceof Error ? e.message : String(e); if (e instanceof BalanceError || _m.includes('Недостаточно') || _m.includes('insufficient')) { window.dispatchEvent(new CustomEvent('balance:insufficient', { detail: _m })) } else { setErr(_m) } }
    finally { setRunning(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      {!allHavePhoto && (
        <div className="px-5">
          <PhotoSlot
            label={`Основное фото${allHavePhoto ? '' : ' (для вариантов без своего)'}`}
            hint="Будет применено к вариантам без фото"
            value={modelPhoto} onValue={setModelPhoto} gallery={gallery} disabled={running}
          />
        </div>
      )}

      <div className="px-5">
        <p className="text-[11px] font-bold text-[rgba(255,255,255,0.45)] mb-2">Количество вариантов</p>
        <div className="flex gap-2">
          {[1, 2, 3, 4].map(n => (
            <button key={n} onClick={() => !running && updateCount(n)}
              className={`flex-1 py-2.5 rounded-[12px] text-[14px] font-black border transition-all
                ${count === n
                  ? 'bg-[rgba(255,215,107,0.12)] border-[rgba(255,215,107,0.45)] text-[#ffd96b]'
                  : 'bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.08)] text-[rgba(255,255,255,0.35)]'}`}>
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 flex flex-col gap-2.5">
        {entries.map((e, i) => (
          <EntryCard key={i} index={i} entry={e} gallery={gallery} disabled={running}
            fileRef={el => { photoRefs.current[i] = el }}
            onPrompt={v => updateEntry(i, { prompt: v })}
            onPhoto={v => updateEntry(i, { photo: v })}
          />
        ))}
      </div>

      <div className="px-5">
        <Button fullWidth disabled={!canRun} onClick={run}>
          <IconZap size={16} />
          {running ? 'Генерация...' : count > 1 ? `Изменить (${count} фото)` : 'Изменить фото'}
        </Button>
        <PhotoModelSelector value={photoModel} onChange={setPhotoModel} />
        <p className="text-[10px] text-[rgba(255,255,255,0.25)] text-center mt-2">
          {photoModel === 'nb' ? `$0.20 × ${count} = $${(0.20 * count).toFixed(2)}` : `$0.125 × ${count} = $${(0.125 * count).toFixed(2)}`}
        </p>
        {err && <p className="text-[11px] text-red-400 mt-2 text-center">{err}</p>}
      </div>
      <ToolInfo text="Загрузи фото модели и опиши что изменить. Для каждого варианта можно прикрепить референс-фото или выбрать из хранилища. Все варианты генерируются одновременно." />
    </div>
  )
}

// ── Create New Photo ───────────────────────────────────────────────────────────

export function CreatePhotoTool({ model, onNewGen, gallery }: EditToolProps) {
  const [modelPhoto, setModelPhoto] = useState<PhotoValue>(null)
  const [refPhoto, setRefPhoto] = useState<PhotoValue>(null)
  const [running, setRunning] = useState(false)
  const [stage, setStage] = useState('')
  const [err, setErr] = useState('')
  const [photoModel, setPhotoModel] = useState<PhotoModelChoice>('nb')

  const run = async () => {
    if (!modelPhoto || !refPhoto || running) return
    setRunning(true); setErr(''); setStage('Загрузка...')
    try {
      const [modelUrl, refUrl] = await Promise.all([resolveUrl(modelPhoto), resolveUrl(refPhoto)])
      setStage('Анализ референса...')
      const job = await api.generate.edit({ type: 'create', modelId: model.id, imageUrls: [modelUrl, refUrl], model: photoModel })
      onNewGen(makePlaceholder(job, model))
      setStage('')
    } catch (e) { const _m = e instanceof Error ? e.message : String(e); if (e instanceof BalanceError || _m.includes('Недостаточно') || _m.includes('insufficient')) { window.dispatchEvent(new CustomEvent('balance:insufficient', { detail: _m })) } else { setErr(_m) } setStage('') }
    finally { setRunning(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="px-5 grid grid-cols-2 gap-3">
        <PhotoSlot label="Фото модели" hint="Твоя модель" value={modelPhoto} onValue={setModelPhoto} gallery={gallery} disabled={running} />
        <PhotoSlot label="Референс" hint="Образец для фото" value={refPhoto} onValue={setRefPhoto} disabled={running} />
      </div>
      <div className="px-5">
        <Button fullWidth disabled={!modelPhoto || !refPhoto || running} onClick={run}>
          <IconZap size={16} />{running ? (stage || 'Генерация...') : 'Создать новое фото'}
        </Button>
        <PhotoModelSelector value={photoModel} onChange={setPhotoModel} />
        <p className="text-[10px] text-[rgba(255,255,255,0.25)] text-center mt-2">{photoModel === 'nb' ? '$0.30' : '$0.15'} за генерацию</p>
        {err && <p className="text-[11px] text-red-400 mt-2 text-center">{err}</p>}
      </div>
      <ToolInfo text="Загрузи фото модели и референс. Нейросеть реплицирует сцену с твоей моделью." />
    </div>
  )
}
