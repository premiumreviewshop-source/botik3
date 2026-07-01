import { useState, useRef, useEffect, useCallback } from 'react'
import { useApp } from '../../store/app'
import { useLang } from '../../store/lang'
import { IconVideo, IconZap, IconCheck, IconX, IconTrash, IconDownload } from '../../components/Icons'
import Button from '../../components/Button'
import api, { BalanceError } from '../../api/client'
import type { AIModel, GeneratedPhoto, KlingJob } from '../../types'
import { supabaseUrl, supabaseKey } from '../../lib/supabase'
import { downloadFile } from '../../lib/download'

const VIDEO_MIME: Record<string, string> = {
  mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo', webm: 'video/webm',
}

async function uploadVideo(file: File): Promise<string> {
  const rawExt = (file.name.split('.').pop() ?? 'mp4').toLowerCase()
  const ext = VIDEO_MIME[rawExt] ? rawExt : 'mp4'
  const mime = VIDEO_MIME[ext] ?? 'video/mp4'
  const path = `motion/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
  const base = supabaseUrl.replace(/\/$/, '')
  const resp = await fetch(`${base}/storage/v1/object/model-videos/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${supabaseKey}`,
      apikey: supabaseKey,
      'Content-Type': mime,
      'x-upsert': 'true',
    },
    body: await file.arrayBuffer(),
  })
  if (!resp.ok) throw new Error(`upload failed: ${resp.status}`)
  return `${base}/storage/v1/object/public/model-videos/${path}`
}

type GenStatus = 'idle' | 'uploading' | 'generating' | 'done' | 'error'

interface Props {
  model: AIModel
  gallery: GeneratedPhoto[]
}

export default function ModelVideoTab({ model, gallery }: Props) {
  const { bots, selectedBotId, balance } = useApp()
  const { t } = useLang()

  const modelGallery = gallery.filter(g => g.modelId === model.id)
  const refImages = [
    ...(model.previewUrl ? [{ id: '__preview', url: model.previewUrl }] : []),
    ...modelGallery.slice(0, 20).map(g => ({ id: g.id, url: g.url })),
  ]

  const [refImageUrl, setRefImageUrl] = useState<string | null>(refImages[0]?.url ?? null)
  const [motionVideoFile, setMotionVideoFile] = useState<File | null>(null)
  const [genMode, setGenMode] = useState<'720p' | '1080p'>('720p')
  const [klingModel, setKlingModel] = useState<'2.6' | '3.0'>('2.6')
  const [orientation, setOrientation] = useState<'image' | 'video'>('image')
  const [prompt, setPrompt] = useState('')
  const [status, setStatus] = useState<GenStatus>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [videoStorage, setVideoStorage] = useState<KlingJob[]>([])
  const videoInputRef = useRef<HTMLInputElement>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  void bots; void selectedBotId
  const isRunning = status === 'uploading' || status === 'generating'

  // ── Load all jobs (ready + processing) ─────────────────────────────────────
  const loadJobs = useCallback(async () => {
    try {
      const jobs = await api.klingVideo.list(model.id)
      setVideoStorage(jobs)
    } catch {}
  }, [model.id])

  useEffect(() => { loadJobs() }, [loadJobs])

  // ── Poll processing jobs every 8s while app is open ────────────────────────
  useEffect(() => {
    const startPolling = () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      pollTimerRef.current = setInterval(async () => {
        const current = await api.klingVideo.list(model.id).catch(() => null)
        if (!current) return
        setVideoStorage(current)
        // Stop polling when no more processing jobs
        if (!current.some(j => j.status === 'processing' || j.status === 'pending')) {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current)
          pollTimerRef.current = null
        }
      }, 8000)
    }

    // Check if there are any processing jobs to poll
    if (videoStorage.some(j => j.status === 'processing' || j.status === 'pending')) {
      startPolling()
    }
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoStorage.some(j => j.status === 'processing' || j.status === 'pending'), model.id])

  // ── Reload when user returns to the tab ───────────────────────────────────
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') loadJobs() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loadJobs])

  const handleVideoInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setMotionVideoFile(file)
    e.target.value = ''
  }

  const KLING_PRICES: Record<string, Record<string, number>> = {
    '2.6': { '720p': 0.09, '1080p': 0.12 },
    '3.0': { '720p': 0.15, '1080p': 0.20 },
  }

  const generate = async () => {
    if (!refImageUrl || !motionVideoFile) return
    const videoCost = (KLING_PRICES[klingModel] ?? KLING_PRICES['2.6'])[genMode] ?? 0.09
    if (balance < videoCost) {
      window.dispatchEvent(new CustomEvent('balance:insufficient'))
      return
    }
    setStatus('uploading')
    setErrorMsg(null)
    try {
      const motionUrl = await uploadVideo(motionVideoFile)
      setStatus('generating')

      const job = await api.klingVideo.start({
        modelId: model.id,
        inputImageUrl: refImageUrl,
        motionVideoUrl: motionUrl,
        mode: genMode,
        klingModel,
        characterOrientation: orientation,
        prompt: prompt.trim() || undefined,
        // No botId — app-generated jobs don't trigger Telegram notifications
      })

      // Add processing placeholder — background cron + 8s storage poll handles the rest
      setVideoStorage(prev => [{
        id: job.id, status: 'processing', resultVideoUrl: '', createdAt: new Date().toISOString(),
      }, ...prev.filter(v => v.id !== job.id)])
      setStatus('idle')
      setMotionVideoFile(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (err instanceof BalanceError) {
        window.dispatchEvent(new CustomEvent('balance:insufficient', { detail: msg }))
        setStatus('idle')
      } else {
        setErrorMsg(msg)
        setStatus('error')
      }
    }
  }

  const deleteVideo = async (id: string) => {
    try {
      await api.klingVideo.remove(id)
      setVideoStorage(prev => prev.filter(v => v.id !== id))
    } catch {}
  }

  const downloadVideo = (url: string) =>
    downloadFile(url, `kling_${Date.now()}.mp4`)

  const canGenerate = !!refImageUrl && !!motionVideoFile && !isRunning
  const readyCount = videoStorage.filter(v => v.status === 'ready').length
  const processingCount = videoStorage.filter(v => v.status === 'processing' || v.status === 'pending').length

  return (
    <div className="flex flex-col gap-5">

      {/* Reference image picker */}
      <div className="px-5">
        <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.38)] mb-2.5">
          {t.mods.refImageLabel}
        </p>
        {refImages.length === 0 ? (
          <div className="p-4 rounded-[14px] bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.07)] text-[12px] text-[rgba(255,255,255,0.3)]">
            {t.mods.noPhotoForVideo}
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollSnapType: 'x mandatory' }}>
            {refImages.map(img => (
              <button key={img.id} onClick={() => setRefImageUrl(img.url)}
                className="relative flex-shrink-0 w-[70px] h-[88px] rounded-[13px] overflow-hidden border-2 transition-all"
                style={{ scrollSnapAlign: 'start', borderColor: refImageUrl === img.url ? 'rgba(0,255,170,0.7)' : 'rgba(255,255,255,0.1)' }}>
                <img src={img.url} className="w-full h-full object-cover" alt="" />
                {refImageUrl === img.url && (
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                    <div className="w-5 h-5 rounded-full bg-[#00ffaa] flex items-center justify-center"
                      style={{ boxShadow: '0 0 8px rgba(0,255,170,0.8)' }}>
                      <IconCheck size={10} color="black" />
                    </div>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Motion video upload */}
      <div className="px-5">
        <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.38)] mb-2.5">{t.mods.motionVideoLabel}</p>
        <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoInput} />
        {!motionVideoFile ? (
          <button onClick={() => videoInputRef.current?.click()}
            className="w-full py-8 rounded-[18px] border-2 border-dashed border-[rgba(0,255,170,0.2)] bg-[rgba(255,255,255,0.02)]
              hover:border-[rgba(0,255,170,0.4)] hover:bg-[rgba(0,255,170,0.03)] transition-all flex flex-col items-center gap-2">
            <IconVideo size={28} color="rgba(0,255,170,0.4)" />
            <p className="text-[13px] text-[rgba(255,255,255,0.4)]">{t.mods.uploadMotionVideo}</p>
            <p className="text-[10px] text-[rgba(255,255,255,0.2)]">mp4 · mov · webm</p>
          </button>
        ) : (
          <div className="flex items-center gap-3 p-3 rounded-[14px] bg-[rgba(0,255,170,0.04)] border border-[rgba(0,255,170,0.2)]">
            <IconVideo size={20} color="#00ffaa" />
            <p className="text-[13px] text-white flex-1 truncate">{motionVideoFile.name}</p>
            <button onClick={() => setMotionVideoFile(null)}
              className="w-6 h-6 rounded-full bg-[rgba(255,80,80,0.12)] border border-[rgba(255,80,80,0.3)] flex items-center justify-center">
              <IconX size={12} color="#f87171" />
            </button>
          </div>
        )}
      </div>

      {/* Kling model selector */}
      <div className="px-5">
        <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.38)] mb-2">Модель</p>
        <div className="flex gap-2">
          {([
            { id: '2.6' as const, name: 'Kling 2.6', desc: 'Стабильная · проверенная', color: '#00ffaa' },
            { id: '3.0' as const, name: 'Kling 3.0', desc: 'Новая · лучший результат', color: '#a78bfa' },
          ]).map(k => {
            const active = klingModel === k.id
            const cost = KLING_PRICES[k.id][genMode]
            return (
              <button key={k.id} onClick={() => !isRunning && setKlingModel(k.id)}
                className="flex-1 flex flex-col gap-1 p-3 rounded-[14px] border transition-all active:scale-[0.97] text-left"
                style={{
                  background: active ? `${k.color}12` : 'rgba(255,255,255,0.02)',
                  borderColor: active ? `${k.color}45` : 'rgba(255,255,255,0.07)',
                }}>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-black" style={{ color: active ? k.color : 'rgba(255,255,255,0.7)' }}>{k.name}</span>
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full" style={{ background: active ? `${k.color}20` : 'rgba(255,255,255,0.06)', color: active ? k.color : 'rgba(255,255,255,0.3)' }}>${cost}</span>
                </div>
                <p className="text-[10px] leading-tight" style={{ color: 'rgba(255,255,255,0.28)' }}>{k.desc}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Mode + orientation */}
      <div className="px-5 flex gap-3">
        <div className="flex-1">
          <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.38)] mb-1.5">{t.mods.qualityLabel}</p>
          <div className="flex gap-1.5">
            {(['720p', '1080p'] as const).map(m => (
              <button key={m} onClick={() => !isRunning && setGenMode(m)}
                className={`flex-1 py-2 rounded-[10px] text-[11px] font-black border transition-all
                  ${genMode === m ? 'bg-[rgba(0,255,170,0.12)] border-[rgba(0,255,170,0.4)] text-[#00ffaa]' : 'bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.07)] text-[rgba(255,255,255,0.3)]'}`}>
                {m}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-[rgba(255,255,255,0.22)] mt-1">
            720p ${KLING_PRICES[klingModel]['720p']} · 1080p ${KLING_PRICES[klingModel]['1080p']}
          </p>
        </div>
        <div className="flex-1">
          <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.38)] mb-1.5">{t.mods.orientationLabel}</p>
          <div className="flex gap-1.5">
            {(['image', 'video'] as const).map(o => (
              <button key={o} onClick={() => !isRunning && setOrientation(o)}
                className={`flex-1 py-2 rounded-[10px] text-[11px] font-black border transition-all
                  ${orientation === o ? 'bg-[rgba(0,255,170,0.12)] border-[rgba(0,255,170,0.4)] text-[#00ffaa]' : 'bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.07)] text-[rgba(255,255,255,0.3)]'}`}>
                {o}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Prompt */}
      <div className="px-5">
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)} disabled={isRunning}
          placeholder={t.mods.promptOptional} rows={2}
          className="w-full bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] rounded-[14px] px-3.5 py-3
            text-[13px] text-white placeholder-[rgba(255,255,255,0.2)] resize-none outline-none
            focus:border-[rgba(0,255,170,0.3)] transition-all" />
      </div>

      {/* Upload progress */}
      {isRunning && (
        <div className="px-5">
          <div className="p-3.5 bg-[rgba(251,191,36,0.05)] border border-[rgba(251,191,36,0.18)] rounded-[14px] flex items-center gap-3">
            <div className="w-4 h-4 rounded-full border-2 border-amber-400/25 border-t-amber-400 animate-spin flex-shrink-0" />
            <p className="text-[12px] font-bold text-amber-400">
              {status === 'uploading' ? t.mods.uploadingVideoLabel : t.mods.startingGenLabel}
            </p>
          </div>
        </div>
      )}

      {/* Submitted banner */}
      {status === 'idle' && videoStorage.some(v => v.status === 'processing' || v.status === 'pending') && (
        <div className="px-5">
          <div className="p-3 bg-[rgba(0,255,170,0.04)] border border-[rgba(0,255,170,0.25)] rounded-[14px] flex items-center gap-3">
            <div className="w-5 h-5 rounded-full border-2 border-[rgba(0,255,170,0.3)] border-t-[#00ffaa] animate-spin flex-shrink-0" />
            <p className="text-[13px] font-bold text-[#00ffaa]">{t.mods.jobsSentLabel}</p>
          </div>
        </div>
      )}

      {/* Error */}
      {status === 'error' && errorMsg && (
        <div className="px-5">
          <div className="p-3.5 bg-[rgba(239,68,68,0.05)] border border-[rgba(239,68,68,0.2)] rounded-[14px]">
            <p className="text-[12px] text-red-400">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Generate button */}
      <div className="px-5">
        <Button fullWidth disabled={!canGenerate} onClick={generate}>
          <IconZap size={18} />
          {status === 'uploading' ? t.mods.uploadingVideoLabel : status === 'generating' ? t.mods.startingGenLabel : t.mods.createVideoBtn}
        </Button>
        <p className="text-[10px] text-[rgba(255,255,255,0.25)] text-center mt-1.5">
          генерация ${(KLING_PRICES[klingModel] ?? KLING_PRICES['2.6'])[genMode]}
        </p>
      </div>

      {/* ── Video storage (glass panel) ────────────────────────────────────────── */}
      <div className="px-4 pb-6">
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
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.38)]">
            {t.mods.videoStorageLabel} — {readyCount}
            {processingCount > 0 && (
              <span className="ml-2 text-amber-400">· {processingCount} {t.mods.generatingLabel}</span>
            )}
          </p>
        </div>

        {videoStorage.length === 0 ? (
          <div className="flex flex-col items-center gap-2.5 py-9">
            <IconVideo size={32} color="rgba(0,255,170,0.2)" />
            <p className="text-[12px] text-[rgba(255,255,255,0.25)]">{t.mods.generatedVideosHere}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {videoStorage.map((v) => (
              <div key={v.id} className="rounded-[16px] overflow-hidden border bg-[rgba(255,255,255,0.02)]"
                style={{ borderColor: v.status === 'ready' ? 'rgba(255,255,255,0.08)' : 'rgba(251,191,36,0.2)' }}>

                {/* Processing state */}
                {(v.status === 'processing' || v.status === 'pending') && (
                  <div className="flex items-center gap-3 px-4 py-5">
                    <div className="w-5 h-5 rounded-full border-2 border-amber-400/25 border-t-amber-400 animate-spin flex-shrink-0" />
                    <div>
                      <p className="text-[13px] font-bold text-amber-400">{t.mods.generatingVideoLabel}</p>
                      <p className="text-[10px] text-[rgba(255,255,255,0.3)] mt-0.5">
                        {t.mods.klingProcessingLabel}
                      </p>
                    </div>
                  </div>
                )}

                {/* Failed state */}
                {v.status === 'failed' && (
                  <div className="flex items-center justify-between px-4 py-4">
                    <p className="text-[13px] text-red-400">{t.mods.genErrorLabel}</p>
                    <button onClick={() => deleteVideo(v.id)}
                      className="w-7 h-7 rounded-[8px] bg-[rgba(239,68,68,0.07)] border border-[rgba(239,68,68,0.2)]
                        flex items-center justify-center">
                      <IconTrash size={13} color="#f87171" />
                    </button>
                  </div>
                )}

                {/* Ready state */}
                {v.status === 'ready' && v.resultVideoUrl && (
                  <>
                    <video src={v.resultVideoUrl} controls playsInline preload="metadata"
                      className="w-full block" style={{ maxHeight: 260 }} />
                    <div className="flex gap-2 p-2.5">
                      <button onClick={() => downloadVideo(v.resultVideoUrl)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[10px]
                          bg-[rgba(0,255,170,0.08)] border border-[rgba(0,255,170,0.2)] text-[12px] font-bold text-[#00ffaa]">
                        <IconDownload size={14} color="#00ffaa" />
                        {t.mods.downloadBtn}
                      </button>
                      <button onClick={() => deleteVideo(v.id)}
                        className="w-9 h-9 rounded-[10px] bg-[rgba(239,68,68,0.07)] border border-[rgba(239,68,68,0.2)]
                          flex items-center justify-center hover:bg-[rgba(239,68,68,0.15)] transition-all">
                        <IconTrash size={14} color="#f87171" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        </div>
      </div>

    </div>
  )
}
