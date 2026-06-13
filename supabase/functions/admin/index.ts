import { corsHeaders } from '../_shared/cors.ts'
import { db } from '../_shared/db.ts'
import { verifyInitData } from '../_shared/auth.ts'

const respond = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

// ── Auth ──────────────────────────────────────────────────────────────────────

async function requireAuth(initData: unknown, botToken: string): Promise<string | Response> {
  const raw = String(initData ?? '').trim()
  if (!raw) return respond({ error: 'Telegram authentication required' }, 401)
  if (!botToken) return respond({ error: 'Server misconfiguration' }, 500)
  try {
    return await verifyInitData(raw, botToken)
  } catch (e) {
    return respond({ error: `Auth failed: ${(e as Error).message}` }, 403)
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function isAdmin(id: string): Promise<boolean> {
  const envIds = (Deno.env.get('ADMIN_TG_IDS') ?? '').split(',').map((s: string) => s.trim()).filter(Boolean)
  if (envIds.includes(id)) return true
  try {
    const { data } = await db.from('admins').select('tg_user_id').eq('tg_user_id', id).maybeSingle()
    return !!data
  } catch { return false }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const { action } = body
    const botToken = Deno.env.get('PLATFORM_BOT_TOKEN') ?? Deno.env.get('BOT_TOKEN') ?? ''

    // ── Public — no auth required ─────────────────────────────────────────────

    if (action === 'get_maintenance') {
      try {
        const { data: m } = await db.from('platform_settings').select('value').eq('key', 'maintenance_mode').maybeSingle()
        const { data: msg } = await db.from('platform_settings').select('value').eq('key', 'maintenance_message').maybeSingle()
        return respond({ maintenance: (m as any)?.value === 'true', message: (msg as any)?.value ?? 'Идут технические работы. Скоро вернёмся!' })
      } catch { return respond({ maintenance: false, message: '' }) }
    }

    // Returns boolean — no sensitive data, safe to keep open
    if (action === 'check_admin') {
      const callerStr = String(body.callerTgId ?? '').trim()
      if (!callerStr) return respond({ isAdmin: false })
      const admin = await isAdmin(callerStr)
      return respond({ isAdmin: admin })
    }

    // ── Authenticated user actions (require valid initData) ───────────────────

    if (action === 'save_profile') {
      const authResult = await requireAuth(body.initData, botToken)
      if (authResult instanceof Response) return authResult
      const verifiedId = authResult

      const { username, firstName, lastName } = body as any
      await db.from('users').upsert({
        tg_user_id: verifiedId,
        username: username ?? null,
        first_name: firstName ?? null,
        last_name: lastName ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tg_user_id' })
      return respond({ ok: true })
    }

    if (action === 'get_notifications') {
      const authResult = await requireAuth(body.initData, botToken)
      if (authResult instanceof Response) return authResult
      const uid = authResult

      try {
        const { data } = await db.from('platform_notifications')
          .select('*').eq('tg_user_id', uid).eq('seen', false)
          .order('created_at', { ascending: false }).limit(10)
        return respond({ notifications: data ?? [] })
      } catch { return respond({ notifications: [] }) }
    }

    if (action === 'mark_notification_seen') {
      const authResult = await requireAuth(body.initData, botToken)
      if (authResult instanceof Response) return authResult
      const uid = authResult
      const { notifId } = body as any
      if (!notifId) return respond({ ok: false })
      try {
        await db.from('platform_notifications')
          .update({ seen: true })
          .eq('id', String(notifId))
          .eq('tg_user_id', uid)  // only update own notifications
        return respond({ ok: true })
      } catch { return respond({ ok: false }) }
    }

    // ── Admin actions (require valid initData + admin rights) ─────────────────

    const authResult = await requireAuth(body.initData, botToken)
    if (authResult instanceof Response) return authResult
    const callerStr = authResult

    if (!(await isAdmin(callerStr))) {
      return respond({ error: 'Forbidden' }, 403)
    }

    switch (action) {
      case 'stats': {
        const tables = ['bots', 'transactions', 'ai_models', 'generations', 'posts',
          'content_plan', 'channels', 'saved_prompts', 'saved_footers', 'saved_emojis',
          'ppv_items', 'kling_jobs', 'ai_chat_config', 'users']
        const results = await Promise.all(tables.map(t => db.from(t).select('tg_user_id')))
        const allIds = new Set<string>()
        for (const { data } of results) {
          for (const r of (data ?? []) as any[]) if (r.tg_user_id) allIds.add(String(r.tg_user_id))
        }
        const totalUsers = allIds.size
        const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString()
        const { data: recentUsers } = await db.from('users').select('tg_user_id').gte('updated_at', cutoff)
        const onlineUsers = (recentUsers ?? []).length
        const { data: deposits } = await db.from('transactions').select('amount').eq('type', 'topup')
        const totalDeposited = (deposits ?? []).reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0)
        return respond({ totalUsers, onlineUsers, totalDeposited })
      }

      case 'users': {
        const activityTables = ['bots', 'transactions', 'ai_models', 'generations', 'posts',
          'content_plan', 'channels', 'saved_prompts', 'saved_emojis', 'kling_jobs']
        const activityResults = await Promise.all(activityTables.map(t => db.from(t).select('tg_user_id')))
        const allIds = new Set<string>()
        for (const { data } of activityResults) {
          for (const r of (data ?? []) as any[]) if (r.tg_user_id) allIds.add(String(r.tg_user_id))
        }
        const { data: txData } = await db.from('transactions').select('tg_user_id, type, amount')
        const balanceMap: Record<string, number> = {}
        for (const t of (txData ?? []) as any[]) {
          if (!balanceMap[t.tg_user_id]) balanceMap[t.tg_user_id] = 0
          if (t.type === 'topup') balanceMap[t.tg_user_id] += Number(t.amount) || 0
          else if (t.type === 'spend') balanceMap[t.tg_user_id] -= Math.abs(Number(t.amount) || 0)
        }
        const { data: usersData } = await db.from('users').select('tg_user_id, username, first_name, last_name')
        const nameMap: Record<string, { username?: string; firstName?: string; lastName?: string }> = {}
        for (const r of (usersData ?? []) as any[]) {
          allIds.add(String(r.tg_user_id))
          nameMap[String(r.tg_user_id)] = { username: r.username ?? undefined, firstName: r.first_name ?? undefined, lastName: r.last_name ?? undefined }
        }
        const { data: banned } = await db.from('banned_users').select('tg_user_id')
        const bannedSet = new Set((banned ?? []).map((r: any) => String(r.tg_user_id)))
        const users = Array.from(allIds).map(id => ({
          tgId: id,
          username: nameMap[id]?.username ?? null,
          firstName: nameMap[id]?.firstName ?? null,
          lastName: nameMap[id]?.lastName ?? null,
          balance: balanceMap[id] ?? 0,
          banned: bannedSet.has(id),
        }))
        const search = (body.search ?? '').toLowerCase().trim()
        const filtered = search
          ? users.filter(u =>
              (u.username ?? '').toLowerCase().includes(search) ||
              (u.firstName ?? '').toLowerCase().includes(search) ||
              (u.lastName ?? '').toLowerCase().includes(search) ||
              u.tgId.includes(search))
          : users
        return respond({ users: filtered.sort((a, b) => b.balance - a.balance).slice(0, 200) })
      }

      case 'transactions': {
        const { data } = await db.from('transactions').select('*').order('created_at', { ascending: false }).limit(200)
        return respond({ transactions: data ?? [] })
      }

      case 'ban': {
        const { targetTgId, banned } = body as any
        if (!targetTgId) return respond({ error: 'targetTgId required' }, 400)
        if (banned) {
          await db.from('banned_users').upsert({ tg_user_id: String(targetTgId), updated_at: new Date().toISOString() }, { onConflict: 'tg_user_id' })
        } else {
          await db.from('banned_users').delete().eq('tg_user_id', String(targetTgId))
        }
        return respond({ ok: true })
      }

      case 'adjust_balance': {
        const { targetTgId, amount, note } = body as any
        const n = Number(amount)
        if (!n || !targetTgId) return respond({ error: 'Invalid params' }, 400)
        const _now = new Date()
        const _dateStr = `${_now.getDate().toString().padStart(2,'0')}.${(_now.getMonth()+1).toString().padStart(2,'0')}.${_now.getFullYear()}`
        const txResult: any = await db.from('transactions').insert({
          tg_user_id: String(targetTgId),
          type: n > 0 ? 'topup' : 'spend',
          amount: Math.abs(n),
          description: String(note ?? `Admin: ${n > 0 ? '+' : '-'}$${Math.abs(n).toFixed(2)}`),
          date: _dateStr,
          created_at: _now.toISOString(),
        })
        if (txResult?.error) return respond({ error: String(txResult.error.message ?? txResult.error) }, 500)
        try {
          await db.from('platform_notifications').insert({
            tg_user_id: String(targetTgId), type: 'balance',
            amount: n, message: note ? String(note) : null,
            seen: false, created_at: _now.toISOString(),
          })
        } catch { /* ignore */ }
        return respond({ ok: true })
      }

      case 'set_maintenance': {
        const { enabled, message } = body as any
        const _now = new Date().toISOString()
        await db.from('platform_settings').upsert({ key: 'maintenance_mode', value: enabled ? 'true' : 'false', updated_at: _now }, { onConflict: 'key' })
        if (message !== undefined) {
          await db.from('platform_settings').upsert({ key: 'maintenance_message', value: String(message), updated_at: _now }, { onConflict: 'key' })
        }
        return respond({ ok: true })
      }

      case 'send_notification': {
        const { targetTgId, amount, message, type: nType = 'announcement' } = body as any
        if (!message && !amount) return respond({ error: 'message or amount required' }, 400)
        const _now = new Date().toISOString()
        if (targetTgId === 'all') {
          const { data: allUsers } = await db.from('users').select('tg_user_id')
          const ids = (allUsers ?? []).map((r: any) => String(r.tg_user_id))
          if (ids.length > 0) {
            const { error: nErr } = await db.from('platform_notifications').insert(
              ids.map(id => ({ tg_user_id: id, type: nType, amount: amount ?? null, message: message ?? null, seen: false, created_at: _now }))
            )
            if (nErr) return respond({ error: `DB error: ${nErr.message}` }, 500)
          }
          return respond({ ok: true, count: ids.length })
        }
        if (!targetTgId) return respond({ error: 'targetTgId required' }, 400)
        const { error: nErr2 } = await db.from('platform_notifications').insert({
          tg_user_id: String(targetTgId), type: nType,
          amount: amount ?? null, message: message ?? null,
          seen: false, created_at: _now,
        })
        if (nErr2) return respond({ error: `DB error: ${nErr2.message}` }, 500)
        return respond({ ok: true, count: 1 })
      }

      case 'treasury': {
        const { data: topups } = await db.from('transactions').select('tg_user_id, amount, created_at, description').eq('type', 'topup').order('created_at', { ascending: false }).limit(200)
        const total = (topups ?? []).reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0)
        const byUser: Record<string, number> = {}
        for (const t of (topups ?? []) as any[]) {
          if (!byUser[t.tg_user_id]) byUser[t.tg_user_id] = 0
          byUser[t.tg_user_id] += Number(t.amount) || 0
        }
        const topDepositors = Object.entries(byUser)
          .map(([tgId, amt]) => ({ tgId, amount: amt }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 10)
        return respond({ total, recentTopups: (topups ?? []).slice(0, 50), topDepositors })
      }

      case 'list_admins': {
        try {
          const { data } = await db.from('admins').select('*').order('created_at', { ascending: false })
          return respond({ admins: data ?? [] })
        } catch { return respond({ admins: [] }) }
      }

      case 'add_admin': {
        const { targetTgId, note } = body as any
        if (!targetTgId) return respond({ error: 'targetTgId required' }, 400)
        try {
          await db.from('admins').upsert({
            tg_user_id: String(targetTgId),
            granted_by: callerStr,
            note: note ?? null,
            created_at: new Date().toISOString(),
          }, { onConflict: 'tg_user_id' })
          return respond({ ok: true })
        } catch (e) {
          return respond({ error: `Table may not exist. Run: CREATE TABLE admins (tg_user_id TEXT PRIMARY KEY, granted_by TEXT, note TEXT, created_at TIMESTAMPTZ DEFAULT NOW()); — ${e}` }, 500)
        }
      }

      case 'remove_admin': {
        const { targetTgId } = body as any
        await db.from('admins').delete().eq('tg_user_id', String(targetTgId))
        return respond({ ok: true })
      }

      default:
        return respond({ error: 'Unknown action' }, 400)
    }
  } catch (err) {
    return respond({ error: 'Internal server error' }, 500)
  }
})
