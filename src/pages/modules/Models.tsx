import { useEffect, useState } from 'react'
import { useApp } from '../../store/app'
import { useLang } from '../../store/lang'
import { IconBack, IconPlus, IconBrain, IconTrash, IconDownload } from '../../components/Icons'
import Button from '../../components/Button'
import BottomSheet from '../../components/BottomSheet'
import type { AIModel } from '../../types'
import api from '../../api/client'

const STATUS_CLS: Record<AIModel['status'], string> = {
  ready: 'bg-[rgba(0,255,170,0.08)] text-[#00ffaa] border-[rgba(0,255,170,0.3)]',
  processing: 'bg-[rgba(251,191,36,0.1)] text-amber-400 border-[rgba(251,191,36,0.2)]',
  failed: 'bg-[rgba(239,68,68,0.1)] text-red-400 border-[rgba(239,68,68,0.2)]',
}

function ModelThumb({ url }: { url?: string }) {
  const [err, setErr] = useState(false)
  if (!url || err) return <IconBrain size={22} color="rgba(0,255,170,0.5)" />
  return <img src={url} className="w-full h-full object-cover" alt="" onError={() => setErr(true)} />
}

export default function Models() {
  const { models, setModels, navigate, goBack, setSelectedModelId } = useApp()
  const { t } = useLang()
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Only show models the user accepted and named (not pending/failed)
  const visibleModels = models.filter(m => m.name !== '_pending' && m.status !== 'failed')

  // Poll DB every 10 s while any visible model is still processing
  useEffect(() => {
    const hasProcessing = visibleModels.some(m => m.status === 'processing')
    if (!hasProcessing) return
    const id = setInterval(() => {
      api.models.list().then(setModels).catch(() => {})
    }, 10_000)
    return () => clearInterval(id)
  }, [visibleModels, setModels])

  const openModel = (id: string) => {
    setSelectedModelId(id)
    navigate('module/models/detail')
  }

  const confirmDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setConfirmDeleteId(id)
  }

  const doDelete = async () => {
    if (!confirmDeleteId) return
    setDeleting(true)
    try {
      await api.models.remove(confirmDeleteId)
      setModels(models.filter(m => m.id !== confirmDeleteId))
    } catch {}
    setDeleting(false)
    setConfirmDeleteId(null)
  }

  const modelToDelete = models.find(m => m.id === confirmDeleteId)

  const downloadModelPhoto = async (url: string, name: string) => {
    try {
      const resp = await fetch(url)
      const blob = await resp.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `${name}.jpg`
      document.body.appendChild(a)
      a.click()
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(blobUrl) }, 100)
    } catch {}
  }

  return (
    <div className="flex flex-col gap-5 pt-4">
      {/* Header */}
      <div className="flex items-center gap-3 px-5">
        <button onClick={goBack}
          className="w-10 h-10 rounded-[14px] flex items-center justify-center transition-all duration-200 active:scale-[0.92]"
          style={{ background: 'rgba(0,255,170,0.06)', border: '1px solid rgba(0,255,170,0.2)' }}>
          <IconBack size={20} color="#00ffaa" />
        </button>
        <div className="flex-1">
          <p className="text-[9px] font-black uppercase tracking-[2px] text-[rgba(0,255,170,0.5)]">{t.mods.moduleLabel}</p>
          <h1 className="text-[22px] font-black tracking-tight">{t.home.modModels}</h1>
        </div>
        {visibleModels.length > 0 && (
          <button onClick={() => navigate('module/models/create')}
            className="w-10 h-10 rounded-[14px] flex items-center justify-center transition-all duration-200 active:scale-[0.92]" style={{ background: 'rgba(0,255,170,0.06)', border: '1px solid rgba(0,255,170,0.2)' }}>
            <IconPlus size={18} color="#00ffaa" />
          </button>
        )}
      </div>

      {visibleModels.length === 0 ? (
        <div className="flex flex-col items-center gap-5 px-5 py-12 text-center">
          <div className="w-20 h-20 rounded-[24px] bg-[rgba(0,255,170,0.07)] border border-[rgba(0,255,170,0.2)] flex items-center justify-center"
            style={{ boxShadow: '0 0 24px rgba(0,255,170,0.08)' }}>
            <IconBrain size={36} color="rgba(0,255,170,0.45)" />
          </div>
          <div>
            <p className="text-[19px] font-extrabold mb-2">{t.mods.noModels}</p>
            <p className="text-[13px] text-[rgba(255,255,255,0.35)] leading-relaxed">{t.mods.noModelsDesc}</p>
          </div>
          <Button onClick={() => navigate('module/models/create')} size="lg">
            <IconPlus size={20} />
            {t.mods.createModel}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-5">
          {visibleModels.map(m => {
            const statusLabels = { ready: t.mods.modelReady, processing: t.mods.modelProcessing, failed: t.mods.modelFailed }
            return (
              <div key={m.id} className="relative">
                <button onClick={() => openModel(m.id)}
                  className="flex items-center gap-3.5 p-4 bg-[rgba(255,255,255,0.02)] border border-[rgba(0,255,170,0.12)] rounded-[16px]
                    hover:bg-[rgba(0,255,170,0.03)] hover:border-[rgba(0,255,170,0.3)] transition-all duration-200 text-left w-full pr-12">
                  <div className="w-12 h-12 rounded-[14px] overflow-hidden bg-[rgba(0,255,170,0.08)] border border-[rgba(0,255,170,0.2)] flex items-center justify-center flex-shrink-0">
                    <ModelThumb url={m.previewUrl} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-bold truncate">{m.name}</p>
                    <p className="text-[11px] text-[rgba(255,255,255,0.28)]">{m.createdAt}</p>
                  </div>
                  <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border uppercase tracking-[0.5px] flex-shrink-0 ${STATUS_CLS[m.status]}`}>
                    {statusLabels[m.status]}
                  </span>
                </button>
                {m.previewUrl && (
                  <button
                    onClick={(e) => { e.stopPropagation(); downloadModelPhoto(m.previewUrl!, m.name) }}
                    className="absolute right-3 top-2.5 w-7 h-7 rounded-full bg-[#111] border border-[rgba(0,255,170,0.2)]
                      flex items-center justify-center hover:bg-[rgba(0,255,170,0.12)] hover:border-[rgba(0,255,170,0.4)] transition-all duration-200 z-10">
                    <IconDownload size={13} color="#00ffaa" />
                  </button>
                )}
                <button
                  onClick={(e) => confirmDelete(e, m.id)}
                  className={`absolute right-3 w-7 h-7 rounded-full bg-[#111] border border-[rgba(239,68,68,0.2)]
                    flex items-center justify-center hover:bg-[rgba(239,68,68,0.12)] hover:border-[rgba(239,68,68,0.5)] transition-all duration-200 z-10
                    ${m.previewUrl ? 'bottom-2.5' : 'top-1/2 -translate-y-1/2'}`}>
                  <IconTrash size={13} color="#f87171" />
                </button>
              </div>
            )
          })}
          <Button onClick={() => navigate('module/models/create')} variant="secondary" fullWidth>
            <IconPlus size={18} />
            {t.mods.createModel}
          </Button>
        </div>
      )}

      {/* Delete confirmation */}
      <BottomSheet
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        title={`${t.mods.deleteModel}?`}
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmDeleteId(null)}>
              {t.common.cancel}
            </Button>
            <Button
              className="flex-1 !bg-[rgba(239,68,68,0.12)] !border-[rgba(239,68,68,0.4)] !text-red-400 hover:!bg-[rgba(239,68,68,0.2)]"
              disabled={deleting}
              onClick={doDelete}>
              <IconTrash size={16} color="#f87171" />
              {deleting ? t.mods.deletingLabel : t.mods.deleteModel}
            </Button>
          </div>
        }
      >
        <p className="text-[14px] text-[rgba(255,255,255,0.55)] leading-relaxed">
          <span className="text-white font-bold">«{modelToDelete?.name}»</span>
          {' '}{t.mods.deleteModelDesc}
        </p>
      </BottomSheet>
    </div>
  )
}
