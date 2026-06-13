import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../store/app'
import { IconShare, IconCheck } from '../components/Icons'
import { supabase } from '../lib/supabase'
import api from '../api/client'

type RefUser = { tg_user_id: string; username: string | null; first_name: string | null; joined_at: string; total_deposited: number }
type WithdrawMode = 'withdraw' | 'toBalance' | null
type WithdrawStep = 'method' | 'details'
type WithdrawMethod = 'cryptobot' | 'tonkeeper'

const BOT_HANDLE = (import.meta.env.VITE_BOT_HANDLE as string | undefined) ?? 'WELOlab_bot'

const TIERS = [
  { range: '1 – 5 рефов', pct: '10%', idx: 0 },
  { range: '6 – 10 рефов', pct: '15%', idx: 1 },
  { range: '11+ рефов', pct: '20%', idx: 2 },
]

export default function Referral() {
  const { transactions, user, setTransactions } = useApp()
  const [copied, setCopied] = useState(false)
  const [showRefsModal, setShowRefsModal] = useState(false)
  const [refUsers, setRefUsers] = useState<RefUser[]>([])

  // Withdraw state
  const [withdrawMode, setWithdrawMode] = useState<WithdrawMode>(null)
  const [withdrawStep, setWithdrawStep] = useState<WithdrawStep>('method')
  const [withdrawMethod, setWithdrawMethod] = useState<WithdrawMethod | null>(null)
  const [withdrawAmt, setWithdrawAmt] = useState('')
  const [withdrawWallet, setWithdrawWallet] = useState('')
  const [withdrawLoading, setWithdrawLoading] = useState(false)
  const [withdrawDone, setWithdrawDone] = useState(false)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)

  useEffect(() => {
    const initData = (window as any).Telegram?.WebApp?.initData ?? ''
    supabase.functions.invoke('payments', { body: { action: 'get_referrals', tgUserId: user.id, initData } })
      .then(({ data }) => { if (data?.referrals) setRefUsers(data.referrals) })
      .catch(() => {})
  }, [user.id])

  const refEarned = transactions.filter(tx => tx.type === 'referral').reduce((s, tx) => s + tx.amount, 0)
  const refPaidOut = transactions.filter(tx => tx.type === 'referral_payout').reduce((s, tx) => s + tx.amount, 0)
  const refBalance = Math.max(0, refEarned - refPaidOut)

  const activeRefs = refUsers.length
  // Tier is based on unique referees who have deposited (those with total_deposited > 0)
  const depositedRefs = refUsers.filter(r => r.total_deposited > 0).length
  const currentTierIdx = depositedRefs >= 11 ? 2 : depositedRefs >= 6 ? 1 : 0

  // Earned per referee ID (from referral transactions matching "Реферал #ID ·")
  const earnedMap: Record<string, number> = {}
  for (const tx of transactions.filter(t => t.type === 'referral')) {
    const m = (tx.description ?? '').match(/^Реферал\s+(\S+)/)
    if (m) earnedMap[m[1]] = (earnedMap[m[1]] ?? 0) + tx.amount
  }

  const canWithdraw = refBalance >= 1

  const refLink = `https://t.me/${BOT_HANDLE}?startapp=ref_${user.id}`

  const shareLink = async () => {
    ;(window as any).Telegram?.WebApp?.HapticFeedback?.impactOccurred('light')
    const shareText = 'Зарабатывай с AI-ботом для подписчиков 🤖'
    if (navigator.share) {
      try { await navigator.share({ url: refLink, text: shareText }); return } catch { /* cancelled */ }
    }
    navigator.clipboard?.writeText(refLink).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const openWithdraw = (mode: WithdrawMode) => {
    setWithdrawMode(mode)
    setWithdrawStep(mode === 'withdraw' ? 'method' : 'details')
    setWithdrawMethod(null)
    setWithdrawAmt(refBalance.toFixed(2))
    setWithdrawWallet('')
    setWithdrawError(null)
    setWithdrawDone(false)
  }

  const closeWithdraw = () => { setWithdrawMode(null); setWithdrawDone(false); setWithdrawError(null) }

  const confirmWithdraw = async () => {
    const amt = Number(withdrawAmt)
    if (!amt || amt <= 0 || amt > refBalance) { setWithdrawError('Неверная сумма'); return }
    if (withdrawMode === 'withdraw' && !withdrawWallet.trim()) { setWithdrawError('Введите адрес кошелька'); return }

    setWithdrawLoading(true)
    setWithdrawError(null)
    try {
      const initData = (window as any).Telegram?.WebApp?.initData ?? ''
      const body: Record<string, unknown> = {
        action: 'payout_referral',
        tgUserId: user.id,
        type: withdrawMode === 'toBalance' ? 'balance' : 'withdraw',
        amount: amt,
        initData,
      }
      if (withdrawMode === 'withdraw') {
        body.walletType = withdrawMethod === 'cryptobot' ? 'CryptoBot' : 'TonKeeper'
        body.walletAddress = withdrawWallet.trim()
      }
      const { data, error } = await supabase.functions.invoke('payments', { body })
      if (error || !data?.ok) throw new Error(error?.message ?? 'Ошибка')
      // Refresh transactions from API
      const fresh = await api.transactions.list().catch(() => null)
      if (fresh) setTransactions(fresh)
      setWithdrawDone(true)
    } catch (e) {
      setWithdrawError(String(e).replace('Error: ', ''))
    } finally {
      setWithdrawLoading(false)
    }
  }

  return (
    <div className="flex flex-col min-h-full">

      {/* ── Header row ── */}
      <div className="flex items-center justify-between px-5 mb-4 animate-reveal-up">
        <p style={{ color: 'rgba(180,210,255,0.65)', fontSize: '13px', fontWeight: 600, letterSpacing: '0.2px' }}>
          Партнёрская программа
        </p>
        <div className="px-2.5 py-1 rounded-full"
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(160,200,255,0.7)' }}>
            REF
          </span>
        </div>
      </div>

      {/* ── Balance card ── */}
      <div className="mx-5 rounded-[24px] mb-3 animate-reveal-up stagger-1" style={{
        background: 'linear-gradient(145deg, rgba(255,248,235,0.13) 0%, rgba(255,255,255,0.07) 100%)',
        border: '1px solid rgba(255,255,255,0.25)',
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        boxShadow: '0 12px 40px rgba(0,20,80,0.45), inset 0 1px 0 rgba(255,255,255,0.3)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', right: '-10px', top: '-18px',
          transform: 'rotate(-30deg)',
          fontSize: '118px', fontWeight: 900, lineHeight: 1,
          background: 'linear-gradient(155deg, rgba(80,255,160,0.9) 0%, rgba(0,255,100,0.7) 35%, rgba(0,210,80,0.5) 65%, rgba(0,130,50,0.25) 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          filter: 'drop-shadow(0 0 18px rgba(0,255,100,0.75))',
          pointerEvents: 'none',
          userSelect: 'none' as const,
          letterSpacing: '-4px',
        }}>$</div>

        <div className="px-5 pt-5 pb-5">
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', fontWeight: 600, letterSpacing: '0.3px', marginBottom: '4px' }}>
            Реферальный баланс
          </p>
          {refEarned > 0 && (
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '10px', marginBottom: '4px' }}>
              Заработано: ${refEarned.toFixed(2)}{refPaidOut > 0 ? ` · Выведено: $${refPaidOut.toFixed(2)}` : ''}
            </p>
          )}
          <p style={{
            fontSize: '54px', fontWeight: 800, letterSpacing: '-3.5px', lineHeight: 1,
            color: '#ffffff', fontVariantNumeric: 'tabular-nums',
            marginBottom: '16px',
          }}>
            ${refBalance.toFixed(2)}
          </p>

          <button onClick={() => setShowRefsModal(true)}
            className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-full mb-4 transition-all active:scale-[0.98] touch-manipulation"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.16)' }}>
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#60b0ff', boxShadow: '0 0 5px rgba(96,176,255,0.9)' }} />
            <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '12px', fontWeight: 700, flex: 1, textAlign: 'left' }}>
              {activeRefs} рефов {depositedRefs > 0 ? `· ${depositedRefs} пополнили` : ''}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px', fontWeight: 600 }}>Смотреть</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginLeft: '6px', flexShrink: 0 }}>
              <div style={{ width: 14, height: 1.5, borderRadius: 1, background: 'rgba(255,255,255,0.45)' }} />
              <div style={{ width: 10, height: 1.5, borderRadius: 1, background: 'rgba(255,255,255,0.45)' }} />
              <div style={{ width: 14, height: 1.5, borderRadius: 1, background: 'rgba(255,255,255,0.45)' }} />
            </div>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => openWithdraw('withdraw')}
              disabled={!canWithdraw}
              className="py-[14px] rounded-[16px] flex items-center justify-center transition-all active:scale-[0.97] touch-manipulation disabled:opacity-40"
              style={{ background: '#ffffff', boxShadow: '0 4px 18px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.6)' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#000000' }}>Вывести</span>
            </button>
            <button
              onClick={() => openWithdraw('toBalance')}
              disabled={!canWithdraw}
              className="py-[14px] rounded-[16px] flex items-center justify-center transition-all active:scale-[0.97] touch-manipulation disabled:opacity-40"
              style={{
                background: 'linear-gradient(135deg, #0e7a38 0%, #0a5c2a 100%)',
                border: '1px solid rgba(0,230,100,0.35)',
                boxShadow: '0 4px 18px rgba(0,160,60,0.45), inset 0 1px 0 rgba(0,255,120,0.2)',
              }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#4dffa0' }}>В баланс</span>
            </button>
          </div>
          {!canWithdraw && refBalance > 0 && (
            <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '11px', textAlign: 'center', marginTop: '10px' }}>
              Минимум $1 для вывода (ещё ${(1 - refBalance).toFixed(2)})
            </p>
          )}
        </div>
      </div>

      {/* ── Dark panel ── */}
      <div className="relative mx-0 flex-1 animate-panel-up" style={{
        background: 'rgba(4,4,14,0.96)',
        borderRadius: '28px 28px 0 0',
        border: '1px solid rgba(255,255,255,0.06)',
        borderBottom: 'none',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)',
        marginTop: '12px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '10px', paddingBottom: '16px' }}>
          <div style={{ width: 32, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.12)' }} />
        </div>

        <div className="px-5 pb-10 flex flex-col gap-5">

          {/* Referral link */}
          <div>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '9px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '8px' }}>
              Твоя ссылка
            </p>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center px-3.5 py-3 rounded-[13px] min-w-0"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="truncate" style={{ fontSize: '10px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.3)' }}>
                  {refLink}
                </p>
              </div>
              <button onClick={shareLink}
                className="w-11 h-11 flex-shrink-0 rounded-[13px] flex items-center justify-center transition-all active:scale-[0.9] touch-manipulation"
                style={copied
                  ? { background: 'rgba(0,255,170,0.1)', border: '1px solid rgba(0,255,170,0.25)' }
                  : { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
                {copied ? <IconCheck size={15} color="#00ffaa" /> : <IconShare size={15} color="rgba(255,255,255,0.5)" />}
              </button>
            </div>
            {copied && (
              <p style={{ color: '#00ffaa', fontSize: '11px', textAlign: 'center', marginTop: '5px' }}>Скопировано!</p>
            )}
          </div>

          {/* Tiers */}
          <div>
            <p style={{ color: 'rgba(255,255,255,0.28)', fontSize: '9px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '10px' }}>
              Как ты зарабатываешь
            </p>
            <div className="rounded-[16px] overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.016)', border: '1px solid rgba(255,255,255,0.06)' }}>
              {TIERS.map((tier, i) => {
                const isActive = i === currentTierIdx
                return (
                  <div key={tier.range} className="flex items-center justify-between px-4 py-3"
                    style={{
                      background: isActive ? 'rgba(77,159,255,0.08)' : 'transparent',
                      borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    }}>
                    <div className="flex items-center gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={isActive
                          ? { background: '#4d9fff', boxShadow: '0 0 5px rgba(77,159,255,0.9)' }
                          : { background: 'rgba(255,255,255,0.1)' }} />
                      <span style={{ fontSize: '13px', color: isActive ? '#fff' : 'rgba(255,255,255,0.3)', fontWeight: isActive ? 600 : 400 }}>
                        {tier.range}
                      </span>
                    </div>
                    <span style={{ fontSize: '19px', fontWeight: 900, letterSpacing: '-0.5px', color: isActive ? '#4d9fff' : 'rgba(77,159,255,0.18)' }}>
                      {tier.pct}
                    </span>
                  </div>
                )
              })}
              <div className="px-4 py-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: 'rgba(0,0,0,0.14)' }}>
                <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '11px', lineHeight: 1.5 }}>
                  % <span style={{ color: 'rgba(77,159,255,0.6)', fontWeight: 600 }}>с каждого пополнения</span> реферала — пожизненно
                </p>
              </div>
            </div>
          </div>

          {/* How it works */}
          <div className="rounded-[14px] p-4"
            style={{ background: 'rgba(77,159,255,0.04)', border: '1px solid rgba(77,159,255,0.07)' }}>
            <p style={{ color: 'rgba(180,210,255,0.4)', fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '10px' }}>
              Как работает ссылка
            </p>
            {[
              'Партнёр кликает по твоей ссылке в Telegram',
              'Если он ещё не заходил — засчитывается как твой реферал',
              'После его пополнения ты получаешь % на реферальный баланс',
            ].map((text, n) => (
              <div key={n} className="flex items-start gap-2.5 mb-2 last:mb-0">
                <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: 'rgba(77,159,255,0.1)', border: '1px solid rgba(77,159,255,0.2)' }}>
                  <span style={{ fontSize: '8px', fontWeight: 900, color: '#4d9fff' }}>{n + 1}</span>
                </div>
                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>{text}</p>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* ══ Withdraw sheet ════════════════════════════════════════════════════ */}
      {withdrawMode && createPortal(
        <div className="fixed inset-0 z-50 flex items-end"
          style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(10px)' }}
          onClick={closeWithdraw}>
          <div className="w-full rounded-t-[28px] animate-sheet"
            style={{
              background: 'rgba(6,8,20,0.98)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderBottom: 'none',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 28px)',
            }}
            onClick={e => e.stopPropagation()}>

            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '12px', paddingBottom: '4px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
            </div>

            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '10px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase' }}>
                  {withdrawMode === 'withdraw' ? 'Вывод средств' : 'Перевод в баланс'}
                </p>
                <p style={{ color: '#fff', fontSize: '20px', fontWeight: 800, letterSpacing: '-0.5px', marginTop: '2px' }}>
                  Доступно: <span style={{ color: withdrawMode === 'withdraw' ? '#fff' : '#4dffa0' }}>${refBalance.toFixed(2)}</span>
                </p>
              </div>
              <button onClick={closeWithdraw}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', fontSize: '18px' }}>×</button>
            </div>

            {withdrawDone ? (
              /* Success state */
              <div className="px-5 pb-4 flex flex-col items-center gap-4">
                <div style={{ fontSize: '52px', lineHeight: 1 }}>✅</div>
                <p style={{ color: '#00ffaa', fontSize: '18px', fontWeight: 800, textAlign: 'center' }}>
                  {withdrawMode === 'toBalance' ? 'Переведено в баланс!' : 'Запрос отправлен!'}
                </p>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', textAlign: 'center', lineHeight: 1.5 }}>
                  {withdrawMode === 'toBalance'
                    ? `$${Number(withdrawAmt).toFixed(2)} добавлены на основной баланс`
                    : `Мы получили запрос на вывод $${Number(withdrawAmt).toFixed(2)} и обработаем его вручную`}
                </p>
                <button onClick={closeWithdraw}
                  className="w-full py-[14px] rounded-[16px] transition-all active:scale-[0.97] touch-manipulation"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px', fontWeight: 700 }}>Закрыть</span>
                </button>
              </div>
            ) : withdrawMode === 'withdraw' && withdrawStep === 'method' ? (
              /* Method selection for withdrawal */
              <div className="px-5 pb-2 flex flex-col gap-3">
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', marginBottom: '4px' }}>Выбери способ вывода:</p>
                {([
                  { id: 'cryptobot' as const, label: 'Crypto Bot', sub: 'USDT · TON · BTC', hex: '#38bdf8', rgb: '56,189,248' },
                  { id: 'tonkeeper' as const, label: 'TON Keeper', sub: 'TON кошелёк', hex: '#6366f1', rgb: '30,58,138' },
                ] as const).map(m => (
                  <button key={m.id}
                    onClick={() => { setWithdrawMethod(m.id); setWithdrawStep('details') }}
                    className="flex items-center gap-4 px-4 py-4 rounded-[18px] transition-all active:scale-[0.97] touch-manipulation"
                    style={{ background: `rgba(${m.rgb},0.07)`, border: `1px solid rgba(${m.rgb},0.22)` }}>
                    <div className="flex-1 text-left">
                      <p style={{ fontSize: '16px', fontWeight: 800, color: m.hex }}>{m.label}</p>
                      <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '2px' }}>{m.sub}</p>
                    </div>
                    <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '20px' }}>›</span>
                  </button>
                ))}
              </div>
            ) : (
              /* Amount + wallet details */
              <div className="px-5 flex flex-col gap-4">
                {/* Method label for withdraw */}
                {withdrawMode === 'withdraw' && withdrawMethod && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => setWithdrawStep('method')}
                      style={{ color: 'rgba(100,160,255,0.7)', fontSize: '13px', fontWeight: 600 }}>
                      ← {withdrawMethod === 'cryptobot' ? 'Crypto Bot' : 'TonKeeper'}
                    </button>
                  </div>
                )}

                {/* Percentage presets */}
                <div className="grid grid-cols-4 gap-2">
                  {[25, 50, 75, 100].map(pct => {
                    const val = ((refBalance * pct) / 100).toFixed(2)
                    const isSelected = withdrawAmt === val
                    return (
                      <button key={pct} onClick={() => setWithdrawAmt(val)}
                        className="py-2.5 rounded-[12px] flex flex-col items-center gap-0.5 transition-all active:scale-[0.95] touch-manipulation"
                        style={isSelected ? {
                          background: withdrawMode === 'withdraw' ? 'rgba(255,255,255,0.15)' : 'rgba(0,180,70,0.15)',
                          border: `1px solid ${withdrawMode === 'withdraw' ? 'rgba(255,255,255,0.35)' : 'rgba(0,220,80,0.4)'}`,
                        } : {
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.07)',
                        }}>
                        <span style={{ fontSize: '13px', fontWeight: 800, color: isSelected ? (withdrawMode === 'withdraw' ? '#fff' : '#4dffa0') : 'rgba(255,255,255,0.5)' }}>{pct}%</span>
                        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.28)', fontVariantNumeric: 'tabular-nums' }}>${val}</span>
                      </button>
                    )
                  })}
                </div>

                {/* Amount input */}
                <div className="flex items-center gap-3 px-4 py-3 rounded-[16px]"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '20px', fontWeight: 700 }}>$</span>
                  <input
                    type="number" min="0.01" max={refBalance} step="0.01"
                    value={withdrawAmt}
                    onChange={e => setWithdrawAmt(e.target.value)}
                    placeholder="0.00"
                    className="flex-1 bg-transparent outline-none text-white text-[20px] font-bold"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  />
                  {withdrawAmt && (
                    <button onClick={() => setWithdrawAmt('')} style={{ color: 'rgba(255,255,255,0.3)', fontSize: '16px', padding: '2px 6px' }}>×</button>
                  )}
                </div>

                {/* Wallet address (only for withdraw) */}
                {withdrawMode === 'withdraw' && (
                  <div>
                    <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '8px' }}>
                      {withdrawMethod === 'cryptobot' ? 'Имя пользователя в CryptoBot (или TG @username)' : 'TON кошелёк'}
                    </p>
                    <div className="flex items-center gap-3 px-4 py-3 rounded-[16px]"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <input
                        type="text"
                        value={withdrawWallet}
                        onChange={e => setWithdrawWallet(e.target.value)}
                        placeholder={withdrawMethod === 'cryptobot' ? '@username' : 'EQ...'}
                        className="flex-1 bg-transparent outline-none text-white text-[15px] font-medium"
                        style={{ fontFamily: 'monospace' }}
                      />
                    </div>
                  </div>
                )}

                {withdrawError && (
                  <p style={{ color: '#ff6b87', fontSize: '12px', textAlign: 'center' }}>{withdrawError}</p>
                )}

                {/* Confirm button */}
                <button
                  disabled={!withdrawAmt || Number(withdrawAmt) <= 0 || Number(withdrawAmt) > refBalance || withdrawLoading || (withdrawMode === 'withdraw' && !withdrawWallet.trim())}
                  onClick={confirmWithdraw}
                  className="w-full py-[15px] rounded-[16px] flex items-center justify-center transition-all active:scale-[0.97] disabled:opacity-40 touch-manipulation"
                  style={withdrawMode === 'withdraw' ? {
                    background: '#ffffff',
                    boxShadow: '0 4px 18px rgba(0,0,0,0.3)',
                  } : {
                    background: 'linear-gradient(135deg, #0a5c2a 0%, #073d1c 100%)',
                    border: '1px solid rgba(0,200,80,0.3)',
                    boxShadow: '0 4px 16px rgba(0,100,40,0.4)',
                  }}>
                  {withdrawLoading
                    ? <span className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(0,0,0,0.2)', borderTopColor: withdrawMode === 'withdraw' ? '#000' : '#4dffa0' }} />
                    : <span style={{ fontSize: '15px', fontWeight: 800, color: withdrawMode === 'withdraw' ? '#0a1f50' : '#4dffa0' }}>
                        {withdrawMode === 'withdraw' ? 'Вывести' : 'Перевести в баланс'}
                        {withdrawAmt && Number(withdrawAmt) > 0 ? ` $${Number(withdrawAmt).toFixed(2)}` : ''}
                      </span>
                  }
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* ══ Refs modal ════════════════════════════════════════════════════════ */}
      {showRefsModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-end"
          style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(10px)' }}
          onClick={() => setShowRefsModal(false)}>
          <div className="w-full rounded-t-[28px] animate-sheet"
            style={{
              background: 'rgba(9,12,38,0.98)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderBottom: 'none',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
              maxHeight: '70vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
            }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '12px', paddingBottom: '4px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
            </div>

            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <p style={{ color: 'rgba(180,210,255,0.4)', fontSize: '10px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase' }}>
                  Рефералы
                </p>
                <p style={{ color: '#fff', fontSize: '20px', fontWeight: 800, letterSpacing: '-0.5px', marginTop: '2px' }}>
                  {activeRefs} приглашённых
                </p>
              </div>
              <button onClick={() => setShowRefsModal(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', fontSize: '18px' }}>×</button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }} className="pb-2">
              {refUsers.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10 px-5">
                  <p style={{ fontSize: '36px' }}>👥</p>
                  <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '14px', fontWeight: 600 }}>Пока нет рефералов</p>
                  <p style={{ color: 'rgba(255,255,255,0.15)', fontSize: '12px', textAlign: 'center', lineHeight: 1.5 }}>
                    Поделись своей ссылкой, и здесь появятся приглашённые пользователи
                  </p>
                </div>
              ) : (
                <div className="flex flex-col">
                  {refUsers.map((ref, i) => {
                    const displayName = ref.username ? `@${ref.username}` : ref.first_name ?? `#${ref.tg_user_id}`
                    const mapKey = `#${ref.tg_user_id}`
                    const earned = earnedMap[mapKey] ?? 0
                    const hasDeposit = ref.total_deposited > 0
                    const code = (displayName.charCodeAt(0) ?? 65) % 5
                    const avatarColors = [
                      { bg: 'rgba(77,159,255,0.15)', border: 'rgba(77,159,255,0.3)', color: '#60b0ff' },
                      { bg: 'rgba(0,255,170,0.1)',   border: 'rgba(0,255,170,0.25)',  color: '#00ffaa' },
                      { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)', color: '#f59e0b' },
                      { bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.25)', color: '#a855f7' },
                      { bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.22)',  color: '#f87171' },
                    ]
                    const av = avatarColors[code]
                    return (
                      <div key={ref.tg_user_id} style={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        padding: '12px 20px',
                        borderBottom: i < refUsers.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                      }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%',
                          background: av.bg, border: `1px solid ${av.border}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          <span style={{ fontSize: '14px', fontWeight: 800, color: av.color }}>
                            {(displayName[0] ?? '?').toUpperCase()}
                          </span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {displayName}
                          </p>
                          <p style={{ fontSize: '10px', color: hasDeposit ? 'rgba(0,255,170,0.6)' : 'rgba(255,255,255,0.25)', marginTop: '1px' }}>
                            {hasDeposit ? `Пополнил $${ref.total_deposited.toFixed(2)}` : 'Ещё не пополнял'}
                          </p>
                        </div>
                        {earned > 0 && (
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <p style={{ fontSize: '8px', fontWeight: 800, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'rgba(0,255,170,0.5)', marginBottom: '2px' }}>
                              Заработано
                            </p>
                            <p style={{ fontSize: '12px', fontWeight: 800, color: '#00ffaa', fontVariantNumeric: 'tabular-nums' }}>
                              +${earned.toFixed(2)}
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  )
}
