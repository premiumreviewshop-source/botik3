import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../store/app'
import { useLang } from '../store/lang'
import Input from '../components/Input'
import { supabase } from '../lib/supabase'
import { openTgLink } from '../lib/tgUser'
import api from '../api/client'

const STARS_PER_DOLLAR = 1000 / 13
const usdToStars = (u: number) => Math.round(u * STARS_PER_DOLLAR)
const QUICK = [5, 10, 25]

const TX_CFG: Record<string, { color: string; bg: string; icon: string }> = {
  topup:    { color: '#00ffaa', bg: 'rgba(0,255,170,0.07)',   icon: '↑' },
  spend:    { color: '#ff6b87', bg: 'rgba(255,107,135,0.07)', icon: '↓' },
  referral: { color: '#f59e0b', bg: 'rgba(245,158,11,0.07)',  icon: '◈' },
}

// Payment method colors: cryptobot=sky-blue, tonkeeper=dark-navy, tgstars=gold
const PAYMENT_METHODS = [
  { id: 'cryptobot', label: 'Crypto Bot',  hex: '#38bdf8', rgb: '56,189,248',   sub: 'USDT · BTC · ETH · TON', fee: '3% комиссия',   feeK: 0.97 },
  { id: 'tonkeeper', label: 'TON Keeper',  hex: '#6366f1', rgb: '30,58,138',    sub: 'Оплата через кошелёк',  fee: 'Без комиссии',   feeK: 1.00 },
  { id: 'tgstars',   label: 'TG Stars',    hex: '#f59e0b', rgb: '245,158,11',   sub: 'Telegram Stars',         fee: '1000 ⭐ = $13',  feeK: 1.00 },
]

// ── SVG icons (brand-accurate) ────────────────────────────────────────────────
function CurrencyIcon({ id, size }: { id: string; size: number }) {
  if (id === 'USDT') return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <circle cx="50" cy="50" r="50" fill="#26A17B"/>
      <path d="M27 25H73V36H56V75H44V36H27V25Z" fill="white"/>
      <path d="M31 61 Q50 69 69 61" stroke="white" strokeWidth="5.5" fill="none" strokeLinecap="round" opacity="0.7"/>
    </svg>
  )
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <circle cx="50" cy="50" r="50" fill="#0098EA"/>
      <path d="M50 18L78 68H22L50 18Z" fill="white" opacity="0.95"/>
      <path d="M50 18L62 42H38L50 18Z" fill="rgba(0,90,160,0.4)"/>
    </svg>
  )
}

