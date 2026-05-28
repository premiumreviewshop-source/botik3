import { useState } from 'react'
import { useApp } from '../../store/app'
import { IconBack, IconBrain, IconZap, IconBox, IconStar, IconBots, IconSend, IconImage, IconInfo } from '../../components/Icons'

type Period = 'today' | 'week' | 'month'

const MOCK: Record<Period, {
  aiMessages: number; aiChats: number; aiAvgSec: number
  ppvSold: number; ppvRevenue: number; ppvViews: number
  postsPublished: number; postsReach: number
  botsActive: number
}> = {
  today: { aiMessages: 147, aiChats: 8,  aiAvgSec: 1.8, ppvSold: 3,  ppvRevenue: 450,   ppvViews: 28,  postsPublished: 2,  postsReach: 810,  botsActive: 1 },
  week:  { aiMessages: 894, aiChats: 41, aiAvgSec: 2.1, ppvSold: 17, ppvRevenue: 2380,  ppvViews: 153, postsPublished: 11, postsReach: 4200, botsActive: 2 },
  month: { aiMessages: 3247, aiChats: 189, aiAvgSec: 2.3, ppvSold: 64, ppvRevenue: 8910, ppvViews: 621, postsPublished: 43, postsReach: 17300, botsActive: 2 },
}

const SPARKLINES: Record<Period, number[]> = {
  today: [12,8,20,35,47,30,22,40,55,62,48,30,25,38,52,70,85,92,80,65,50,40,35,28],
  week:  [90,120,105,145,160,130,95,140,175,190,165,150,125,160,185,210,195,170,145,130,160,185,200,180],
  month: [800,950,1100,1050,1200,1350,1180,1400,1500,1380,1450,1600,1480,1550,1700,1620,1800,1900,1750,1820,2000,1950,2100,2200],
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
  title: string
  Icon: (p: any) => JSX.Element
  color: string
  rows: { label: string; value: string; IconR: (p: any) => JSX.Element }[]
  sparkData: number[]
  period: Period
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
        <Sparkline data={sparkData} color={color} />
      </div>
    </div>
  )
}

