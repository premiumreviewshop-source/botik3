import { corsHeaders } from '../_shared/cors.ts'
import { db } from '../_shared/db.ts'
import { verifyInitData } from '../_shared/auth.ts'

const STARS_PER_DOLLAR = 1000 / 13
const usdToStars = (usd: number) => Math.round(usd * STARS_PER_DOLLAR)
const MAX_TOPUP_USD = 1000
const MAX_WALLET_LEN = 200

const respond = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

// ── Auth ──────────────────────────────────────────────────────────────────────

// Verify Telegram initData and return the authenticated user ID.
// All user-facing actions MUST call this — no exceptions.
async function requireAuth(body: any, botToken: string): Promise<string | Response> {
  const initData = String(body.initData ?? '').trim()
  if (!initData) return respond({ error: 'Telegram authentication required. Must be called from the Mini App.' }, 401)
  if (!botToken) return respond({ error: 'Server misconfiguration' }, 500)
  try {
    return await verifyInitData(initData, botToken)
  } catch (e) {
    return respond({ error: `Auth failed: ${(e as Error).message}` }, 403)
  }
}

// ── Input validators ──────────────────────────────────────────────────────────

function validUserId(id: unknown): string | null {
  const s = String(id ?? '').trim()
  return /^\d{1,18}$/.test(s) ? s : null
}

function validAmount(amount: unknown, max = MAX_TOPUP_USD): number | null {
  const n = Number(amount)
  return Number.isFinite(n) && n > 0 && n <= max ? n : null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function notifyOwner(text: string) {
  const botToken = Deno.env.get('PLATFORM_BOT_TOKEN') ?? Deno.env.get('BOT_TOKEN') ?? Deno.env.get('TELEGRAM_BOT_TOKEN')
  const ownerId = Deno.env.get('OWNER_TG_ID')
  if (!botToken || !ownerId) return
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: ownerId, text, parse_mode: 'HTML' }),
  }).catch(() => {})
}

async function getUserBalance(tgUserId: string): Promise<number> {
  const { data } = await db.from('transactions').select('type, amount').eq('tg_user_id', tgUserId)
  let bal = 0
  for (const t of (data ?? []) as any[]) {
    if (t.type === 'topup') bal += Number(t.amount) || 0
    else if (t.type === 'spend') bal -= Math.abs(Number(t.amount) || 0)
  }
  return bal
}

async function notifyUser(tgUserId: string, amountUsd: number, newBalance: number, method: string) {
  const botToken = Deno.env.get('PLATFORM_BOT_TOKEN') ?? Deno.env.get('BOT_TOKEN') ?? Deno.env.get('TELEGRAM_BOT_TOKEN')
  if (!botToken) return
  const text = `<b>Поздравляем! Ваш баланс пополнен на +$${amountUsd.toFixed(2)}!<tg-emoji emoji-id="5197434882321567830">💵</tg-emoji></b>\n<blockquote><b>Текущий баланс $${newBalance.toFixed(2)}<tg-emoji emoji-id="5278467510604160626">💰</tg-emoji></b></blockquote>`
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: String(tgUserId), text, parse_mode: 'HTML' }),
  }).catch(() => {})
}

