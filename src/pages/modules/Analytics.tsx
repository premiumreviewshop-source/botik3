import { useState, useEffect, useRef, type JSX } from 'react'
import { useApp } from '../../store/app'
import { useLang } from '../../store/lang'
import { IconBack, IconBrain, IconZap, IconBox, IconStar, IconBots, IconSend, IconImage, IconInfo, IconFlame, IconCheck } from '../../components/Icons'
import api from '../../api/client'
import type { Bot, Channel } from '../../types'
import SubscriptionPaywall from '../../components/SubscriptionPaywall'

function useCountUp(target: number, duration = 900): number {
  const [val, setVal] = useState(0)
  const prevRef = useRef(0)
  useEffect(() => {
    const start = prevRef.current
    const diff = target - start
    if (diff === 0) return
    const t0 = performance.now()
    let raf: number
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(start + diff * eased)
      if (p < 1) { raf = requestAnimationFrame(tick) } else { setVal(target); prevRef.current = target }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return val
}

// ── Types ────────────────────────────────────────────────────────────────────

type Period = 'today' | 'week' | 'month'

interface SaleRecord {
  id: string; createdAt: string; tgUserId: number | null
  tgFirstName?: string | null; tgUsername?: string | null
  amountStars: number; amountUsd: number; itemTitle: string | null
}

interface Stats {
  aiMessages: number; aiChats: number; aiAvgSec: number
  ppvSold: number; ppvRevenue: number; ppvRevenueUsd: number; ppvViews: number
  postsPublished: number; postsReach: number; postsInPlan: number
  botsActive: number; spark: number[]
  starsEarned?: number; starsBalance?: number; starsWithdrawn?: number
  salesHistory?: SaleRecord[]
}

const FALLBACK: Record<Period, Stats> = {
  today: { aiMessages: 0, aiChats: 0, aiAvgSec: 0, ppvSold: 0, ppvRevenue: 0, ppvRevenueUsd: 0, ppvViews: 0, postsPublished: 0, postsReach: 0, postsInPlan: 0, botsActive: 0, spark: Array(24).fill(0) },
  week:  { aiMessages: 0, aiChats: 0, aiAvgSec: 0, ppvSold: 0, ppvRevenue: 0, ppvRevenueUsd: 0, ppvViews: 0, postsPublished: 0, postsReach: 0, postsInPlan: 0, botsActive: 0, spark: Array(24).fill(0) },
  month: { aiMessages: 0, aiChats: 0, aiAvgSec: 0, ppvSold: 0, ppvRevenue: 0, ppvRevenueUsd: 0, ppvViews: 0, postsPublished: 0, postsReach: 0, postsInPlan: 0, botsActive: 0, spark: Array(24).fill(0) },
}

function fmt(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n) }

function Sparkline({ data, color = '#0099ff', sid = 'a' }: { data: number[]; color?: string; sid?: string }) {
  const max = Math.max(...data), min = Math.min(...data)
  const range = max - min || 1
  const w = 100, h = 46, yp = 6
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * w,
    y: h - yp - ((v - min) / range) * (h - yp * 2),
  }))
  let line = `M${pts[0].x},${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], c = pts[i], cpx = p.x + (c.x - p.x) / 2
    line += ` C${cpx},${p.y} ${cpx},${c.y} ${c.x},${c.y}`
  }
  const area = `${line} L${w},${h} L0,${h} Z`
  const mi = data.indexOf(Math.max(...data))
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sg${sid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg${sid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[mi].x} cy={pts[mi].y} r="6" fill={color} fillOpacity="0.15" />
      <circle cx={pts[mi].x} cy={pts[mi].y} r="2.5" fill={color} />
    </svg>
  )
}

function StatCard({ label, value, sub, Icon, delay = 0, color = '#00ffaa' }: { label: string; value: number; sub?: string; Icon: (p: any) => JSX.Element; delay?: number; color?: string }) {
  const animated = useCountUp(value)
  const display = animated >= 1000 ? `${(animated / 1000).toFixed(1)}k` : String(Math.round(animated))
  const rgb = color === '#ffb800' ? '251,184,0' : color === '#00c8ff' ? '0,200,255' : '0,255,170'
  return (
    <div className="flex-1 p-3 rounded-[16px] flex flex-col gap-2 min-w-0 count-up-anim"
      style={{ background: `rgba(${rgb},0.04)`, border: `1px solid rgba(${rgb},0.14)`, backdropFilter: 'blur(12px)', animationDelay: `${delay}ms` }}>
      <div className="flex items-center gap-1.5">
        <Icon size={13} color={`rgba(${rgb},0.7)`} />
        <span className="text-[9px] font-black uppercase tracking-[1px] text-[rgba(255,255,255,0.35)] truncate">{label}</span>
      </div>
      <p className="text-[22px] font-black leading-none tabular-nums" style={{ color }}>{display}</p>
      {sub && <p className="text-[9px]" style={{ color: `rgba(${rgb},0.55)` }}>{sub}</p>}
    </div>
  )
}

function SL({ children }: { children: string }) {
  return <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,170,0.55)] mb-3">{children}</p>
}

function ModuleBlock({ title, Icon, rows, sparkData, period }: {
  title: string; Icon: (p: any) => JSX.Element
  rows: { label: string; value: string; IconR: (p: any) => JSX.Element }[]; sparkData: number[]; period: Period
}) {
  const { t } = useLang()
  const periodLabel = period === 'today' ? t.analytics.todayByHour : period === 'week' ? t.analytics.weekByDay : t.analytics.monthByDay
  return (
    <div className="rounded-[18px] p-4 flex flex-col gap-3"
      style={{ background: 'rgba(0,255,170,0.04)', border: '1px solid rgba(0,255,170,0.14)', backdropFilter: 'blur(12px)' }}>
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-[12px] flex items-center justify-center"
          style={{ background: 'rgba(0,255,170,0.1)', border: '1px solid rgba(0,255,170,0.25)' }}>
          <Icon size={16} color="#00ffaa" />
        </div>
        <p className="text-[14px] font-black">{title}</p>
      </div>
      <div className="flex flex-col gap-2">
        {rows.map(r => (
          <div key={r.label} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <r.IconR size={12} color="rgba(255,255,255,0.28)" />
              <span className="text-[11px] text-[rgba(255,255,255,0.45)]">{r.label}</span>
            </div>
            <span className="text-[13px] font-black text-[#00ffaa]">{r.value}</span>
          </div>
        ))}
      </div>
      <div className="pt-2 border-t border-[rgba(255,255,255,0.05)]">
        <p className="text-[8px] text-[rgba(255,255,255,0.22)] mb-2">{periodLabel}</p>
        <div className="rounded-[12px] px-2 pt-1.5 pb-0.5" style={{ background: 'rgba(2,3,14,0.95)', border: '1px solid rgba(0,100,255,0.14)' }}>
          <Sparkline data={sparkData.length ? sparkData : Array(12).fill(0)} color="#0099ff" sid={title.replace(/\s/g,'').slice(0,6)} />
        </div>
      </div>
    </div>
  )
}

// ── Аналитика tab (timing heatmap) ───────────────────────────────────────────

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const HOURS = Array.from({ length: 24 }, (_, i) => i)

const ENGAGEMENT: number[][] = [
  [0.1,0.05,0.03,0.02,0.02,0.05,0.15,0.3,0.5,0.45,0.4,0.35,0.3,0.35,0.4,0.5,0.6,0.75,0.85,0.8,0.7,0.55,0.35,0.2],
  [0.1,0.05,0.03,0.02,0.02,0.05,0.2,0.35,0.55,0.5,0.45,0.4,0.35,0.4,0.45,0.55,0.65,0.8,0.9,0.85,0.75,0.6,0.4,0.25],
  [0.1,0.05,0.02,0.02,0.02,0.04,0.15,0.28,0.45,0.4,0.35,0.3,0.28,0.32,0.38,0.48,0.58,0.72,0.82,0.78,0.68,0.52,0.33,0.18],
  [0.12,0.06,0.03,0.02,0.02,0.05,0.18,0.32,0.52,0.47,0.42,0.37,0.32,0.37,0.42,0.52,0.62,0.77,0.87,0.83,0.73,0.58,0.38,0.22],
  [0.15,0.08,0.04,0.03,0.02,0.06,0.22,0.38,0.6,0.55,0.5,0.45,0.4,0.45,0.5,0.62,0.75,0.9,1.0,0.95,0.85,0.7,0.5,0.3],
  [0.18,0.1,0.06,0.04,0.03,0.07,0.18,0.32,0.5,0.55,0.6,0.58,0.52,0.55,0.6,0.68,0.78,0.85,0.9,0.88,0.78,0.65,0.48,0.3],
  [0.2,0.12,0.07,0.05,0.03,0.06,0.15,0.28,0.45,0.5,0.55,0.52,0.48,0.5,0.55,0.62,0.7,0.78,0.85,0.82,0.72,0.58,0.42,0.25],
]

const hourAvg = HOURS.map(h => ENGAGEMENT.reduce((s, d) => s + d[h], 0) / 7)
const dayAvg = ENGAGEMENT.map(d => d.reduce((s, v) => s + v, 0) / 24)
const bestHour = hourAvg.indexOf(Math.max(...hourAvg))
const bestDay = dayAvg.indexOf(Math.max(...dayAvg))

function TabAnalytics({ publishedHours }: { publishedHours: number[] }) {
  const [barsReady, setBarsReady] = useState(false)
  useEffect(() => { const id = setTimeout(() => setBarsReady(true), 80); return () => clearTimeout(id) }, [])
  const totalPublished = publishedHours.reduce((s, v) => s + v, 0)
  const hasRealData = totalPublished > 0
  const displayHours = hasRealData ? publishedHours : hourAvg.map(v => v * 100)
  const maxH = Math.max(...displayHours, 1)
  const bestRealHour = hasRealData ? publishedHours.indexOf(Math.max(...publishedHours)) : bestHour

  const recs = [
    { Icon: IconFlame, text: hasRealData ? `Твой пик публикаций: ${bestRealHour}:00–${bestRealHour + 1}:00` : `Пик активности ${bestHour}:00–${bestHour + 2}:00 (пн–пт)` },
    { Icon: IconStar,  text: `Платный контент — ${DAYS[bestDay]} вечером, охват +40%` },
    { Icon: IconImage, text: 'Обычный контент лучше идёт утром 9:00–11:00' },
    { Icon: IconZap,   text: '2–3 поста в день — оптимальный ритм для роста' },
  ]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-3 px-5">
        {[
          { val: hasRealData ? String(totalPublished) : '—', sub: 'опубл. постов' },
          { val: `${bestRealHour}:00`, sub: hasRealData ? 'твой пик' : 'пик аудитории' },
          { val: DAYS[bestDay], sub: 'лучший день' },
        ].map(s => (
          <div key={s.sub} className="flex-1 p-3 rounded-[14px] text-center" style={{ background: 'linear-gradient(135deg, rgba(18,24,60,0.7), rgba(8,11,30,0.9))', border: '1px solid rgba(0,255,170,0.12)' }}>
            <p className="text-[20px] font-black text-[#00ffaa] leading-none mb-1">{s.val}</p>
            <p className="text-[9px] text-[rgba(255,255,255,0.35)]">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="px-5">
        <SL>{hasRealData ? `Реальная статистика публикаций (${totalPublished} постов)` : 'Активность аудитории по часам'}</SL>
        <div className="rounded-[18px] px-4 pt-4 pb-3" style={{ background: 'rgba(2,3,13,0.97)', border: '1px solid rgba(0,100,255,0.18)', boxShadow: 'inset 0 1px 0 rgba(0,120,255,0.07)' }}>
          <div className="flex items-end gap-[2px] h-16 mb-2">
            {displayHours.map((v, h) => {
              const ratio = v / maxH
              return (
                <div key={h} className="flex-1 self-end rounded-t-[3px]"
                  style={{
                    height: barsReady ? `${Math.max(3, ratio * 60)}px` : '3px',
                    transition: `height 0.75s cubic-bezier(0.22,1,0.36,1) ${h * 12}ms`,
                    background: `linear-gradient(to top, rgba(0,70,200,${(0.5 + ratio * 0.5).toFixed(2)}), rgba(0,180,255,${(0.4 + ratio * 0.6).toFixed(2)}))`,
                    boxShadow: ratio > 0.6 ? `0 0 8px rgba(0,170,255,${(ratio * 0.4).toFixed(2)})` : 'none',
                  }} />
              )
            })}
          </div>
          <div className="flex justify-between text-[8px] text-[rgba(255,255,255,0.3)]">
            {[0, 6, 12, 18, 23].map(h => <span key={h}>{h}:00</span>)}
          </div>
        </div>
        <p className="text-[10px] text-[rgba(255,255,255,0.35)] mt-2">
          Пик: <span className="font-bold" style={{ color: '#00aaff' }}>{bestRealHour}:00–{bestRealHour + 1}:00</span>
          {!hasRealData && <span className="text-[rgba(255,255,255,0.22)] ml-1">(данные аудитории — опубликуй посты для реальной статистики)</span>}
        </p>
      </div>

      <div className="px-5">
        <SL>По дням недели</SL>
        <div className="flex gap-1.5">
          {DAYS.map((d, i) => {
            const v = dayAvg[i], best = i === bestDay
            return (
              <div key={d} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="w-full aspect-square rounded-[10px] transition-all"
                  style={{
                    background: best
                      ? 'linear-gradient(135deg, rgba(0,120,255,0.5), rgba(0,200,255,0.3))'
                      : `rgba(0,100,220,${(0.05 + v * 0.45).toFixed(2)})`,
                    border: best ? '1.5px solid rgba(0,180,255,0.7)' : '1px solid rgba(0,100,255,0.12)',
                    boxShadow: best ? '0 0 12px rgba(0,160,255,0.35)' : 'none',
                  }} />
                <span className={`text-[9px] font-bold ${best ? 'text-[#00aaff]' : 'text-[rgba(255,255,255,0.35)]'}`}>{d}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="px-5">
        <SL>AI Рекомендации</SL>
        <div className="flex flex-col gap-2">
          {recs.map(({ Icon, text }, i) => (
            <div key={i} className="flex items-start gap-3 p-3 bg-[rgba(0,255,170,0.03)] border border-[rgba(0,255,170,0.1)] rounded-[12px]">
              <div className="w-7 h-7 rounded-[8px] bg-[rgba(0,255,170,0.08)] flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon size={14} color="rgba(0,255,170,0.8)" />
              </div>
              <p className="text-[12px] text-[rgba(255,255,255,0.65)] leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="px-5">
        <SL>Тепловая карта (день × время)</SL>
        <div className="rounded-[14px] p-3" style={{ background: 'rgba(2,3,13,0.95)', border: '1px solid rgba(0,100,255,0.14)' }}>
          {['Утро 6–12', 'День 12–18', 'Вечер 18–24'].map((label, slot) => (
            <div key={label} className="flex items-center gap-1.5 mb-1.5 last:mb-0">
              <span className="text-[8px] text-[rgba(255,255,255,0.3)] w-16 flex-shrink-0">{label}</span>
              <div className="flex gap-px flex-1">
                {DAYS.map((d, di) => {
                  const v = ENGAGEMENT[di].slice(slot * 6 + 6, slot * 6 + 12).reduce((s, x) => s + x, 0) / 6
                  return <div key={d} className="flex-1 h-5 rounded-[3px]" style={{ background: `linear-gradient(135deg, rgba(0,70,200,${(0.1 + v * 0.65).toFixed(2)}), rgba(0,180,255,${(0.08 + v * 0.55).toFixed(2)}))` }} />
                })}
              </div>
            </div>
          ))}
          <div className="flex items-center gap-1.5 mt-1">
            <span className="w-16 flex-shrink-0" />
            <div className="flex flex-1">{DAYS.map(d => <span key={d} className="flex-1 text-center text-[8px] text-[rgba(255,255,255,0.25)]">{d}</span>)}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type Tab = 'analytics' | 'stats'

export default function Analytics() {
  const { goBack, navigate, contentPlan, isAdmin } = useApp()
  const { t: tl } = useLang()

  if (!isAdmin) return <SubscriptionPaywall module="analytics" onBack={goBack} />
  const [activeTab, setActiveTab] = useState<Tab>('analytics')
  const [period, setPeriod] = useState<Period>('week')
  const [stats, setStats] = useState<Record<Period, Stats>>(FALLBACK)
  const [loading, setLoading] = useState(false)

  // Bot filter for AI stats
  const [bots, setBots] = useState<Bot[]>([])
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null)
  const [botStats, setBotStats] = useState<{ messages: number; uniqueChatters: number; ppvSold: number; ppvRevenue: number; ppvRevenueUsd: number; postsPublished: number; starsBalance?: number; starsEarned?: number; starsWithdrawn?: number; salesHistory?: SaleRecord[] } | null>(null)
  const [botStatsLoading, setBotStatsLoading] = useState(false)
  const [salesHistory, setSalesHistory] = useState<SaleRecord[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)

  // Channel filter for autopost stats
  const [channels, setChannels] = useState<Channel[]>([])
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null)
  const [channelStats, setChannelStats] = useState<{ channelId: string; published: number; scheduled: number }[]>([])

  // Real published hours for analytics tab
  const [publishedHours, setPublishedHours] = useState<number[]>(Array(24).fill(0))

  useEffect(() => {
    api.bots.list().then(list => {
      setBots(list)
      // auto-select first bot so stats are always per-bot
      if (list.length > 0) setSelectedBotId(list[0].id)
    }).catch(() => {})
    api.channels.list().then(list => {
      setChannels(list)
      if (list.length > 0) setSelectedChannelId(list[0].id)
    }).catch(() => {})
    api.autopost.publishedHours().then(setPublishedHours).catch(() => {})
    api.autopost.channelStats().then(setChannelStats).catch(() => {})
  }, [])

  const refreshStats = () => {
    setLoading(true)
    api.analytics.get(period, selectedBotId ?? undefined).then(d => {
      setStats(prev => ({ ...prev, [period]: d as Stats }))
      setSalesHistory((d as any).salesHistory ?? [])
    }).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => {
    if (activeTab !== 'stats') return
    if (bots.length === 0) return
    refreshStats()
    const interval = setInterval(refreshStats, 15000)
    const onVisible = () => { if (!document.hidden) refreshStats() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible) }
  }, [period, activeTab, selectedBotId, bots.length])

  const refreshBotStats = (id: string) => {
    setBotStatsLoading(true)
    api.bots.stats(id, period).then(setBotStats).catch(() => setBotStats(null)).finally(() => setBotStatsLoading(false))
  }

  useEffect(() => {
    if (!selectedBotId) { setBotStats(null); return }
    refreshBotStats(selectedBotId)
    if (activeTab !== 'stats') return
    const interval = setInterval(() => refreshBotStats(selectedBotId), 15000)
    const onVisible = () => { if (!document.hidden) refreshBotStats(selectedBotId) }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible) }
  }, [selectedBotId, period, activeTab])

  const d = stats[period]
  const selChannel = channels.find(c => c.id === selectedChannelId)
  const selChannelStat = channelStats.find(s => s.channelId === selectedChannelId)

  return (
    <div className="flex flex-col gap-5 pt-4 pb-24">
      <div className="flex items-center gap-3 px-5 animate-slide-up">
        <button onClick={goBack}
          className="w-10 h-10 rounded-[14px] flex items-center justify-center transition-all duration-200 active:scale-[0.92]"
          style={{ background: 'rgba(0,255,170,0.06)', border: '1px solid rgba(0,255,170,0.2)' }}>
          <IconBack size={20} color="#00ffaa" />
        </button>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[2px] text-[rgba(0,255,170,0.5)]">{tl.analytics.section}</p>
          <h1 className="text-[22px] font-black tracking-tight">{tl.analytics.title}</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {loading && <div className="w-4 h-4 border-2 border-[#00ffaa] border-t-transparent rounded-full animate-spin" />}
          {activeTab === 'stats' && !loading && (
            <button onClick={refreshStats} className="w-8 h-8 rounded-full bg-[rgba(0,255,170,0.06)] border border-[rgba(0,255,170,0.2)] flex items-center justify-center hover:bg-[rgba(0,255,170,0.12)] transition-colors text-[#00ffaa] text-[14px]">↻</button>
          )}
        </div>
      </div>

      <div className="flex gap-1.5 px-5">
        {([[`analytics`, tl.analytics.tabAnalytics], [`stats`, tl.analytics.tabStats]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setActiveTab(k)}
            className={`flex-1 py-2 rounded-[10px] text-[12px] font-black border transition-all ${activeTab === k ? 'bg-[#00ffaa] border-[#00ffaa] text-black' : 'border-[rgba(0,255,170,0.2)] text-[rgba(255,255,255,0.45)] hover:border-[rgba(0,255,170,0.4)]'}`}>
            {l}
          </button>
        ))}
      </div>

      {activeTab === 'analytics' && (
        channels.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16 px-8 text-center animate-reveal-up">
            <div className="w-16 h-16 rounded-[20px] flex items-center justify-center" style={{ background: 'rgba(0,255,170,0.06)', border: '1px solid rgba(0,255,170,0.18)' }}>
              <IconZap size={30} color="rgba(0,255,170,0.4)" />
            </div>
            <div>
              <p className="text-[17px] font-bold mb-1.5 text-white">{tl.analytics.noChannelTitle}</p>
              <p className="text-[13px] text-[rgba(255,255,255,0.35)] leading-relaxed">{tl.analytics.noChannelDesc}</p>
            </div>
          </div>
        ) : <TabAnalytics publishedHours={publishedHours} />
      )}

      {activeTab === 'stats' && bots.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-16 px-8 text-center animate-reveal-up">
          <div className="w-16 h-16 rounded-[20px] flex items-center justify-center" style={{ background: 'rgba(0,255,170,0.06)', border: '1px solid rgba(0,255,170,0.18)' }}>
            <IconBrain size={30} color="rgba(0,255,170,0.4)" />
          </div>
          <div>
            <p className="text-[17px] font-bold mb-1.5 text-white">{tl.analytics.noBotTitle}</p>
            <p className="text-[13px] text-[rgba(255,255,255,0.35)] leading-relaxed mb-4">{tl.analytics.noBotDesc}</p>
          </div>
          <button onClick={() => navigate('bots/add')}
            className="px-6 py-3 rounded-[14px] text-[14px] font-black transition-all active:scale-[0.97]"
            style={{ background: 'rgba(0,255,170,0.08)', border: '1.5px solid rgba(0,255,170,0.3)', color: '#00ffaa', backdropFilter: 'blur(12px)' }}>
            {tl.analytics.addBotBtn}
          </button>
        </div>
      )}

      {activeTab === 'stats' && bots.length > 0 && (
        <>
          {/* Period selector */}
          <div className="flex gap-1.5 px-5">
            {([[`today`, tl.analytics.today], [`week`, tl.analytics.week], [`month`, tl.analytics.month]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setPeriod(k)}
                className={`flex-1 py-2 rounded-[10px] text-[11px] font-black border transition-all ${period === k ? 'bg-[rgba(0,255,170,0.15)] border-[rgba(0,255,170,0.5)] text-[#00ffaa]' : 'border-[rgba(0,255,170,0.2)] text-[rgba(255,255,255,0.45)] hover:border-[rgba(0,255,170,0.4)]'}`}>
                {l}
              </button>
            ))}
          </div>

          {/* Overview */}
          <div className="px-5">
            <SL>{tl.analytics.overview}</SL>
            <div className="flex gap-2">
              <StatCard label={tl.analytics.aiMsgs} value={d.aiMessages} Icon={IconBrain} delay={0} />
              <StatCard label={tl.analytics.ppvSales} value={d.ppvSold} sub={`⭐ ${fmt(d.starsEarned ?? d.ppvRevenue)}`} Icon={IconBox} delay={60} color="#ffb800" />
              <StatCard label={tl.analytics.posts} value={d.postsPublished} sub={`~${fmt(d.postsReach)}`} Icon={IconZap} delay={120} color="#00c8ff" />
            </div>
          </div>

          {/* AI Chatting + bot filter */}
          <div className="px-5 flex flex-col gap-3">
            {bots.length > 0 && (
              <div>
                <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,170,0.55)] mb-2">{tl.analytics.botFilter}</p>
                <div className="flex gap-1.5 flex-wrap">
                  <button
                    onClick={() => setSelectedBotId(null)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${!selectedBotId ? 'bg-[#00ffaa] border-[#00ffaa] text-black' : 'border-[rgba(0,255,170,0.2)] text-[rgba(255,255,255,0.45)] hover:border-[rgba(0,255,170,0.4)]'}`}>
                    {tl.analytics.allBots}
                  </button>
                  {bots.map(bot => (
                    <button key={bot.id} onClick={() => setSelectedBotId(bot.id)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${selectedBotId === bot.id ? 'bg-[#00ffaa] border-[#00ffaa] text-black' : 'border-[rgba(0,255,170,0.2)] text-[rgba(255,255,255,0.45)] hover:border-[rgba(0,255,170,0.4)]'}`}>
                      {bot.name || bot.handle}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedBotId && botStats ? (
              <div className="rounded-[18px] p-4 flex flex-col gap-3" style={{ background: 'linear-gradient(135deg, rgba(18,24,60,0.8), rgba(8,11,30,0.95))', border: '1px solid rgba(0,255,170,0.12)' }}>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-[10px] bg-[rgba(0,255,170,0.08)] border border-[rgba(0,255,170,0.2)] flex items-center justify-center">
                    <IconBrain size={16} color="#00ffaa" />
                  </div>
                  <div>
                    <p className="text-[14px] font-black">{bots.find(b => b.id === selectedBotId)?.name ?? 'Бот'}</p>
                    <p className="text-[10px] text-[rgba(255,255,255,0.35)]">{bots.find(b => b.id === selectedBotId)?.handle}</p>
                  </div>
                  {botStatsLoading && <div className="ml-auto w-3.5 h-3.5 border-2 border-[#00ffaa] border-t-transparent rounded-full animate-spin" />}
                </div>
                {[
                  { label: tl.analytics.msgsSent, value: fmt(botStats.messages), IconR: IconSend },
                  { label: tl.analytics.activeChats, value: String(botStats.uniqueChatters), IconR: IconBots },
                  { label: tl.analytics.ppvSold, value: String(botStats.ppvSold), IconR: IconBox },
                  { label: tl.analytics.starsEarned, value: fmt(botStats.starsEarned ?? botStats.ppvRevenue), IconR: IconStar },
                  { label: tl.analytics.starsAvail, value: fmt(botStats.starsBalance ?? botStats.ppvRevenue), IconR: IconStar },
                  { label: tl.analytics.usdAvail, value: `$${((botStats.starsBalance ?? botStats.ppvRevenueUsd ?? 0) * (botStats.starsBalance != null ? 0.013 : 1)).toFixed(2)}`, IconR: IconInfo },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2"><r.IconR size={12} color="rgba(255,255,255,0.3)" /><span className="text-[11px] text-[rgba(255,255,255,0.45)]">{r.label}</span></div>
                    <span className="text-[13px] font-black text-[#00ffaa]">{r.value}</span>
                  </div>
                ))}
              </div>
            ) : !selectedBotId && (
              <ModuleBlock title="AI Chatting" Icon={IconBrain} period={period} sparkData={d.spark}
                rows={[
                  { label: tl.analytics.msgsSent, value: fmt(d.aiMessages), IconR: IconSend },
                  { label: tl.analytics.activeChats, value: String(d.aiChats), IconR: IconBots },
                  { label: tl.analytics.avgResp, value: `${d.aiAvgSec}s`, IconR: IconInfo },
                ]} />
            )}
          </div>

          {/* Income chart */}
          <div className="px-5">
            {(() => {
              const earned = selectedBotId && botStats
                ? (botStats.starsEarned ?? botStats.ppvRevenue)
                : (d.starsEarned ?? d.ppvRevenue)
              const usdTotal = ((selectedBotId && botStats
                ? (botStats.starsBalance ?? botStats.ppvRevenueUsd ?? 0)
                : (d.starsBalance ?? d.ppvRevenue)) * 0.013)
              const sparkRev = d.spark.map(v => v * 0.15)
              const maxV = Math.max(...sparkRev, 1)
              const periodLabel = period === 'today' ? 'по часам' : period === 'week' ? 'по дням' : 'по дням месяца'
              return (
                <div className="rounded-[20px] p-4 flex flex-col gap-4" style={{
                  background: 'linear-gradient(135deg, rgba(245,158,11,0.06) 0%, rgba(8,11,30,0.96) 100%)',
                  border: '1px solid rgba(245,158,11,0.14)',
                  backdropFilter: 'blur(12px)',
                }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-[10px] flex items-center justify-center"
                        style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}>
                        <IconStar size={15} color="#f59e0b" />
                      </div>
                      <div>
                        <p className="text-[14px] font-black">Доход</p>
                        <p className="text-[9px] text-[rgba(255,255,255,0.35)] uppercase tracking-[1px]">{periodLabel}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[18px] font-black tabular-nums" style={{ color: '#f59e0b' }}>+{fmt(earned)}⭐</p>
                      <p className="text-[11px] font-bold" style={{ color: 'rgba(0,255,170,0.7)' }}>${usdTotal.toFixed(2)}</p>
                    </div>
                  </div>

                  {/* High-res chart */}
                  <div className="rounded-[14px] px-3 pt-3 pb-2" style={{
                    background: 'rgba(2,2,10,0.98)',
                    border: '1px solid rgba(245,158,11,0.1)',
                    boxShadow: 'inset 0 1px 0 rgba(245,158,11,0.06)',
                  }}>
                    <svg width="100%" height="80" viewBox="0 0 300 80" preserveAspectRatio="none"
                      style={{ display: 'block' }}>
                      <defs>
                        <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.5" />
                          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.01" />
                        </linearGradient>
                        <filter id="glow">
                          <feGaussianBlur stdDeviation="2" result="blur" />
                          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                      </defs>
                      {(() => {
                        const pts = sparkRev.map((v, i) => ({
                          x: (i / (sparkRev.length - 1)) * 300,
                          y: 72 - Math.max(3, (v / maxV) * 62),
                        }))
                        let line = `M${pts[0].x},${pts[0].y}`
                        for (let i = 1; i < pts.length; i++) {
                          const cpx = pts[i-1].x + (pts[i].x - pts[i-1].x) / 2
                          line += ` C${cpx},${pts[i-1].y} ${cpx},${pts[i].y} ${pts[i].x},${pts[i].y}`
                        }
                        const area = `${line} L300,76 L0,76 Z`
                        const peak = pts.reduce((m, p) => p.y < m.y ? p : m, pts[0])
                        return (
                          <>
                            <path d={area} fill="url(#incomeGrad)" />
                            <path d={line} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)" />
                            <circle cx={peak.x} cy={peak.y} r="8" fill="rgba(245,158,11,0.15)" />
                            <circle cx={peak.x} cy={peak.y} r="3.5" fill="#f59e0b" filter="url(#glow)" />
                            {/* Grid lines */}
                            {[25, 50, 75].map(y => (
                              <line key={y} x1="0" y1={y} x2="300" y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                            ))}
                          </>
                        )
                      })()}
                    </svg>
                    <div className="flex justify-between mt-1">
                      {period === 'today'
                        ? [0, 6, 12, 18, 23].map(h => <span key={h} className="text-[8px] text-[rgba(255,255,255,0.22)]">{h}:00</span>)
                        : period === 'week'
                        ? ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(d => <span key={d} className="text-[8px] text-[rgba(255,255,255,0.22)]">{d}</span>)
                        : [1,8,15,22,sparkRev.length].map(d => <span key={d} className="text-[8px] text-[rgba(255,255,255,0.22)]">{d}</span>)
                      }
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'PPV продаж', val: String(selectedBotId && botStats ? botStats.ppvSold : d.ppvSold) },
                      { label: 'Stars заработано', val: fmt(earned) },
                      { label: 'Доступно $', val: `$${usdTotal.toFixed(2)}` },
                    ].map(s => (
                      <div key={s.label} className="p-2.5 rounded-[12px] text-center" style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.1)' }}>
                        <p className="text-[14px] font-black tabular-nums" style={{ color: '#f59e0b' }}>{s.val}</p>
                        <p className="text-[8px] text-[rgba(255,255,255,0.3)] mt-0.5 leading-tight">{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Sales history */}
          {(() => {
            const hist = selectedBotId ? ((botStats as any)?.salesHistory ?? []) : salesHistory
            if (hist.length === 0 && !selectedBotId) return null
            return (
            <div className="px-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,170,0.55)]">{tl.analytics.salesHistory}{hist.length > 0 ? ` (${hist.length})` : ''}</p>
                <button onClick={() => setHistoryOpen(v => !v)} className="text-[11px] text-[rgba(255,255,255,0.35)] hover:text-[rgba(255,255,255,0.6)] transition-colors px-2 py-0.5 rounded-full border border-[rgba(255,255,255,0.1)]">
                  {historyOpen ? tl.analytics.hide : tl.analytics.show}
                </button>
              </div>
              {historyOpen && (hist.length === 0 ? (
                <p className="text-[11px] text-[rgba(255,255,255,0.3)] text-center py-3">{tl.analytics.noSales}</p>
              ) : <div className="flex flex-col gap-2">
                {hist.map((s: SaleRecord) => {
                  const dt = new Date(s.createdAt)
                  const dateStr = `${dt.getDate().toString().padStart(2,'0')}.${(dt.getMonth()+1).toString().padStart(2,'0')} ${dt.getHours().toString().padStart(2,'0')}:${dt.getMinutes().toString().padStart(2,'0')}`
                  const buyerName = s.tgUsername ? `@${s.tgUsername}` : s.tgFirstName ?? (s.tgUserId ? `#${String(s.tgUserId).slice(-4)}` : '—')
                  return (
                    <div key={s.id} className="flex items-center gap-3 p-3 rounded-[14px]" style={{ background: 'rgba(251,184,0,0.03)', border: '1px solid rgba(251,184,0,0.14)', backdropFilter: 'blur(12px)' }}>
                      <div className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(251,184,0,0.1)', border: '1px solid rgba(251,184,0,0.25)' }}>
                        <IconStar size={14} color="rgba(251,184,0,0.9)" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-bold truncate">{s.itemTitle ?? 'PPV контент'}</p>
                        <p className="text-[10px] text-[rgba(255,255,255,0.35)]">{buyerName} · {dateStr}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[13px] font-black" style={{ color: '#ffb800' }}>+{s.amountStars}⭐</p>
                        <p className="text-[10px] text-[rgba(255,255,255,0.35)]">${s.amountUsd.toFixed(2)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>)}
            </div>
            )
          })()}

          {/* Autopost + channel filter */}
          <div className="px-5 flex flex-col gap-3">
            {channels.length > 0 && (
              <div>
                <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,170,0.55)] mb-2">{tl.analytics.channelFilter}</p>
                <div className="flex gap-1.5 flex-wrap">
                  <button onClick={() => setSelectedChannelId(null)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${!selectedChannelId ? 'bg-[rgba(0,255,170,0.12)] border-[rgba(0,255,170,0.4)] text-[#00ffaa]' : 'border-[rgba(0,255,170,0.2)] text-[rgba(255,255,255,0.45)]'}`}>
                    {tl.analytics.allChannels}
                  </button>
                  {channels.map(ch => (
                    <button key={ch.id} onClick={() => setSelectedChannelId(ch.id)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all flex items-center gap-1.5 ${selectedChannelId === ch.id ? 'bg-[rgba(0,255,170,0.12)] border-[rgba(0,255,170,0.4)] text-[#00ffaa]' : 'border-[rgba(0,255,170,0.2)] text-[rgba(255,255,255,0.45)]'}`}>
                      {ch.photoUrl ? <img src={ch.photoUrl} className="w-4 h-4 rounded-full object-cover" alt="" /> : null}
                      {ch.title || ch.username}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedChannelId && selChannel ? (
              <div className="rounded-[18px] p-4 flex flex-col gap-3" style={{ background: 'rgba(0,255,170,0.04)', border: '1px solid rgba(0,255,170,0.14)', backdropFilter: 'blur(12px)' }}>
                <div className="flex items-center gap-2">
                  {selChannel.photoUrl
                    ? <img src={selChannel.photoUrl} className="w-8 h-8 rounded-full object-cover flex-shrink-0" alt="" />
                    : <div className="w-8 h-8 rounded-full bg-[rgba(0,255,170,0.08)] border border-[rgba(0,255,170,0.25)] flex items-center justify-center text-[12px] font-black text-[#00ffaa] flex-shrink-0">{(selChannel.title || '@')[0].toUpperCase()}</div>
                  }
                  <div>
                    <p className="text-[14px] font-black">{selChannel.title}</p>
                    <p className="text-[10px] text-[rgba(255,255,255,0.35)]">{selChannel.username}</p>
                  </div>
                </div>
                {[
                  { label: tl.analytics.postsPub, value: String(selChannelStat?.published ?? 0), IconR: IconCheck },
                  { label: tl.analytics.inPlan, value: String(selChannelStat?.scheduled ?? 0), IconR: IconZap },
                  { label: tl.analytics.inPlan, value: String((selChannelStat?.published ?? 0) + (selChannelStat?.scheduled ?? 0)), IconR: IconInfo },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2"><r.IconR size={12} color="rgba(255,255,255,0.3)" /><span className="text-[11px] text-[rgba(255,255,255,0.45)]">{r.label}</span></div>
                    <span className="text-[13px] font-black text-[#00ffaa]">{r.value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <ModuleBlock title="Autopost" Icon={IconZap} period={period} sparkData={d.spark.map(v => v * 0.04)}
                rows={[
                  { label: tl.analytics.postsPub, value: String(d.postsPublished), IconR: IconSend },
                  { label: tl.analytics.reach, value: `~${fmt(d.postsReach)}`, IconR: IconInfo },
                  { label: tl.analytics.inPlan, value: String(contentPlan?.filter(p => p.status !== 'cancelled').length ?? d.postsInPlan), IconR: IconZap },
                ]} />
            )}
          </div>
        </>
      )}
    </div>
  )
}
