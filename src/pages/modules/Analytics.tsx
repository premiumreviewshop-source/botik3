import { useState, useEffect } from 'react'
import { useApp } from '../../store/app'
import { IconBack, IconBrain, IconZap, IconBox, IconStar, IconBots, IconSend, IconImage, IconInfo } from '../../components/Icons'
import api from '../../api/client'

type Period = 'today' | 'week' | 'month'

interface Stats {
  aiMessages: number; aiChats: number; aiAvgSec: number
  ppvSold: number; ppvRevenue: number; ppvViews: number
  postsPublished: number; postsReach: number; postsInPlan: number
  botsActive: number; spark: number[]
}

const FALLBACK: Record<Period, Stats> = {
  today: { aiMessages: 0, aiChats: 0, aiAvgSec: 0, ppvSold: 0, ppvRevenue: 0, ppvViews: 0, postsPublished: 0, postsReach: 0, postsInPlan: 0, botsActive: 0, spark: Array(24).fill(0) },
  week:  { aiMessages: 0, aiChats: 0, aiAvgSec: 0, ppvSold: 0, ppvRevenue: 0, ppvViews: 0, postsPublished: 0, postsReach: 0, postsInPlan: 0, botsActive: 0, spark: Array(24).fill(0) },
  month: { aiMessages: 0, aiChats: 0, aiAvgSec: 0, ppvSold: 0, ppvRevenue: 0, ppvViews: 0, postsPublished: 0, postsReach: 0, postsInPlan: 0, botsActive: 0, spark: Array(24).fill(0) },
}

function fmt(n: number) { return n >= 1000 ? `${(n/1000).toFixed(1)}k` : String(n) }

function Sparkline({ data, color = '#00ff88' }: { data: number[]; color?: string }) {
  const max = Math.max(...data), min = Math.min(...data)
  const range = max - min || 1
  const w = 100, h = 28
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ')
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
    </svg>
  )
}

function StatCard({ label, value, sub, Icon, color = '#00ff88', delay = 0 }: { label: string; value: string; sub?: string; Icon: (p: any) => JSX.Element; color?: string; delay?: number }) {
  return (
    <div className="flex-1 p-3 bg-[#080808] border border-[rgba(0,255,136,0.1)] rounded-[14px] flex flex-col gap-2 animate-glow-in min-w-0" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center gap-1.5">
        <Icon size={13} color={color} />
        <span className="text-[9px] font-black uppercase tracking-[1px] text-[rgba(255,255,255,0.35)] truncate">{label}</span>
      </div>
      <p className="text-[22px] font-black leading-none" style={{ color }}>{value}</p>
      {sub && <p className="text-[9px] text-[rgba(255,255,255,0.3)]">{sub}</p>}
    </div>
  )
}

function SL({ children }: { children: string }) {
  return <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,136,0.55)] mb-3">{children}</p>
}

function ModuleBlock({ title, Icon, color, rows, sparkData, period }: {
  title: string; Icon: (p: any) => JSX.Element; color: string
  rows: { label: string; value: string; IconR: (p: any) => JSX.Element }[]; sparkData: number[]; period: Period
}) {
  return (
    <div className="bg-[#080808] border border-[rgba(0,255,136,0.1)] rounded-[18px] p-4 flex flex-col gap-3 animate-fade-up">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ backgroundColor: `${color}15`, border: `1px solid ${color}30` }}>
          <Icon size={16} color={color} />
        </div>
        <p className="text-[14px] font-black">{title}</p>
      </div>
      <div className="flex flex-col gap-2">
        {rows.map(r => (
          <div key={r.label} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <r.IconR size={12} color="rgba(255,255,255,0.3)" />
              <span className="text-[11px] text-[rgba(255,255,255,0.45)]">{r.label}</span>
            </div>
            <span className="text-[13px] font-black" style={{ color }}>{r.value}</span>
          </div>
        ))}
      </div>
      <div className="pt-1 border-t border-[rgba(255,255,255,0.05)]">
        <p className="text-[8px] text-[rgba(255,255,255,0.2)] mb-1">
          {period === 'today' ? 'Сегодня по часам' : period === 'week' ? 'За неделю по дням' : 'За месяц по дням'}
        </p>
        <Sparkline data={sparkData.length ? sparkData : [0,0]} color={color} />
      </div>
    </div>
  )
}

