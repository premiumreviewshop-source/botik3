import { useState, useEffect, useCallback } from 'react'
import { useApp } from '../store/app'
import { supabase } from '../lib/supabase'

const tgId = () => (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id
  ?? (window as any).__tgUserId
  ?? 0

async function adminCall<T>(action: string, params?: object): Promise<T> {
  const initData = (window as any).Telegram?.WebApp?.initData ?? ''
  const { data, error } = await supabase.functions.invoke<T>('admin', {
    body: { action, callerTgId: tgId(), initData, ...params },
  })
  if (error) {
    // Try to extract actual error message from response body
    let msg = error.message
    try {
      const ctx = (error as any).context
      if (ctx) {
        const body = typeof ctx.json === 'function' ? await ctx.json() : null
        if (body?.error) msg = body.error
      }
    } catch {}
    throw new Error(msg)
  }
  if ((data as any)?.error) throw new Error((data as any).error)
  return data as T
}

function Pill({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex-1 rounded-[18px] p-4 flex flex-col gap-1"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.35)]">{label}</p>
      <p className="text-[28px] font-black leading-none">{value}</p>
      {sub && <p className="text-[10px] text-[rgba(255,255,255,0.3)]">{sub}</p>}
    </div>
  )
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="px-4 py-2 rounded-[12px] text-[13px] font-bold transition-all"
      style={active ? {
        background: 'rgba(167,139,250,0.2)',
        color: '#a78bfa',
        border: '1px solid rgba(167,139,250,0.3)',
      } : {
        color: 'rgba(255,255,255,0.4)',
        border: '1px solid transparent',
      }}>
      {label}
    </button>
  )
}

type Tab = 'overview' | 'users' | 'transactions' | 'treasury' | 'admins'

interface AdminUser {
  tgId: string; username: string | null; firstName: string | null; lastName: string | null; balance: number; banned: boolean
}
interface AdminTx {
  id: string; tg_user_id: string; type: string; amount: number; description: string; created_at: string
}
interface TreasuryData {
  total: number
  recentTopups: { tg_user_id: string; amount: number; created_at: string; description: string }[]
  topDepositors: { tgId: string; amount: number }[]
}

