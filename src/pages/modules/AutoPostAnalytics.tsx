import { useApp } from '../../store/app'
import { useLang } from '../../store/lang'
import { IconBack, IconZap, IconFlame, IconImage, IconStar } from '../../components/Icons'

const ENG: number[][] = [
  [0.1,0.05,0.03,0.02,0.02,0.05,0.15,0.3,0.5,0.45,0.4,0.35,0.3,0.35,0.4,0.5,0.6,0.75,0.85,0.8,0.7,0.55,0.35,0.2],
  [0.1,0.05,0.03,0.02,0.02,0.05,0.2,0.35,0.55,0.5,0.45,0.4,0.35,0.4,0.45,0.55,0.65,0.8,0.9,0.85,0.75,0.6,0.4,0.25],
  [0.1,0.05,0.02,0.02,0.02,0.04,0.15,0.28,0.45,0.4,0.35,0.3,0.28,0.32,0.38,0.48,0.58,0.72,0.82,0.78,0.68,0.52,0.33,0.18],
  [0.12,0.06,0.03,0.02,0.02,0.05,0.18,0.32,0.52,0.47,0.42,0.37,0.32,0.37,0.42,0.52,0.62,0.77,0.87,0.83,0.73,0.58,0.38,0.22],
  [0.15,0.08,0.04,0.03,0.02,0.06,0.22,0.38,0.6,0.55,0.5,0.45,0.4,0.45,0.5,0.62,0.75,0.9,1.0,0.95,0.85,0.7,0.5,0.3],
  [0.18,0.1,0.06,0.04,0.03,0.07,0.18,0.32,0.5,0.55,0.6,0.58,0.52,0.55,0.6,0.68,0.78,0.85,0.9,0.88,0.78,0.65,0.48,0.3],
  [0.2,0.12,0.07,0.05,0.03,0.06,0.15,0.28,0.45,0.5,0.55,0.52,0.48,0.5,0.55,0.62,0.7,0.78,0.85,0.82,0.72,0.58,0.42,0.25],
]

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const hourAvg = HOURS.map(h => ENG.reduce((s, d) => s + d[h], 0) / 7)
const dayAvg = ENG.map(d => d.reduce((s, v) => s + v, 0) / 24)
const bestHour = hourAvg.indexOf(Math.max(...hourAvg))
const bestDay = dayAvg.indexOf(Math.max(...dayAvg))

function SL({ children }: { children: string }) {
  return <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,170,0.55)] mb-3">{children}</p>
}

