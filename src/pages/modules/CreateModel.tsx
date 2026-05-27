import { useState, useRef } from 'react'
import { useApp } from '../../store/app'
import { IconBack, IconPlus, IconCheck, IconTrash, IconRefresh } from '../../components/Icons'
import Button from '../../components/Button'
import Input from '../../components/Input'
import BottomSheet from '../../components/BottomSheet'

type Step = 1 | 2 | 3
type GenStatus = 'idle' | 'processing' | 'done'

export default function CreateModel() {
  const { goBack, navigate, setModels, models } = useApp()
  const [step, setStep] = useState<Step>(1)
  const [photos, setPhotos] = useState<(string | null)[]>([null, null, null, null])
  const [genStatus, setGenStatus] = useState<GenStatus>('idle')
  const [genProgress, setGenProgress] = useState(0)
  const [modelName, setModelName] = useState('')
  const [showPreview, setShowPreview] = useState(false)

  const filled = photos.filter(Boolean).length
  const canGenerate = filled >= 3 && genStatus === 'idle'
  const previewUrl = photos.find(Boolean) ?? null

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingSlot, setPendingSlot] = useState<number | null>(null)

  const openSlotPicker = (idx: number) => { setPendingSlot(idx); fileInputRef.current?.click() }

  const handleSlotFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || pendingSlot === null) return
    const url = URL.createObjectURL(file)
    setPhotos(p => p.map((v, i) => i === pendingSlot ? url : v))
    e.target.value = ''
    setPendingSlot(null)
  }

  const removePhoto = (idx: number) => setPhotos(p => p.map((v, i) => i === idx ? null : v))

  const generate = async () => {
    setGenStatus('processing')
    for (let i = 0; i <= 100; i += 10) {
      await new Promise(r => setTimeout(r, 280))
      setGenProgress(i)
    }
    setGenStatus('done')
    setShowPreview(true)
  }

  const regenerate = () => {
    setShowPreview(false)
    setGenStatus('idle')
    setGenProgress(0)
  }

  const saveModel = () => {
    setShowPreview(false)
    setStep(2)
  }

  const finish = () => {
    setModels([...models, {
      id: Date.now().toString(),
      name: modelName || 'Model',
      status: 'ready',
      previewUrl: previewUrl ?? undefined,
      createdAt: new Date().toLocaleDateString('ru'),
    }])
    navigate('module/models')
  }

  const progressBarWidth = `${genProgress}%`

  return (
    <div className="flex flex-col gap-5 pt-4">
      {/* Header */}
      <div className="flex items-center gap-3 px-5">
        <button onClick={step === 1 ? goBack : () => setStep(s => (s - 1) as Step)}
          className="w-9 h-9 rounded-full bg-[rgba(0,255,136,0.06)] border border-[rgba(0,255,136,0.2)] flex items-center justify-center hover:bg-[rgba(0,255,136,0.12)] transition-colors">
          <IconBack size={20} color="#00ff88" />
        </button>
        <div className="flex-1">
          <p className="text-[9px] font-black uppercase tracking-[2px] text-[rgba(0,255,136,0.5)]">Шаг {step} из 3</p>
          <h1 className="text-[20px] font-extrabold leading-tight tracking-tight">
            {step === 1 ? 'Загрузи фото' : step === 2 ? 'Название модели' : 'Готово!'}
          </h1>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex gap-1.5 px-5">
        {[1, 2, 3].map(s => (
          <div key={s} className={`h-[3px] flex-1 rounded-full transition-all duration-300 ${s <= step ? 'bg-[#00ff88]' : 'bg-[rgba(255,255,255,0.08)]'}`}
            style={s <= step ? { boxShadow: '0 0 6px rgba(0,255,136,0.6)' } : {}} />
        ))}
      </div>

      {step === 1 && (
        <>
          <div className="px-5">
            <p className="text-[13px] text-[rgba(255,255,255,0.38)] mb-4">Загрузи 3–4 чёткие фотографии лица для обучения модели</p>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleSlotFile} />
            <div className="grid grid-cols-2 gap-3">
              {photos.map((photo, idx) => (
                <div key={idx} className="aspect-[3/4] relative">
                  {photo ? (
                    <div className="w-full h-full rounded-[16px] overflow-hidden border border-[rgba(0,255,136,0.3)] relative bg-[#050505]"
                      style={{ boxShadow: '0 0 12px rgba(0,255,136,0.1)' }}>
                      <img src={photo} alt="" className="w-full h-full object-contain" />
                      <button onClick={() => removePhoto(idx)}
                        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 border border-[rgba(0,255,136,0.3)] flex items-center justify-center">
                        <IconTrash size={14} color="#00ff88" />
                      </button>
                      <div className="absolute bottom-2 left-2 w-5 h-5 rounded-full bg-[#00ff88] flex items-center justify-center"
                        style={{ boxShadow: '0 0 6px rgba(0,255,136,0.8)' }}>
                        <IconCheck size={12} color="black" />
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => openSlotPicker(idx)}
                      className="w-full h-full rounded-[16px] border-2 border-dashed border-[rgba(0,255,136,0.15)] bg-[#080808]
                        hover:border-[rgba(0,255,136,0.4)] hover:bg-[rgba(0,255,136,0.04)] transition-all duration-200
                        flex flex-col items-center justify-center gap-2">
                      <div className="w-10 h-10 rounded-full bg-[rgba(0,255,136,0.07)] flex items-center justify-center">
                        <IconPlus size={20} color="rgba(0,255,136,0.4)" />
                      </div>
                      <p className="text-[11px] text-[rgba(255,255,255,0.25)]">Фото {idx + 1}{idx < 3 ? ' *' : ''}</p>
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-[rgba(255,255,255,0.2)] mt-2">* минимум 3 фото</p>
          </div>

          <div className="flex flex-col gap-3 px-5">
            {genStatus === 'idle' && (
              <Button fullWidth disabled={!canGenerate} onClick={generate}>
                Создать модель ({filled}/3)
              </Button>
            )}
            {genStatus === 'processing' && (
              <div className="p-4 bg-[#080808] border border-[rgba(0,255,136,0.2)] rounded-[16px]">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[13px] font-bold">Создание модели...</p>
                  <p className="text-[13px] font-black text-[#00ff88]"
                    style={{ textShadow: '0 0 8px rgba(0,255,136,0.5)' }}>{genProgress}%</p>
                </div>
                <div className="h-[3px] bg-[rgba(0,255,136,0.08)] rounded-full overflow-hidden">
                  <div className="h-full bg-[#00ff88] rounded-full transition-all duration-300"
                    style={{ width: progressBarWidth, boxShadow: '0 0 8px rgba(0,255,136,0.7)' }} />
                </div>
                <p className="text-[11px] text-[rgba(255,255,255,0.28)] mt-2">Обработка займёт ~30 секунд</p>
              </div>
            )}
          </div>
        </>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4 px-5">
          {previewUrl && (
            <div className="flex items-center gap-4 p-4 bg-[#080808] border border-[rgba(0,255,136,0.15)] rounded-[16px]">
              <img src={previewUrl} className="w-14 h-14 rounded-[12px] object-cover flex-shrink-0" alt="" />
              <div>
                <p className="text-[9px] font-black uppercase tracking-[1px] text-[rgba(0,255,136,0.5)] mb-1">Превью модели</p>
                <p className="text-[13px] font-bold text-[#00ff88]">✓ Создана</p>
              </div>
            </div>
          )}
          <Input label="Название модели" value={modelName} onChange={setModelName}
            placeholder="Sofia AI, Mia Model..." autoFocus />
          <Button fullWidth disabled={!modelName.trim()} onClick={() => setStep(3)}>
            Сохранить →
          </Button>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col items-center gap-6 px-5 py-8 text-center">
          <div className="w-20 h-20 rounded-[24px] bg-[rgba(0,255,136,0.08)] border border-[rgba(0,255,136,0.25)] flex items-center justify-center text-4xl"
            style={{ boxShadow: '0 0 32px rgba(0,255,136,0.1)' }}>
            🎉
          </div>
          <div>
            <p className="text-[26px] font-black mb-2 tracking-tight">Модель создана!</p>
            <p className="text-[14px] text-[rgba(255,255,255,0.4)] leading-relaxed">
              <span className="text-white font-bold">{modelName}</span> готова к использованию.
            </p>
          </div>
          <Button size="lg" onClick={finish}>
            <IconCheck size={20} />
            Перейти к моделям
          </Button>
        </div>
      )}

      {/* Preview sheet — appears after generation */}
      <BottomSheet isOpen={showPreview} onClose={() => {}} title="Модель создана">
        {previewUrl && (
          <div className="relative rounded-[16px] overflow-hidden border border-[rgba(0,255,136,0.25)] bg-black flex items-center justify-center"
            style={{ boxShadow: '0 0 20px rgba(0,255,136,0.08)' }}>
            <img src={previewUrl} alt="Model preview" className="max-w-full max-h-[62vh] w-auto h-auto block" />
            <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88]" style={{ boxShadow: '0 0 5px rgba(0,255,136,1)' }} />
              <span className="text-[10px] font-black uppercase tracking-[1px] text-[#00ff88]">Сгенерировано</span>
            </div>
          </div>
        )}
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={regenerate}>
            <IconRefresh size={17} />
            Перегенерировать
          </Button>
          <Button className="flex-1" onClick={saveModel}>
            <IconCheck size={17} />
            Сохранить
          </Button>
        </div>
      </BottomSheet>
    </div>
  )
}
