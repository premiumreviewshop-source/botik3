import { useApp } from '../../store/app'
import { IconBack, IconZap, IconFlame, IconImage, IconStar } from '../../components/Icons'

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const HOURS = Array.from({ length: 24 }, (_, i) => i)

const ENG: number[][] = [
  [0.1,0.05,0.03,0.02,0.02,0.05,0.15,0.3,0.5,0.45,0.4,0.35,0.3,0.35,0.4,0.5,0.6,0.75,0.85,0.8,0.7,0.55,0.35,0.2],
  [0.1,0.05,0.03,0.02,0.02,0.05,0.2,0.35,0.55,0.5,0.45,0.4,0.35,0.4,0.45,0.55,0.65,0.8,0.9,0.85,0.75,0.6,0.4,0.25],
  [0.1,0.05,0.02,0.02,0.02,0.04,0.15,0.28,0.45,0.4,0.35,0.3,0.28,0.32,0.38,0.48,0.58,0.72,0.82,0.78,0.68,0.52,0.33,0.18],
  [0.12,0.06,0.03,0.02,0.02,0.05,0.18,0.32,0.52,0.47,0.42,0.37,0.32,0.37,0.42,0.52,0.62,0.77,0.87,0.83,0.73,0.58,0.38,0.22],
  [0.15,0.08,0.04,0.03,0.02,0.06,0.22,0.38,0.6,0.55,0.5,0.45,0.4,0.45,0.5,0.62,0.75,0.9,1.0,0.95,0.85,0.7,0.5,0.3],
  [0.18,0.1,0.06,0.04,0.03,0.07,0.18,0.32,0.5,0.55,0.6,0.58,0.52,0.55,0.6,0.68,0.78,0.85,0.9,0.88,0.78,0.65,0.48,0.3],
  [0.2,0.12,0.07,0.05,0.03,0.06,0.15,0.28,0.45,0.5,0.55,0.52,0.48,0.5,0.55,0.62,0.7,0.78,0.85,0.82,0.72,0.58,0.42,0.25],
]

const hourAvg = HOURS.map(h => ENG.reduce((s, d) => s + d[h], 0) / 7)
const dayAvg = ENG.map(d => d.reduce((s, v) => s + v, 0) / 24)
const bestHour = hourAvg.indexOf(Math.max(...hourAvg))
const bestDay = dayAvg.indexOf(Math.max(...dayAvg))

const recs = [
  { Icon: IconFlame, text: `Пик активности ${bestHour}:00–${bestHour + 2}:00 (пн–пт)` },
  { Icon: IconStar,  text: `Платный контент — ${DAYS[bestDay]} вечером, охват +40%` },
  { Icon: IconImage, text: 'Обычный контент лучше идёт утром 9:00–11:00' },
  { Icon: IconZap,   text: '2–3 поста в день — оптимальный ритм для роста' },
]

function SL({ children }: { children: string }) {
  return <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,136,0.55)] mb-3">{children}</p>
}