function fmtDate(d: Date): string {
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`
}

async function creditBalance(tgUserId: string, amountUsd: number, desc: string): Promise<boolean> {
  const now = new Date()
  // Use INSERT ... ON CONFLICT DO NOTHING so partial unique index (topup only) works.
  // Returns the inserted row only if it was new (not a duplicate).
  const { data, error } = await db.from('transactions').insert(
    { tg_user_id: String(tgUserId), type: 'topup', amount: amountUsd, description: desc, date: fmtDate(now), created_at: now.toISOString() },
  ).select('id')
  if (error) {
    // Unique violation = already credited (idempotent)
    if ((error as any).code === '23505') return false
    console.error('[creditBalance] error:', error.message)
    return false
  }
  return (data?.length ?? 0) > 0
}

async function payReferralBonus(refereeTgUserId: string, amountUsd: number, topupDesc: string) {
  try {
    const { data: ref } = await db.from('referral_tracking')
      .select('referrer_tg_user_id')
      .eq('referee_tg_user_id', Number(refereeTgUserId))
      .maybeSingle()
    if (!ref?.referrer_tg_user_id) return

    const referrerTgId = String(ref.referrer_tg_user_id)
    const { data: existingRefs } = await db.from('transactions')
      .select('description').eq('tg_user_id', referrerTgId).eq('type', 'referral')
    const uniqueReferees = new Set((existingRefs ?? []).map((r: any) => {
      const m = (r.description as string ?? '').match(/^Реферал (.+?) ·/)
      return m?.[1] ?? ''
    }).filter(Boolean))
    const pct = uniqueReferees.size >= 10 ? 20 : uniqueReferees.size >= 5 ? 15 : 10
    const bonus = Math.round(amountUsd * (pct / 100) * 1000) / 1000

    const now = new Date()
    const { error } = await db.from('transactions').insert({
      tg_user_id: referrerTgId, type: 'referral', amount: bonus,
      description: `Реферал #${refereeTgUserId} · ${topupDesc}`,
      date: fmtDate(now), created_at: now.toISOString(),
    })
    if (error) console.error('[referral] insert error:', error.message)
  } catch (e) {
    console.error('[referral] bonus error:', String(e))
  }
}

