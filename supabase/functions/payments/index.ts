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
  const text = `✅ <b>Баланс пополнен!</b>\n\n💰 Зачислено: <b>+$${amountUsd.toFixed(2)}</b>\n📊 Баланс: <b>$${newBalance.toFixed(2)}</b>\n\n🏦 ${method}`
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
  const { data, error } = await db.from('transactions').upsert(
    { tg_user_id: String(tgUserId), type: 'topup', amount: amountUsd, description: desc, date: fmtDate(now), created_at: now.toISOString() },
    { onConflict: 'tg_user_id,description', ignoreDuplicates: true }
  ).select('id')
  if (error) { console.error('[creditBalance] error:', error.message); return false }
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

    // ── Debug ──────────────────────────────────────────────────────────────
    if (action === 'debug_notify') {
      if (!botToken) return respond({ error: 'no bot token set' })
      const chatId = String(tgUserId ?? body.chatId ?? '')
      if (!chatId) return respond({ error: 'tgUserId required' })
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: '✅ Тест уведомлений — всё работает!' }),
      })
      return respond({ status: res.status, tgResp: await res.json(), botTokenPrefix: botToken.slice(0,8)+'...', chatId })
    }

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
      await notifyOwner(`💸 <b>Запрос на вывод реферального</b>\nПользователь: <code>${uid}</code>\nСумма: <b>$${payoutAmt.toFixed(2)}</b>\nМетод: ${walletType}\nКошелёк: <code>${walletAddress}</code>`)
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

    // ── check_cryptobot ────────────────────────────────────────────────────
    if (action === 'check_cryptobot') {
      const { invoiceId } = body
      const uid = validUserId(tgUserId)
      if (!uid || !invoiceId) return respond({ error: 'Missing params' }, 400)
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

    // ── check_ton ──────────────────────────────────────────────────────────
    if (action === 'check_ton') {
      const { comment, amountUsd } = body
      const uid = validUserId(tgUserId)
      if (!uid || !comment) return respond({ error: 'Missing params' }, 400)
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
      const found = (tcData.result ?? []).some((tx: any) => {
        const msgData = tx.in_msg?.msg_data
        if (msgData?.['@type'] === 'msg.dataText') {
          try { return atob(msgData.text ?? '') === comment } catch { return false }
        }
        return (tx.in_msg?.message ?? '') === comment
      })
      if (!found) return respond({ credited: false })
      const desc = `TON Keeper · ${comment}`
      const { data: existing } = await db.from('transactions').select('id').eq('tg_user_id', uid).eq('description', desc).maybeSingle()
      if (existing) return respond({ credited: true, alreadyDone: true })
      const amt = validAmount(amountUsd)
      if (!amt) return respond({ error: 'Invalid amount' }, 400)
      const wasInserted = await creditBalance(uid, amt, desc)
      if (wasInserted) {
        const newBal = await getUserBalance(uid)
        await notifyUser(uid, amt, newBal, 'TON Keeper')
        await notifyOwner(`💎 <b>TON оплата</b>\nПользователь: <code>${uid}</code>\nСумма: <b>+$${amt}</b>\nКомментарий: <code>${comment}</code>`)
        await payReferralBonus(uid, amt, desc)
      }
      return respond({ credited: wasInserted })
    }

    // ── create_invoice ─────────────────────────────────────────────────────
    if (action !== 'create_invoice') return respond({ error: 'Unknown action' }, 400)

    const amountUsd = validAmount(amount)
    if (!amountUsd) return respond({ error: `Invalid amount (must be > 0 and ≤ ${MAX_TOPUP_USD})` }, 400)
    const uid = validUserId(tgUserId)
    if (!uid) return respond({ error: 'Invalid tgUserId' }, 400)

    const baseUrl = Deno.env.get('SUPABASE_URL')!
    const currency = (body.currency as string | undefined) ?? undefined

    if (platform === 'tgstars') {
      if (!botToken) return respond({ error: 'PLATFORM_BOT_TOKEN not set' }, 500)
      const stars = usdToStars(amountUsd)
      const nonce = (body.nonce as string | undefined) ?? Date.now().toString(36)
      const res = await fetch(`https://api.telegram.org/bot${botToken}/createInvoiceLink`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Пополнение баланса', description: `+$${amountUsd} на ваш счёт`,
          payload: `topup:${uid}:${amountUsd}:${nonce}`, currency: 'XTR',
          prices: [{ label: `Баланс +$${amountUsd}`, amount: stars }],
        }),
      })
      const data = await res.json()
      if (!data.ok) return respond({ error: data.description ?? 'Telegram error' }, 500)
      return respond({ url: data.result })
    }

    if (platform === 'cryptobot') {
      const token = Deno.env.get('CRYPTOBOT_TOKEN')
      if (!token) return respond({ error: 'CRYPTOBOT_TOKEN not set' }, 500)
      await fetch('https://pay.crypt.bot/api/setWebhook', {
        method: 'POST',
        headers: { 'Crypto-Pay-API-Token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: `${baseUrl}/functions/v1/payments?cb=cryptobot` }),
      }).catch(() => {})
      const res = await fetch('https://pay.crypt.bot/api/createInvoice', {
        method: 'POST',
        headers: { 'Crypto-Pay-API-Token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currency_type: 'fiat', fiat: 'USD', amount: String(amountUsd),
          description: `Пополнение +$${amountUsd}`, payload: `topup:${uid}:${amountUsd}`,
          accepted_assets: currency ?? 'USDT,TON',
        }),
      })
      const data = await res.json()
      if (!data.ok) return respond({ error: data.error?.name ?? 'CryptoBot error' }, 500)
      return respond({ url: data.result.bot_invoice_url, miniAppUrl: data.result.mini_app_invoice_url, invoiceId: data.result.invoice_id })
    }

    if (platform === 'tonkeeper') {
      const walletAddr = Deno.env.get('TON_WALLET_ADDRESS')
      if (!walletAddr) return respond({ error: 'TON_WALLET_ADDRESS not set' }, 500)
      let tonPriceUsd = 3.5
      try {
        const priceData = await (await fetch('https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd')).json()
        tonPriceUsd = priceData['the-open-network']?.usd ?? 3.5
      } catch { /* use fallback */ }
      const nanotons = Math.round((amountUsd / tonPriceUsd) * 1e9)
      const nonce = Date.now().toString(36)
      const comment = `topup_${uid}_${nonce}`
      return respond({ url: `https://app.tonkeeper.com/transfer/${walletAddr}?amount=${nanotons}&text=${encodeURIComponent(comment)}`, walletAddr, nanotons, comment, tonPriceUsd })
    }

    return respond({ error: 'Unknown platform' }, 400)
  } catch (err) {
    return respond({ error: String(err) }, 500)
  }
})
