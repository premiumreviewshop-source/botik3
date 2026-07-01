import { useState, useRef } from 'react'
import { useApp } from '../../store/app'
import { useLang } from '../../store/lang'
import { IconBack, IconPlus, IconCheck, IconTrash, IconRefresh, IconBrain, IconImage, IconSparkle } from '../../components/Icons'
import Button from '../../components/Button'
import Input from '../../components/Input'
import BottomSheet from '../../components/BottomSheet'
import api, { BalanceError } from '../../api/client'
import { supabase, supabaseUrl, supabaseKey } from '../../lib/supabase'

const SAFE_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif',
}

async function uploadFile(file: File, slot: number): Promise<string> {
  const rawExt = (file.name.split('.').pop() ?? 'jpg').toLowerCase()
  const ext = SAFE_MIME[rawExt] ? rawExt : (file.type.includes('png') ? 'png' : file.type.includes('webp') ? 'webp' : 'jpg')
  const mime = SAFE_MIME[ext] ?? 'image/jpeg'
  const path = `${Date.now()}_${slot}.${ext}`
  const base = supabaseUrl.replace(/\/$/, '')
  const buf = await file.arrayBuffer()
  const resp = await fetch(`${base}/storage/v1/object/model-images/${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseKey}`,
      'apikey': supabaseKey,
      'Content-Type': mime,
      'x-upsert': 'true',
    },
    body: buf,
  })
  if (!resp.ok) {
    const msg = await resp.text().catch(() => String(resp.status))
    throw new Error(`Upload failed: ${msg}`)
  }
  return `${base}/storage/v1/object/public/model-images/${path}`
}

type Mode = null | 'ai' | 'own'
type Step = 1 | 2 | 3
type GenStatus = 'idle' | 'processing' | 'done'