export default function Admin() {
  const { user, navigate, isAdmin } = useApp()
  const [tab, setTab] = useState<Tab>('overview')

  // Overview
  const [stats, setStats] = useState<{ totalUsers: number; onlineUsers: number; totalDeposited: number } | null>(null)
  const [maintenanceOn, setMaintenanceOn] = useState(false)
  const [maintenanceMsg, setMaintenanceMsg] = useState('')
  const [maintenanceLoading, setMaintenanceLoading] = useState(false)
  // Broadcast
  const [broadcastTarget, setBroadcastTarget] = useState('all')
  const [broadcastMsg, setBroadcastMsg] = useState('')
  const [broadcastAmt, setBroadcastAmt] = useState('')
  const [broadcastLoading, setBroadcastLoading] = useState(false)

  // Users
  const [users, setUsers] = useState<AdminUser[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [actionSheet, setActionSheet] = useState<AdminUser | null>(null)
  const [adjustAmt, setAdjustAmt] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  // Transactions
  const [txList, setTxList] = useState<AdminTx[]>([])

  // Treasury
  const [treasury, setTreasury] = useState<TreasuryData | null>(null)

  // Admins
  const [adminList, setAdminList] = useState<{ tg_user_id: string; note?: string; granted_by?: string }[]>([])
  const [newAdminId, setNewAdminId] = useState('')
  const [newAdminNote, setNewAdminNote] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadStats = useCallback(async () => {
    setLoading(true)
    try {
      const d = await adminCall<{ totalUsers: number; onlineUsers: number; totalDeposited: number }>('stats')
      setStats(d)
      const m = await adminCall<{ maintenance: boolean; message: string }>('get_maintenance')
      setMaintenanceOn(m?.maintenance ?? false)
      setMaintenanceMsg(m?.message ?? '')
    } catch (e) { setError(String(e)) } finally { setLoading(false) }
  }, [])

  const toggleMaintenance = async () => {
    setMaintenanceLoading(true)
    try {
      await adminCall('set_maintenance', { enabled: !maintenanceOn, message: maintenanceMsg || undefined })
      setMaintenanceOn(v => !v)
    } catch (e) { alert(String(e)) } finally { setMaintenanceLoading(false) }
  }

  const sendBroadcast = async () => {
    if (!broadcastMsg.trim() && !broadcastAmt.trim()) return
    setBroadcastLoading(true)
    try {
      const r = await adminCall<{ ok: boolean; count: number }>('send_notification', {
        targetTgId: broadcastTarget === 'all' ? 'all' : broadcastTarget,
        message: broadcastMsg.trim() || undefined,
        amount: broadcastAmt ? Number(broadcastAmt) : undefined,
        type: 'announcement',
      })
      alert(`Отправлено: ${r?.count ?? 0} пользователям`)
      setBroadcastMsg('')
      setBroadcastAmt('')
    } catch (e) { alert(String(e)) } finally { setBroadcastLoading(false) }
  }

  const loadUsers = useCallback(async (search = '') => {
    setLoading(true)
    try {
      const d = await adminCall<{ users: AdminUser[] }>('users', { search })
      setUsers(d.users)
    } catch (e) { setError(String(e)) } finally { setLoading(false) }
  }, [])

  const loadTx = useCallback(async () => {
    setLoading(true)
    try {
      const d = await adminCall<{ transactions: AdminTx[] }>('transactions')
      setTxList(d.transactions)
    } catch (e) { setError(String(e)) } finally { setLoading(false) }
  }, [])

  const loadTreasury = useCallback(async () => {
    setLoading(true)
    try {
      const d = await adminCall<TreasuryData>('treasury')
      setTreasury(d)
    } catch (e) { setError(String(e)) } finally { setLoading(false) }
  }, [])

  const loadAdmins = useCallback(async () => {
    setLoading(true)
    try {
      const d = await adminCall<{ admins: any[] }>('list_admins')
      setAdminList(d.admins)
    } catch (e) { setError(String(e)) } finally { setLoading(false) }
  }, [])

  const handleAddAdmin = async () => {
    if (!newAdminId.trim()) return
    setActionLoading(true)
    try {
      await adminCall('add_admin', { targetTgId: newAdminId.trim(), note: newAdminNote || undefined })
      setNewAdminId(''); setNewAdminNote('')
      loadAdmins()
    } catch (e) { alert(String(e)) } finally { setActionLoading(false) }
  }

  const handleRemoveAdmin = async (tgId: string) => {
    if (!confirm(`Убрать права у ${tgId}?`)) return
    await adminCall('remove_admin', { targetTgId: tgId }).catch(e => alert(String(e)))
    loadAdmins()
  }

  useEffect(() => {
    if (tab === 'overview') loadStats()
    else if (tab === 'users') loadUsers()
    else if (tab === 'transactions') loadTx()
    else if (tab === 'treasury') loadTreasury()
    else if (tab === 'admins') loadAdmins()
  }, [tab])

  const handleSearchChange = (v: string) => {
    setUserSearch(v)
    if (searchTimeout) clearTimeout(searchTimeout)
    setSearchTimeout(setTimeout(() => loadUsers(v), 400))
  }

  const handleBan = async (u: AdminUser, ban: boolean) => {
    setActionLoading(true)
    try {
      await adminCall('ban', { targetTgId: u.tgId, banned: ban })
      setUsers(prev => prev.map(x => x.tgId === u.tgId ? { ...x, banned: ban } : x))
      setActionSheet(prev => prev?.tgId === u.tgId ? { ...prev, banned: ban } : prev)
    } catch (e) { alert(String(e)) } finally { setActionLoading(false) }
  }

  const handleAdjust = async () => {
    if (!actionSheet || !adjustAmt) return
    setActionLoading(true)
    try {
      await adminCall('adjust_balance', { targetTgId: actionSheet.tgId, amount: Number(adjustAmt), note: adjustNote || undefined })
      const n = Number(adjustAmt)
      setUsers(prev => prev.map(x => x.tgId === actionSheet.tgId ? { ...x, balance: x.balance + n } : x))
      setActionSheet(prev => prev ? { ...prev, balance: prev.balance + n } : prev)
      setAdjustAmt('')
      setAdjustNote('')
      alert('Done')
    } catch (e) { alert(String(e)) } finally { setActionLoading(false) }
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
        <p className="text-[48px]">🔒</p>
        <p className="text-[16px] font-bold text-[rgba(255,255,255,0.5)]">Access denied</p>
        <p className="text-[12px] text-[rgba(255,255,255,0.25)]">ID: {user.id} · @{user.username ?? '—'}</p>
        <button onClick={() => navigate('settings')} className="text-[13px] text-[rgba(255,255,255,0.3)] underline">Back</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col pb-6">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <button onClick={() => navigate('settings')}
          className="w-9 h-9 rounded-[12px] flex items-center justify-center text-[18px] font-bold"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
          ←
        </button>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(167,139,250,0.5)]">Admin</p>
          <h1 className="text-[20px] font-black leading-tight">Панель</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 px-5 pb-4 overflow-x-auto scrollbar-none">
        <TabBtn label="Обзор" active={tab === 'overview'} onClick={() => setTab('overview')} />
        <TabBtn label="Пользователи" active={tab === 'users'} onClick={() => setTab('users')} />
        <TabBtn label="Транзакции" active={tab === 'transactions'} onClick={() => setTab('transactions')} />
        <TabBtn label="Казна" active={tab === 'treasury'} onClick={() => setTab('treasury')} />
        <TabBtn label="Админы" active={tab === 'admins'} onClick={() => setTab('admins')} />
      </div>

      {error && (
        <div className="mx-5 mb-4 p-3 rounded-[14px] text-[13px] text-[#ff7088]"
          style={{ background: 'rgba(255,112,136,0.08)', border: '1px solid rgba(255,112,136,0.2)' }}>
          {error}
        </div>
      )}

      {loading && !stats && !users.length && !txList.length && !treasury && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-[rgba(167,139,250,0.3)] border-t-[#a78bfa] rounded-full animate-spin" />
        </div>
      )}

      {/* Overview Tab */}
      {tab === 'overview' && stats && (
        <div className="px-5 flex flex-col gap-4 animate-reveal-up">
          <div className="flex gap-3">
            <Pill label="Всего юзеров" value={stats.totalUsers} />
            <Pill label="Онлайн (2ч)" value={stats.onlineUsers} />
          </div>
          <Pill label="Заработано" value={`$${stats.totalDeposited.toFixed(2)}`} sub="Все пополнения" />

          {/* Maintenance toggle */}
          <div className="flex items-center gap-3 p-4 rounded-[18px]"
            style={{ background: maintenanceOn ? 'rgba(255,112,136,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${maintenanceOn ? 'rgba(255,112,136,0.25)' : 'rgba(255,255,255,0.07)'}` }}>
            <div className="flex-1">
              <p className="text-[13px] font-bold text-white">Режим техработ</p>
              <p className="text-[11px] text-[rgba(255,255,255,0.4)]">Сайт виден только админам</p>
            </div>
            <button onClick={toggleMaintenance} disabled={maintenanceLoading}
              className="px-4 py-2 rounded-[10px] text-[13px] font-bold transition-all disabled:opacity-40"
              style={maintenanceOn ? {
                background: 'rgba(255,112,136,0.15)', color: '#ff7088', border: '1px solid rgba(255,112,136,0.3)',
              } : {
                background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)',
              }}>
              {maintenanceOn ? '⚠️ Вкл' : '✓ Выкл'}
            </button>
          </div>
          {maintenanceOn && (
            <input value={maintenanceMsg} onChange={e => setMaintenanceMsg(e.target.value)}
              onBlur={() => adminCall('set_maintenance', { enabled: true, message: maintenanceMsg }).catch(() => {})}
              placeholder="Текст сообщения для пользователей..."
              className="w-full px-4 py-3 rounded-[14px] text-[13px] outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
          )}

          {/* Broadcast */}
          <div className="p-4 rounded-[18px] flex flex-col gap-2"
            style={{ background: 'rgba(167,139,250,0.05)', border: '1px solid rgba(167,139,250,0.2)' }}>
            <p className="text-[11px] font-black uppercase tracking-[2px] text-[rgba(167,139,250,0.6)]">Объявление</p>
            <input value={broadcastTarget} onChange={e => setBroadcastTarget(e.target.value)}
              placeholder='Кому: "all" или TG ID'
              className="w-full px-3 py-2.5 rounded-[12px] text-[13px] outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'white' }} />
            <input value={broadcastAmt} onChange={e => setBroadcastAmt(e.target.value)} type="number"
              placeholder="Сумма (необязательно, + или -)"
              className="w-full px-3 py-2.5 rounded-[12px] text-[13px] outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'white' }} />
            <textarea value={broadcastMsg} onChange={e => setBroadcastMsg(e.target.value)}
              placeholder="Текст сообщения..."
              rows={3}
              className="w-full px-3 py-2.5 rounded-[12px] text-[13px] outline-none resize-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'white' }} />
            <button onClick={sendBroadcast} disabled={broadcastLoading || (!broadcastMsg.trim() && !broadcastAmt)}
              className="w-full py-3 rounded-[12px] text-[14px] font-bold disabled:opacity-40"
              style={{ background: 'rgba(167,139,250,0.2)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)' }}>
              {broadcastLoading ? '...' : 'Отправить'}
            </button>
          </div>
        </div>
      )}

      {/* Users Tab */}
      {tab === 'users' && (
        <div className="px-5 flex flex-col gap-3 animate-reveal-up">
          <input
            value={userSearch}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Поиск по нику или ID..."
            className="w-full px-4 py-3 rounded-[14px] text-[14px] font-medium outline-none"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'white',
            }}
          />
          {users.map(u => (
            <button key={u.tgId} onClick={() => { setActionSheet(u); setAdjustAmt(''); setAdjustNote('') }}
              className="flex items-center gap-3 p-3.5 rounded-[16px] text-left transition-all active:scale-[0.98]"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="w-10 h-10 rounded-[13px] flex items-center justify-center text-[16px] font-black flex-shrink-0"
                style={{ background: u.banned ? 'rgba(255,112,136,0.15)' : 'rgba(167,139,250,0.12)', color: u.banned ? '#ff7088' : '#a78bfa' }}>
                {u.username ? u.username[0].toUpperCase() : '#'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold truncate">
                  {u.username ? `@${u.username}` : (u.firstName || `User #${u.tgId.slice(-4)}`)}
                  {u.banned && <span className="ml-2 text-[11px] text-[#ff7088]">banned</span>}
                </p>
                <p className="text-[11px] text-[rgba(255,255,255,0.3)]">
                  ID: {u.tgId}
                  {u.firstName && u.username ? ` · ${u.firstName}${u.lastName ? ' ' + u.lastName : ''}` : ''}
                </p>
              </div>
              <span className="text-[14px] font-black text-[#00ffaa]">${u.balance.toFixed(2)}</span>
            </button>
          ))}
          {users.length === 0 && !loading && (
            <p className="text-center text-[14px] text-[rgba(255,255,255,0.3)] py-8">Нет пользователей</p>
          )}
        </div>
      )}

      {/* Transactions Tab */}
      {tab === 'transactions' && (
        <div className="px-5 flex flex-col gap-2 animate-reveal-up">
          {txList.map(tx => (
            <div key={tx.id} className="flex items-center gap-3 p-3 rounded-[14px]"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="w-8 h-8 rounded-[10px] flex items-center justify-center text-[12px] font-black flex-shrink-0"
                style={{
                  background: tx.type === 'topup' ? 'rgba(0,255,170,0.1)' : tx.type === 'spend' ? 'rgba(255,112,136,0.1)' : 'rgba(255,180,50,0.1)',
                  color: tx.type === 'topup' ? '#00ffaa' : tx.type === 'spend' ? '#ff7088' : '#ffb432',
                }}>
                {tx.type === 'topup' ? '↑' : tx.type === 'spend' ? '↓' : '◈'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold truncate">{tx.description || tx.type}</p>
                <p className="text-[10px] text-[rgba(255,255,255,0.3)]">
                  ID:{tx.tg_user_id} · {tx.created_at ? new Date(tx.created_at).toLocaleDateString('ru') : ''}
                </p>
              </div>
              <span className="text-[13px] font-black" style={{ color: tx.type === 'spend' ? '#ff7088' : '#00ffaa' }}>
                {tx.type === 'spend' ? '-' : '+'}${Number(tx.amount).toFixed(2)}
              </span>
            </div>
          ))}
          {txList.length === 0 && !loading && (
            <p className="text-center text-[14px] text-[rgba(255,255,255,0.3)] py-8">Транзакций нет</p>
          )}
        </div>
      )}

      {/* Treasury Tab */}
      {tab === 'treasury' && treasury && (
        <div className="px-5 flex flex-col gap-4 animate-reveal-up">
          <div className="p-5 rounded-[20px]"
            style={{ background: 'rgba(0,255,170,0.05)', border: '1px solid rgba(0,255,170,0.18)' }}>
            <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(0,255,170,0.5)] mb-1">Всего заработано</p>
            <p className="text-[40px] font-black text-[#00ffaa]">${treasury.total.toFixed(2)}</p>
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.3)] mb-2">Топ 10 пополнений</p>
            <div className="flex flex-col gap-2">
              {treasury.topDepositors.map((d, i) => (
                <div key={d.tgId} className="flex items-center gap-3 p-3 rounded-[14px]"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <span className="text-[13px] font-black w-6 text-center" style={{ color: i < 3 ? '#ffb800' : 'rgba(255,255,255,0.3)' }}>
                    {i + 1}
                  </span>
                  <p className="flex-1 text-[13px] font-semibold text-[rgba(255,255,255,0.7)]">ID: {d.tgId}</p>
                  <span className="text-[13px] font-black text-[#00ffaa]">${d.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.3)] mb-2">Последние пополнения</p>
            <div className="flex flex-col gap-1.5">
              {treasury.recentTopups.slice(0, 20).map((t, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-[12px]"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <p className="flex-1 text-[12px] text-[rgba(255,255,255,0.5)] truncate">{t.description || `ID:${t.tg_user_id}`}</p>
                  <span className="text-[12px] font-bold text-[#00ffaa]">+${Number(t.amount).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Admins Tab */}
      {tab === 'admins' && (
        <div className="px-5 flex flex-col gap-4 animate-reveal-up">
          <div className="p-4 rounded-[16px]" style={{ background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.2)' }}>
            <p className="text-[11px] font-black uppercase tracking-[2px] text-[rgba(167,139,250,0.6)] mb-3">Добавить админа</p>
            <input value={newAdminId} onChange={e => setNewAdminId(e.target.value)}
              placeholder="Telegram ID пользователя"
              className="w-full px-3 py-3 rounded-[12px] text-[14px] outline-none mb-2"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
            <input value={newAdminNote} onChange={e => setNewAdminNote(e.target.value)}
              placeholder="Комментарий (опционально)"
              className="w-full px-3 py-2.5 rounded-[12px] text-[13px] outline-none mb-3"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'white' }} />
            <button onClick={handleAddAdmin} disabled={!newAdminId.trim() || actionLoading}
              className="w-full py-3 rounded-[12px] text-[14px] font-bold disabled:opacity-40"
              style={{ background: 'rgba(167,139,250,0.2)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)' }}>
              Дать права
            </button>
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.3)] mb-2">
              Текущие админы {adminList.length > 0 && `(${adminList.length})`}
            </p>
            {adminList.length === 0 && !loading && (
              <p className="text-[13px] text-[rgba(255,255,255,0.25)] text-center py-6">
                Пока нет. Сначала создай таблицу:
                {'\n'}
                <span className="text-[11px] font-mono text-[rgba(167,139,250,0.5)]">
                  CREATE TABLE admins (tg_user_id TEXT PRIMARY KEY, granted_by TEXT, note TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
                </span>
              </p>
            )}
            {adminList.map(a => (
              <div key={a.tg_user_id} className="flex items-center gap-3 p-3 mb-1.5 rounded-[14px]"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="w-8 h-8 rounded-[10px] flex items-center justify-center text-[14px]"
                  style={{ background: 'rgba(167,139,250,0.12)', color: '#a78bfa' }}>A</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold">ID: {a.tg_user_id}</p>
                  {a.note && <p className="text-[11px] text-[rgba(255,255,255,0.35)] truncate">{a.note}</p>}
                </div>
                <button onClick={() => handleRemoveAdmin(a.tg_user_id)}
                  className="px-3 py-1.5 rounded-[10px] text-[12px] font-bold"
                  style={{ background: 'rgba(255,112,136,0.1)', color: '#ff7088', border: '1px solid rgba(255,112,136,0.2)' }}>
                  Убрать
                </button>
              </div>
            ))}
          </div>

          <div className="p-3 rounded-[14px]" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-[11px] text-[rgba(255,255,255,0.3)]">Твой TG ID: <span className="font-black text-white">{user.id}</span></p>
            <p className="text-[11px] text-[rgba(255,255,255,0.3)] mt-0.5">Username: <span className="text-white">@{user.username ?? '—'}</span></p>
          </div>
        </div>
      )}

      {/* User action sheet */}
      {actionSheet && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setActionSheet(null)}
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full rounded-t-[24px] px-5 pt-5 animate-sheet"
            style={{ background: 'rgba(14,16,30,0.98)', border: '1px solid rgba(255,255,255,0.08)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex justify-center mb-4">
              <div className="w-10 h-1 rounded-full bg-[rgba(255,255,255,0.15)]" />
            </div>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-[14px] flex items-center justify-center text-[20px] font-black"
                style={{ background: 'rgba(167,139,250,0.12)', color: '#a78bfa' }}>
                {actionSheet.username ? actionSheet.username[0].toUpperCase() : '#'}
              </div>
              <div>
                <p className="text-[16px] font-bold">{actionSheet.username ? `@${actionSheet.username}` : actionSheet.firstName ?? 'User'}</p>
                <p className="text-[12px] text-[rgba(255,255,255,0.35)]">ID: {actionSheet.tgId} · Баланс: ${actionSheet.balance.toFixed(2)}</p>
              </div>
            </div>

            {/* Adjust balance */}
            <p className="text-[11px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.3)] mb-2">Изменить баланс</p>
            <div className="flex gap-2 mb-2">
              <input value={adjustAmt} onChange={e => setAdjustAmt(e.target.value)} type="number"
                placeholder="Сумма (+ или -)" className="flex-1 px-3 py-3 rounded-[12px] text-[14px] outline-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
              <button onClick={handleAdjust} disabled={!adjustAmt || actionLoading}
                className="px-5 py-3 rounded-[12px] text-[14px] font-bold disabled:opacity-40"
                style={{ background: '#00ffaa', color: '#020202' }}>
                OK
              </button>
            </div>
            <input value={adjustNote} onChange={e => setAdjustNote(e.target.value)}
              placeholder="Комментарий (опционально)" className="w-full px-3 py-2.5 rounded-[12px] text-[13px] outline-none mb-4"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'white' }} />

            {/* Ban / unban */}
            <button onClick={() => handleBan(actionSheet, !actionSheet.banned)} disabled={actionLoading}
              className="w-full py-3.5 rounded-[14px] text-[14px] font-bold disabled:opacity-40"
              style={actionSheet.banned ? {
                background: 'rgba(0,255,170,0.1)',
                border: '1px solid rgba(0,255,170,0.3)',
                color: '#00ffaa',
              } : {
                background: 'rgba(255,112,136,0.1)',
                border: '1px solid rgba(255,112,136,0.3)',
                color: '#ff7088',
              }}>
              {actionSheet.banned ? 'Разбанить' : 'Забанить'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
