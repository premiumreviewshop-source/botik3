import { useState } from 'react'
import type { PlanItem } from '../../types'
import { useLang } from '../../store/lang'
import { IconImage, IconStar, IconPin, IconEdit, IconZap, IconCheck } from '../../components/Icons'
import api from '../../api/client'

type PublishState = 'idle' | 'loading' | 'ok' | 'error'

type Category = 'free' | 'paid' | 'fix'

interface Props {
  plan: PlanItem[]
  onUpdate: (plan: PlanItem[]) => void
  onSaveItem?: (id: string, data: { time?: string; date?: string; dateObj?: string; status?: string; price?: number | null }) => void
  onExtend: () => void
  autoActive: boolean
  onToggleAuto: () => void
  toggleError?: string | null
  channelName: string
  channelId?: string | null
}

export default function AutoPostPlanTab({ plan, onUpdate, onSaveItem, onExtend, autoActive, onToggleAuto, toggleError, channelName, channelId }: Props) {
  const { t, lang } = useLang()

  const CAT_INFO = {
    free: { label: lang === 'ru' ? 'Обычный' : lang === 'tr' ? 'Normal' : 'Regular', Icon: IconImage },
    paid: { label: lang === 'ru' ? 'Платный' : lang === 'tr' ? 'Ücretli' : 'Paid',   Icon: IconStar  },
    fix:  { label: lang === 'ru' ? 'Фикс пост' : lang === 'tr' ? 'Sabit gönderi' : 'Fixed post', Icon: IconPin },
  }

  const [swapMode, setSwapMode] = useState(false)
  const [swapFirst, setSwapFirst] = useState<string | null>(null)
  const [editPriceId, setEditPriceId] = useState<string | null>(null)
  const [editPriceVal, setEditPriceVal] = useState('')
  const [editDateId, setEditDateId] = useState<string | null>(null)
  const [testRunning, setTestRunning] = useState(false)
  const [testResult, setTestResult] = useState<{ published: number; checked: number; total: number; active?: number; errors: string[] } | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [publishStates, setPublishStates] = useState<Record<string, PublishState>>({})
  const [publishErrors, setPublishErrors] = useState<Record<string, string>>({})
  const [lastError, setLastError] = useState<string | null>(null)
  const [lastDebug, setLastDebug] = useState<{ rawCaption?: string; compiledHtml?: string; parsedText?: string; parsedEntities?: object[]; usedMTProto?: boolean; usedStaging?: boolean; mtprotoError?: string; entitiesBuilt?: number } | null>(null)
  const [showDebug, setShowDebug] = useState(false)

  const publishNow = async (itemId: string) => {
    setPublishStates(s => ({ ...s, [itemId]: 'loading' }))
    setPublishErrors(e => { const n = { ...e }; delete n[itemId]; return n })
    setLastError(null)
    try {
      const result = await api.autopost.publishNow(itemId, channelId ?? undefined)
      setPublishStates(s => ({ ...s, [itemId]: 'ok' }))
      if (result.debug) setLastDebug(result.debug)
      onUpdate(plan.map(x => x.id === itemId ? { ...x, status: 'published' as const } : x))
      onSaveItem?.(itemId, { status: 'published' })
    } catch (e) {
      const msg = String(e).replace('Error: ', '')
      setPublishStates(s => ({ ...s, [itemId]: 'error' }))
      setPublishErrors(err => ({ ...err, [itemId]: msg }))
      setLastError(msg)
    }
  }

  const grouped = plan.reduce((acc, item) => {
    if (!acc[item.dateObj]) acc[item.dateObj] = []
    acc[item.dateObj].push(item)
    return acc
  }, {} as Record<string, PlanItem[]>)
  const days = Object.keys(grouped).sort()

  const scheduled = plan.filter(p => p.status === 'scheduled').length
  const publishedCount = plan.filter(p => p.status === 'published').length
  const cancelled = plan.filter(p => p.status === 'cancelled').length

  const enterSwap = () => { setSwapMode(true); setSwapFirst(null) }
  const exitSwap = () => { setSwapMode(false); setSwapFirst(null) }

  const runTest = async () => {
    setTestRunning(true)
    setTestResult(null)
    setTestError(null)
    try {
      const r = await api.autopost.runPublish()
      setTestResult(r)
    } catch (e) {
      setTestError(String(e).replace('Error: ', ''))
    } finally {
      setTestRunning(false)
    }
  }

  const handleSwapTap = (itemId: string) => {
    if (!swapFirst) {
      setSwapFirst(itemId)
    } else if (swapFirst === itemId) {
      setSwapFirst(null)
    } else {
      const a = plan.find(x => x.id === swapFirst)!
      const b = plan.find(x => x.id === itemId)!
      onUpdate(plan.map(x => {
        if (x.id === swapFirst) return { ...x, date: b.date, dateObj: b.dateObj, time: b.time }
        if (x.id === itemId)   return { ...x, date: a.date, dateObj: a.dateObj, time: a.time }
        return x
      }))
      onSaveItem?.(swapFirst, { time: b.time, dateObj: b.dateObj, date: b.date })
      onSaveItem?.(itemId, { time: a.time, dateObj: a.dateObj, date: a.date })
      setSwapFirst(null)
      setSwapMode(false)
    }
  }

  const savePriceEdit = (itemId: string) => {
    const price = editPriceVal ? Number(editPriceVal) : null
    onUpdate(plan.map(x => x.id === itemId ? { ...x, price: price ?? undefined } : x))
    onSaveItem?.(itemId, { price })
    setEditPriceId(null)
  }

  if (!plan.length) {
    return (
      <div className="px-5 py-12 flex flex-col items-center gap-3 text-center animate-fade-up">
        <div className="w-14 h-14 rounded-[18px] bg-[rgba(0,255,170,0.06)] border border-[rgba(0,255,170,0.15)] flex items-center justify-center">
          <IconZap size={24} color="rgba(0,255,170,0.4)" />
        </div>
        <p className="text-[14px] font-bold text-[rgba(255,255,255,0.5)]">{t.mods.noActivePlan}</p>
        <p className="text-[12px] text-[rgba(255,255,255,0.3)]">{t.mods.noActivePlanDesc}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-5 pb-8">
      {/* Summary row */}
      <div className="flex gap-2 animate-fade-up">
        <div className="flex-1 p-2.5 rounded-[12px] text-center" style={{ background: 'linear-gradient(135deg, rgba(18,24,60,0.7), rgba(8,11,30,0.9))', border: '1px solid rgba(0,255,170,0.12)' }}>
          <p className="text-[18px] font-black text-[#00ffaa] leading-none">{scheduled}</p>
          <p className="text-[9px] text-[rgba(255,255,255,0.35)] mt-0.5">{t.mods.inQueueLabel}</p>
        </div>
        <div className="flex-1 p-2.5 rounded-[12px] text-center" style={{ background: 'linear-gradient(135deg, rgba(18,24,60,0.7), rgba(8,11,30,0.9))', border: '1px solid rgba(0,255,170,0.12)' }}>
          <p className="text-[18px] font-black text-[rgba(0,255,170,0.7)] leading-none">{publishedCount}</p>
          <p className="text-[9px] text-[rgba(255,255,255,0.35)] mt-0.5">{t.mods.publishedCountLabel}</p>
        </div>
        <div className="flex-1 p-2.5 rounded-[12px] text-center" style={{ background: 'linear-gradient(135deg, rgba(18,24,60,0.7), rgba(8,11,30,0.9))', border: '1px solid rgba(0,255,170,0.12)' }}>
          <p className="text-[18px] font-black text-[rgba(255,255,255,0.4)] leading-none">{cancelled}</p>
          <p className="text-[9px] text-[rgba(255,255,255,0.35)] mt-0.5">{t.mods.cancelledLabel}</p>
        </div>
      </div>

      {/* Autoposting toggle */}
      <div className="flex flex-col gap-1.5">
        <div className={`flex items-center gap-3 p-3 rounded-[14px] border transition-all ${autoActive ? 'border-[rgba(0,255,170,0.3)]' : 'border-[rgba(0,255,170,0.1)]'}`}
          style={{ background: autoActive ? 'rgba(0,255,170,0.07)' : 'linear-gradient(135deg, rgba(14,20,48,0.65), rgba(8,11,24,0.85))' }}>
          <div className="flex-1">
            <p className="text-[13px] font-bold">{autoActive ? t.mods.autopostActiveLabel : t.mods.startAutopostLabel}</p>
            {autoActive && <p className="text-[10px] text-[rgba(0,255,170,0.6)]">{t.mods.publishingInLabel} {channelName}</p>}
          </div>
          {autoActive && (
            <span className="w-2 h-2 rounded-full bg-[#00ffaa] animate-pulse flex-shrink-0" style={{ boxShadow: '0 0 6px rgba(0,255,170,1)' }} />
          )}
          <button onClick={onToggleAuto}
            className={`relative w-11 h-6 rounded-full border transition-all flex-shrink-0 ${autoActive ? 'bg-[#00ffaa] border-[#00ffaa]' : 'bg-[rgba(255,255,255,0.06)] border-[rgba(255,255,255,0.1)]'}`}
            style={autoActive ? { boxShadow: '0 0 8px rgba(0,255,170,0.4)' } : {}}>
            <span className={`absolute top-1 w-4 h-4 rounded-full transition-all ${autoActive ? 'left-6 bg-black' : 'left-1 bg-[rgba(255,255,255,0.4)]'}`} />
          </button>
        </div>
        {toggleError && (
          <p className="text-[11px] text-red-400 px-1">{toggleError}</p>
        )}
      </div>

      {/* Debug test panel */}
      <div className="flex flex-col gap-2">
        <button
          onClick={runTest}
          disabled={testRunning}
          className="flex items-center justify-center gap-2 py-2 rounded-[12px] border border-[rgba(251,191,36,0.3)] bg-[rgba(251,191,36,0.04)] hover:bg-[rgba(251,191,36,0.08)] text-[12px] font-bold text-amber-400 transition-all disabled:opacity-50">
          {testRunning
            ? <><span className="w-3.5 h-3.5 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />{t.mods.checkingLabel}</>
            : t.mods.testAutopostBtn}
        </button>
        {testError && (
          <div className="p-3 bg-[rgba(255,80,80,0.06)] border border-[rgba(255,80,80,0.25)] rounded-[12px]">
            <p className="text-[11px] text-red-400 font-bold mb-1">{t.mods.errorTitle}</p>
            <p className="text-[11px] text-[rgba(255,255,255,0.6)] break-all">{testError}</p>
          </div>
        )}
        {testResult && (
          <div className="p-3 bg-[rgba(0,255,170,0.04)] border border-[rgba(0,255,170,0.2)] rounded-[12px] flex flex-col gap-1.5">
            <div className="flex gap-3 flex-wrap">
              <span className="text-[11px]"><span className="text-[rgba(255,255,255,0.4)]">{t.mods.inDbLabel} </span><span className="font-black text-white">{testResult.total}</span></span>
              <span className="text-[11px]"><span className="text-[rgba(255,255,255,0.4)]">{t.mods.activeLabel} </span><span className="font-black text-[rgba(0,255,170,0.9)]">{testResult.active ?? testResult.total}</span></span>
              <span className="text-[11px]"><span className="text-[rgba(255,255,255,0.4)]">{t.mods.byTimeLabel} </span><span className="font-black text-amber-400">{testResult.checked}</span></span>
              <span className="text-[11px]"><span className="text-[rgba(255,255,255,0.4)]">{t.mods.publishedResultLabel} </span><span className="font-black text-[#00ffaa]">{testResult.published}</span></span>
            </div>
            {testResult.total === 0 && (
              <p className="text-[11px] text-amber-400">{t.mods.noPostsWarn}</p>
            )}
            {testResult.total > 0 && (testResult.active ?? testResult.total) === 0 && (
              <p className="text-[11px] text-amber-400">{t.mods.postsExistNoAutopost}</p>
            )}
            {testResult.total > 0 && (testResult.active ?? testResult.total) > 0 && testResult.checked === 0 && (
              <p className="text-[11px] text-[rgba(255,255,255,0.5)]">{t.mods.postsActiveWaiting}</p>
            )}
            {testResult.published > 0 && (
              <p className="text-[11px] text-[#00ffaa] font-bold">✓ {testResult.published} {t.mods.publishedBadge}!</p>
            )}
            {(testResult.errors ?? []).length > 0 && (
              <div className="flex flex-col gap-0.5">
                {(testResult.errors ?? []).map((e, i) => (
                  <p key={i} className="text-[10px] text-red-400 break-all">{e}</p>
                ))}
              </div>
            )}
          </div>
        )}
      {lastError && (
        <div className="p-3 bg-[rgba(255,80,80,0.06)] border border-[rgba(255,80,80,0.25)] rounded-[12px]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] text-red-400 font-bold mb-1">{t.mods.publishErrorTitle}</p>
              <p className="text-[11px] text-[rgba(255,255,255,0.6)] break-all">{lastError}</p>
            </div>
            <button onClick={() => setLastError(null)} className="text-[14px] text-[rgba(255,255,255,0.3)] hover:text-white flex-shrink-0">×</button>
          </div>
        </div>
      )}
      {lastDebug && (
        <div className="p-3 bg-[rgba(0,255,170,0.03)] border border-[rgba(0,255,170,0.15)] rounded-[12px]">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[9px] font-black uppercase tracking-[1px] text-[rgba(0,255,170,0.5)]">{t.mods.debugTitle}</p>
            <div className="flex gap-2">
              <button onClick={() => setShowDebug(v => !v)} className="text-[10px] text-[rgba(0,255,170,0.6)] hover:text-[#00ffaa]">{showDebug ? t.mods.hideLabel : t.mods.showLabel}</button>
              <button onClick={() => setLastDebug(null)} className="text-[12px] text-[rgba(255,255,255,0.3)] hover:text-white">×</button>
            </div>
          </div>
          {showDebug && (
            <div className="flex flex-col gap-1.5">
              <div className="flex gap-2 flex-wrap">
                <span className={`text-[10px] font-black px-2 py-0.5 rounded ${lastDebug.usedMTProto ? 'bg-[rgba(0,255,170,0.15)] text-[#00ffaa]' : 'bg-[rgba(255,80,80,0.12)] text-[rgba(255,80,80,0.8)]'}`}>
                  {lastDebug.usedMTProto ? '✓ MTProto' : '✗ MTProto (fallback)'}
                </span>
                {lastDebug.usedStaging && <span className="text-[10px] font-black px-2 py-0.5 rounded bg-[rgba(255,200,0,0.12)] text-[rgba(255,200,0,0.8)]">staging+forward</span>}
                {lastDebug.mtprotoError && <span className="text-[9px] text-[rgba(255,80,80,0.7)] font-mono">{lastDebug.mtprotoError}</span>}
              </div>
              <div>
                <p className="text-[9px] text-[rgba(255,255,255,0.35)] mb-0.5">raw caption:</p>
                <p className="text-[10px] text-[rgba(255,255,255,0.6)] font-mono break-all bg-black/30 rounded px-2 py-1">{lastDebug.rawCaption ?? '—'}</p>
              </div>
              <div>
                <p className="text-[9px] text-[rgba(255,255,255,0.35)] mb-0.5">compiled html:</p>
                <p className="text-[10px] text-[rgba(255,255,255,0.6)] font-mono break-all bg-black/30 rounded px-2 py-1">{lastDebug.compiledHtml ?? '—'}</p>
              </div>
              <div>
                <p className="text-[9px] text-[rgba(255,255,255,0.35)] mb-0.5">text sent ({lastDebug.parsedText?.length ?? 0} chars):</p>
                <p className="text-[10px] text-[rgba(255,255,255,0.6)] font-mono break-all bg-black/30 rounded px-2 py-1">{lastDebug.parsedText ?? '—'}</p>
              </div>
              <div>
                <p className="text-[9px] text-[rgba(255,255,255,0.35)] mb-0.5">entities ({(lastDebug.parsedEntities ?? []).length}):</p>
                <p className="text-[10px] text-[rgba(255,255,255,0.6)] font-mono break-all bg-black/30 rounded px-2 py-1">{JSON.stringify(lastDebug.parsedEntities ?? [])}</p>
              </div>
            </div>
          )}
        </div>
      )}
      </div>

      {/* Swap mode controls */}
      {!swapMode ? (
        <button onClick={enterSwap}
          className="flex items-center justify-center gap-2 py-2 rounded-[12px] border border-[rgba(0,255,170,0.2)] bg-[rgba(0,255,170,0.03)] hover:border-[rgba(0,255,170,0.4)] hover:bg-[rgba(0,255,170,0.07)] text-[12px] font-bold text-[rgba(0,255,170,0.7)] hover:text-[#00ffaa] transition-all">
          {t.mods.swapPostsBtn}
        </button>
      ) : (
        <div className="flex items-center gap-3 p-3 rounded-[12px] bg-[rgba(0,255,170,0.07)] border border-[rgba(0,255,170,0.35)]">
          <p className="flex-1 text-[12px] font-bold text-[#00ffaa]">
            {swapFirst ? t.mods.selectSecondSwap : t.mods.selectFirstSwap}
          </p>
          <button onClick={exitSwap} className="text-[11px] text-[rgba(255,255,255,0.4)] hover:text-white transition-colors">{t.common.cancel}</button>
        </div>
      )}

      {/* Timeline */}
      {days.map((day, di) => (
        <div key={day} className="animate-fade-up" style={{ animationDelay: `${di * 40}ms` }}>
          <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,170,0.55)] mb-2">
            {grouped[day][0].date}
          </p>
          <div className="flex flex-col gap-1.5">
            {grouped[day].map(item => {
              const CatIcon = CAT_INFO[item.category as Category].Icon
              const gone = item.status === 'cancelled'
              const published = item.status === 'published'
              const isSwapSelected = swapFirst === item.id
              const swapHighlight = swapMode && !gone && !published

              if (published) {
                return (
                  <div key={item.id} className="rounded-[12px] border border-[rgba(0,255,170,0.18)] overflow-hidden bg-[#050505]">
                    {/* Published banner */}
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-[rgba(0,255,170,0.1)]">
                      <div className="w-4 h-4 rounded-full bg-[#00ffaa] flex items-center justify-center flex-shrink-0" style={{ boxShadow: '0 0 5px rgba(0,255,170,0.7)' }}>
                        <IconCheck size={9} color="black" />
                      </div>
                      <span className="text-[11px] font-black text-[#00ffaa] tracking-[0.5px] uppercase flex-1">{t.mods.publishedBadge}</span>
                      <span className="text-[11px] font-bold text-[rgba(0,255,170,0.8)]">{item.publishedAt ?? item.time}</span>
                    </div>
                    {/* Content row */}
                    <div className="flex items-center gap-2.5 px-3 py-2.5 opacity-50">
                      <div className="relative flex-shrink-0">
                        {item.postUrl
                          ? <img src={item.postUrl} className="w-9 h-9 rounded-[8px] object-cover grayscale" alt="" />
                          : <div className="w-9 h-9 rounded-[8px] bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] flex items-center justify-center">
                              <CatIcon size={14} color="rgba(255,255,255,0.25)" />
                            </div>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[11px] font-bold text-[rgba(255,255,255,0.5)]">{CAT_INFO[item.category as Category].label}</span>
                        {item.postCaption
                          ? <p className="text-[10px] text-[rgba(255,255,255,0.25)] truncate mt-0.5">{item.postCaption}</p>
                          : <p className="text-[10px] text-[rgba(255,255,255,0.15)] italic mt-0.5">{t.mods.withoutDescLabel}</p>
                        }
                      </div>
                      <span className="text-[10px] text-[rgba(255,255,255,0.25)] flex-shrink-0">{item.time}</span>
                    </div>
                  </div>
                )
              }

              return (
                <div key={item.id}
                  onClick={swapHighlight ? () => handleSwapTap(item.id) : undefined}
                  className={`flex items-center gap-2.5 p-3 border rounded-[12px] transition-all duration-200
                    ${gone ? 'opacity-40 border-[rgba(255,255,255,0.05)]' :
                      isSwapSelected ? 'border-[#00ffaa] shadow-[0_0_10px_rgba(0,255,170,0.2)]' :
                      swapHighlight ? 'border-[rgba(0,255,170,0.35)] cursor-pointer hover:border-[#00ffaa]' :
                      'border-[rgba(0,255,170,0.1)] hover:border-[rgba(0,255,170,0.22)]'}`}
                  style={{ background: gone ? 'rgba(255,255,255,0.01)' : isSwapSelected ? 'rgba(0,255,170,0.08)' : swapHighlight ? 'linear-gradient(135deg, rgba(0,20,20,0.6), rgba(8,11,24,0.8))' : 'linear-gradient(135deg, rgba(14,20,48,0.65), rgba(8,11,24,0.85))' }}>
                  {swapHighlight && (
                    <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${isSwapSelected ? 'border-[#00ffaa] bg-[#00ffaa]' : 'border-[rgba(0,255,170,0.4)]'}`}>
                      {isSwapSelected && <span className="w-2 h-2 rounded-full bg-black" />}
                    </div>
                  )}
                  {!swapHighlight && (
                    <div className="relative flex-shrink-0">
                      {item.postUrl
                        ? <img src={item.postUrl} className="w-9 h-9 rounded-[8px] object-cover" alt="" />
                        : <div className="w-9 h-9 rounded-[8px] bg-[rgba(0,255,170,0.06)] border border-[rgba(0,255,170,0.15)] flex items-center justify-center">
                            <CatIcon size={14} color="rgba(0,255,170,0.5)" />
                          </div>
                      }
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[11px] font-bold text-[rgba(255,255,255,0.75)]">{CAT_INFO[item.category as Category].label}</span>
                      {item.category === 'paid' && (
                        editPriceId === item.id ? (
                          <input
                            type="number"
                            value={editPriceVal}
                            autoFocus
                            onChange={e => setEditPriceVal(e.target.value)}
                            onBlur={() => savePriceEdit(item.id)}
                            onKeyDown={e => { if (e.key === 'Enter') savePriceEdit(item.id); if (e.key === 'Escape') setEditPriceId(null) }}
                            placeholder="Stars"
                            style={{ colorScheme: 'dark' }}
                            className="w-[68px] bg-transparent border border-[rgba(251,191,36,0.5)] rounded-[6px] px-1.5 py-0.5 text-[10px] text-amber-400 outline-none"
                            onClick={e => e.stopPropagation()}
                          />
                        ) : (
                          <button
                            onClick={e => { e.stopPropagation(); setEditPriceId(item.id); setEditPriceVal(item.price?.toString() ?? '') }}
                            className="inline-flex items-center gap-0.5 text-[9px] font-black text-amber-400 hover:text-amber-300 transition-colors">
                            <IconStar size={8} color="rgb(251,191,36)" />
                            {item.price ?? '—'}
                          </button>
                        )
                      )}
                      {item.category !== 'paid' && item.price && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-amber-400">
                          <IconStar size={8} color="rgb(251,191,36)" />{item.price}
                        </span>
                      )}
                      {gone && <span className="text-[9px] text-[rgba(255,80,80,0.5)]">{t.mods.cancelledBadge}</span>}
                    </div>
                    {item.postCaption
                      ? <p className="text-[10px] text-[rgba(255,255,255,0.3)] truncate">{item.postCaption}</p>
                      : <p className="text-[10px] text-[rgba(255,255,255,0.2)] italic">{t.mods.withoutDescLabel}</p>
                    }
                  </div>
                  {!swapMode && (
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      {item.editing ? (
                        <input type="time" defaultValue={item.time} autoFocus style={{ colorScheme: 'dark' }}
                          onBlur={e => {
                            const t = e.target.value
                            onUpdate(plan.map(x => x.id === item.id ? { ...x, time: t, editing: false } : x))
                            onSaveItem?.(item.id, { time: t, dateObj: item.dateObj })
                          }}
                          className="bg-transparent border border-[rgba(0,255,170,0.4)] rounded-[8px] px-2 py-1 text-[11px] text-[#00ffaa] outline-none w-[72px]" />
                      ) : (
                        <button onClick={() => onUpdate(plan.map(x => x.id === item.id ? { ...x, editing: true } : x))}
                          className="text-[11px] font-bold text-[rgba(0,255,170,0.7)] hover:text-[#00ffaa] transition-colors">
                          {item.time}
                        </button>
                      )}
                      {editDateId === item.id ? (
                        <input type="date" defaultValue={item.dateObj} autoFocus style={{ colorScheme: 'dark' }}
                          onBlur={e => {
                            const val = e.target.value
                            if (val) {
                              const d = new Date(val)
                              const newDate = d.toLocaleDateString('ru', { day: 'numeric', month: 'short', weekday: 'short' })
                              onUpdate(plan.map(x => x.id === item.id ? { ...x, dateObj: val, date: newDate } : x))
                              onSaveItem?.(item.id, { dateObj: val, date: newDate, time: item.time })
                            }
                            setEditDateId(null)
                          }}
                          className="bg-transparent border border-[rgba(0,255,170,0.3)] rounded-[8px] px-1.5 py-0.5 text-[9px] text-[rgba(0,255,170,0.7)] outline-none w-[100px]" />
                      ) : (
                        <button onClick={() => setEditDateId(item.id)}
                          className="text-[9px] text-[rgba(255,255,255,0.2)] hover:text-[rgba(0,255,170,0.5)] transition-colors">
                          {item.dateObj}
                        </button>
                      )}
                    </div>
                  )}
                  {!swapMode && (!gone ? (
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      {publishErrors[item.id] && (
                        <p className="text-[9px] text-red-400 max-w-[100px] text-right leading-tight">{publishErrors[item.id]}</p>
                      )}
                      <div className="flex gap-1">
                        {publishStates[item.id] === 'ok' ? (
                          <div className="w-7 h-7 rounded-[8px] bg-[rgba(0,255,170,0.15)] border border-[rgba(0,255,170,0.4)] flex items-center justify-center flex-shrink-0">
                            <IconCheck size={12} color="#00ffaa" />
                          </div>
                        ) : (
                          <button
                            onClick={e => { e.stopPropagation(); publishNow(item.id) }}
                            disabled={publishStates[item.id] === 'loading'}
                            title="Опубликовать сейчас"
                            className="w-7 h-7 rounded-[8px] bg-[rgba(0,255,170,0.07)] border border-[rgba(0,255,170,0.25)] flex items-center justify-center hover:bg-[rgba(0,255,170,0.18)] transition-all flex-shrink-0 disabled:opacity-40">
                            {publishStates[item.id] === 'loading'
                              ? <span className="w-3 h-3 border-2 border-[rgba(0,255,170,0.3)] border-t-[#00ffaa] rounded-full animate-spin" />
                              : <IconZap size={12} color="rgba(0,255,170,0.8)" />}
                          </button>
                        )}
                        <button onClick={() => {
                          onUpdate(plan.map(x => x.id === item.id ? { ...x, status: 'cancelled' as const } : x))
                          onSaveItem?.(item.id, { status: 'cancelled' })
                        }}
                          className="w-7 h-7 rounded-[8px] bg-[rgba(255,80,80,0.07)] border border-[rgba(255,80,80,0.15)] flex items-center justify-center text-[rgba(255,80,80,0.5)] hover:text-[rgba(255,80,80,0.9)] text-[16px] transition-all flex-shrink-0">
                          ×
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => {
                      onUpdate(plan.map(x => x.id === item.id ? { ...x, status: 'scheduled' as const } : x))
                      onSaveItem?.(item.id, { status: 'scheduled' })
                    }}
                      className="w-7 h-7 rounded-[8px] bg-[rgba(0,255,170,0.07)] border border-[rgba(0,255,170,0.2)] flex items-center justify-center transition-all flex-shrink-0">
                      <IconCheck size={12} color="rgba(0,255,170,0.6)" />
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Extend plan */}
      <button onClick={onExtend}
        className="flex items-center justify-center gap-2 w-full py-3 rounded-[14px] border border-dashed border-[rgba(0,255,170,0.25)] bg-[rgba(0,255,170,0.02)] hover:border-[rgba(0,255,170,0.5)] hover:bg-[rgba(0,255,170,0.06)] text-[13px] font-bold text-[rgba(0,255,170,0.7)] hover:text-[#00ffaa] transition-all">
        <IconEdit size={14} color="currentColor" /> {t.mods.extendPlanBtn}
      </button>
    </div>
  )
}
