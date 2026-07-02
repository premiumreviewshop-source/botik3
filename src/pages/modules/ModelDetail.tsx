import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../../store/app'
import { useLang } from '../../store/lang'
import {
  IconBack, IconPlus, IconTrash, IconImage,
  IconCheck, IconZap, IconDownload, IconX, IconChevronRight, IconVideo, IconPhoto,
} from '../../components/Icons'
import Button from '../../components/Button'
import BottomSheet from '../../components/BottomSheet'
import ModelVideoTab from './ModelVideoTab'
import ModelCaptionsTab from './ModelCaptionsTab'
import ModelSpooferTab from './ModelSpooferTab'
import {
  ToolSelector, OutfitTool, PhotoEditTool, CreatePhotoTool, CarouselTool,
  type ToolType,
} from './ModelEditTools'
import api from '../../api/client'
import type { GeneratedPhoto } from '../../types/index'
import { supabaseUrl, supabaseKey } from '../../lib/supabase'
import { downloadFile } from '../../lib/download'
import { stripExif } from '../../lib/imageClean'

// ── Prompts ──────────────────────────────────────────────────────────────────

const PROMPT_FACESWAP = `Replace the woman in the second reference image with the woman from the first reference image. The first image is the identity reference and must be strictly preserved: keep her face, body shape, exact proportions, and silhouette unchanged. Do not modify anatomy, do not stretch or resize body parts. Use the outfit from the second reference image. The clothing, styling, and fit must match the second image exactly. Transfer the woman from the first image into the pose of the second image, matching body position precisely while keeping original proportions. The second image defines the environment: keep the same background, camera angle, framing, perspective, and composition. Match the lighting from the second image exactly: same light direction, intensity, shadows, highlights, and color grading. Match the image quality of the second photo: same resolution, sharpness, noise level, skin detail, lens characteristics, and overall realism. Do not enhance or degrade quality — replicate it exactly. Ensure seamless blending into the scene with correct depth and perspective. No stylization, no reinterpretation, no body reshaping. Photorealistic, natural result good quality, delete tattoo on hand, no text`

// ── Upload helper ─────────────────────────────────────────────────────────────

const SAFE_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
}