function PayIcon({ id, size = 36 }: { id: string; size?: number }) {
  if (id === 'cryptobot') return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <circle cx="18" cy="18" r="18" fill="#38bdf8"/>
      <path d="M23.5 15.2c.22-1.65-1-2.52-2.7-3.11l.55-2.2-1.34-.33-.54 2.15c-.35-.09-.71-.17-1.06-.25l.55-2.17-1.34-.33-.55 2.2c-.29-.07-.57-.13-.84-.2l-1.76-.44-.34 1.43s1 .23 1 .23c.55.14.65.5.63.79l-1.5 5.99c-.1.26-.38.64-.98.5l-1-.25-.7 1.53 1.87.47 1.02.26-.56 2.26 1.34.34.56-2.2c.36.1.72.19 1.07.28l-.55 2.18 1.34.34.56-2.26c2.48.47 4.34.28 5.13-1.97.63-1.8-.03-2.83-1.34-3.5 1-.23 1.75-.88 1.95-2.23zm-3.49 4.9c-.45 1.8-3.47.83-4.45.58l.8-3.2c.97.25 4.08.74 3.65 2.62zm.46-4.93c-.41 1.63-2.92.8-3.73.6l.72-2.89c.82.2 3.44.56 3.01 2.29z" fill="white"/>
    </svg>
  )
  if (id === 'tonkeeper') return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <circle cx="18" cy="18" r="18" fill="#1e40af"/>
      <path d="M18 7L29 25H7L18 7Z" fill="white"/>
      <path d="M18 7L23 17.5H13L18 7Z" fill="rgba(30,80,180,0.4)"/>
    </svg>
  )
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <circle cx="18" cy="18" r="18" fill="#f59e0b"/>
      <path d="M18 8l3.04 6.18 6.76 1.01-4.9 4.77 1.16 6.8L18 23.4l-6.06 3.21 1.16-6.8L8.2 15.19l6.76-1.01L18 8z" fill="white"/>
    </svg>
  )
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function Balance() {
  const { balance, transactions, user, setTransactions } = useApp()
  const { t } = useLang()
  const [custom, setCustom] = useState('')
  const [selected, setSelected] = useState<number | null>(10)
  const [showPaySheet, setShowPaySheet] = useState(false)
  const [payLoading, setPayLoading] = useState<string | null>(null)
  const [payError, setPayError] = useState<string | null>(null)
  const [cryptoCurrencySheet, setCryptoCurrencySheet] = useState<number | null>(null)
  const [pendingPayment, setPendingPayment] = useState<{ type: 'cryptobot' | 'tonkeeper'; invoiceId?: number; comment?: string; amountUsd: number } | null>(null)
  const [checkResult, setCheckResult] = useState<'credited' | 'not_found' | null>(null)
  const [showSuccessRain, setShowSuccessRain] = useState(false)
  const [displayAmounts, setDisplayAmounts] = useState<number[]>(QUICK.map(() => 0))
  const prevBalanceRef = useRef(0)
  const hasInitialLoadedRef = useRef(false)
  const [displayBalance, setDisplayBalance] = useState(0)
  const [showMoneyRain, setShowMoneyRain] = useState(false)
  const btnContainerRef = useRef<HTMLDivElement>(null)
  const [pillLeft, setPillLeft] = useState(0)
  const [pillWidth, setPillWidth] = useState(0)
  const [pillReady, setPillReady] = useState(false)

  // Count-up animation for quick amount buttons on mount
  useEffect(() => {
    const duration = 2000
    const start = performance.now()
    const frame = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplayAmounts(QUICK.map(v => Math.round(v * eased)))
      if (t < 1) requestAnimationFrame(frame)
    }
    const raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Balance count-up animation when balance increases
  useEffect(() => {
    const prev = prevBalanceRef.current
    prevBalanceRef.current = balance
    if (balance <= prev) { setDisplayBalance(balance); return }
    const duration = 1300
    const start = performance.now()
    let raf: number
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      const e = 1 - Math.pow(1 - t, 3)
      setDisplayBalance(prev + (balance - prev) * e)
      if (t < 1) { raf = requestAnimationFrame(step) }
      else {
        setDisplayBalance(balance)
        if (hasInitialLoadedRef.current) { setShowMoneyRain(true); setTimeout(() => setShowMoneyRain(false), 2200) }
        hasInitialLoadedRef.current = true
      }
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [balance])

  // Measure button positions for sliding pill indicator
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (!btnContainerRef.current || selected === null) { setPillReady(false); return }
      const idx = QUICK.indexOf(selected)
      if (idx === -1) { setPillReady(false); return }
      const container = btnContainerRef.current
      const btns = container.querySelectorAll<HTMLElement>('.quick-btn')
      const btn = btns[idx]
      if (!btn) return
      const cRect = container.getBoundingClientRect()
      const bRect = btn.getBoundingClientRect()
      if (cRect.width === 0) return
      setPillLeft(bRect.left - cRect.left)
      setPillWidth(bRect.width)
      setPillReady(true)
    })
    return () => cancelAnimationFrame(raf)
  }, [selected])

  // Auto-poll for pending payment: check every 4s + on visibility change
  useEffect(() => {
    if (!pendingPayment) return
    const t0 = setTimeout(checkPendingPayment, 1800)
    const id = setInterval(checkPendingPayment, 4000)
    const vis = () => { if (!document.hidden) checkPendingPayment() }
    document.addEventListener('visibilitychange', vis)
    return () => { clearTimeout(t0); clearInterval(id); document.removeEventListener('visibilitychange', vis) }
  }, [pendingPayment])

  // Refresh transactions every 30s so admin adjustments and delayed credits appear promptly
  useEffect(() => {
    const id = setInterval(() => {
      api.transactions.list().then(d => setTransactions(d)).catch(() => {})
    }, 30000)
    return () => clearInterval(id)
  }, [])

  const handlePayMethod = async (methodId: string, amount: number, currency?: string) => {
    if (methodId === 'cryptobot' && !currency) { setCryptoCurrencySheet(amount); return }
    setPayLoading(methodId + (currency ?? ''))
    setPayError(null)
    try {
      const nonce = Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
      const { data, error } = await supabase.functions.invoke<{ url?: string; miniAppUrl?: string; walletAddr?: string; comment?: string }>('payments', {
        body: { action: 'create_invoice', platform: methodId, tgUserId: user.id, amount, currency, nonce },
      })
      if (error || !data) throw new Error(error?.message ?? 'Ошибка сервера')
      const tg = (window as any).Telegram?.WebApp

      if (methodId === 'tonkeeper') {
        if (tg?.openLink) tg.openLink(data.url!, { try_instant_view: false })
        else window.location.href = data.url!
        setShowPaySheet(false)
        setPendingPayment({ type: 'tonkeeper', comment: data.comment!, amountUsd: amount })
      } else if (methodId === 'tgstars' && data.url) {
        if (tg?.openInvoice) {
          tg.openInvoice(data.url, (status: string) => {
            if (status === 'paid') {
              // Balance is credited via telegram-webhook (successful_payment handler).
              // Refresh transactions until the credit appears.
              setShowSuccessRain(true)
              setTimeout(() => setShowSuccessRain(false), 3500)
              const refresh = () => api.transactions.list().then(d => setTransactions(d)).catch(() => {})
              refresh()
              setTimeout(refresh, 1200)
              setTimeout(refresh, 3000)
              setTimeout(refresh, 6000)
            }
          })
        } else openTgLink(data.url.replace('https://t.me/', ''))
        setShowPaySheet(false)
      } else if (data.miniAppUrl) {
        openTgLink(data.miniAppUrl.replace('https://t.me/', ''))
        setShowPaySheet(false)
        if (methodId === 'cryptobot') setPendingPayment({ type: 'cryptobot', invoiceId: (data as any).invoiceId, amountUsd: amount })
      } else if (data.url) {
        if (tg?.openLink) tg.openLink(data.url)
        else window.open(data.url, '_blank')
        setShowPaySheet(false)
        if (methodId === 'cryptobot') setPendingPayment({ type: 'cryptobot', invoiceId: (data as any).invoiceId, amountUsd: amount })
      }
    } catch (e) {
      setPayError(String(e).replace('Error: ', ''))
    } finally {
      setPayLoading(null)
    }
  }

  const checkPendingPayment = async () => {
    if (!pendingPayment) return
    try {
      const body = pendingPayment.type === 'cryptobot'
        ? { action: 'check_cryptobot', tgUserId: user.id, invoiceId: pendingPayment.invoiceId }
        : { action: 'check_ton', tgUserId: user.id, comment: pendingPayment.comment, amountUsd: pendingPayment.amountUsd }
      const { data } = await supabase.functions.invoke<{ credited: boolean }>('payments', { body })
      if (data?.credited) {
        setCheckResult('credited')
        setShowSuccessRain(true)
        setTimeout(() => setShowSuccessRain(false), 3500)
        const refresh = () => api.transactions.list().then(d => setTransactions(d)).catch(() => {})
        refresh()
        setTimeout(refresh, 1200)
        setTimeout(refresh, 3000)
        setTimeout(() => { setPendingPayment(null); setCheckResult(null) }, 2800)
      } else {
        setCheckResult('not_found')
      }
    } catch {}
  }

  const amount = selected ?? Number(custom)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-full relative">
      {/* Top ambient glow — fixed to viewport top so no double-layer seam */}
      <div style={{
        position: 'fixed', top: '-180px', left: 0, right: 0, height: '600px',
        background: 'radial-gradient(ellipse 120% 340px at 50% 180px, rgba(0,255,136,0.2) 0%, rgba(0,255,136,0.07) 48%, transparent 72%)',
        pointerEvents: 'none', zIndex: 0,
      }} />

      {/* ── Hero: Phantom-style centered balance ── */}
      <div className="flex flex-col items-center pt-5 pb-6 px-5 animate-reveal-up relative">
        <p style={{ color: 'rgba(255,255,255,0.28)', fontSize: '10px', fontWeight: 700, letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '12px' }}>
          {t.balance.current}
        </p>
        <h1 style={{
          fontSize: 'clamp(52px, 18.5vw, 76px)',
          fontWeight: 800,
          letterSpacing: '-4px',
          lineHeight: 1,
          color: '#ffffff',
          fontVariantNumeric: 'tabular-nums',
          fontFeatureSettings: '"tnum" 1',
        }}>
          ${displayBalance.toFixed(2)}
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px', marginTop: '8px', letterSpacing: '0.2px' }}>
          {usdToStars(balance).toLocaleString()} ⭐ · ≈ ${((usdToStars(balance) / 1000) * 13).toFixed(2)}
        </p>
      </div>

      {/* ── Amount selector (glass dark boxes style) ── */}
      <div className="px-5 mb-3 animate-reveal-up stagger-1 relative">
        <div ref={btnContainerRef} className="relative rounded-[20px] mb-3"
          style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)' }}>
          {/* Sliding green indicator */}
          <div style={{
            position: 'absolute', top: 0, bottom: 0,
            left: pillLeft, width: pillWidth,
            background: 'rgba(0,255,170,0.09)',
            border: '1px solid rgba(0,255,170,0.35)',
            boxShadow: '0 0 18px rgba(0,255,170,0.1)',
            borderRadius: '18px',
            opacity: pillReady ? 1 : 0,
            transition: 'left 0.28s cubic-bezier(0.22,1,0.36,1), opacity 0.15s ease',
            pointerEvents: 'none',
          }} />
          <div className="grid grid-cols-3 gap-2.5 relative" style={{ zIndex: 1 }}>
          {QUICK.map((amt, i) => (
            <button key={amt} onClick={() => { setSelected(amt); setCustom('') }}
              className="quick-btn relative rounded-[18px] transition-all active:scale-[0.94] touch-manipulation"
              style={{ background: 'transparent', border: 'none', padding: '14px 8px' }}>
              {amt === 10 && (
                <span style={{
                  position: 'absolute', top: '-10px', right: '-9px',
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  color: 'white',
                  fontSize: '9px', fontWeight: 900, letterSpacing: '0.5px',
                  padding: '3px 7px', borderRadius: '5px',
                  textTransform: 'uppercase' as const,
                  boxShadow: '0 2px 12px rgba(239,68,68,0.65)',
                  lineHeight: 1.3,
                  transform: 'rotate(12deg)',
                  display: 'block',
                }}>HOT</span>
              )}
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>
                сумма
              </p>
              <p style={{
                color: selected === amt ? '#00ffaa' : 'rgba(255,255,255,0.85)',
                fontSize: '22px',
                fontWeight: 800,
                letterSpacing: '-1px',
                fontVariantNumeric: 'tabular-nums',
              }}>
                ${displayAmounts[i]}
              </p>
            </button>
          ))}
          </div>
        </div>
        <Input value={custom} onChange={v => { setCustom(v); setSelected(null) }}
          placeholder={t.balance.customAmt} type="number" />
      </div>

      {/* ── Dark premium "Пополнить" button ── */}
      <div className="px-5 mb-6 animate-reveal-up stagger-2">
        <button
          disabled={!selected && !custom}
          onClick={() => setShowPaySheet(true)}
          className="w-full flex items-center justify-center gap-2.5 py-[18px] rounded-[20px] relative overflow-hidden transition-all active:scale-[0.97] disabled:opacity-40 touch-manipulation"
          style={{
            background: 'linear-gradient(135deg, #00e87a 0%, #00c96a 100%)',
            border: '1px solid rgba(0,255,136,0.4)',
            boxShadow: '0 0 32px rgba(0,255,136,0.22), inset 0 1px 0 rgba(255,255,255,0.25)',
          }}>
          {/* Repeating shimmer bar */}
          <span style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.28) 50%, transparent 100%)',
            width: '45%',
            animation: 'btn-shine-sweep 2.2s 0.4s ease-in-out infinite',
            pointerEvents: 'none',
          }} />
          <span style={{ fontSize: '20px', color: '#020202', fontWeight: 900, position: 'relative', lineHeight: 1 }}>+</span>
          <span style={{ color: '#020202', fontSize: '16px', fontWeight: 800, position: 'relative', letterSpacing: '-0.3px' }}>
            Пополнить
          </span>
        </button>
      </div>

      {/* ── Glass transaction panel (iOS glass style) ── */}
      <div className="relative mx-0 flex-1" style={{
        background: 'rgba(255,255,255,0.025)',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
        borderRadius: '32px 32px 0 0',
        border: '1px solid rgba(255,255,255,0.08)',
        borderBottom: 'none',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)',
        minHeight: '260px',
      }}>
        {/* Handle pill */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '12px', paddingBottom: '20px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
        </div>

        {/* Transaction history */}
        <div className="px-5 pb-6">
          <p style={{ color: 'rgba(255,255,255,0.28)', fontSize: '10px', fontWeight: 700, letterSpacing: '2.5px', textTransform: 'uppercase', marginBottom: '12px' }}>
            {t.balance.history}
          </p>
          {(() => {
            const displayTxs = transactions.filter(tx => tx.type !== 'referral' && tx.type !== 'referral_payout')
            return displayTxs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 rounded-[20px]"
              style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
              <p style={{ fontSize: '32px' }}>💸</p>
              <p style={{ fontSize: '14px', fontWeight: 700, color: 'rgba(255,255,255,0.25)' }}>{t.balance.noTx}</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {displayTxs.map((tx, i) => {
                const cfg = TX_CFG[tx.type] ?? TX_CFG.spend
                return (
                  <div key={tx.id} className="flex items-center gap-3.5 py-3.5 animate-card-in"
                    style={{
                      borderBottom: i < displayTxs.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                      animationDelay: `${i * 35}ms`,
                    }}>
                    <div className="w-9 h-9 rounded-[12px] flex items-center justify-center font-black text-[14px] flex-shrink-0"
                      style={{ background: `${cfg.color}15`, color: cfg.color }}>
                      {cfg.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate" style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>{tx.description}</p>
                      <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', marginTop: '2px' }}>{tx.date}</p>
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: cfg.color, fontVariantNumeric: 'tabular-nums' }}>
                      {tx.type === 'spend' ? '-' : '+'}${(() => { const n = Math.abs(tx.amount); const s = n.toFixed(3); return s.endsWith('0') ? n.toFixed(2) : s })()}
                    </span>
                  </div>
                )
              })}
            </div>
          )
          })()}
        </div>
      </div>

      {/* ══ Payment method sheet ══════════════════════════════════════════════ */}
      {showPaySheet && createPortal(
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full rounded-t-[32px] animate-sheet" style={{
            background: 'rgba(2,2,10,0.98)',
            backgroundImage: 'linear-gradient(rgba(0,255,136,0.012) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,136,0.012) 1px, transparent 1px)',
            backgroundSize: '38px 38px',
            border: '1px solid rgba(255,255,255,0.07)',
            borderBottom: 'none',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
            maxHeight: '85vh',
            overflowY: 'auto' as const,
          }}>
            {/* Handle + header */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '12px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
            </div>
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <div>
                <p style={{ color: 'rgba(255,255,255,0.28)', fontSize: '10px', fontWeight: 700, letterSpacing: '2.5px', textTransform: 'uppercase' }}>
                  Способ оплаты
                </p>
                <p style={{ color: '#ffffff', fontSize: '24px', fontWeight: 800, letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums', marginTop: '2px' }}>
                  +${amount}
                </p>
              </div>
              <button onClick={() => setShowPaySheet(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-[0.92]"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', fontSize: '18px' }}>
                ×
              </button>
            </div>

            {payError && (
              <p style={{ color: '#ff6b87', fontSize: '12px', textAlign: 'center', padding: '0 20px 8px' }}>{payError}</p>
            )}

            <div className="flex flex-col gap-2.5 px-5 mt-2">
              {PAYMENT_METHODS.map(m => {
                const loading = payLoading?.startsWith(m.id) ?? false
                const net = (amount * m.feeK).toFixed(2)
                const netLine = m.id === 'tgstars'
                  ? `+$${net} = ${usdToStars(amount * m.feeK).toLocaleString()} ⭐`
                  : `+$${net} на баланс`
                return (
                  <button key={m.id} onClick={() => handlePayMethod(m.id, amount)} disabled={!!payLoading}
                    className="flex items-center gap-4 p-4 rounded-[20px] transition-all active:scale-[0.97] disabled:opacity-60 touch-manipulation"
                    style={{
                      background: 'rgba(255,255,255,0.035)',
                      backdropFilter: 'blur(20px)',
                      WebkitBackdropFilter: 'blur(20px)',
                      border: '1px solid rgba(255,255,255,0.07)',
                    }}>
                    {loading
                      ? <div className="w-9 h-9 flex items-center justify-center flex-shrink-0">
                          <span className="w-5 h-5 border-2 rounded-full animate-spin"
                            style={{ borderColor: `rgba(${m.rgb},0.2)`, borderTopColor: m.hex }} />
                        </div>
                      : <PayIcon id={m.id} size={44} />}
                    <div className="flex-1 text-left">
                      <p style={{ fontSize: '16px', fontWeight: 800, color: m.hex, letterSpacing: '-0.3px' }}>{m.label}</p>
                      <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.28)', marginTop: '2px' }}>{m.sub}</p>
                      <p style={{ fontSize: '10px', fontWeight: 700, color: `rgba(${m.rgb},0.55)`, marginTop: '3px' }}>{m.fee}</p>
                      <p style={{ fontSize: '11px', fontWeight: 800, color: '#00ffaa', marginTop: '3px', letterSpacing: '-0.2px' }}>{netLine}</p>
                    </div>
                    <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: '18px', fontWeight: 300 }}>›</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ══ Crypto Bot currency selection ════════════════════════════════════ */}
      {cryptoCurrencySheet !== null && createPortal(
        <div className="fixed inset-0 z-[60] flex items-end" style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full rounded-t-[28px] px-5 pt-5 animate-sheet" style={{
            background: '#06070f',
            backgroundImage: 'linear-gradient(rgba(0,255,136,0.022) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,136,0.022) 1px, transparent 1px)',
            backgroundSize: '38px 38px',
            border: '1px solid rgba(255,255,255,0.08)',
            borderBottom: 'none',
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: '16px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
            </div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <p style={{ color: 'rgba(56,189,248,0.6)', fontSize: '10px', fontWeight: 700, letterSpacing: '2.5px', textTransform: 'uppercase' }}>
                  Crypto Bot
                </p>
                <p style={{ color: '#ffffff', fontSize: '18px', fontWeight: 800, marginTop: '2px' }}>Выбери валюту</p>
              </div>
              <button onClick={() => setCryptoCurrencySheet(null)}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', fontSize: '18px' }}>
                ×
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {[
                { id: 'USDT', label: 'Tether USDT', sub: 'TRC-20 / ERC-20 / TON', hex: '#26a17b', rgb: '38,161,123' },
                { id: 'TON',  label: 'Toncoin TON',  sub: 'The Open Network',      hex: '#0098ea', rgb: '0,152,234' },
              ].map(c => (
                <button key={c.id}
                  onClick={() => { setCryptoCurrencySheet(null); handlePayMethod('cryptobot', cryptoCurrencySheet, c.id) }}
                  disabled={!!payLoading}
                  className="flex items-center gap-4 px-4 py-4 rounded-[20px] transition-all active:scale-[0.97] touch-manipulation"
                  style={{
                    background: `rgba(${c.rgb},0.07)`,
                    border: `1px solid rgba(${c.rgb},0.22)`,
                    boxShadow: `0 0 20px rgba(${c.rgb},0.04)`,
                  }}>
                  <div className="flex-shrink-0">
                    <CurrencyIcon id={c.id} size={60} />
                  </div>
                  <div className="flex-1 text-left">
                    <p style={{ fontSize: '17px', fontWeight: 800, color: c.hex, letterSpacing: '-0.3px' }}>{c.label}</p>
                    <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', marginTop: '3px' }}>{c.sub}</p>
                  </div>
                  <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '20px', fontWeight: 300 }}>›</span>
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ══ Ambient money rain on balance count-up ═══════════════════════════ */}
      {showMoneyRain && createPortal(
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 30, overflow: 'hidden' }}>
          {[4, 10, 17, 23, 29, 35, 62, 68, 74, 80, 87, 93].map((left, i) => (
            <div key={i} style={{
              position: 'absolute', left: `${left}%`, bottom: '80px',
              fontSize: `${13 + (i % 3) * 4}px`, color: '#00ffaa', fontWeight: 900,
              animation: `money-rise ${0.9 + (i % 4) * 0.35}s ${(i % 6) * 0.13}s ease-out forwards`,
            }}>$</div>
          ))}
        </div>,
        document.body
      )}

      {/* ══ Full-screen success rain after payment credited ══════════════════ */}
      {showSuccessRain && createPortal(
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 200, overflow: 'hidden' }}>
          {Array.from({ length: 30 }, (_, i) => (
            <div key={i} style={{
              position: 'absolute',
              left: `${(i / 30) * 96 + 2}%`,
              bottom: '-20px',
              fontSize: `${16 + (i % 4) * 6}px`,
              color: i % 5 === 0 ? '#00d4ff' : '#00ffaa',
              fontWeight: 900,
              opacity: 0,
              animation: `money-rise ${0.7 + (i % 5) * 0.28}s ${(i % 10) * 0.1}s ease-out forwards`,
            }}>$</div>
          ))}
        </div>,
        document.body
      )}

      {/* ══ Pending payment — centered modal ══════════════════════════════════ */}
      {pendingPayment && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center px-5"
          style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}>
          <div className="w-full max-w-[360px] rounded-[28px] p-6 animate-reveal-scale"
            style={{
              background: 'rgba(255,255,255,0.035)',
              backdropFilter: 'blur(40px)',
              WebkitBackdropFilter: 'blur(40px)',
              border: '1px solid rgba(255,255,255,0.09)',
              boxShadow: '0 40px 80px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.12)',
            }}>

            {/* Close */}
            <div className="flex justify-end mb-2">
              <button onClick={() => { setPendingPayment(null); setCheckResult(null) }}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-[0.9]"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.32)', fontSize: '18px' }}>
                ×
              </button>
            </div>

            {/* Payment icon */}
            <div className="flex justify-center mb-4">
              <PayIcon id={pendingPayment.type} size={64} />
            </div>

            {checkResult === 'credited' ? (
              <>
                {/* Animated checkmark */}
                <div className="flex justify-center mb-3">
                  <svg width="68" height="68" viewBox="0 0 68 68" fill="none">
                    <circle cx="34" cy="34" r="32" fill="rgba(0,255,170,0.07)" stroke="rgba(0,255,170,0.25)" strokeWidth="1.5" />
                    <path d="M21 34l10 10 16-20" stroke="#00ffaa" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                      fill="none" strokeDasharray="65" style={{ animation: 'check-draw 0.5s 0.1s ease-out both' }} />
                  </svg>
                </div>
                <div className="text-center mb-5">
                  <p style={{ color: '#00ffaa', fontSize: '58px', fontWeight: 900, letterSpacing: '-4px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                    +${pendingPayment.amountUsd}
                  </p>
                  <p style={{ color: 'rgba(0,255,170,0.75)', fontSize: '15px', fontWeight: 700, marginTop: '8px' }}>
                    Зачислено на баланс!
                  </p>
                </div>
              </>
            ) : (
              <>
                {/* Animated bouncing dots */}
                <div className="flex justify-center gap-2.5 mb-4 pt-1">
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{
                      width: 10, height: 10, borderRadius: '50%', background: '#00ffaa',
                      animation: `dot-pulse 1.4s ${i * 0.22}s ease-in-out infinite`,
                    }} />
                  ))}
                </div>
                <div className="text-center mb-5">
                  <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px', marginBottom: '6px' }}>
                    {pendingPayment.type === 'tonkeeper' ? 'Ожидание TON Keeper' : 'Ожидание Crypto Bot'}
                  </p>
                  <p style={{ color: '#ffffff', fontSize: '58px', fontWeight: 900, letterSpacing: '-4px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                    +${pendingPayment.amountUsd}
                  </p>
                </div>
                <div className="flex flex-col items-center gap-1.5 py-3 rounded-[14px]"
                  style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p style={{ color: 'rgba(255,255,255,0.28)', fontSize: '12px' }}>
                    {checkResult === 'not_found' ? 'Ещё не зачислено, продолжаем...' : 'Обрабатываем платёж...'}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
