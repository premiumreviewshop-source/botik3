import { corsHeaders } from '../_shared/cors.ts'
import { db } from '../_shared/db.ts'
import { verifyAuth } from '../_shared/auth.ts'

const STAR_TO_USD = 0.013

const respond = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (req.method !== 'POST') return respond({ error: 'POST required' }, 405)

    const body = await req.json().catch(() => ({}))
    const { initData, period: periodParam = 'week', botId } = body

    const botToken = Deno.env.get('PLATFORM_BOT_TOKEN') ?? Deno.env.get('BOT_TOKEN') ?? ''
    const auth = await verifyAuth(initData, botToken)
    if ('error' in auth) return respond(auth, auth.status)
    const uid = auth.uid

    // Verify bot ownership if botId provided
    if (botId) {
      const { data: botRow } = await db.from('bots').select('tg_user_id').eq('id', botId).single()
      if (!botRow || String(botRow.tg_user_id) !== uid) return respond({ error: 'Forbidden' }, 403)
    }

    const period = String(periodParam)
    const days = period === 'today' ? 1 : period === 'week' ? 7 : 30
    const sparkDays = period === 'today' ? 24 : Math.min(days, 14)
    const since = new Date(Date.now() - days * 86400_000).toISOString()

    // Get user's bot IDs for scoping when no specific bot requested
    let userBotIds: string[] | null = null
    if (!botId) {
      const { data: userBots } = await db.from('bots').select('id').eq('tg_user_id', uid)
      userBotIds = (userBots ?? []).map((b: any) => b.id)
      if (userBotIds.length === 0) {
        return respond({ period, aiMessages: 0, aiChats: 0, aiAvgSec: 0, ppvSold: 0, ppvRevenue: 0, ppvRevenueUsd: 0, ppvViews: 0, postsPublished: 0, postsReach: 0, postsInPlan: 0, botsActive: 0, spark: [], salesHistory: [], starsBalance: 0, starsEarned: 0, starsWithdrawn: 0, messages: 0, uniqueChatters: 0 })
      }
    }

    let msgQuery = db.from('tg_updates').select('user_id, ts, bot_id').eq('type', 'message').gte('ts', since)
    if (botId) {
      msgQuery = msgQuery.eq('bot_id', botId)
    } else {
      msgQuery = msgQuery.in('bot_id', userBotIds!)
    }

    const botTokenQuery = botId
      ? db.from('bots').select('token').eq('id', botId)
      : db.from('bots').select('token').eq('tg_user_id', uid).eq('is_active', true)

    const postsQuery = db.from('content_plan').select('id', { count: 'exact', head: true })
      .eq('status', 'published').gte('created_at', since).eq('tg_user_id', uid)
    const botsQuery = db.from('bots').select('id', { count: 'exact', head: true })
      .eq('is_active', true).eq('tg_user_id', uid)
    const planQuery = db.from('content_plan').select('id', { count: 'exact', head: true })
      .eq('status', 'scheduled').eq('tg_user_id', uid)

    const [msgRes, postsRes, botsRes, planRes, botTokenRes] = await Promise.all([
      msgQuery, postsQuery, botsQuery, planQuery, botTokenQuery,
    ])

    const msgRows = (msgRes.data ?? []) as { user_id: number; ts: string; bot_id: string }[]
    const aiMessages = msgRows.length
    const aiChats = new Set(msgRows.map((r) => r.user_id)).size

    const spark: number[] = []
    const now = Date.now()
    for (let i = 0; i < sparkDays; i++) {
      const bucketMs = period === 'today' ? 3600_000 : 86400_000
      const bucketStart = new Date(now - (sparkDays - 1 - i) * bucketMs)
      const bucketEnd = new Date(bucketStart.getTime() + bucketMs)
      const count = msgRows.filter((r) => r.ts >= bucketStart.toISOString() && r.ts < bucketEnd.toISOString()).length
      spark.push(count)
    }

    interface TxDetail {
      amount: number; date: number
      userId: number | null; firstName: string | null; username: string | null
      payload: string | null
    }
    const collectedTxs: TxDetail[] = []
    let starsEarned = 0
    let starsWithdrawn = 0

    const tokenRows = ((botTokenRes.data ?? []) as { token: string }[])
      .map((r) => r.token).filter(Boolean)

    await Promise.all(tokenRows.map(async (token) => {
      try {
        const txResp = await fetch(`https://api.telegram.org/bot${token}/getStarTransactions?limit=100`)
        if (!txResp.ok) return
        const txData = await txResp.json()
        // deno-lint-ignore no-explicit-any
        const txs = (txData.result?.transactions ?? []) as any[]
        for (const tx of txs) {
          const amt = (tx.amount as number) ?? 0
          if (tx.source) {
            starsEarned += amt
            collectedTxs.push({
              amount: amt,
              date: tx.date as number,
              userId: (tx.source?.user?.id as number | null) ?? null,
              firstName: (tx.source?.user?.first_name as string | null) ?? null,
              username: (tx.source?.user?.username as string | null) ?? null,
              payload: (tx.source?.invoice_payload as string | null) ?? null,
            })
          }
          if (tx.receiver?.type === 'fragment') starsWithdrawn += amt
        }
      } catch { /* ignore */ }
    }))

    const starsBalance = starsEarned - starsWithdrawn
    const tgSalesCount = collectedTxs.length

    collectedTxs.sort((a, b) => b.date - a.date)

    const ppvItemIds = [...new Set(
      collectedTxs
        .map(t => t.payload?.startsWith('ppv:') ? (t.payload.split(':')[1] ?? null) : null)
        .filter(Boolean),
    )] as string[]

    const itemTitleMap: Record<string, string> = {}
    if (ppvItemIds.length > 0) {
      const { data: itemRows } = await db.from('ppv_items').select('id, title').in('id', ppvItemIds)
      for (const row of (itemRows ?? []) as { id: string; title: string }[]) {
        itemTitleMap[row.id] = row.title
      }
    }

    let salesHistory
    if (collectedTxs.length > 0) {
      salesHistory = collectedTxs.slice(0, 50).map((t, i) => {
        const itemId = t.payload?.startsWith('ppv:') ? (t.payload.split(':')[1] ?? null) : null
        return {
          id: `tg_${t.date}_${i}`,
          createdAt: new Date(t.date * 1000).toISOString(),
          tgUserId: t.userId,
          tgFirstName: t.firstName,
          tgUsername: t.username,
          amountStars: t.amount,
          amountUsd: +(t.amount * STAR_TO_USD).toFixed(2),
          itemTitle: itemId ? (itemTitleMap[itemId] ?? null) : null,
        }
      })
    } else {
      let histQuery = db.from('ppv_purchases')
        .select('id, tg_user_id, tg_first_name, tg_username, amount_stars, payload, created_at, ppv_items(title)')
        .order('created_at', { ascending: false }).limit(50)
      if (botId) histQuery = histQuery.eq('bot_id', botId)
      const histRes = await histQuery
      // deno-lint-ignore no-explicit-any
      salesHistory = ((histRes.data ?? []) as any[]).map((r) => ({
        id: r.id as string,
        createdAt: r.created_at as string,
        tgUserId: r.tg_user_id as number | null,
        tgFirstName: (r.tg_first_name as string | null) ?? null,
        tgUsername: (r.tg_username as string | null) ?? null,
        amountStars: (r.amount_stars as number) ?? 0,
        amountUsd: +((r.amount_stars ?? 0) * STAR_TO_USD).toFixed(2),
        itemTitle: (r.ppv_items as { title?: string } | null)?.title ?? null,
      }))
    }

    const ppvRevenue = starsEarned
    const ppvRevenueUsd = +(ppvRevenue * STAR_TO_USD).toFixed(2)

    return respond({
      period,
      aiMessages,
      aiChats,
      aiAvgSec: 0,
      ppvSold: tgSalesCount > 0 ? tgSalesCount : 0,
      ppvRevenue,
      ppvRevenueUsd,
      ppvViews: 0,
      postsPublished: postsRes.count ?? 0,
      postsReach: 0,
      postsInPlan: planRes.count ?? 0,
      botsActive: botsRes.count ?? 0,
      spark,
      salesHistory,
      starsBalance,
      starsEarned,
      starsWithdrawn,
      messages: aiMessages,
      uniqueChatters: aiChats,
    })
  } catch {
    return respond({ error: 'Internal server error' }, 500)
  }
})
