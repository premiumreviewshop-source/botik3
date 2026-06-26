import { useState, useRef, useEffect } from 'react'
import { useLang } from '../../store/lang'
import { IconPlus, IconDownload, IconTrash, IconZap, IconCheck, IconImage } from '../../components/Icons'
import {
  cleanImage, detectPhotoTime,
  type GrainLevel, type TimeOfDay,
} from '../../lib/imageClean'
import { downloadFile } from '../../lib/download'
import { supabaseUrl, supabaseKey } from '../../lib/supabase'

type ItemStatus = 'idle' | 'processing' | 'done' | 'error'

interface Item {
  id: string; file: File; preview: string; status: ItemStatus
  resultUrl?: string; resultFile?: File
  originalSize: number; cleanedSize?: number
  todApplied?: TimeOfDay; appliedTime?: string
  autoTod?: TimeOfDay; autoTime?: string
}

interface StoredPhoto { url: string; path: string; name: string }

interface Prefs { grain: GrainLevel; microResize: boolean }

const GRAIN_OPTIONS: GrainLevel[] = ['none', 'light', 'medium', 'strong']
const TOD_LABELS: Record<TimeOfDay, Record<'en'|'ru'|'tr', string>> = {
  morning: { en: 'Morning 🌅', ru: 'Утро 🌅',  tr: 'Sabah 🌅' },
  day:     { en: 'Day ☀️',     ru: 'День ☀️',  tr: 'Gün ☀️'   },
  evening: { en: 'Evening 🌆', ru: 'Вечер 🌆', tr: 'Akşam 🌆' },
  night:   { en: 'Night 🌙',   ru: 'Ночь 🌙',  tr: 'Gece 🌙'  },
}

const STORAGE_KEY = 'spoofer_prefs'
const loadPrefs = (): Prefs => {
  try { const r = localStorage.getItem(STORAGE_KEY); if (r) return { grain: 'light', microResize: true, ...JSON.parse(r) } } catch {}
  return { grain: 'light', microResize: true }
}
const savePrefs = (p: Prefs) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)) } catch {} }
const fmtSize = (b: number) => b < 1024*1024 ? `${(b/1024).toFixed(0)}KB` : `${(b/(1024*1024)).toFixed(1)}MB`
const PV = (o: number) => `rgba(139,92,246,${o})`

// ── Storage helpers ──────────────────────────────────────────────────────────
const getTgUid = () => String((window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id ?? 'anon')
const BASE = () => supabaseUrl.replace(/\/$/, '')
const BUCKET_PREFIX = (uid: string) => `spoofer/${uid}/`
const HEADERS = { Authorization: `Bearer ${supabaseKey}`, apikey: supabaseKey }

async function saveToStorage(file: File): Promise<StoredPhoto | null> {
  try {
    const uid = getTgUid()
    const name = `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`
    const path = `${BUCKET_PREFIX(uid)}${name}`
    const resp = await fetch(`${BASE()}/storage/v1/object/model-images/${path}`, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
      body: await file.arrayBuffer(),
    })
    if (!resp.ok) return null
    return { url: `${BASE()}/storage/v1/object/public/model-images/${path}`, path, name }
  } catch { return null }
}

async function loadStorage(): Promise<StoredPhoto[]> {
  try {
    const uid = getTgUid()
    const resp = await fetch(`${BASE()}/storage/v1/object/list/model-images`, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: BUCKET_PREFIX(uid), limit: 200, offset: 0, sortBy: { column: 'created_at', order: 'desc' } }),
    })
    if (!resp.ok) return []
    const data = await resp.json()
    if (!Array.isArray(data)) return []
    const uid2 = uid
    return data
      .filter((x: any) => x.name && !x.name.endsWith('/'))
      .map((x: any) => ({
        name: x.name,
        path: `${BUCKET_PREFIX(uid2)}${x.name}`,
        url: `${BASE()}/storage/v1/object/public/model-images/${BUCKET_PREFIX(uid2)}${x.name}`,
      }))
  } catch { return [] }
}

async function deleteFromStorage(path: string): Promise<void> {
  await fetch(`${BASE()}/storage/v1/object/model-images`, {
    method: 'DELETE',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: [path] }),
  })
}