export default function CreateModel() {
  const { goBack, navigate, setModels, models, balance } = useApp()
  const { t, lang } = useLang()

  const [mode, setMode] = useState<Mode>(null)

  // ── AI flow state ──
  const [step, setStep] = useState<Step>(1)
  const [photos, setPhotos] = useState<string[]>([])
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [genStatus, setGenStatus] = useState<GenStatus>('idle')
  const [genProgress, setGenProgress] = useState(0)
  const [modelName, setModelName] = useState('')
  const MODEL_PROMPT = 'Combine the images together into a new perfect looking model in a room with white background.\nshe is staying in front of the camera view with a natural face.'
  const [showPreview, setShowPreview] = useState(false)
  const [createdModelId, setCreatedModelId] = useState<string | null>(null)
  const [resultPreviewUrl, setResultPreviewUrl] = useState<string | null>(null)
  const [genError, setGenError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Own model flow state ──
  const [ownPhoto, setOwnPhoto] = useState<string | null>(null)
  const [ownFile, setOwnFile] = useState<File | null>(null)
  const [ownName, setOwnName] = useState('')
  const [ownDone, setOwnDone] = useState(false)
  const [ownError, setOwnError] = useState<string | null>(null)
  const ownFileRef = useRef<HTMLInputElement>(null)

  // ── AI flow handlers ──
  const filled = photos.length
  const canGenerate = filled >= 2 && genStatus === 'idle'
  const previewUrl = photos[0] ?? null

  const handleAiFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setPhotos(p => [...p, ...files.map(f => URL.createObjectURL(f))])
    setPhotoFiles(p => [...p, ...files])
    e.target.value = ''
  }
  const removePhoto = (idx: number) => {
    setPhotos(p => p.filter((_, i) => i !== idx))
    setPhotoFiles(p => p.filter((_, i) => i !== idx))
  }

  const generate = async () => {
    if (balance < 0.075) {
      window.dispatchEvent(new CustomEvent('balance:insufficient'))
      return
    }
    setGenStatus('processing')
    setGenProgress(0)
    setGenError(null)
    try {
      const filledFiles = photoFiles
      const imageUrls: string[] = []
      for (let i = 0; i < filledFiles.length; i++) {
        const url = await uploadFile(filledFiles[i], i)
        imageUrls.push(url)
        setGenProgress(Math.round(((i + 1) / filledFiles.length) * 70))
      }
      setGenProgress(75)
      const result = await api.models.create({ name: '_pending', imageUrls, prompt: MODEL_PROMPT })
      setCreatedModelId(result.id)
      const url = (result as Record<string, unknown>).resultUrl as string | undefined
      if (url) {
        setResultPreviewUrl(url)
        setGenProgress(100)
        setGenStatus('done')
        setShowPreview(true)
        return
      }
      setGenProgress(80)
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 5000))
        const model = await api.models.get(result.id)
        if (model.status === 'ready') {
          setResultPreviewUrl(model.previewUrl ?? null)
          setGenProgress(100)
          setGenStatus('done')
          setShowPreview(true)
          return
        }
        if (model.status === 'failed') throw new Error('Generation error from Wavespeed')
        setGenProgress(Math.min(80 + i, 97))
      }
      throw new Error('Timeout exceeded')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (err instanceof BalanceError) {
        window.dispatchEvent(new CustomEvent('balance:insufficient', { detail: msg }))
      } else {
        setGenError(msg)
      }
      setGenStatus('idle')
      setGenProgress(0)
    }
  }
  const regenerate = () => {
    setShowPreview(false)
    setGenStatus('idle')
    setGenProgress(0)
    setCreatedModelId(null)
    setResultPreviewUrl(null)
    setGenError(null)
    setPhotos([])
    setPhotoFiles([])
  }
  const saveModel = () => { setShowPreview(false); setStep(2) }
  const finish = async () => {
    if (createdModelId) {
      try {
        await supabase.from('ai_models').update({ name: modelName || 'Model' }).eq('id', createdModelId)
      } catch {}
      setModels([...models, {
        id: createdModelId,
        name: modelName || 'Model',
        status: 'ready',
        previewUrl: resultPreviewUrl ?? undefined,
        createdAt: new Date().toLocaleDateString('ru'),
      }])
    }
    navigate('module/models')
  }

  // ── Own model handlers ──
  const handleOwnFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setOwnPhoto(URL.createObjectURL(file))
    setOwnFile(file)
    e.target.value = ''
  }
  const saveOwnModel = async () => {
    const name = ownName.trim() || 'My Model'
    setOwnError(null)
    try {
      const imageUrl = await uploadFile(ownFile!, 0)
      const result = await api.models.create({ name, imageUrls: [imageUrl] })
      setModels([...models, { id: result.id, name, status: 'ready', previewUrl: imageUrl, createdAt: new Date().toLocaleDateString('ru') }])
      setOwnDone(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (err instanceof BalanceError) {
        window.dispatchEvent(new CustomEvent('balance:insufficient', { detail: msg }))
      } else {
        setOwnError(msg)
      }
    }
  }

  const handleBack = () => {
    if (mode === null) { goBack(); return }
    if (mode === 'own') { if (ownDone) { navigate('module/models'); return } setMode(null); return }
    if (step === 1) setMode(null)
    else setStep(s => (s - 1) as Step)
  }

  const stepTitle = step === 1 ? t.mods.uploadPhotos : step === 2 ? t.mods.namingStep : t.mods.doneStep

  // ── Mode picker ──
  if (mode === null) {
    return (
      <div className="flex flex-col gap-5 pt-4">
        <div className="flex items-center gap-3 px-5">
          <button onClick={goBack}
            className="w-10 h-10 rounded-[14px] flex items-center justify-center transition-all duration-200 active:scale-[0.92]" style={{ background: 'rgba(0,255,170,0.06)', border: '1px solid rgba(0,255,170,0.2)' }}>
            <IconBack size={20} color="#00ffaa" />
          </button>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[2px] text-[rgba(0,255,170,0.5)]">{t.mods.creatingHeader}</p>
            <h1 className="text-[22px] font-black tracking-tight">{t.mods.newModelLabel}</h1>
          </div>
        </div>

        <div className="px-5 flex flex-col gap-3">
          <p className="text-[13px] text-[rgba(255,255,255,0.38)]">{t.mods.chooseModeLabel}</p>

          {/* AI generation option */}
          <button onClick={() => setMode('ai')}
            className="flex items-start gap-4 p-4 bg-[rgba(0,255,170,0.04)] border border-[rgba(0,255,170,0.2)] rounded-[18px] text-left
              hover:border-[rgba(0,255,170,0.4)] hover:bg-[rgba(0,255,170,0.07)] transition-all duration-200">
            <div className="w-12 h-12 rounded-[14px] bg-[rgba(0,255,170,0.1)] border border-[rgba(0,255,170,0.25)] flex items-center justify-center flex-shrink-0">
              <IconBrain size={24} color="rgba(0,255,170,0.8)" />
            </div>
            <div className="flex-1 pt-0.5">
              <p className="text-[15px] font-black mb-0.5">{t.mods.createWithAI}</p>
              <p className="text-[12px] text-[rgba(255,255,255,0.38)] leading-snug">{t.mods.createWithAIDesc}</p>
              <span className="inline-block mt-2 text-[9px] font-black uppercase tracking-[1px] px-2 py-0.5 rounded-full bg-[rgba(0,255,170,0.08)] border border-[rgba(0,255,170,0.2)] text-[rgba(0,255,170,0.7)]">
                {t.mods.recommendedBadge}
              </span>
            </div>
          </button>

          {/* Own model option */}
          <button onClick={() => setMode('own')}
            className="flex items-start gap-4 p-4 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] rounded-[18px] text-left
              hover:border-[rgba(0,255,170,0.25)] hover:bg-[rgba(0,255,170,0.02)] transition-all duration-200">
            <div className="w-12 h-12 rounded-[14px] bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.1)] flex items-center justify-center flex-shrink-0">
              <IconImage size={24} color="rgba(255,255,255,0.4)" />
            </div>
            <div className="flex-1 pt-0.5">
              <p className="text-[15px] font-black mb-0.5">{t.mods.addOwnModel}</p>
              <p className="text-[12px] text-[rgba(255,255,255,0.38)] leading-snug">{t.mods.addOwnModelDesc}</p>
            </div>
          </button>
        </div>
      </div>
    )
  }

  // ── Own model flow ──
  if (mode === 'own') {
    if (ownDone) {
      return (
        <div className="flex flex-col gap-5 pt-4">
          <div className="flex items-center gap-3 px-5">
            <button onClick={handleBack}
              className="w-9 h-9 rounded-full bg-[rgba(0,255,170,0.06)] border border-[rgba(0,255,170,0.2)] flex items-center justify-center">
              <IconBack size={20} color="#00ffaa" />
            </button>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[2px] text-[rgba(0,255,170,0.5)]">{t.mods.doneStep}</p>
              <h1 className="text-[22px] font-black tracking-tight">{t.mods.modelAddedTitle}</h1>
            </div>
          </div>
          <div className="flex flex-col items-center gap-6 px-5 py-8 text-center">
            <div className="w-20 h-20 rounded-[24px] bg-[rgba(0,255,170,0.08)] border border-[rgba(0,255,170,0.25)] flex items-center justify-center"
              style={{ boxShadow: '0 0 32px rgba(0,255,170,0.1)' }}>
              <IconSparkle size={36} color="#00ffaa" />
            </div>
            <div>
              <p className="text-[26px] font-black mb-2 tracking-tight">{t.mods.doneStep}</p>
              <p className="text-[14px] text-[rgba(255,255,255,0.4)] leading-relaxed">
                <span className="text-white font-bold">{ownName || 'My Model'}</span> {t.mods.addedToModels}
              </p>
            </div>
            <Button size="lg" onClick={() => navigate('module/models')}>
              <IconCheck size={20} />
              {t.mods.goToModels}
            </Button>
          </div>
        </div>
      )
    }

    return (
      <div className="flex flex-col gap-5 pt-4">
        <div className="flex items-center gap-3 px-5">
          <button onClick={handleBack}
            className="w-10 h-10 rounded-[14px] flex items-center justify-center transition-all duration-200 active:scale-[0.92]" style={{ background: 'rgba(0,255,170,0.06)', border: '1px solid rgba(0,255,170,0.2)' }}>
            <IconBack size={20} color="#00ffaa" />
          </button>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[2px] text-[rgba(0,255,170,0.5)]">{t.mods.ownModelHeader}</p>
            <h1 className="text-[22px] font-black tracking-tight">{t.mods.addModelBtn}</h1>
          </div>
        </div>

        {/* Photo upload */}
        <div className="px-5">
          <input ref={ownFileRef} type="file" accept="image/*" className="hidden" onChange={handleOwnFile} />
          {ownPhoto ? (
            <div className="relative w-full rounded-[20px] overflow-hidden border border-[rgba(0,255,170,0.3)] bg-[#050505]"
              style={{ boxShadow: '0 0 16px rgba(0,255,170,0.08)' }}>
              <img src={ownPhoto} className="w-full object-cover max-h-64" alt="" />
              <button onClick={() => { setOwnPhoto(null); setOwnFile(null) }}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/70 border border-[rgba(255,255,255,0.15)] flex items-center justify-center">
                <IconTrash size={14} color="#ff5555" />
              </button>
              <button onClick={() => ownFileRef.current?.click()}
                className="absolute bottom-3 right-3 px-3 py-1.5 rounded-full bg-black/70 border border-[rgba(0,255,170,0.3)] flex items-center gap-1.5">
                <IconRefresh size={12} color="#00ffaa" />
                <span className="text-[11px] font-bold text-[#00ffaa]">{t.mods.replaceBtn}</span>
              </button>
            </div>
          ) : (
            <button onClick={() => ownFileRef.current?.click()}
              className="w-full rounded-[20px] border-2 border-dashed border-[rgba(0,255,170,0.2)] bg-[rgba(255,255,255,0.02)]
                hover:border-[rgba(0,255,170,0.45)] hover:bg-[rgba(0,255,170,0.04)] transition-all duration-200
                flex flex-col items-center justify-center gap-3 py-12">
              <div className="w-14 h-14 rounded-full bg-[rgba(0,255,170,0.07)] border border-[rgba(0,255,170,0.2)] flex items-center justify-center">
                <IconPlus size={26} color="rgba(0,255,170,0.5)" />
              </div>
              <div className="text-center">
                <p className="text-[14px] font-bold text-[rgba(255,255,255,0.55)]">{t.mods.uploadModelPhoto}</p>
                <p className="text-[11px] text-[rgba(255,255,255,0.25)] mt-1">{t.mods.tapToGallery}</p>
              </div>
            </button>
          )}
        </div>

        {/* Name */}
        <div className="px-5">
          <Input label={t.mods.modelNameLabel} value={ownName} onChange={setOwnName} placeholder="Sofia, Mia, Anna..." />
        </div>

        <div className="px-5 flex flex-col gap-2">
          <Button fullWidth disabled={!ownPhoto || !ownName.trim()} onClick={saveOwnModel}>
            <IconCheck size={18} />
            {t.mods.addModelBtn}
          </Button>
          {ownError && <p className="text-[11px] text-red-400 text-center">{ownError}</p>}
        </div>
      </div>
    )
  }

  // ── AI generation flow ──
  return (
    <div className="flex flex-col gap-5 pt-4">
      <div className="flex items-center gap-3 px-5">
        <button onClick={handleBack}
          className="w-10 h-10 rounded-[14px] flex items-center justify-center transition-all duration-200 active:scale-[0.92]" style={{ background: 'rgba(0,255,170,0.06)', border: '1px solid rgba(0,255,170,0.2)' }}>
          <IconBack size={20} color="#00ffaa" />
        </button>
        <div className="flex-1">
          <p className="text-[9px] font-black uppercase tracking-[2px] text-[rgba(0,255,170,0.5)]">
            {lang === 'ru' ? `Шаг ${step} из 3` : lang === 'tr' ? `Adım ${step}/3` : `Step ${step} of 3`}
          </p>
          <h1 className="text-[20px] font-extrabold leading-tight tracking-tight">{stepTitle}</h1>
        </div>
      </div>

      <div className="flex gap-1.5 px-5">
        {[1, 2, 3].map(s => (
          <div key={s} className={`h-[3px] flex-1 rounded-full transition-all duration-300 ${s <= step ? 'bg-[#00ffaa]' : 'bg-[rgba(255,255,255,0.08)]'}`}
            style={s <= step ? { boxShadow: '0 0 6px rgba(0,255,170,0.6)' } : {}} />
        ))}
      </div>

      {step === 1 && (
        <>
          <div className="px-5 flex flex-col gap-3">
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleAiFile} />

            {/* Large upload zone */}
            <button onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-[20px] border-2 border-dashed border-[rgba(0,255,170,0.2)] bg-[rgba(255,255,255,0.02)]
                hover:border-[rgba(0,255,170,0.45)] hover:bg-[rgba(0,255,170,0.04)] transition-all duration-200
                flex flex-col items-center justify-center gap-3 py-10">
              <div className="w-14 h-14 rounded-full bg-[rgba(0,255,170,0.07)] border border-[rgba(0,255,170,0.2)] flex items-center justify-center">
                <IconPlus size={26} color="rgba(0,255,170,0.5)" />
              </div>
              <div className="text-center">
                <p className="text-[14px] font-bold text-[rgba(255,255,255,0.55)]">{t.mods.uploadForBlend}</p>
                <p className="text-[11px] text-[rgba(255,255,255,0.25)] mt-1">{t.mods.tapToGallery}</p>
              </div>
            </button>

            {/* Uploaded thumbnails strip */}
            {photos.length > 0 && (
              <div className="flex gap-2.5 overflow-x-auto pb-1" style={{ scrollSnapType: 'x mandatory' }}>
                {photos.map((url, idx) => (
                  <div key={idx} className="w-20 h-20 flex-shrink-0 relative rounded-[12px] overflow-hidden border border-[rgba(0,255,170,0.3)] bg-[#050505]"
                    style={{ scrollSnapAlign: 'start' }}>
                    <img src={url} className="w-full h-full object-cover" alt="" />
                    <button onClick={() => removePhoto(idx)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center">
                      <IconTrash size={9} color="#ff5555" />
                    </button>
                  </div>
                ))}
                <button onClick={() => fileInputRef.current?.click()}
                  className="w-20 h-20 flex-shrink-0 rounded-[12px] border-2 border-dashed border-[rgba(0,255,170,0.15)] bg-[rgba(255,255,255,0.02)]
                    hover:border-[rgba(0,255,170,0.35)] transition-all flex items-center justify-center"
                  style={{ scrollSnapAlign: 'start' }}>
                  <IconPlus size={18} color="rgba(0,255,170,0.35)" />
                </button>
              </div>
            )}

            {/* Recommendation hint */}
            <div className="p-3 bg-[rgba(0,255,170,0.03)] border border-[rgba(0,255,170,0.1)] rounded-[14px]">
              <p className="text-[11px] text-[rgba(255,255,255,0.4)] leading-relaxed">
                {t.mods.photosHint}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 px-5">
            {genStatus === 'idle' && (
              <>
                <Button fullWidth disabled={!canGenerate} onClick={generate}>
                  {t.mods.createModel} {filled > 0 ? `(${filled})` : ''}
                </Button>
                <p className="text-[10px] text-[rgba(255,255,255,0.25)] text-center -mt-1">генерация $0.075</p>
                {genError && (
                  <p className="text-[11px] text-red-400 text-center">{genError}</p>
                )}
              </>
            )}
            {genStatus === 'processing' && (
              <div className="p-4 bg-[rgba(255,255,255,0.02)] border border-[rgba(0,255,170,0.2)] rounded-[16px]">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[13px] font-bold">{t.mods.creatingModelLabel}</p>
                  <p className="text-[13px] font-black text-[#00ffaa]"
                    style={{ textShadow: '0 0 8px rgba(0,255,170,0.5)' }}>{genProgress}%</p>
                </div>
                <div className="h-[3px] bg-[rgba(0,255,170,0.08)] rounded-full overflow-hidden">
                  <div className="h-full bg-[#00ffaa] rounded-full transition-all duration-300"
                    style={{ width: `${genProgress}%`, boxShadow: '0 0 8px rgba(0,255,170,0.7)' }} />
                </div>
                <p className="text-[11px] text-[rgba(255,255,255,0.28)] mt-2">
                  {genProgress < 36 ? t.mods.uploadingPhotos : genProgress < 42 ? t.mods.sendingToWavespeed : t.mods.generatingModelWait}
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4 px-5">
          {(resultPreviewUrl || previewUrl) && (
            <div className="flex items-center gap-4 p-4 bg-[rgba(255,255,255,0.02)] border border-[rgba(0,255,170,0.15)] rounded-[16px]">
              <img src={resultPreviewUrl ?? previewUrl!} className="w-14 h-14 rounded-[12px] object-cover flex-shrink-0" alt="" />
              <div>
                <p className="text-[9px] font-black uppercase tracking-[1px] text-[rgba(0,255,170,0.5)] mb-1">{t.mods.modelPreviewBadge}</p>
                <p className="text-[13px] font-bold text-[#00ffaa]">✓ {t.mods.modelCreated}</p>
              </div>
            </div>
          )}
          <Input label={t.mods.namingStep} value={modelName} onChange={setModelName}
            placeholder="Sofia AI, Mia Model..." autoFocus />

          <Button fullWidth disabled={!modelName.trim()} onClick={() => setStep(3)}>
            {t.common.save} →
          </Button>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col items-center gap-6 px-5 py-8 text-center">
          <div className="w-20 h-20 rounded-[24px] bg-[rgba(0,255,170,0.08)] border border-[rgba(0,255,170,0.25)] flex items-center justify-center text-4xl"
            style={{ boxShadow: '0 0 32px rgba(0,255,170,0.1)' }}>
            🎉
          </div>
          <div>
            <p className="text-[26px] font-black mb-2 tracking-tight">{t.mods.modelCreatedExclaim}</p>
            <p className="text-[14px] text-[rgba(255,255,255,0.4)] leading-relaxed">
              <span className="text-white font-bold">{modelName}</span> {t.mods.modelReadyForUse}
            </p>
          </div>
          <Button size="lg" onClick={finish}>
            <IconCheck size={20} />
            {t.mods.goToModels}
          </Button>
        </div>
      )}

      <BottomSheet
        isOpen={showPreview}
        onClose={() => {}}
        title={t.mods.modelCreated}
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={regenerate}>
              <IconRefresh size={17} />
              {t.mods.regenerateBtn}
            </Button>
            <Button className="flex-1" onClick={saveModel}>
              <IconCheck size={17} />
              {t.common.save}
            </Button>
          </div>
        }
      >
        {(resultPreviewUrl || previewUrl) && (
          <div className="relative rounded-[16px] overflow-hidden border border-[rgba(0,255,170,0.25)] bg-black flex items-center justify-center"
            style={{ boxShadow: '0 0 20px rgba(0,255,170,0.08)' }}>
            <img src={resultPreviewUrl ?? previewUrl!} alt="Model preview" className="max-w-full max-h-[55vh] w-auto h-auto block" />
            <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00ffaa]" style={{ boxShadow: '0 0 5px rgba(0,255,170,1)' }} />
              <span className="text-[10px] font-black uppercase tracking-[1px] text-[#00ffaa]">{t.mods.generatedBadge}</span>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  )
}
