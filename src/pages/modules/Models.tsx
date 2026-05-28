import { useApp } from '../../store/app'
import { IconBack, IconPlus, IconBrain } from '../../components/Icons'
import Button from '../../components/Button'
import type { AIModel } from '../../types'

const STATUS_STYLES: Record<AIModel['status'], { label: string; cls: string }> = {
  ready: { label: 'Готова', cls: 'bg-[rgba(0,255,136,0.08)] text-[#00ff88] border-[rgba(0,255,136,0.3)]' },
  processing: { label: 'Генерация...', cls: 'bg-[rgba(251,191,36,0.1)] text-amber-400 border-[rgba(251,191,36,0.2)]' },
  failed: { label: 'Ошибка', cls: 'bg-[rgba(239,68,68,0.1)] text-red-400 border-[rgba(239,68,68,0.2)]' },
}

export default function Models() {
  const { models, navigate, goBack, setSelectedModelId } = useApp()

  const openModel = (id: string) => {
    setSelectedModelId(id)
    navigate('module/models/detail')
  }

  return (
    <div className="flex flex-col gap-5 pt-4">
      {/* Header */}
      <div className="flex items-center gap-3 px-5">
        <button onClick={goBack}
          className="w-9 h-9 rounded-full bg-[rgba(0,255,136,0.06)] border border-[rgba(0,255,136,0.2)] flex items-center justify-center hover:bg-[rgba(0,255,136,0.12)] transition-colors">
          <IconBack size={20} color="#00ff88" />
        </button>
        <div className="flex-1">
          <p className="text-[9px] font-black uppercase tracking-[2px] text-[rgba(0,255,136,0.5)]">Генерация</p>
          <h1 className="text-[22px] font-black tracking-tight">AI Модели</h1>
        </div>
        {models.length > 0 && (
          <button onClick={() => navigate('module/models/create')}
            className="w-9 h-9 rounded-full bg-[rgba(0,255,136,0.07)] border border-[rgba(0,255,136,0.25)] flex items-center justify-center
              hover:bg-[rgba(0,255,136,0.14)] hover:border-[rgba(0,255,136,0.5)] transition-all duration-200">
            <IconPlus size={18} color="#00ff88" />
          </button>
        )}
      </div>

      {models.length === 0 ? (
        <div className="flex flex-col items-center gap-5 px-5 py-12 text-center">
          <div className="w-20 h-20 rounded-[24px] bg-[rgba(0,255,136,0.07)] border border-[rgba(0,255,136,0.2)] flex items-center justify-center"
            style={{ boxShadow: '0 0 24px rgba(0,255,136,0.08)' }}>
            <IconBrain size={36} color="rgba(0,255,136,0.45)" />
          </div>
          <div>
            <p className="text-[19px] font-extrabold mb-2">Нет AI-моделей</p>
            <p className="text-[13px] text-[rgba(255,255,255,0.35)] leading-relaxed">
              Загрузи 3–4 фото лица и платформа<br />создаст персональную AI-модель
            </p>
          </div>
          <Button onClick={() => navigate('module/models/create')} size="lg">
            <IconPlus size={20} />
            Создать модель
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-5">
          {models.map(m => {
            const s = STATUS_STYLES[m.status]
            return (
              <button key={m.id} onClick={() => openModel(m.id)}
                className="flex items-center gap-3.5 p-4 bg-[#080808] border border-[rgba(0,255,136,0.12)] rounded-[16px]
                  hover:bg-[rgba(0,255,136,0.03)] hover:border-[rgba(0,255,136,0.3)] transition-all duration-200 text-left w-full">
                <div className="w-12 h-12 rounded-[14px] overflow-hidden bg-[rgba(0,255,136,0.08)] border border-[rgba(0,255,136,0.2)] flex items-center justify-center text-xl flex-shrink-0">
                  {m.previewUrl
                    ? <img src={m.previewUrl} className="w-full h-full object-cover" alt="" />
                    : <IconBrain size={22} color="rgba(0,255,136,0.5)" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-bold">{m.name}</p>
                  <p className="text-[11px] text-[rgba(255,255,255,0.28)]">{m.createdAt}</p>
                </div>
                <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border uppercase tracking-[0.5px] flex-shrink-0 ${s.cls}`}>
                  {s.label}
                </span>
              </button>
            )
          })}
          <Button onClick={() => navigate('module/models/create')} variant="secondary" fullWidth>
            <IconPlus size={18} />
            Создать ещё модель
          </Button>
        </div>
      )}
    </div>
  )
}