async function uploadForSwap(file: File): Promise<string> {
  // Strip EXIF metadata before uploading to AI — protects privacy + avoids metadata leaks
  const cleaned = await stripExif(file).catch(() => file)
  const rawExt = (cleaned.name.split('.').pop() ?? 'jpg').toLowerCase()
  const ext = SAFE_MIME[rawExt] ? rawExt : 'jpg'
  const mime = SAFE_MIME[ext] ?? 'image/jpeg'
  const path = `faceswap/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
  const base = supabaseUrl.replace(/\/$/, '')
  const resp = await fetch(`${base}/storage/v1/object/model-images/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${supabaseKey}`,
      apikey: supabaseKey,
      'Content-Type': mime,
      'x-upsert': 'true',
    },
    body: await cleaned.arrayBuffer(),
  })
  if (!resp.ok) throw new Error(`upload failed: ${resp.status}`)
  return `${base}/storage/v1/object/public/model-images/${path}`
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Status = 'idle' | 'uploading' | 'processing' | 'done' | 'error' | 'leaving'
type PhotoItem = { id: string; file: File; previewUrl: string; status: Status; errorMsg?: string }

const BORDER: Record<Status, string> = {
  idle: 'rgba(0,255,170,0.22)',
  uploading: 'rgba(251,191,36,0.45)',
  processing: 'rgba(251,191,36,0.45)',
  done: 'rgba(0,255,170,0.55)',
  error: 'rgba(239,68,68,0.4)',
  leaving: 'rgba(0,255,170,0.3)',
}

const CLASSIC_LABELS: Record<string, string> = {
  faceswap: 'FaceSwap',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ModelDetail() {
  const { goBack, models, selectedModelId, gallery, setGallery } = useApp()
  const { t } = useLang()
  const model = models.find(m => m.id === selectedModelId)

  const TABS = ['photo', 'video', 'captions', 'spoofer'] as const
  type TabKey = typeof TABS[number]
  const [mainMode, setMainMode] = useState<TabKey>('photo')
  const [slideDir, setSlideDir] = useState<'left' | 'right'>('right')
  const [animKey, setAnimKey] = useState(0)
  const switchMode = (next: TabKey) => {
    if (next === mainMode) return
    setSlideDir(TABS.indexOf(next) > TABS.indexOf(mainMode) ? 'right' : 'left')
    setMainMode(next)
    setAnimKey(k => k + 1)
  }

  const [selectedTool, setSelectedTool] = useState<ToolType>('faceswap')
  const [photoModel, setPhotoModel] = useState<'nb' | 'wan'>('nb')
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [running, setRunning] = useState(false)
  const [showStorage, setShowStorage] = useState(false)
  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const [promptOpen, setPromptOpen] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const fileRef = useRef<HTMLInputElement>(null)
  const photoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  if (!model) return null

  // ── Reload this model's generations from DB (background support) ──────────
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const reloadModelGens = useCallback(async () => {
    try {
      const fresh = await api.generate.listByModel(model.id)
      setGallery([
        ...fresh,
        ...gallery.filter((g: GeneratedPhoto) => g.modelId !== model.id),
      ])
    } catch {}
  // gallery intentionally excluded: stale is fine — we replace only this model's rows
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.id, setGallery])

  // Reload from DB on mount — picks up any completions that happened while app was in background
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => { reloadModelGens() }, [model.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll every 5s while processing generations exist
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const hasProcessing = gallery.some(
      g => g.modelId === model.id && (g.status === 'processing' || g.status === 'carousel' || !g.status),
    )
    if (!hasProcessing) {
      if (photoTimerRef.current) { clearInterval(photoTimerRef.current); photoTimerRef.current = null }
      return
    }
    if (photoTimerRef.current) return
    photoTimerRef.current = setInterval(reloadModelGens, 5000)
    return () => { if (photoTimerRef.current) { clearInterval(photoTimerRef.current); photoTimerRef.current = null } }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gallery.some(g => g.modelId === model.id && (g.status === 'processing' || g.status === 'carousel' || !g.status)), model.id])

  // Reload on tab focus
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') reloadModelGens() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reloadModelGens])

  const modelGallery = gallery.filter(g => g.modelId === model.id)
  const reversedGallery = [...modelGallery].reverse()
  const readyGallery = reversedGallery.filter(g => g.status !== 'processing' && g.status !== 'carousel' && g.url)
  const modelPhoto = model.previewUrl ?? ''
  const canFaceSwap = !!modelPhoto && !modelPhoto.toLowerCase().includes('.safetensors')
  const needsModelPhoto = true
  const isClassicTool = selectedTool === 'faceswap'

  const addFiles = (files: File[]) => {
    const items: PhotoItem[] = files
      .filter(f => f.type.startsWith('image/'))
      .map(f => ({
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        file: f,
        previewUrl: URL.createObjectURL(f),
        status: 'idle' as Status,
      }))
    if (items.length) setPhotos(p => [...p, ...items])
  }

  const updatePhoto = (id: string, patch: Partial<PhotoItem>) =>
    setPhotos(p => p.map(ph => ph.id === id ? { ...ph, ...patch } : ph))

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (!running) addFiles(Array.from(e.dataTransfer.files))
  }

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files))
    e.target.value = ''
  }

  const removeFromGallery = async (id: string) => {
    try {
      await api.generate.remove(id)
      setGallery(gallery.filter(g => g.id !== id))
    } catch {}
  }

  const downloadPhoto = (url: string, idx: number) =>
    downloadFile(url, `photo_${idx + 1}.jpg`)

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const downloadSelected = async () => {
    const items = readyGallery.filter(g => selectedIds.has(g.id))
    for (let i = 0; i < items.length; i++) {
      await downloadPhoto(items[i].url, i)
      if (i < items.length - 1) await new Promise(r => setTimeout(r, 350))
    }
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  const deleteSelected = async () => {
    const ids = [...selectedIds]
    await Promise.all(ids.map(id => api.generate.remove(id).catch(() => {})))
    setGallery(gallery.filter(g => !selectedIds.has(g.id)))
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  const openLightbox = (idx: number) => {
    setShowStorage(false)
    setPromptOpen(false)
    setTimeout(() => setLightboxIdx(idx), 120)
  }

  const closeLightbox = () => {
    setLightboxIdx(null)
    setTimeout(() => setShowStorage(true), 80)
  }

  const scheduleLeavingAnimation = (photoId: string) => {
    setTimeout(() => {
      updatePhoto(photoId, { status: 'leaving' })
      setTimeout(() => setPhotos(p => p.filter(x => x.id !== photoId)), 420)
    }, 1500)
  }

  const addToGallery = (gen: GeneratedPhoto) => {
    setNewIds(prev => new Set([...prev, gen.id]))
    setGallery([...gallery.filter((g: GeneratedPhoto) => g.id !== gen.id), gen])
  }

  const runFaceSwap = async () => {
    const queue = photos.filter(p => p.status === 'idle')
    if (!queue.length) return
    if (needsModelPhoto && !canFaceSwap) return
    setRunning(true)

    const prompt = PROMPT_FACESWAP

    // Submit all photos in parallel — background cron handles completion
    const newPlaceholders: GeneratedPhoto[] = []

    await Promise.all(queue.map(async (photo) => {
      updatePhoto(photo.id, { status: 'uploading' })
      try {
        const uploadedUrl = await uploadForSwap(photo.file)
        updatePhoto(photo.id, { status: 'processing' })

        const job = await api.generate.start({ prompt, modelId: model.id, imageUrls: [modelPhoto, uploadedUrl], model: photoModel })

        newPlaceholders.push({
          id: job.id,
          modelId: model.id,
          modelName: model.name,
          url: '',
          createdAt: new Date().toISOString(),
          status: 'processing',
        })
        setNewIds(prev => new Set([...prev, job.id]))
        updatePhoto(photo.id, { status: 'done' })
        scheduleLeavingAnimation(photo.id)
      } catch (err) {
        updatePhoto(photo.id, { status: 'error', errorMsg: String(err) })
      }
    }))

    // Single setGallery call after all promises settle — avoids stale closure overwrites
    if (newPlaceholders.length) {
      const placeholderIds = new Set(newPlaceholders.map(p => p.id))
      setGallery([...gallery.filter((g: GeneratedPhoto) => !placeholderIds.has(g.id)), ...newPlaceholders])
    }

    setRunning(false)
  }

  const idleCount = photos.filter(p => p.status === 'idle').length
  const doneCount = photos.filter(p => p.status === 'done').length
  const activeCount = photos.filter(p => p.status === 'uploading' || p.status === 'processing').length

  const processingPhotoCount = modelGallery.filter(g => g.status === 'processing' || g.status === 'carousel').length
  const readyPhotoCount = modelGallery.filter(g => g.status === 'ready' || !g.status).length

  const storageTitle = (
    <div className="flex items-center justify-between w-full pr-1">
      <span>
        {t.mods.storageLabel} — {readyPhotoCount} {t.mods.photoTab.toLowerCase()}
        {processingPhotoCount > 0 && <span className="text-amber-400 ml-1.5">· {processingPhotoCount} AI</span>}
      </span>
      <button
        onClick={() => { setSelectMode(s => !s); setSelectedIds(new Set()) }}
        className={`text-[12px] font-bold px-3 py-1 rounded-[8px] transition-all
          ${selectMode
            ? 'text-white bg-[rgba(255,255,255,0.08)]'
            : 'text-[#00ffaa] hover:bg-[rgba(0,255,170,0.08)]'}`}>
        {selectMode ? t.common.cancel : t.mods.selectBtn}
      </button>
    </div>
  )

  const storageFooter = selectMode && selectedIds.size > 0 ? (
    <div className="flex gap-3 pb-1">
      <button
        onClick={downloadSelected}
        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-[13px]
          bg-[rgba(0,255,170,0.1)] border border-[rgba(0,255,170,0.3)] text-[13px] font-bold text-[#00ffaa]">
        <IconDownload size={16} color="#00ffaa" />
        {t.mods.downloadBtn} ({selectedIds.size})
      </button>
      <button
        onClick={deleteSelected}
        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-[13px]
          bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.25)] text-[13px] font-bold text-red-400">
        <IconTrash size={15} color="#f87171" />
        {t.common.delete} ({selectedIds.size})
      </button>
    </div>
  ) : undefined

  return (
    <div className="flex flex-col gap-5 pt-4 pb-8">
      <style>{`
        @keyframes dropIn {
          from { opacity:0; transform:translateY(-18px) scale(.88); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        @keyframes popIn {
          from { opacity:0; transform:scale(.82) translateY(10px); }
          to   { opacity:1; transform:scale(1) translateY(0); }
        }
        @keyframes rollAway {
          0%   { opacity:1; transform:scale(1) translateX(0) rotate(0deg); }
          35%  { opacity:1; transform:scale(1.06) translateX(6px) rotate(4deg); }
          100% { opacity:0; transform:scale(0.5) translateX(55px) rotate(18deg); }
        }
        @keyframes lbIn {
          from { opacity:0; transform:scale(0.96); }
          to   { opacity:1; transform:scale(1); }
        }
        @keyframes slideFromRight {
          from { opacity:0; transform:translateX(32px); }
          to   { opacity:1; transform:translateX(0); }
        }
        @keyframes slideFromLeft {
          from { opacity:0; transform:translateX(-32px); }
          to   { opacity:1; transform:translateX(0); }
        }
      `}</style>

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-5">
        <button onClick={goBack}
          className="w-10 h-10 rounded-[14px] flex items-center justify-center transition-all duration-200 active:scale-[0.92]" style={{ background: 'rgba(0,255,170,0.06)', border: '1px solid rgba(0,255,170,0.2)' }}>
          <IconBack size={20} color="#00ffaa" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[2px] text-[rgba(0,255,170,0.5)]">{t.mods.aiModelBadge}</p>
          <h1 className="text-[20px] font-black tracking-tight truncate">{model.name}</h1>
        </div>
      </div>

      {/* ── Mode tabs — sliding indicator ── */}
      <div className="px-5">
        <div className="relative rounded-[18px]"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', padding: '6px' }}>
          {/* Sliding pill indicator */}
          <div className="absolute rounded-[13px] pointer-events-none"
            style={{
              top: '6px', bottom: '6px',
              width: 'calc((100% - 30px) / 4)',
              left: `calc(6px + ${TABS.indexOf(mainMode)} * ((100% - 30px) / 4 + 6px))`,
              transition: 'left 0.22s cubic-bezier(0.34,1.3,0.64,1), background 0.18s, border-color 0.18s',
              background: mainMode === 'spoofer' ? 'rgba(139,92,246,0.15)' : 'rgba(0,255,170,0.1)',
              border: `1.5px solid ${mainMode === 'spoofer' ? 'rgba(139,92,246,0.4)' : 'rgba(0,255,170,0.35)'}`,
            }} />
          {/* Tab buttons */}
          <div className="grid grid-cols-4 gap-1.5 relative">
            {([
              { key: 'photo'    as TabKey, label: t.mods.photoTab,    icon: (a: boolean) => <IconPhoto size={18} color={a ? '#00ffaa' : 'rgba(255,255,255,0.35)'} /> },
              { key: 'video'    as TabKey, label: t.mods.videoTab,    icon: (a: boolean) => <IconVideo size={18} color={a ? '#00ffaa' : 'rgba(255,255,255,0.35)'} /> },
              { key: 'captions' as TabKey, label: t.mods.captionsTab, icon: (a: boolean) => <IconZap   size={18} color={a ? '#00ffaa' : 'rgba(255,255,255,0.35)'} /> },
              { key: 'spoofer'  as TabKey, label: t.spoofer.tabLabel,
                icon: (a: boolean) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                  stroke={a ? 'rgba(139,92,246,1)' : 'rgba(255,255,255,0.35)'}
                  strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>,
              },
            ]).map(tab => {
              const isActive = mainMode === tab.key
              const isSpoofer = tab.key === 'spoofer'
              return (
                <button key={tab.key} onClick={() => switchMode(tab.key)}
                  className="flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-[13px] transition-all active:scale-[0.92] select-none">
                  {tab.icon(isActive)}
                  <span className="text-[9px] font-black uppercase tracking-[0.5px] leading-none transition-colors"
                    style={{ color: isActive ? (isSpoofer ? 'rgba(139,92,246,1)' : '#00ffaa') : 'rgba(255,255,255,0.3)' }}>
                    {tab.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Swipeable content area ── */}
      <div key={animKey}
        className="flex flex-col gap-5"
        style={{ animation: `slide${slideDir === 'right' ? 'FromRight' : 'FromLeft'} 0.22s ease both`, overflowX: 'hidden' }}>

      {/* ── Video mode ── */}
      {mainMode === 'video' && <ModelVideoTab model={model} gallery={gallery} />}

      {/* ── Captions mode ── */}
      {mainMode === 'captions' && <ModelCaptionsTab model={model} />}

      {/* ── Spoofer mode ── */}
      {mainMode === 'spoofer' && <ModelSpooferTab />}

      {/* ── Photo mode content ── */}
      {mainMode === 'photo' && <>

      {/* ── Tool selector tab bar ── */}
      <ToolSelector selected={selectedTool} onSelect={t => { setSelectedTool(t); setPhotos([]) }} />

      {/* ── Tool content (carpet animation on switch) ── */}
      <div key={selectedTool} style={{ animation: 'toolCarpet 0.22s cubic-bezier(0.34,1.15,0.64,1) both' }}>
      {selectedTool === 'carousel'   && <CarouselTool    model={model} onNewGen={addToGallery} gallery={readyGallery.map(g => g.url).filter(Boolean)} />}
      {selectedTool === 'outfit'     && <OutfitTool      model={model} onNewGen={addToGallery} gallery={readyGallery.map(g => g.url).filter(Boolean)} />}
      {selectedTool === 'pose'       && <PhotoEditTool   model={model} onNewGen={addToGallery} gallery={readyGallery.map(g => g.url).filter(Boolean)} />}
      {selectedTool === 'create'     && <CreatePhotoTool model={model} onNewGen={addToGallery} gallery={readyGallery.map(g => g.url).filter(Boolean)} />}

      {/* ── Classic tool content (faceswap / nude / swap+nude) ── */}
      {isClassicTool && <>
        {needsModelPhoto && !canFaceSwap && (
          <p className="text-[10px] text-amber-400/70 px-6">{t.mods.noModelPhotoHint}</p>
        )}
        <div className="px-5">
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleInput} />
          <div
            onClick={() => !running && fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); if (!running) setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`w-full rounded-[22px] border-2 border-dashed transition-all duration-300 select-none
              flex flex-col items-center justify-center gap-3 py-10
              ${dragOver ? 'border-[#00ffaa] bg-[rgba(0,255,170,0.07)] scale-[0.99]'
                : running ? 'border-[rgba(0,255,170,0.1)] bg-[#060606] cursor-default'
                : 'border-[rgba(0,255,170,0.2)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(0,255,170,0.4)] hover:bg-[rgba(0,255,170,0.03)] cursor-pointer'}`}
            style={dragOver ? { boxShadow: '0 0 36px rgba(0,255,170,0.14)' } : {}}>
            <div className={`w-16 h-16 rounded-full border flex items-center justify-center transition-all duration-300
              ${dragOver ? 'bg-[rgba(0,255,170,0.14)] border-[rgba(0,255,170,0.5)] scale-110' : 'bg-[rgba(0,255,170,0.06)] border-[rgba(0,255,170,0.2)]'}`}>
              <IconPlus size={28} color={dragOver ? '#00ffaa' : 'rgba(0,255,170,0.5)'} />
            </div>
            <div className="text-center">
              <p className="text-[15px] font-bold text-[rgba(255,255,255,0.55)]">
                {dragOver ? t.mods.dropToUpload : t.mods.uploadRefForProcessing}
              </p>
              <p className="text-[11px] text-[rgba(255,255,255,0.22)] mt-1">
                {photos.length > 0 ? `${photos.length} ${t.mods.photoTab.toLowerCase()} · ${t.mods.tapToGallery.toLowerCase()}` : t.mods.tapOrDrag}
              </p>
            </div>
          </div>
        </div>

        {photos.length > 0 && (
          <div className="px-5">
            <div className="flex gap-2.5 overflow-x-auto pb-1.5" style={{ scrollSnapType: 'x mandatory' }}>
              {photos.map((ph, idx) => (
                <div key={ph.id}
                  className="w-[70px] h-[88px] flex-shrink-0 relative rounded-[13px] overflow-hidden bg-[#050505]"
                  style={{
                    scrollSnapAlign: 'start',
                    border: `1.5px solid ${BORDER[ph.status]}`,
                    animation: ph.status === 'leaving'
                      ? 'rollAway 0.42s ease-in both'
                      : `dropIn 0.38s cubic-bezier(0.34,1.56,0.64,1) ${idx * 0.06}s both`,
                  }}>
                  <img src={ph.previewUrl} className="w-full h-full object-cover" alt="" />
                  {(ph.status === 'uploading' || ph.status === 'processing') && (
                    <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center gap-1">
                      <div className="w-5 h-5 rounded-full border-2 border-amber-400/30 border-t-amber-400 animate-spin" />
                      <p className="text-[7px] font-black text-amber-300 uppercase tracking-[0.5px]">
                        {ph.status === 'uploading' ? 'Upload' : 'AI'}
                      </p>
                    </div>
                  )}
                  {(ph.status === 'done' || ph.status === 'leaving') && (
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                      <div className="w-6 h-6 rounded-full bg-[#00ffaa] flex items-center justify-center"
                        style={{ boxShadow: '0 0 12px rgba(0,255,170,0.9)' }}>
                        <IconCheck size={12} color="black" />
                      </div>
                    </div>
                  )}
                  {ph.status === 'error' && (
                    <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-0.5 px-1">
                      <span className="text-red-400 text-[14px] font-black">✕</span>
                      {ph.errorMsg && (
                        <span className="text-[6px] text-red-300/80 text-center leading-tight break-all">
                          {ph.errorMsg.slice(0, 40)}
                        </span>
                      )}
                    </div>
                  )}
                  {!running && ph.status === 'idle' && (
                    <button onClick={() => setPhotos(p => p.filter(x => x.id !== ph.id))}
                      className="absolute top-1 right-1 w-[18px] h-[18px] rounded-full bg-black/75 flex items-center justify-center">
                      <IconTrash size={8} color="#ff5555" />
                    </button>
                  )}
                </div>
              ))}
              {!running && (
                <button onClick={() => fileRef.current?.click()}
                  className="w-[70px] h-[88px] flex-shrink-0 rounded-[13px] border-2 border-dashed border-[rgba(0,255,170,0.14)] bg-[rgba(255,255,255,0.02)]
                    hover:border-[rgba(0,255,170,0.35)] transition-all flex items-center justify-center"
                  style={{ scrollSnapAlign: 'start' }}>
                  <IconPlus size={16} color="rgba(0,255,170,0.3)" />
                </button>
              )}
            </div>
          </div>
        )}

        {running && (
          <div className="px-5">
            <div className="p-3.5 bg-[rgba(251,191,36,0.05)] border border-[rgba(251,191,36,0.18)] rounded-[14px] flex items-center gap-3">
              <div className="w-4 h-4 rounded-full border-2 border-amber-400/25 border-t-amber-400 animate-spin flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-amber-400">
                  {activeCount > 0 ? `${t.mods.uploadRefForProcessing} ${activeCount}...` : t.mods.finishingLabel}
                </p>
                {doneCount > 0 && (
                  <p className="text-[10px] text-[rgba(255,255,255,0.3)] mt-0.5">{doneCount} / {photos.length}</p>
                )}
              </div>
              {doneCount > 0 && <span className="text-[13px] font-black text-[#00ffaa]">{doneCount}/{photos.length}</span>}
            </div>
          </div>
        )}

        <div className="px-5">
          <Button fullWidth disabled={!idleCount || running || (needsModelPhoto && !canFaceSwap)} onClick={runFaceSwap}>
            <IconZap size={18} />
            {photos.length === 0 ? (CLASSIC_LABELS[selectedTool!] ?? '')
              : idleCount > 0 ? `${CLASSIC_LABELS[selectedTool!]} (${idleCount})`
              : `${CLASSIC_LABELS[selectedTool!]} ✓`}
          </Button>
          {/* NB / WAN model selector */}
          <div className="flex gap-2 mt-3">
            {([
              { id: 'nb' as const, name: 'Nano Banana', desc: 'Качественный · реалистичный', price: '$0.20' },
              { id: 'wan' as const, name: 'WAN 2.7', desc: 'Интим-контент · работает хорошо', price: '$0.125' },
            ]).map(o => {
              const active = photoModel === o.id
              return (
                <button key={o.id} onClick={() => setPhotoModel(o.id)} disabled={running}
                  className="flex-1 flex flex-col gap-1 px-3 py-2.5 rounded-[13px] border transition-all active:scale-[0.97] text-left"
                  style={{
                    background: active ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.02)',
                    borderColor: active ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)',
                  }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-black" style={{ color: active ? '#fff' : 'rgba(255,255,255,0.5)' }}>{o.name}</span>
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-[rgba(255,255,255,0.07)] text-[rgba(255,255,255,0.4)]">{o.price}</span>
                  </div>
                  <p className="text-[9px] leading-tight" style={{ color: 'rgba(255,255,255,0.25)' }}>{o.desc}</p>
                </button>
              )
            })}
          </div>
          <p className="text-[10px] text-[rgba(255,255,255,0.25)] text-center mt-2">генерация {photoModel === 'nb' ? '$0.20' : '$0.125'} / фото</p>
          {doneCount > 0 && !running && (
            <p className="text-[11px] text-[rgba(0,255,170,0.55)] text-center mt-1">✓ {doneCount} {t.mods.enterStorageBtn.toLowerCase()}</p>
          )}
        </div>
      </>}
      </div>

      {/* ── Storage preview (glass panel) ── */}
      <div className="px-4">
        <div style={{
          background: 'rgba(255,255,255,0.025)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderRadius: '24px',
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
          overflow: 'hidden',
          padding: '16px',
        }}>
          <div className="flex items-center gap-2 mb-3">
            <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.38)]">{t.mods.modelStorageLabel}</p>
            {processingPhotoCount > 0 && (
              <span className="text-[9px] font-black uppercase tracking-[1px] text-amber-400 flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full border border-amber-400/30 border-t-amber-400 animate-spin inline-block" />
                {processingPhotoCount} {t.mods.generatingLabel}
              </span>
            )}
          </div>
          {modelGallery.length === 0 ? (
            <div className="flex flex-col items-center gap-2.5 py-9">
              <IconImage size={32} color="rgba(0,255,170,0.2)" />
              <p className="text-[12px] text-[rgba(255,255,255,0.25)]">{t.mods.processedPhotosHere}</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                {reversedGallery.slice(0, 6).map((g, idx) => {
                  const isFailed = g.status === 'failed'
                  const isProc = !isFailed && (g.status === 'processing' || g.status === 'carousel' || !g.url)
                  return (
                  <div key={g.id}
                    className="relative aspect-[3/4] rounded-[13px] overflow-hidden border bg-[#050505]"
                    style={{
                      borderColor: isFailed ? 'rgba(239,68,68,0.35)' : isProc ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.08)',
                      ...(newIds.has(g.id) ? { animation: `popIn 0.45s cubic-bezier(0.34,1.56,0.64,1) ${idx * 0.08}s both` } : {}),
                    }}>
                    {isFailed ? (
                      <>
                        <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 bg-[rgba(239,68,68,0.04)]">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.6)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                          <span className="text-[7px] font-black text-red-400/60 uppercase tracking-[0.5px]">Ошибка</span>
                        </div>
                        <button onClick={e => { e.stopPropagation(); removeFromGallery(g.id) }}
                          className="absolute top-1 right-1 w-[20px] h-[20px] rounded-full bg-black/80 flex items-center justify-center border border-[rgba(239,68,68,0.5)]">
                          <IconTrash size={9} color="#f87171" />
                        </button>
                      </>
                    ) : isProc ? (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 bg-[rgba(255,255,255,0.02)]">
                        <div className="w-5 h-5 rounded-full border-2 border-amber-400/20 border-t-amber-400 animate-spin" />
                        <span className="text-[7px] font-black text-amber-400/60 uppercase tracking-[0.5px]">AI</span>
                      </div>
                    ) : (
                      <img src={g.url} className="w-full h-full object-cover" alt="" />
                    )}
                  </div>
                  )
                })}
              </div>
              <button onClick={() => setShowStorage(true)}
                className="w-full mt-3 py-3 rounded-[14px] transition-all active:scale-[0.97]"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.55)',
                  fontSize: '12px',
                  fontWeight: 700,
                }}>
                {t.mods.enterStorageBtn} {modelGallery.length > 6 ? `· ${modelGallery.length} →` : '→'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Storage bottom sheet ── */}
      <BottomSheet
        isOpen={showStorage}
        onClose={() => { setShowStorage(false); setSelectMode(false); setSelectedIds(new Set()) }}
        title={storageTitle}
        footer={storageFooter}>
        {modelGallery.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <IconImage size={40} color="rgba(0,255,170,0.2)" />
            <p className="text-[13px] text-[rgba(255,255,255,0.3)]">{t.mods.storageEmpty}</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 pb-2">
            {reversedGallery.map((g, idx) => {
              const isFailed = g.status === 'failed'
              const isProcessing = !isFailed && (g.status === 'processing' || g.status === 'carousel' || !g.url)
              const readyIdx = reversedGallery.filter((x, i) => i < idx && !['processing','carousel','failed'].includes(x.status ?? '') && x.url).length
              return (
                <div key={g.id}
                  className="relative aspect-[3/4] rounded-[12px] overflow-hidden border bg-[#050505] cursor-pointer"
                  style={{ borderColor: isFailed ? 'rgba(239,68,68,0.4)' : isProcessing ? 'rgba(251,191,36,0.3)' : selectedIds.has(g.id) ? 'rgba(0,255,170,0.6)' : 'rgba(0,255,170,0.14)' }}
                  onClick={() => !isProcessing && !isFailed && (selectMode ? toggleSelect(g.id) : openLightbox(readyIdx))}>
                  {isFailed ? (
                    <>
                      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 bg-[rgba(239,68,68,0.04)]">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.55)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                        <span className="text-[7px] font-black text-red-400/60 uppercase tracking-[0.5px]">Ошибка</span>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); removeFromGallery(g.id) }}
                        className="absolute top-1 right-1 w-[20px] h-[20px] rounded-full bg-black/80 flex items-center justify-center border border-[rgba(239,68,68,0.5)]">
                        <IconTrash size={9} color="#f87171" />
                      </button>
                    </>
                  ) : isProcessing ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 bg-[rgba(255,255,255,0.02)]">
                      <div className="w-5 h-5 rounded-full border-2 border-amber-400/20 border-t-amber-400 animate-spin" />
                      <span className="text-[7px] font-black text-amber-400/60 uppercase tracking-[0.5px]">AI</span>
                    </div>
                  ) : (
                    <>
                      <img src={g.url} className="w-full h-full object-cover" alt="" />
                      {selectMode && (
                        <div className="absolute inset-0 bg-black/20 flex items-start justify-start p-1.5">
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all
                            ${selectedIds.has(g.id) ? 'bg-[#00ffaa] border-[#00ffaa]' : 'bg-black/50 border-white/60'}`}>
                            {selectedIds.has(g.id) && <IconCheck size={10} color="black" />}
                          </div>
                        </div>
                      )}
                      {!selectMode && (
                        <button
                          onClick={e => { e.stopPropagation(); removeFromGallery(g.id) }}
                          className="absolute top-1 right-1 w-[20px] h-[20px] rounded-full bg-black/80 flex items-center justify-center border border-[rgba(255,80,80,0.4)] hover:bg-[rgba(255,80,80,0.2)] transition-all">
                          <IconTrash size={9} color="#ff5555" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </BottomSheet>

      </>}

      </div>{/* end swipeable content */}

      {/* ── Lightbox (portal, renders after BottomSheet closes) ── */}
      {lightboxIdx !== null && readyGallery[lightboxIdx] && createPortal(
        <div className="fixed inset-0 bg-black flex flex-col" style={{ zIndex: 9999, animation: 'lbIn 0.2s ease both' }}>
          {/* Top bar */}
          <div className="flex items-center justify-center px-4 pt-5 pb-2 flex-shrink-0">
            <span className="text-[13px] font-bold text-white/50">{lightboxIdx + 1} / {readyGallery.length}</span>
          </div>

          {/* Photo */}
          <div className="flex-1 flex items-center justify-center relative min-h-0 px-10">
            {lightboxIdx > 0 && (
              <button onClick={() => setLightboxIdx(lightboxIdx - 1)}
                className="absolute left-2 w-10 h-10 rounded-full bg-black/60 border border-white/15 flex items-center justify-center z-10">
                <IconBack size={22} color="white" />
              </button>
            )}
            <img
              src={readyGallery[lightboxIdx].url}
              className="max-w-full max-h-full object-contain rounded-[10px]"
              style={{ maxHeight: 'calc(100dvh - 160px)' }}
              alt=""
            />
            {lightboxIdx < readyGallery.length - 1 && (
              <button onClick={() => setLightboxIdx(lightboxIdx + 1)}
                className="absolute right-2 w-10 h-10 rounded-full bg-black/60 border border-white/15 flex items-center justify-center z-10">
                <IconChevronRight size={22} color="white" />
              </button>
            )}
          </div>

          {/* Metadata panel */}
          {(() => {
            const g = readyGallery[lightboxIdx!]
            const hasInfo = !!(g.prompt || g.cost || g.createdAt)
            if (!hasInfo) return null
            const dateStr = g.createdAt ? new Date(g.createdAt).toLocaleString('ru', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
            return (
              <div className="px-4 pb-1 flex-shrink-0">
                <div className="rounded-[16px] overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-[11px] text-[rgba(255,255,255,0.38)]">{dateStr}</span>
                    {g.cost != null && <span className="text-[12px] font-black text-[rgba(0,255,170,0.75)]">${g.cost.toFixed(2)}</span>}
                  </div>
                  {g.prompt && (
                    <>
                      <button onClick={() => setPromptOpen(o => !o)}
                        className="w-full flex items-center justify-between px-4 py-2.5 transition-colors"
                        style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                        <span className="text-[11px] font-bold text-[rgba(255,255,255,0.45)]">Промт</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5"
                          style={{ transform: promptOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s' }}>
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                      </button>
                      {promptOpen && (
                        <div className="px-4 pb-3.5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                          <p className="text-[11px] text-[rgba(255,255,255,0.4)] leading-relaxed mt-2.5"
                            style={{ maxHeight: 120, overflowY: 'auto' }}>{g.prompt}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })()}

          {/* Bottom bar */}
          <div className="flex items-center justify-center gap-3 px-4 pb-8 pt-3 flex-shrink-0">
            <button
              onClick={closeLightbox}
              className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center border border-white/15">
              <IconX size={20} color="white" />
            </button>
            <button
              onClick={() => downloadPhoto(readyGallery[lightboxIdx!].url, lightboxIdx!)}
              className="flex items-center gap-2 px-5 py-3 rounded-[14px] bg-[rgba(0,255,170,0.12)] border border-[rgba(0,255,170,0.35)] text-[13px] font-bold text-[#00ffaa]">
              <IconDownload size={17} color="#00ffaa" />
              {t.mods.downloadBtn}
            </button>
            <button
              onClick={() => { removeFromGallery(readyGallery[lightboxIdx!].id); closeLightbox() }}
              className="flex items-center gap-2 px-5 py-3 rounded-[14px] bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.3)] text-[13px] font-bold text-red-400">
              <IconTrash size={16} color="#f87171" />
              {t.common.delete}
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
