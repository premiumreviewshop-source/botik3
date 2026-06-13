import { corsHeaders } from '../_shared/cors.ts'
import { db } from '../_shared/db.ts'

const STAR_TO_USD = 0.013

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    let period = 'week'
    let botId: string | null = null

    if (req.method === 'POST') {
      try {
        const body = await req.json()
        if (body.period) period = body.period
        if (body.botId) botId = body.botId
      } catch { /* ignore */ }
    } else {
      const url = new URL(req.url)
      period = url.searchParams.get('period') ?? 'week'
      botId = url.searchParams.get('botId') ?? null
    }

    const days = period === 'today' ? 1 : period === 'week' ? 7 : 30
    const sparkDays = period === 'today' ? 24 : Math.min(days, 14)
    const since = new Date(Date.now() - days * 86400_000).toISOString()

    let msgQuery = db.from('tg_updates').select('user_id, ts, bot_id').eq('type', 'message').gte('ts', since)
    if (botId) msgQuery = msgQuery.eq('bot_id', botId)

    const botTokenQuery = botId
      ? db.from('bots').select('token').eq('id', botId)
      : db.from('bots').select('token').eq('is_active', true)

    const [msgRes, postsRes, botsRes, planRes, botTokenRes] = await Promise.all([
      msgQuery,
      db.from('content_plan').select('id', { count: 'exact', head: true }).eq('status', 'published').gte('created_at', since),
      db.from('bots').select('id', { count: 'exact', head: true }).eq('is_active', true),
      db.from('content_plan').select('id', { count: 'exact', head: true }).eq('status', 'scheduled'),
      botTokenQuery,
    ])

    const msgRows = (msgRes.data ?? []) as { user_id: number; ts: string; bot_id: string }[]
    const aiMessages = msgRows.length
    const aiChats = new Set(msgRows.map((r) => r.user_id)).size

    // Spark
    const spark: number[] = []
    const now = Date.now()
    for (let i = 0; i < sparkDays; i++) {
      const bucketMs = period === 'today' ? 3600_000 : 86400_000
      const bucketStart = new Date(now - (sparkDays - 1 - i) * bucketMs)
      const bucketEnd = new Date(bucketStart.getTime() + bucketMs)
      const count = msgRows.filter((r) => r.ts >= bucketStart.toISOString() && r.ts < bucketEnd.toISOString()).length
      spark.push(count)
    }

    // ── Telegram Stars: fetch transactions for all relevant bots ──────────────
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

    // Sort Telegram transactions newest-first
    collectedTxs.sort((a, b) => b.date - a.date)

    // Batch-lookup item titles for ppv: payloads
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

    // Build history from Telegram (complete + real names). Fall back to DB if TG unavailable.
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
      // Fallback: DB-sourced history — only used when Telegram API is unavailable
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

    // ppvRevenue from DB still used for backward compat in overview card
    const ppvRevenue = starsEarned  // use Telegram total as the canonical revenue figure
    const ppvRevenueUsd = +(ppvRevenue * STAR_TO_USD).toFixed(2)

    return new Response(
      JSON.stringify({
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
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