export default function AutoPostAnalytics() {
  const { goBack } = useApp()

  return (
    <div className="flex flex-col gap-5 pt-4 pb-24">
      <div className="flex items-center gap-3 px-5">
        <button onClick={goBack}
          className="w-9 h-9 rounded-full bg-[rgba(0,255,136,0.06)] border border-[rgba(0,255,136,0.2)] flex items-center justify-center hover:bg-[rgba(0,255,136,0.12)] transition-colors">
          <IconBack size={20} color="#00ff88" />
        </button>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[2px] text-[rgba(0,255,136,0.5)]">Посты + Автопостинг</p>
          <h1 className="text-[20px] font-black tracking-tight">Аналитика</h1>
        </div>
      </div>

      {/* Stats chips */}
      <div className="flex gap-3 px-5">
        {[
          { val: '127', sub: 'постов' },
          { val: `${bestHour}:00`, sub: 'пик часа' },
          { val: DAYS[bestDay], sub: 'лучший день' },
        ].map(s => (
          <div key={s.sub} className="flex-1 p-3 bg-[#080808] border border-[rgba(0,255,136,0.12)] rounded-[14px] text-center animate-glow-in">
            <p className="text-[20px] font-black text-[#00ff88] leading-none mb-1">{s.val}</p>
            <p className="text-[9px] text-[rgba(255,255,255,0.35)]">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Hour bar chart */}
      <div className="px-5">
        <SL>Активность по часам</SL>
        <div className="flex items-end gap-px h-12 mb-1">
          {hourAvg.map((v, h) => (
            <div key={h} className="flex-1 rounded-[2px] transition-all"
              style={{
                height: `${Math.max(4, v * 48)}px`,
                backgroundColor: `rgba(0,255,136,${(0.12 + v * 0.88).toFixed(2)})`,
                boxShadow: v > 0.75 ? `0 0 6px rgba(0,255,136,${(v * 0.45).toFixed(2)})` : 'none',
              }} />
          ))}
        </div>
        <div className="flex justify-between text-[8px] text-[rgba(255,255,255,0.25)]">
          {[0, 6, 12, 18, 23].map(h => (
            <span key={h}>{h}:00</span>
          ))}
        </div>
        <p className="text-[10px] text-[rgba(255,255,255,0.35)] mt-1.5">
          Пик: <span className="text-[#00ff88] font-bold">{bestHour}:00–{bestHour + 2}:00</span>
        </p>
      </div>

      {/* Day heatmap */}
      <div className="px-5">
        <SL>По дням недели</SL>
        <div className="flex gap-1.5">
          {DAYS.map((d, i) => {
            const v = dayAvg[i], best = i === bestDay
            return (
              <div key={d} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="w-full aspect-square rounded-[10px] transition-all"
                  style={{
                    backgroundColor: `rgba(0,255,136,${(0.06 + v * 0.55).toFixed(2)})`,
                    border: best ? '1.5px solid rgba(0,255,136,0.7)' : '1px solid rgba(0,255,136,0.08)',
                    boxShadow: best ? '0 0 12px rgba(0,255,136,0.3)' : 'none',
                  }} />
                <span className={`text-[9px] font-bold ${best ? 'text-[#00ff88]' : 'text-[rgba(255,255,255,0.35)]'}`}>{d}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* AI recommendations */}
      <div className="px-5">
        <SL>AI Рекомендации</SL>
        <div className="flex flex-col gap-2">
          {recs.map(({ Icon, text }, i) => (
            <div key={i} className="flex items-start gap-3 p-3 bg-[rgba(0,255,136,0.03)] border border-[rgba(0,255,136,0.1)] rounded-[12px] animate-fade-up"
              style={{ animationDelay: `${i * 60}ms` }}>
              <div className="w-7 h-7 rounded-[8px] bg-[rgba(0,255,136,0.08)] flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon size={14} color="rgba(0,255,136,0.8)" />
              </div>
              <p className="text-[12px] text-[rgba(255,255,255,0.65)] leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Heatmap grid (days x time slots) */}
      <div className="px-5">
        <SL>Тепловая карта (день × время)</SL>
        <div className="flex flex-col gap-px">
          {['Утро 6–12', 'День 12–18', 'Вечер 18–24'].map((label, slot) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="text-[8px] text-[rgba(255,255,255,0.3)] w-16 flex-shrink-0">{label}</span>
              <div className="flex gap-px flex-1">
                {DAYS.map((d, di) => {
                  const v = ENG[di].slice(slot * 6 + 6, slot * 6 + 12).reduce((s, x) => s + x, 0) / 6
                  return (
                    <div key={d} className="flex-1 h-5 rounded-[3px]"
                      style={{ backgroundColor: `rgba(0,255,136,${(0.05 + v * 0.95).toFixed(2)})` }} />
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