export default function Analytics() {
  const { goBack, contentPlan } = useApp()
  const [period, setPeriod] = useState<Period>('week')
  const [stats, setStats] = useState<Record<Period, Stats>>(FALLBACK)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.analytics.get(period).then(d => {
      setStats(prev => ({ ...prev, [period]: d as Stats }))
    }).catch(() => {}).finally(() => setLoading(false))
  }, [period])

  const d = stats[period]

  return (
    <div className="flex flex-col gap-5 pt-4 pb-24">
      <div className="flex items-center gap-3 px-5">
        <button onClick={goBack}
          className="w-9 h-9 rounded-full bg-[rgba(0,255,136,0.06)] border border-[rgba(0,255,136,0.2)] flex items-center justify-center hover:bg-[rgba(0,255,136,0.12)] transition-colors">
          <IconBack size={20} color="#00ff88" />
        </button>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[2px] text-[rgba(0,255,136,0.5)]">Модуль</p>
          <h1 className="text-[22px] font-black tracking-tight">Аналитика</h1>
        </div>
        {loading && <div className="ml-auto w-4 h-4 border-2 border-[#00ff88] border-t-transparent rounded-full animate-spin" />}
      </div>

      <div className="flex gap-1.5 px-5">
        {([['today', 'Сегодня'], ['week', 'Неделя'], ['month', 'Месяц']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setPeriod(k)}
            className={`flex-1 py-2 rounded-[10px] text-[11px] font-black border transition-all ${period === k ? 'bg-[#00ff88] border-[#00ff88] text-black' : 'border-[rgba(0,255,136,0.2)] text-[rgba(255,255,255,0.45)] hover:border-[rgba(0,255,136,0.4)]'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="px-5">
        <SL>Общий обзор</SL>
        <div className="flex gap-2">
          <StatCard label="AI сообщений" value={fmt(d.aiMessages)} Icon={IconBrain} color="#00ff88" delay={0} />
          <StatCard label="PPV продаж" value={String(d.ppvSold)} sub={`⭐ ${fmt(d.ppvRevenue)}`} Icon={IconBox} color="rgba(251,191,36,0.9)" delay={60} />
          <StatCard label="Постов" value={String(d.postsPublished)} sub={`~${fmt(d.postsReach)} охват`} Icon={IconZap} color="rgba(0,200,255,0.85)" delay={120} />
        </div>
      </div>

      <div className="px-5">
        <ModuleBlock title="AI Chatting" Icon={IconBrain} color="#00ff88" period={period} sparkData={d.spark}
          rows={[
            { label: 'Сообщений отправлено', value: fmt(d.aiMessages), IconR: IconSend },
            { label: 'Активных чатов', value: String(d.aiChats), IconR: IconBots },
            { label: 'Среднее время ответа', value: `${d.aiAvgSec}с`, IconR: IconInfo },
          ]} />
      </div>

      <div className="px-5">
        <ModuleBlock title="PPV Контент" Icon={IconBox} color="rgba(251,191,36,0.9)" period={period} sparkData={d.spark.map(v => v * 0.12)}
          rows={[
            { label: 'Продаж контента', value: String(d.ppvSold), IconR: IconStar },
            { label: 'Доход в Stars', value: `⭐ ${fmt(d.ppvRevenue)}`, IconR: IconStar },
            { label: 'Просмотров', value: String(d.ppvViews), IconR: IconImage },
          ]} />
      </div>

      <div className="px-5">
        <ModuleBlock title="Автопостинг" Icon={IconZap} color="rgba(0,200,255,0.85)" period={period} sparkData={d.spark.map(v => v * 0.04)}
          rows={[
            { label: 'Постов опубликовано', value: String(d.postsPublished), IconR: IconSend },
            { label: 'Охват (estimate)', value: `~${fmt(d.postsReach)}`, IconR: IconInfo },
            { label: 'Постов в плане', value: String(contentPlan?.filter(p => p.status !== 'cancelled').length ?? d.postsInPlan), IconR: IconZap },
          ]} />
      </div>
    </div>
  )
}