export default function AutoPostAnalytics() {
  const { goBack } = useApp()
  const { t, lang } = useLang()

  const DAYS = lang === 'ru'
    ? ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
    : lang === 'tr'
    ? ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const recs = [
    { Icon: IconFlame, text: `${t.mods.peakLabel} ${bestHour}:00–${bestHour + 2}:00` },
    { Icon: IconStar,  text: `${DAYS[bestDay]} +40%` },
    { Icon: IconImage, text: lang === 'ru' ? 'Обычный контент лучше идёт утром 9:00–11:00' : lang === 'tr' ? 'Normal içerik sabah 9:00–11:00 daha iyi performans gösterir' : 'Regular content performs best in the morning 9:00–11:00' },
    { Icon: IconZap,   text: lang === 'ru' ? '2–3 поста в день — оптимальный ритм для роста' : lang === 'tr' ? 'Günde 2–3 gönderi büyüme için optimal ritimdir' : '2–3 posts per day — optimal rhythm for growth' },
  ]

  return (
    <div className="flex flex-col gap-5 pt-4 pb-24">
      <div className="flex items-center gap-3 px-5 animate-slide-up">
        <button onClick={goBack}
          className="w-10 h-10 rounded-[14px] flex items-center justify-center transition-all duration-200 active:scale-[0.92]"
          style={{ background: 'rgba(0,255,170,0.06)', border: '1px solid rgba(0,255,170,0.2)' }}>
          <IconBack size={20} color="#00ffaa" />
        </button>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[2px] text-[rgba(0,255,170,0.5)]">{t.mods.analyticsBadge}</p>
          <h1 className="text-[20px] font-black tracking-tight">{t.mods.analyticsTitle}</h1>
        </div>
      </div>

      {/* Stats chips */}
      <div className="flex gap-3 px-5">
        {[
          { val: '127', sub: t.mods.postsLabel },
          { val: `${bestHour}:00`, sub: t.mods.peakHourLabel },
          { val: DAYS[bestDay], sub: t.mods.bestDayLabel },
        ].map(s => (
          <div key={s.sub} className="flex-1 p-3 rounded-[14px] text-center animate-card-in" style={{ background: 'linear-gradient(135deg, rgba(18,24,60,0.7), rgba(8,11,30,0.9))', border: '1px solid rgba(0,255,170,0.12)' }}>
            <p className="text-[20px] font-black text-[#00ffaa] leading-none mb-1">{s.val}</p>
            <p className="text-[9px] text-[rgba(255,255,255,0.35)]">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Hour bar chart */}
      <div className="px-5">
        <SL>{t.mods.activityByHour}</SL>
        <div className="flex items-end gap-px h-12 mb-1">
          {hourAvg.map((v, h) => (
            <div key={h} className="flex-1 rounded-[2px] transition-all"
              style={{
                height: `${Math.max(4, v * 48)}px`,
                backgroundColor: `rgba(0,255,170,${(0.12 + v * 0.88).toFixed(2)})`,
                boxShadow: v > 0.75 ? `0 0 6px rgba(0,255,170,${(v * 0.45).toFixed(2)})` : 'none',
              }} />
          ))}
        </div>
        <div className="flex justify-between text-[8px] text-[rgba(255,255,255,0.25)]">
          {[0, 6, 12, 18, 23].map(h => (
            <span key={h}>{h}:00</span>
          ))}
        </div>
        <p className="text-[10px] text-[rgba(255,255,255,0.35)] mt-1.5">
          {t.mods.peakLabel} <span className="text-[#00ffaa] font-bold">{bestHour}:00–{bestHour + 2}:00</span>
        </p>
      </div>

      {/* Day heatmap */}
      <div className="px-5">
        <SL>{t.mods.byDayLabel}</SL>
        <div className="flex gap-1.5">
          {DAYS.map((d, i) => {
            const v = dayAvg[i], best = i === bestDay
            return (
              <div key={d} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="w-full aspect-square rounded-[10px] transition-all"
                  style={{
                    backgroundColor: `rgba(0,255,170,${(0.06 + v * 0.55).toFixed(2)})`,
                    border: best ? '1.5px solid rgba(0,255,170,0.7)' : '1px solid rgba(0,255,170,0.08)',
                    boxShadow: best ? '0 0 12px rgba(0,255,170,0.3)' : 'none',
                  }} />
                <span className={`text-[9px] font-bold ${best ? 'text-[#00ffaa]' : 'text-[rgba(255,255,255,0.35)]'}`}>{d}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* AI recommendations */}
      <div className="px-5">
        <SL>{t.mods.aiRecsLabel}</SL>
        <div className="flex flex-col gap-2">
          {recs.map(({ Icon, text }, i) => (
            <div key={i} className="flex items-start gap-3 p-3 bg-[rgba(0,255,170,0.03)] border border-[rgba(0,255,170,0.1)] rounded-[12px] animate-fade-up"
              style={{ animationDelay: `${i * 60}ms` }}>
              <div className="w-7 h-7 rounded-[8px] bg-[rgba(0,255,170,0.08)] flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon size={14} color="rgba(0,255,170,0.8)" />
              </div>
              <p className="text-[12px] text-[rgba(255,255,255,0.65)] leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Heatmap grid (days x time slots) */}
      <div className="px-5">
        <SL>{t.mods.heatmapLabel}</SL>
        <div className="flex flex-col gap-px">
          {[t.mods.morningSlot, t.mods.afternoonSlot, t.mods.eveningSlot].map((label, slot) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="text-[8px] text-[rgba(255,255,255,0.3)] w-16 flex-shrink-0">{label}</span>
              <div className="flex gap-px flex-1">
                {DAYS.map((d, di) => {
                  const v = ENG[di].slice(slot * 6 + 6, slot * 6 + 12).reduce((s, x) => s + x, 0) / 6
                  return (
                    <div key={d} className="flex-1 h-5 rounded-[3px]"
                      style={{ backgroundColor: `rgba(0,255,170,${(0.05 + v * 0.95).toFixed(2)})` }} />
                  )
                })}
              </div>
            </div>
          ))}
          <div className="flex items-center gap-1.5 mt-1">
            <span className="w-16 flex-shrink-0" />
            <div className="flex flex-1">
              {DAYS.map(d => (
                <span key={d} className="flex-1 text-center text-[8px] text-[rgba(255,255,255,0.25)]">{d}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