// ── Server ────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)
  const cb = url.searchParams.get('cb')

  // ── Webhook: Platform Bot (/start) ────────────────────────────────────────
  if (cb === 'platform') {
    const botToken = Deno.env.get('PLATFORM_BOT_TOKEN')
    if (!botToken) return new Response('ok')
    try {
      const update = await req.json()
      const msg = update.message
      if (msg?.text?.startsWith('/start')) {
        const chatId = msg.chat.id
        const fromId = msg.from?.id as number | undefined
        const startParam = (msg.text as string).split(' ')[1] ?? ''
        if (fromId && startParam.startsWith('ref_')) {
          const referrer = Number(startParam.slice(4))
          if (referrer && referrer !== fromId) {
            await db.from('referral_tracking').upsert(
              { referee_tg_user_id: fromId, referrer_tg_user_id: referrer },
              { onConflict: 'referee_tg_user_id', ignoreDuplicates: true }
            )
          }
        }
        const webappUrl = Deno.env.get('WEBAPP_URL') ?? 'https://botik3.vercel.app'
        const refQuery = startParam.startsWith('ref_') ? `?ref=${startParam.slice(4)}` : ''
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: '👋 <b>Добро пожаловать!</b>\n\nЗдесь вы можете автоматизировать работу с подписчиками и зарабатывать больше с помощью AI.',
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: '🚀 Начать зарабатывать', web_app: { url: `${webappUrl}${refQuery}` } }]] },
          }),
        })
      }
    } catch { /* ignore */ }
    return new Response('ok')
  }

  // ── Webhook: Crypto Bot ───────────────────────────────────────────────────
  if (cb === 'cryptobot') {
    const token = Deno.env.get('CRYPTOBOT_TOKEN') ?? ''
    const bodyText = await req.text()
    if (req.headers.get('crypto-pay-api-token') !== token) return new Response('bad sig', { status: 403 })
    try {
      const update = JSON.parse(bodyText)
      if (update.update_type === 'invoice_paid') {
        const invoice = update.payload
        const payloadStr = invoice.payload as string | undefined
        if (payloadStr?.startsWith('topup:')) {
          const [, userId, amtStr] = payloadStr.split(':')
          const amountUsd = parseFloat(amtStr ?? '0')
          if (userId && amountUsd > 0 && amountUsd <= MAX_TOPUP_USD) {
            const asset = invoice.asset ?? 'USDT'
            const desc = `Crypto Bot · +$${amountUsd} (${asset}) #${invoice.invoice_id}`
            const { data: existing } = await db.from('transactions').select('id').eq('tg_user_id', userId).eq('description', desc).maybeSingle()
            if (!existing) {
              const wasInserted = await creditBalance(userId, amountUsd, desc)
              if (wasInserted) {
                const newBal = await getUserBalance(userId)
                await notifyUser(userId, amountUsd, newBal, `Crypto Bot (${asset})`)
                await notifyOwner(`💰 <b>Пополнение</b>\nПользователь: <code>${userId}</code>\nСумма: <b>+$${amountUsd}</b>\nМетод: Crypto Bot (${asset})`)
                await payReferralBonus(userId, amountUsd, desc)
              }
            }
          }
        }
      }
    } catch { /* ignore */ }
    return new Response('ok')
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  try {
    const body = await req.json()
    const { action, tgUserId, amount, platform } = body
    const botToken = Deno.env.get('PLATFORM_BOT_TOKEN') ?? Deno.env.get('BOT_TOKEN') ?? Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''

    // ── get_transactions  [AUTH REQUIRED] ──────────────────────────────────
    if (action === 'get_transactions') {
      const authResult = await requireAuth(body, botToken)
      if (authResult instanceof Response) return authResult
      const uid = authResult  // use verified identity, ignore body tgUserId
      const { data } = await db.from('transactions')
        .select('*').eq('tg_user_id', uid).order('created_at', { ascending: false })
      return respond({ transactions: data ?? [] })
    }

    // ── track_referral  [AUTH REQUIRED — referee must be the caller] ───────
    if (action === 'track_referral') {
      const authResult = await requireAuth(body, botToken)
      if (authResult instanceof Response) return authResult
      const verifiedId = authResult

      const referee = Number(body.refereeTgUserId)
      const referrer = Number(body.referrerTgUserId)
      if (!referee || !referrer || referee === referrer) return respond({ error: 'Invalid params' }, 400)
      // Enforce: only the actual referee can register themselves
      if (String(referee) !== verifiedId) return respond({ error: 'You can only register yourself as a referee' }, 403)

      const { error } = await db.from('referral_tracking').upsert(
        { referee_tg_user_id: referee, referrer_tg_user_id: referrer },
        { onConflict: 'referee_tg_user_id', ignoreDuplicates: true }
      )
      if (error) return respond({ error: error.message }, 500)
      return respond({ ok: true })
    }

    // ── get_referrals  [AUTH REQUIRED] ─────────────────────────────────────
    if (action === 'get_referrals') {
      const authResult = await requireAuth(body, botToken)
      if (authResult instanceof Response) return authResult
      const uid = authResult  // only return referrals for the authenticated user

      const { data: refs } = await db.from('referral_tracking')
        .select('referee_tg_user_id, created_at')
        .eq('referrer_tg_user_id', Number(uid))
        .order('created_at', { ascending: false })
      if (!refs?.length) return respond({ referrals: [] })
      const refIds = refs.map((r: any) => String(r.referee_tg_user_id))
      const [usersRes, txsRes] = await Promise.all([
        db.from('users').select('tg_user_id, username, first_name').in('tg_user_id', refIds),
        db.from('transactions').select('tg_user_id, amount').in('tg_user_id', refIds).eq('type', 'topup'),
      ])
      const userMap = Object.fromEntries((usersRes.data ?? []).map((u: any) => [u.tg_user_id, u]))
      const depositMap: Record<string, number> = {}
      for (const tx of txsRes.data ?? []) depositMap[(tx as any).tg_user_id] = (depositMap[(tx as any).tg_user_id] ?? 0) + Number((tx as any).amount)
      return respond({
        referrals: refs.map((r: any) => {
          const id = String(r.referee_tg_user_id)
          const u = (userMap as any)[id]
          return { tg_user_id: id, username: u?.username ?? null, first_name: u?.first_name ?? null, joined_at: r.created_at, total_deposited: depositMap[id] ?? 0 }
        })
      })
    }

    // ── payout_referral  [AUTH REQUIRED] ────────────────────────────────────
    if (action === 'payout_referral') {
      const authResult = await requireAuth(body, botToken)
      if (authResult instanceof Response) return authResult
      const uid = authResult  // always use the verified identity

      const { type, walletType, walletAddress } = body
      if (!type || !['balance', 'withdraw'].includes(type)) return respond({ error: 'Invalid type' }, 400)
      const payoutAmount = validAmount(body.amount, 10000)
      if (!payoutAmount) return respond({ error: 'Invalid amount' }, 400)

      if (type === 'withdraw') {
        if (!walletAddress || !walletType) return respond({ error: 'walletAddress and walletType required' }, 400)
        if (typeof walletAddress !== 'string' || walletAddress.length > MAX_WALLET_LEN) return respond({ error: 'Invalid walletAddress' }, 400)
        if (typeof walletType !== 'string' || walletType.length > 50) return respond({ error: 'Invalid walletType' }, 400)
      }

      const { data: refTxs } = await db.from('transactions')
        .select('type, amount').eq('tg_user_id', uid).in('type', ['referral', 'referral_payout'])
      let refBalance = 0
      for (const tx of refTxs ?? []) {
        if ((tx as any).type === 'referral') refBalance += Number((tx as any).amount)
        else refBalance -= Number((tx as any).amount)
      }

      const payoutAmt = Math.min(payoutAmount, refBalance)
      if (payoutAmt < 0.009) return respond({ error: 'Insufficient referral balance' }, 400)

      const now = new Date()
      const dateStr = fmtDate(now)
      const ts = now.toISOString().slice(0, 19)

      if (type === 'balance') {
        await db.from('transactions').insert([
          { tg_user_id: uid, type: 'referral_payout', amount: payoutAmt, description: `Перевод в баланс · ${ts}`, date: dateStr, created_at: now.toISOString() },
          { tg_user_id: uid, type: 'topup', amount: payoutAmt, description: `Реферальный бонус · ${ts}`, date: dateStr, created_at: now.toISOString() },
        ])
        return respond({ ok: true, amount: payoutAmt })
      }

      await db.from('transactions').insert({
        tg_user_id: uid, type: 'referral_payout', amount: payoutAmt,
        description: `Вывод · ${walletType} · ${walletAddress} · ${ts}`, date: dateStr, created_at: now.toISOString(),
      })
      await db.from('withdrawal_requests').insert({
        tg_user_id: uid, amount: payoutAmt, wallet_type: walletType, wallet_address: walletAddress,
        status: 'pending', created_at: now.toISOString(), updated_at: now.toISOString(),
      })
      await notifyOwner(`💸 <b>Новая заявка на вывод</b>\nПользователь: <code>${uid}</code>\nСумма: <b>$${payoutAmt.toFixed(2)}</b>\nМетод: ${walletType}\nКошелёк: <code>${walletAddress}</code>\n\nОткрой админку → Выплаты`)
      return respond({ ok: true, amount: payoutAmt })
    }

    // ── credit_tgstars — PERMANENTLY REMOVED ─────────────────────────────
    if (action === 'credit_tgstars') {
      return respond({ error: 'Endpoint removed. TG Stars are credited via secure webhook only.' }, 410)
    }

    // ── get_bot_info ──────────────────────────────────────────────────────
    if (action === 'get_bot_info') {
      if (!botToken) return respond({ error: 'PLATFORM_BOT_TOKEN not set' })
      const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`)
      const data = await res.json()
      return respond(data.result ?? { error: data.description })
    }

    // ── setup_webhook ─────────────────────────────────────────────────────
    if (action === 'setup_webhook') {
      if (!botToken) return respond({ error: 'PLATFORM_BOT_TOKEN not set' }, 500)
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const webhookUrl = `${supabaseUrl}/functions/v1/payments?cb=platform`
      const setRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl, allowed_updates: ['message'] }),
      })
      const setData = await setRes.json()
      const infoRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`)
      return respond({ set: setData, info: (await infoRes.json()).result })
    }

    // ── check_cryptobot  [AUTH REQUIRED] ──────────────────────────────────
    if (action === 'check_cryptobot') {
      const authResult = await requireAuth(body, botToken)
      if (authResult instanceof Response) return authResult
      const verifiedId = authResult

      const { invoiceId } = body
      if (!invoiceId) return respond({ error: 'Missing invoiceId' }, 400)
      const token = Deno.env.get('CRYPTOBOT_TOKEN')!
      const res = await fetch(`https://pay.crypt.bot/api/getInvoices?invoice_ids=${invoiceId}`, { headers: { 'Crypto-Pay-API-Token': token } })
      const data = await res.json()
      const invoice = data.result?.items?.[0]
      if (!invoice || invoice.status !== 'paid') return respond({ credited: false })
      const payloadStr = invoice.payload as string | undefined
      if (!payloadStr?.startsWith('topup:')) return respond({ credited: false })
      const [, userId, amtStr] = payloadStr.split(':')
      const amountUsd = parseFloat(amtStr ?? '0')
      if (!userId || amountUsd <= 0 || amountUsd > MAX_TOPUP_USD) return respond({ credited: false })
      // Invoice must belong to the authenticated caller
      if (userId !== verifiedId) return respond({ error: 'Invoice does not belong to you' }, 403)
      const asset = invoice.asset ?? 'USDT'
      const desc = `Crypto Bot · +$${amountUsd} (${asset}) #${invoice.invoice_id}`
      const { data: existing } = await db.from('transactions').select('id').eq('tg_user_id', userId).eq('description', desc).maybeSingle()
      if (existing) return respond({ credited: true, alreadyDone: true })
      const wasInserted = await creditBalance(userId, amountUsd, desc)
      if (wasInserted) {
        const newBal = await getUserBalance(userId)
        await notifyUser(userId, amountUsd, newBal, `Crypto Bot (${asset})`)
        await notifyOwner(`💰 <b>Пополнение</b>\nПользователь: <code>${userId}</code>\nСумма: <b>+$${amountUsd}</b>\nМетод: Crypto Bot (${asset})`)
        await payReferralBonus(userId, amountUsd, desc)
      }
      return respond({ credited: wasInserted })
    }

    // ── check_ton  [AUTH REQUIRED] ────────────────────────────────────────
    if (action === 'check_ton') {
      const authResult = await requireAuth(body, botToken)
      if (authResult instanceof Response) return authResult
      const uid = authResult

      const { comment } = body
      if (!comment) return respond({ error: 'Missing comment' }, 400)
      if (typeof comment !== 'string' || comment.length > 100) return respond({ error: 'Invalid comment' }, 400)
      const walletAddr = Deno.env.get('TON_WALLET_ADDRESS')
      if (!walletAddr) return respond({ error: 'TON_WALLET_ADDRESS not set' }, 500)
      const tcKey = Deno.env.get('TONCENTER_API_KEY') ?? ''
      const tcRes = await fetch(
        `https://toncenter.com/api/v2/getTransactions?address=${encodeURIComponent(walletAddr)}&limit=50`,
        tcKey ? { headers: { 'X-API-Key': tcKey } } : {}
      ).catch(() => null)
      if (!tcRes?.ok) return respond({ credited: false, error: 'TonCenter unavailable' })
      const tcData = await tcRes.json()
      const matchedTx = (tcData.result ?? []).find((tx: any) => {
        const msgData = tx.in_msg?.msg_data
        if (msgData?.['@type'] === 'msg.dataText') {
          try { return atob(msgData.text ?? '') === comment } catch { return false }
        }
        return (tx.in_msg?.message ?? '') === comment
      })
      if (!matchedTx) return respond({ credited: false })

      // Compute amount from on-chain value — never trust client-supplied amountUsd
      const nanotons = Number(matchedTx.in_msg?.value ?? 0)
      if (!nanotons || nanotons <= 0) return respond({ credited: false, error: 'Could not read on-chain amount' })
      let tonPriceUsd = 3.5
      try {
        const priceData = await (await fetch('https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd')).json()
        tonPriceUsd = priceData['the-open-network']?.usd ?? 3.5
      } catch { /* use fallback */ }
      const computedAmountUsd = Math.round((nanotons / 1e9) * tonPriceUsd * 100) / 100
      const amt = validAmount(computedAmountUsd)
      if (!amt) return respond({ credited: false, error: 'Computed amount out of range' })

      const desc = `TON Keeper · ${comment}`
      const { data: existing } = await db.from('transactions').select('id').eq('tg_user_id', uid).eq('description', desc).maybeSingle()
      if (existing) return respond({ credited: true, alreadyDone: true })
      const wasInserted = await creditBalance(uid, amt, desc)
      if (wasInserted) {
        const newBal = await getUserBalance(uid)
        await notifyUser(uid, amt, newBal, 'TON Keeper')
        await notifyOwner(`💎 <b>TON оплата</b>\nПользователь: <code>${uid}</code>\nСумма: <b>+$${amt}</b>\nКомментарий: <code>${comment}</code>`)
        await payReferralBonus(uid, amt, desc)
        try { await db.from('pending_ton_payments').update({ credited: true, credited_at: new Date().toISOString() }).eq('comment', comment) } catch { /* ignore */ }
      }
      return respond({ credited: wasInserted })
    }

    // ── get_pending_ton  [AUTH REQUIRED] ─────────────────────────────────
    if (action === 'get_pending_ton') {
      const authResult = await requireAuth(body, botToken)
      if (authResult instanceof Response) return authResult
      const uid = authResult
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data } = await db.from('pending_ton_payments')
        .select('comment, amount_usd')
        .eq('tg_user_id', uid)
        .eq('credited', false)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(5)
      return respond({ pending: data ?? [] })
    }

    // ── get_subscriptions  [AUTH REQUIRED] ───────────────────────────────────
    if (action === 'get_subscriptions') {
      const authResult = await requireAuth(body, botToken)
      if (authResult instanceof Response) return authResult
      const uid = authResult
      const { data } = await db.from('module_subscriptions')
        .select('module_name, plan, amount_usd, expires_at, created_at')
        .eq('tg_user_id', uid)
      return respond({ subscriptions: data ?? [] })
    }

    // ── subscribe_module  [AUTH REQUIRED] ─────────────────────────────────────
    if (action === 'subscribe_module') {
      const authResult = await requireAuth(body, botToken)
      if (authResult instanceof Response) return authResult
      const uid = authResult

      const { moduleName, plan } = body
      const VALID_MODULES = ['analytics', 'autopost']
      const PLANS: Record<string, { usd: number; days: number; label: string }> = {
        month: { usd: 19.90, days: 30,  label: '1 месяц'    },
        '3mo': { usd: 39.90, days: 90,  label: '3 месяца'   },
        year:  { usd: 99.90, days: 365, label: '1 год'       },
      }
      if (!VALID_MODULES.includes(moduleName)) return respond({ error: 'Invalid module' }, 400)
      if (!PLANS[plan]) return respond({ error: 'Invalid plan' }, 400)

      const { usd, days, label } = PLANS[plan]
      const balance = await getUserBalance(uid)
      if (balance < usd) return respond({ error: `Недостаточно средств. Нужно $${usd.toFixed(2)}, на балансе $${balance.toFixed(2)}` }, 402)

      // Deduct from balance
      const now = new Date()
      const desc = `Подписка ${moduleName} · ${label} · ${now.toISOString().slice(0, 10)}`
      const { error: txErr } = await db.from('transactions').insert({
        tg_user_id: uid, type: 'spend', amount: usd, description: desc,
        date: fmtDate(now), created_at: now.toISOString(),
      })
      if (txErr) return respond({ error: txErr.message }, 500)

      // Create or extend subscription (extend from current expiry if still active)
      const { data: existing } = await db.from('module_subscriptions')
        .select('expires_at').eq('tg_user_id', uid).eq('module_name', moduleName).maybeSingle()
      const base = existing?.expires_at && new Date(existing.expires_at) > now
        ? new Date(existing.expires_at) : now
      const expiresAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000)

      const { error: subErr } = await db.from('module_subscriptions').upsert(
        { tg_user_id: uid, module_name: moduleName, plan, amount_usd: usd, expires_at: expiresAt.toISOString(), created_at: now.toISOString() },
        { onConflict: 'tg_user_id,module_name' }
      )
      if (subErr) {
        // Rollback the spend transaction
        await db.from('transactions').delete().eq('tg_user_id', uid).eq('description', desc)
        return respond({ error: subErr.message }, 500)
      }

      return respond({ ok: true, expiresAt: expiresAt.toISOString(), amountUsd: usd })
    }

    // ── create_invoice ─────────────────────────────────────────────────────
    if (action !== 'create_invoice') return respond({ error: 'Unknown action' }, 400)

    const authResult = await requireAuth(body, botToken)
    if (authResult instanceof Response) return authResult
    const uid = authResult

    const amountUsd = validAmount(amount)
    if (!amountUsd) return respond({ error: `Invalid amount (must be > 0 and ≤ ${MAX_TOPUP_USD})` }, 400)

    const baseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const currency = (body.currency as string | undefined) ?? undefined
    const nonce = (body.nonce as string | undefined) ?? Date.now().toString(36)

    if (platform === 'tgstars') {
      if (!botToken) return respond({ error: 'PLATFORM_BOT_TOKEN not set' }, 500)
      const stars = usdToStars(amountUsd)
      let tgRes: Response
      try {
        tgRes = await fetch(`https://api.telegram.org/bot${botToken}/createInvoiceLink`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: 'Пополнение баланса', description: `+$${amountUsd} на ваш счёт`,
            payload: `topup:${uid}:${amountUsd}:${nonce}`, currency: 'XTR',
            prices: [{ label: `Баланс +$${amountUsd}`, amount: stars }],
          }),
        })
      } catch (e) {
        return respond({ error: `Telegram API недоступен: ${String(e)}` }, 502)
      }
      let data: any
      try { data = await tgRes.json() } catch { return respond({ error: 'Telegram API: неверный ответ' }, 502) }
      if (!data.ok) return respond({ error: data.description ?? 'Telegram error' }, 500)
      return respond({ url: data.result })
    }

    if (platform === 'cryptobot') {
      const token = Deno.env.get('CRYPTOBOT_TOKEN')
      if (!token) return respond({ error: 'CRYPTOBOT_TOKEN not configured' }, 500)
      if (baseUrl) {
        fetch('https://pay.crypt.bot/api/setWebhook', {
          method: 'POST',
          headers: { 'Crypto-Pay-API-Token': token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: `${baseUrl}/functions/v1/payments?cb=cryptobot` }),
        }).catch(() => {})
      }
      let cbRes: Response
      try {
        cbRes = await fetch('https://pay.crypt.bot/api/createInvoice', {
          method: 'POST',
          headers: { 'Crypto-Pay-API-Token': token, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currency_type: 'fiat', fiat: 'USD', amount: String(amountUsd),
            description: `Пополнение +$${amountUsd}`, payload: `topup:${uid}:${amountUsd}`,
            accepted_assets: currency ?? 'USDT,TON',
          }),
        })
      } catch (e) {
        return respond({ error: `CryptoPay API недоступен: ${String(e)}` }, 502)
      }
      let data: any
      try { data = await cbRes.json() } catch { return respond({ error: 'CryptoPay API: неверный ответ' }, 502) }
      if (!data.ok) return respond({ error: data.error?.name ?? `CryptoBot error (${cbRes.status})` }, 500)
      return respond({ url: data.result.bot_invoice_url, miniAppUrl: data.result.mini_app_invoice_url, invoiceId: data.result.invoice_id })
    }

    if (platform === 'tonkeeper') {
      const walletAddr = Deno.env.get('TON_WALLET_ADDRESS')
      if (!walletAddr) return respond({ error: 'TON_WALLET_ADDRESS not configured' }, 500)
      let tonPriceUsd = 3.5
      try {
        const pr = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd')
        const prData = await pr.json()
        tonPriceUsd = prData['the-open-network']?.usd ?? 3.5
      } catch { /* fallback price */ }
      const nanotons = Math.round((amountUsd / tonPriceUsd) * 1e9)
      const comment = `topup_${uid}_${nonce}`
      try { await db.from('pending_ton_payments').upsert({ tg_user_id: uid, comment, amount_usd: amountUsd, created_at: new Date().toISOString(), credited: false }, { onConflict: 'comment', ignoreDuplicates: true }) } catch { /* ignore */ }
      return respond({ url: `https://app.tonkeeper.com/transfer/${walletAddr}?amount=${nanotons}&text=${encodeURIComponent(comment)}`, walletAddr, nanotons, comment, tonPriceUsd })
    }

    return respond({ error: 'Unknown platform' }, 400)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[payments] unhandled error:', msg)
    return respond({ error: msg }, 500)
  }
})