export default function Analytics() {
  const { goBack, bots, ppvItems, contentPlan } = useApp()
  const [period, setPeriod] = useState<Period>('week')
  const d = MOCK[period]

  const activeBots = bots.filter(b => b.isActive)

  return (
    <div className="flex flex-col gap-5 pt-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 px-5">
        <button onClick={goBack}
          className="w-9 h-9 rounded-full bg-[rgba(0,255,136,0.06)] border border-[rgba(0,255,136,0.2)] flex items-center justify-center hover:bg-[rgba(0,255,136,0.12)] transition-colors">
          <IconBack size={20} color="#00ff88" />
        </button>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[2px] text-[rgba(0,255,136,0.5)]">Модуль</p>
          <h1 className="text-[22px] font-black tracking-tight">Аналитика</h1>
        </div>
      </div>

      {/* Period tabs */}
      <div className="flex gap-1.5 px-5">
        {([['today', 'Сегодня'], ['week', 'Неделя'], ['month', 'Месяц']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setPeriod(k)}
            className={`flex-1 py-2 rounded-[10px] text-[11px] font-black border transition-all ${period === k ? 'bg-[#00ff88] border-[#00ff88] text-black' : 'border-[rgba(0,255,136,0.2)] text-[rgba(255,255,255,0.45)] hover:border-[rgba(0,255,136,0.4)]'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Top stats row */}
      <div className="px-5">
        <SL>Общий обзор</SL>
        <div className="flex gap-2">
          <StatCard label="AI сообщений" value={fmt(d.aiMessages)} Icon={IconBrain} color="#00ff88" delay={0} />
          <StatCard label="PPV продаж" value={String(d.ppvSold)} sub={`⭐ ${fmt(d.ppvRevenue)}`} Icon={IconBox} color="rgba(251,191,36,0.9)" delay={60} />
          <StatCard label="Постов" value={String(d.postsPublished)} sub={`~${fmt(d.postsReach)} охват`} Icon={IconZap} color="rgba(0,200,255,0.85)" delay={120} />
        </div>
      </div>

      {/* AI Chatting block */}
      <div className="px-5">
        <ModuleBlock
          title="AI Chatting"
          Icon={IconBrain}
          color="#00ff88"
          period={period}
          sparkData={SPARKLINES[period]}
          rows={[
            { label: 'Сообщений отправлено', value: fmt(d.aiMessages), IconR: IconSend },
            { label: 'Активных чатов',        value: String(d.aiChats),  IconR: IconBots },
            { label: 'Среднее время ответа',   value: `${d.aiAvgSec}с`,  IconR: IconInfo },
          ]}
        />
      </div>

      {/* PPV block */}
      <div className="px-5">
        <ModuleBlock
          title="PPV Контент"
          Icon={IconBox}
          color="rgba(251,191,36,0.9)"
          period={period}
          sparkData={SPARKLINES[period].map(v => v * 0.12)}
          rows={[
            { label: 'Продаж контента',  value: String(d.ppvSold),             IconR: IconStar  },
            { label: 'Доход в Stars',    value: `⭐ ${fmt(d.ppvRevenue)}`,     IconR: IconStar  },
            { label: 'Просмотров',       value: String(d.ppvViews),            IconR: IconImage },
          ]}
        />
      </div>

      {/* Autopost block */}
      <div className="px-5">
        <ModuleBlock
          title="Автопостинг"
          Icon={IconZap}
          color="rgba(0,200,255,0.85)"
          period={period}
          sparkData={SPARKLINES[period].map(v => v * 0.04)}
          rows={[
            { label: 'Постов опубликовано', value: String(d.postsPublished),                             IconR: IconSend },
            { label: 'Охват (estimate)',    value: `~${fmt(d.postsReach)}`,                              IconR: IconInfo },
            { label: 'Постов в плане',      value: String(contentPlan?.filter(p => p.status !== 'cancelled').length ?? 0), IconR: IconZap  },
          ]}
        />
      </div>

      {/* Bots summary */}
      <div className="px-5">
        <SL>Мои боты</SL>
        <div className="flex flex-col gap-2">
          {bots.map(bot => (
            <div key={bot.id} className="flex items-center gap-3 p-3.5 bg-[#080808] border border-[rgba(0,255,136,0.1)] rounded-[14px] animate-fade-up">
              <div className="w-9 h-9 rounded-full bg-[rgba(0,255,136,0.07)] border border-[rgba(0,255,136,0.2)] flex items-center justify-center text-[11px] font-black text-[#00ff88] flex-shrink-0">
                {bot.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold">{bot.name}</p>
                <p className="text-[10px] text-[rgba(255,255,255,0.3)]">{bot.modules.length ? bot.modules.join(' · ') : 'Модули не подключены'}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black ${bot.isActive ? 'bg-[rgba(0,255,136,0.1)] text-[#00ff88]' : 'bg-[rgba(255,255,255,0.05)] text-[rgba(255,255,255,0.3)]'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${bot.isActive ? 'bg-[#00ff88] animate-pulse' : 'bg-[rgba(255,255,255,0.2)]'}`} style={bot.isActive ? { boxShadow: '0 0 5px rgba(0,255,136,1)' } : {}} />
                  {bot.isActive ? 'Активен' : 'Офлайн'}
                </div>
                {bot.isActive && (
                  <p className="text-[9px] text-[rgba(255,255,255,0.25)]">{period === 'today' ? `${Math.floor(d.aiMessages / activeBots.length)} сообщ.` : period === 'week' ? `${fmt(Math.floor(d.aiMessages / activeBots.length))} сообщ.` : `${fmt(Math.floor(d.aiMessages / activeBots.length))} сообщ.`}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
