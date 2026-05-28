import type { PlanItem } from '../../types'
import { IconImage, IconStar, IconPin, IconEdit, IconZap, IconCheck } from '../../components/Icons'
import Button from '../../components/Button'

type Category = 'free' | 'paid' | 'fix'

const CAT_INFO = {
  free: { label: 'Обычный',   Icon: IconImage },
  paid: { label: 'Платный',   Icon: IconStar  },
  fix:  { label: 'Фикс пост', Icon: IconPin   },
}

interface Props {
  plan: PlanItem[]
  onUpdate: (plan: PlanItem[]) => void
  onExtend: () => void
  autoActive: boolean
  onToggleAuto: () => void
  channelName: string
}

export default function AutoPostPlanTab({ plan, onUpdate, onExtend, autoActive, onToggleAuto, channelName }: Props) {
  const grouped = plan.reduce((acc, item) => {
    if (!acc[item.dateObj]) acc[item.dateObj] = []
    acc[item.dateObj].push(item)
    return acc
  }, {} as Record<string, PlanItem[]>)
  const days = Object.keys(grouped).sort()

  const scheduled = plan.filter(p => p.status === 'scheduled').length
  const cancelled = plan.filter(p => p.status === 'cancelled').length

  if (!plan.length) {
    return (
      <div className="px-5 py-12 flex flex-col items-center gap-3 text-center animate-fade-up">
        <div className="w-14 h-14 rounded-[18px] bg-[rgba(0,255,136,0.06)] border border-[rgba(0,255,136,0.15)] flex items-center justify-center">
          <IconZap size={24} color="rgba(0,255,136,0.4)" />
        </div>
        <p className="text-[14px] font-bold text-[rgba(255,255,255,0.5)]">Нет активного плана</p>
        <p className="text-[12px] text-[rgba(255,255,255,0.3)]">Настрой расписание и нажми «Создать план»</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-5 pb-8">
      {/* Summary row */}
      <div className="flex gap-2 animate-fade-up">
        <div className="flex-1 p-2.5 bg-[#080808] border border-[rgba(0,255,136,0.12)] rounded-[12px] text-center">
          <p className="text-[18px] font-black text-[#00ff88] leading-none">{scheduled}</p>
          <p className="text-[9px] text-[rgba(255,255,255,0.35)] mt-0.5">запланировано</p>
        </div>
        <div className="flex-1 p-2.5 bg-[#080808] border border-[rgba(0,255,136,0.12)] rounded-[12px] text-center">
          <p className="text-[18px] font-black text-[rgba(255,255,255,0.4)] leading-none">{cancelled}</p>
          <p className="text-[9px] text-[rgba(255,255,255,0.35)] mt-0.5">отменено</p>
        </div>
        <div className="flex-1 p-2.5 bg-[#080808] border border-[rgba(0,255,136,0.12)] rounded-[12px] text-center">
          <p className="text-[18px] font-black text-[rgba(255,255,255,0.5)] leading-none">{days.length}</p>
          <p className="text-[9px] text-[rgba(255,255,255,0.35)] mt-0.5">дней</p>
        </div>
      </div>

      {/* Autoposting toggle */}
      <div className={`flex items-center gap-3 p-3 rounded-[14px] border transition-all ${autoActive ? 'bg-[rgba(0,255,136,0.07)] border-[rgba(0,255,136,0.3)]' : 'bg-[#080808] border-[rgba(0,255,136,0.1)]'}`}>
        <div className="flex-1">
          <p className="text-[13px] font-bold">{autoActive ? 'Автопостинг активен' : 'Запустить автопостинг'}</p>
          {autoActive && <p className="text-[10px] text-[rgba(0,255,136,0.6)]">Публикует в {channelName} по расписанию</p>}
        </div>
        {autoActive && (
          <span className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse flex-shrink-0" style={{ boxShadow: '0 0 6px rgba(0,255,136,1)' }} />
        )}
        <button onClick={onToggleAuto}
          className={`relative w-11 h-6 rounded-full border transition-all flex-shrink-0 ${autoActive ? 'bg-[#00ff88] border-[#00ff88]' : 'bg-[rgba(255,255,255,0.06)] border-[rgba(255,255,255,0.1)]'}`}
          style={autoActive ? { boxShadow: '0 0 8px rgba(0,255,136,0.4)' } : {}}>
          <span className={`absolute top-1 w-4 h-4 rounded-full transition-all ${autoActive ? 'left-6 bg-black' : 'left-1 bg-[rgba(255,255,255,0.4)]'}`} />
        </button>
      </div>

      {/* Timeline */}
      {days.map((day, di) => (
        <div key={day} className="animate-fade-up" style={{ animationDelay: `${di * 40}ms` }}>
          <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,136,0.55)] mb-2">
            {grouped[day][0].date}
          </p>
          <div className="flex flex-col gap-1.5">
            {grouped[day].map(item => {
              const CatIcon = CAT_INFO[item.category as Category].Icon
              const gone = item.status === 'cancelled'
              return (
                <div key={item.id}
                  className={`flex items-center gap-2.5 p-3 bg-[#080808] border rounded-[12px] transition-all duration-200 ${gone ? 'opacity-40 border-[rgba(255,255,255,0.05)]' : 'border-[rgba(0,255,136,0.1)] hover:border-[rgba(0,255,136,0.22)]'}`}>
                  {item.postUrl
                    ? <img src={item.postUrl} className="w-9 h-9 rounded-[8px] object-cover flex-shrink-0" alt="" />
                    : <div className="w-9 h-9 rounded-[8px] bg-[rgba(0,255,136,0.06)] border border-[rgba(0,255,136,0.15)] flex items-center justify-center flex-shrink-0">
                        <CatIcon size={14} color="rgba(0,255,136,0.5)" />
                      </div>
                  }
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[11px] font-bold text-[rgba(255,255,255,0.75)]">{CAT_INFO[item.category as Category].label}</span>
                      {item.price && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-amber-400">
                          <IconStar size={8} color="rgb(251,191,36)" />{item.price}
                        </span>
                      )}
                      {gone && <span className="text-[9px] text-[rgba(255,80,80,0.5)]">отменено</span>}
                    </div>
                    {item.postCaption
                      ? <p className="text-[10px] text-[rgba(255,255,255,0.3)] truncate">{item.postCaption}</p>
                      : <p className="text-[10px] text-[rgba(255,255,255,0.2)] italic">без описания</p>
                    }
                  </div>
                  {item.editing ? (
                    <input type="time" defaultValue={item.time} autoFocus style={{ colorScheme: 'dark' }}
                      onBlur={e => onUpdate(plan.map(x => x.id === item.id ? { ...x, time: e.target.value, editing: false } : x))}
                      className="bg-transparent border border-[rgba(0,255,136,0.4)] rounded-[8px] px-2 py-1 text-[11px] text-[#00ff88] outline-none w-[68px] flex-shrink-0" />
                  ) : (
                    <button onClick={() => onUpdate(plan.map(x => x.id === item.id ? { ...x, editing: true } : x))}
                      className="text-[11px] font-bold text-[rgba(0,255,136,0.7)] hover:text-[#00ff88] transition-colors w-[40px] text-right flex-shrink-0">
                      {item.time}
                    </button>
                  )}
                  {!gone ? (
                    <button onClick={() => onUpdate(plan.map(x => x.id === item.id ? { ...x, status: 'cancelled' as const } : x))}
                      className="w-7 h-7 rounded-[8px] bg-[rgba(255,80,80,0.07)] border border-[rgba(255,80,80,0.15)] flex items-center justify-center text-[rgba(255,80,80,0.5)] hover:text-[rgba(255,80,80,0.9)] text-[16px] transition-all flex-shrink-0">
                      ×
                    </button>
                  ) : (
                    <button onClick={() => onUpdate(plan.map(x => x.id === item.id ? { ...x, status: 'scheduled' as const } : x))}
                      className="w-7 h-7 rounded-[8px] bg-[rgba(0,255,136,0.07)] border border-[rgba(0,255,136,0.2)] flex items-center justify-center transition-all flex-shrink-0">
                      <IconCheck size={12} color="rgba(0,255,136,0.6)" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Extend plan */}
      <button onClick={onExtend}
        className="flex items-center justify-center gap-2 w-full py-3 rounded-[14px] border border-dashed border-[rgba(0,255,136,0.25)] bg-[rgba(0,255,136,0.02)] hover:border-[rgba(0,255,136,0.5)] hover:bg-[rgba(0,255,136,0.06)] text-[13px] font-bold text-[rgba(0,255,136,0.7)] hover:text-[#00ff88] transition-all">
        <IconEdit size={14} color="currentColor" /> Добавить посты к плану
      </button>
    </div>
  )
}
