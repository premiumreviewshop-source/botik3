import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../store/app'
import { supabase } from '../lib/supabase'
import NotificationPanel, { type PlatformNotification } from './NotificationPanel'

async function adminCall<T>(action: string, extra?: object): Promise<T> {
  const { data } = await supabase.functions.invoke<T>('admin', { body: { action, ...extra } })
  return data as T
}

export default function PlatformOverlay() {
  const { user, isAdmin } = useApp()
  const [maintenance, setMaintenance] = useState<{ on: boolean; msg: string } | null>(null)
  const [notifications, setNotifications] = useState<PlatformNotification[]>([])
  const seenIds = useRef(new Set<string>())

  const checkMaintenance = async () => {
    try {
      const r = await adminCall<{ maintenance: boolean; message: string }>('get_maintenance', { callerTgId: user.id })
      setMaintenance({ on: !!r?.maintenance, msg: r?.message ?? '' })
    } catch { setMaintenance({ on: false, msg: '' }) }
  }

  const checkNotifications = async () => {
    if (!user.id) return
    const initData = (window as any).Telegram?.WebApp?.initData ?? ''
    if (!initData) return
    try {
      const r = await adminCall<{ notifications: PlatformNotification[] }>('get_notifications', {
        callerTgId: user.id, tgUserId: user.id, initData,
      })
      const fresh = (r?.notifications ?? []).filter(n => !seenIds.current.has(n.id))
      setNotifications(fresh)
    } catch {}
  }

  useEffect(() => {
    checkMaintenance()
    checkNotifications()
    const mId = setInterval(checkMaintenance, 60_000)
    const nId = setInterval(checkNotifications, 6_000)
    const vis = () => { if (!document.hidden) { checkMaintenance(); checkNotifications() } }
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(mId); clearInterval(nId); document.removeEventListener('visibilitychange', vis) }
  }, [user.id])

  const dismissFirst = async () => {
    const n = notifications[0]
    if (!n) return
    seenIds.current.add(n.id)
    setNotifications(prev => prev.slice(1))
    const initData = (window as any).Telegram?.WebApp?.initData ?? ''
    supabase.functions.invoke('admin', { body: { action: 'mark_notification_seen', callerTgId: user.id, notifId: n.id, initData } }).catch(() => {})
  }

  // Maintenance overlay (non-admin users only)
  if (maintenance?.on && !isAdmin) return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#02020a',
      backgroundImage: 'linear-gradient(rgba(0,255,136,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,136,0.04) 1px, transparent 1px)',
      backgroundSize: '38px 38px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{
        width: '100%', maxWidth: '340px', textAlign: 'center',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '28px', padding: '40px 24px',
      }}>
        <p style={{ fontSize: '52px', marginBottom: '20px' }}>🔧</p>
        <p style={{ fontSize: '22px', fontWeight: 900, color: 'white', marginBottom: '10px' }}>
          Технические работы
        </p>
        <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.7 }}>
          {maintenance.msg || 'Скоро вернёмся!'}
        </p>
      </div>
    </div>,
    document.body
  )

  // Notification panel
  if (notifications.length > 0) {
    return <NotificationPanel notification={notifications[0]} onClose={dismissFirst} />
  }

  return null
}