// ── Component ────────────────────────────────────────────────────────────────
export default function ModelSpooferTab() {
  const { t, lang } = useLang()
  const sp = t.spoofer
  const fileRef = useRef<HTMLInputElement>(null)

  const [prefs, setPrefs]       = useState<Prefs>(loadPrefs)
  const [items, setItems]       = useState<Item[]>([])
  const [running, setRunning]   = useState(false)
  const [stored, setStored]     = useState<StoredPhoto[]>([])
  const [loadingStorage, setLoadingStorage] = useState(true)

  useEffect(() => {
    loadStorage().then(s => { setStored(s); setLoadingStorage(false) })
  }, [])

  const updatePrefs = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch }; setPrefs(next); savePrefs(next)
  }

  const addFiles = (files: File[]) => {
    const imgs = files.filter(f => f.type.startsWith('image/'))
    const newItems: Item[] = imgs.map(f => ({
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      file: f, preview: URL.createObjectURL(f), status: 'idle' as ItemStatus, originalSize: f.size,
    }))
    setItems(p => [...p, ...newItems])
    newItems.forEach(item => {
      detectPhotoTime(item.file)
        .then(({ tod, time }) => setItems(p => p.map(x => x.id === item.id ? { ...x, autoTod: tod, autoTime: time } : x)))
        .catch(() => {})
    })
  }

  const upd = (id: string, patch: Partial<Item>) =>
    setItems(p => p.map(x => x.id === id ? { ...x, ...patch } : x))

  const run = async () => {
    const queue = items.filter(x => x.status === 'idle')
    if (!queue.length) return
    setRunning(true)
    await Promise.all(queue.map(async item => {
      upd(item.id, { status: 'processing' })
      try {
        const cleaned = await cleanImage(item.file, { grain: prefs.grain, microResize: prefs.microResize })
        const todApplied = item.autoTod ?? 'day'
        const appliedTime = item.autoTime ?? ''
        const resultUrl = URL.createObjectURL(cleaned)
        upd(item.id, { status: 'done', resultUrl, resultFile: cleaned, cleanedSize: cleaned.size, todApplied, appliedTime })
        // Auto-save to storage silently
        saveToStorage(cleaned).then(saved => {
          if (saved) setStored(prev => [saved, ...prev])
        })
      } catch {
        upd(item.id, { status: 'error' })
      }
    }))
    setRunning(false)
  }

  const downloadAll = async () => {
    const done = items.filter(x => x.status === 'done' && x.resultUrl && x.resultFile)
    for (let i = 0; i < done.length; i++) {
      await downloadFile(done[i].resultUrl!, done[i].resultFile!.name)
      if (i < done.length - 1) await new Promise(r => setTimeout(r, 300))
    }
  }

  const deleteStored = async (photo: StoredPhoto) => {
    await deleteFromStorage(photo.path)
    setStored(p => p.filter(x => x.path !== photo.path))
  }

  const idleCount = items.filter(x => x.status === 'idle').length
  const doneCount = items.filter(x => x.status === 'done').length

  const grainLabel: Record<GrainLevel, string> = { none: sp.grainNone, light: sp.grainLight, medium: sp.grainMedium, strong: sp.grainStrong }

  return (
    <div className="flex flex-col gap-5 px-5">

      {/* Banner */}
      <div className="rounded-[18px] p-4" style={{ background: PV(0.07), border: `1px solid ${PV(0.2)}` }}>
        <p className="text-[10px] font-black uppercase tracking-[2px] mb-1" style={{ color: PV(0.7) }}>{sp.badge}</p>
        <p className="text-[13px] font-bold text-white leading-snug">{sp.title}</p>
        <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>{sp.desc}</p>
      </div>

      {/* Upload */}
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
        onChange={e => { if (e.target.files) addFiles(Array.from(e.target.files)); e.target.value = '' }} />
      <div onClick={() => !running && fileRef.current?.click()}
        className="w-full rounded-[20px] border-2 border-dashed flex flex-col items-center justify-center gap-3 py-8 cursor-pointer select-none"
        style={{ borderColor: PV(0.3), background: PV(0.04) }}>
        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: PV(0.1), border: `1px solid ${PV(0.3)}` }}>
          <IconPlus size={22} color={PV(0.7)} />
        </div>
        <div className="text-center">
          <p className="text-[14px] font-bold" style={{ color: 'rgba(255,255,255,0.55)' }}>{sp.uploadHint}</p>
          <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.22)' }}>{sp.uploadSub}</p>
        </div>
      </div>

      {/* Previews */}
      {items.length > 0 && (
        <div className="flex gap-2.5 overflow-x-auto pb-1">
          {items.map(item => (
            <div key={item.id} className="relative flex-shrink-0 rounded-[13px] overflow-hidden"
              style={{ width: 80, height: 100, border: `1.5px solid ${item.status==='done'?PV(0.6):item.status==='error'?'rgba(239,68,68,0.4)':item.status==='processing'?'rgba(251,191,36,0.4)':PV(0.2)}` }}>
              <img src={item.status==='done'&&item.resultUrl?item.resultUrl:item.preview} className="w-full h-full object-cover" alt="" />
              {item.status==='idle'&&item.autoTime&&(
                <div className="absolute bottom-0 left-0 right-0 py-0.5 px-1 text-center" style={{ background: 'rgba(0,0,0,0.68)' }}>
                  <p className="text-[7px] font-black" style={{ color: 'rgba(255,210,100,0.95)' }}>{item.autoTime}</p>
                </div>
              )}
              {item.status==='processing'&&<div className="absolute inset-0 bg-black/60 flex items-center justify-center"><div className="w-5 h-5 rounded-full border-2 border-purple-400/30 border-t-purple-400 animate-spin"/></div>}
              {item.status==='done'&&(
                <div className="absolute inset-0 flex flex-col justify-between p-1">
                  <div className="flex justify-end"><div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: PV(0.9) }}><IconCheck size={10} color="white"/></div></div>
                  {item.cleanedSize!=null&&(
                    <div className="rounded-[6px] px-1 py-0.5 text-center" style={{ background: 'rgba(0,0,0,0.72)' }}>
                      <p className="text-[6.5px] font-bold" style={{ color: 'rgba(255,255,255,0.55)' }}>{fmtSize(item.originalSize)}</p>
                      <p className="text-[7px] font-black" style={{ color: PV(0.95) }}>→ {fmtSize(item.cleanedSize)}</p>
                      {item.appliedTime&&<p className="text-[6px] font-bold" style={{ color: 'rgba(255,210,100,0.85)' }}>{item.appliedTime}</p>}
                    </div>
                  )}
                </div>
              )}
              {item.status==='idle'&&!running&&(
                <button onClick={() => setItems(p=>p.filter(x=>x.id!==item.id))} className="absolute top-1 right-1 w-[18px] h-[18px] rounded-full bg-black/75 flex items-center justify-center">
                  <IconTrash size={8} color="#f87171"/>
                </button>
              )}
            </div>
          ))}
          {!running&&<button onClick={() => fileRef.current?.click()} className="flex-shrink-0 rounded-[13px] flex items-center justify-center" style={{ width:80,height:100,border:`1.5px dashed ${PV(0.2)}`,background:PV(0.03) }}><IconPlus size={16} color={PV(0.3)}/></button>}
        </div>
      )}

      {/* Settings */}
      <div className="rounded-[18px] p-4 flex flex-col gap-4" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[1.5px] mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>{sp.grainLabel}</p>
          <div className="flex gap-2">
            {GRAIN_OPTIONS.map(g => (
              <button key={g} onClick={() => updatePrefs({ grain: g })}
                className={`flex-1 py-2 rounded-[10px] text-[11px] font-bold transition-all ${prefs.grain===g?'text-white':'text-[rgba(255,255,255,0.3)]'}`}
                style={prefs.grain===g?{background:PV(0.25),border:`1px solid ${PV(0.5)}`}:{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)'}}>
                {grainLabel[g]}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => updatePrefs({ microResize: !prefs.microResize })} className="flex items-center gap-3 w-full select-none">
          <div className="w-5 h-5 rounded-[6px] border-2 flex items-center justify-center flex-shrink-0 transition-all"
            style={prefs.microResize?{background:PV(0.8),borderColor:PV(0.8)}:{background:'transparent',borderColor:'rgba(255,255,255,0.2)'}}>
            {prefs.microResize&&<IconCheck size={10} color="white"/>}
          </div>
          <div className="text-left">
            <p className="text-[13px] font-bold text-white">{sp.microResizeLabel}</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{sp.microResizeDesc}</p>
          </div>
        </button>
      </div>

      {/* Run */}
      <button disabled={!idleCount||running} onClick={run}
        className="w-full py-4 rounded-[16px] flex items-center justify-center gap-2.5 text-[15px] font-black transition-all active:scale-[0.97] disabled:opacity-40"
        style={{ background: PV(0.85), boxShadow: `0 4px 24px ${PV(0.35)}` }}>
        <IconZap size={18} color="white"/>
        {running?sp.processingLabel:idleCount>0?`${sp.runBtn} (${idleCount})`:sp.runBtn}
      </button>

      {/* Download + verification */}
      {doneCount>0&&!running&&(
        <>
          <button onClick={downloadAll}
            className="w-full py-3.5 rounded-[16px] flex items-center justify-center gap-2.5 text-[14px] font-black transition-all active:scale-[0.97]"
            style={{ background: PV(0.12), border: `1px solid ${PV(0.35)}` }}>
            <IconDownload size={16} color={PV(0.9)}/>
            <span style={{ color: PV(0.9) }}>{sp.downloadBtn} ({doneCount})</span>
          </button>
          <div className="rounded-[14px] p-3.5 flex flex-col gap-1.5" style={{ background: PV(0.05), border: `1px solid ${PV(0.18)}` }}>
            <p className="text-[9px] font-black uppercase tracking-[1.5px]" style={{ color: PV(0.6) }}>{sp.verifyTitle}</p>
            {items.filter(x=>x.status==='done'&&x.appliedTime).slice(0,1).map(item=>(
              <p key={item.id} className="text-[11px] font-bold text-white">
                🕐 {item.appliedTime}{item.todApplied&&` · ${TOD_LABELS[item.todApplied][lang]}`}
              </p>
            ))}
            <p className="text-[11px] text-white"><span style={{ color: PV(0.8) }}>✓ </span>{sp.exifRemoved}</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.38)' }}>{sp.verifyHint}</p>
          </div>
        </>
      )}

      {/* ── Storage section ── */}
      <div className="rounded-[20px] overflow-hidden" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[2px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {lang==='ru'?'Хранилище':lang==='tr'?'Depolama':'Storage'}
            </p>
            {stored.length > 0 && <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{stored.length} {lang==='ru'?'фото':lang==='tr'?'fotoğraf':'photos'}</p>}
          </div>
        </div>

        {loadingStorage ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 rounded-full border-2 border-purple-400/20 border-t-purple-400/60 animate-spin"/>
          </div>
        ) : stored.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 px-4">
            <IconImage size={28} color={PV(0.2)}/>
            <p className="text-[12px] text-center" style={{ color: 'rgba(255,255,255,0.25)' }}>
              {lang==='ru'?'Обработанные фото сохранятся здесь':lang==='tr'?'İşlenmiş fotoğraflar burada görünecek':'Processed photos will appear here'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 px-3 pb-4">
            {stored.map(photo => (
              <div key={photo.path} className="relative aspect-[3/4] rounded-[11px] overflow-hidden" style={{ border: `1px solid ${PV(0.2)}` }}>
                <img src={photo.url} className="w-full h-full object-cover" alt="" loading="lazy" />
                {/* Download button */}
                <button
                  onClick={() => downloadFile(photo.url, photo.name)}
                  className="absolute bottom-1 left-1 right-1 rounded-[7px] flex items-center justify-center gap-1 py-1"
                  style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }}>
                  <IconDownload size={11} color={PV(0.9)}/>
                  <span className="text-[9px] font-black" style={{ color: PV(0.9) }}>
                    {lang==='ru'?'Скачать':lang==='tr'?'İndir':'Save'}
                  </span>
                </button>
                {/* Delete button */}
                <button
                  onClick={() => deleteStored(photo)}
                  className="absolute top-1 right-1 w-[18px] h-[18px] rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(239,68,68,0.4)' }}>
                  <IconTrash size={8} color="#f87171"/>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
