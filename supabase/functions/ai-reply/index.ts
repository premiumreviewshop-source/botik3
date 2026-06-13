import { db } from '../_shared/db.ts'
import { buildSystemPrompt } from '../_shared/prompts.ts'
import { getEffectiveDelay, shouldProcessNow } from '../_shared/delay.ts'

const XAI_BASE = 'https://api.x.ai/v1'
const grokModel = () => Deno.env.get('XAI_MODEL') ?? 'grok-3'
const TG = (token: string) => `https://api.telegram.org/bot${token}`

const SEND_TRIGGERS = [
  'atiyorum', 'atıyorum', 'gonderiyorum', 'gönderiyorum',
  'atayim', 'atayım', 'atıyım', 'atarim', 'atarım', 'atacağım',
  'göndereyim', 'gondereyim',
  'отправляю', 'шлю', 'посылаю', 'скину', 'скидываю', 'кидаю', 'кину',
  'отправлю', 'пришлю', 'покажу',
  'sending', 'sending you', "i'll send", "i'm sending",             // EN (generic phrases removed — appear in casual chat)
]
const VIDEO_TRIGGERS = [
  'video', 'videosu', 'videonu', 'vid ', 'videolar', 'videosun',
  'видео', 'видос', 'видосик', 'ролик', 'запись', 'клип',
  'clip', 'recording',
]
const BARGAIN_WORDS = [
  'pahali', 'pahalı', 'ucuz', 'olur', 'peki',
  '150', '200', '250', '300', '400', '500', '600', '700',
  '800', '900', '1000', '1200', '1400',
  '1500', '1600', '1700', '1800', '1900', '2000', '2100', '2200', '2300', '2400', '2500',
  '3000', '3500', '4000', '4500', '5000',
  'дорого', 'дешевле', 'скидку', 'скидка', 'мало', 'нет денег',
  'expensive', 'too expensive', 'too much', 'cheaper', 'discount',
  'broke', "can't afford", 'cant afford', 'lower the price',
  'go lower', 'lower it', 'reduce', 'deal',
]
const CONTENT_WORDS = [
  'göt', 'meme', 'video', 'foto', 'resim', 'amcık', 'amını', 'götünü', // TR ('am' removed — matches tamam/param/yaparım)
  'фото', 'видео', 'грудь', 'сиськи', 'попа',                          // RU general
  'пизду', 'пизда', 'пизды', 'киску', 'киска', 'кису', 'голую', 'нагую', 'голышом', // RU explicit
  'photo', 'picture', 'boobs', 'ass', 'pussy', 'nude', 'naked', 'tits', 'vagina', // EN
]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function sendTyping(token: string, chatId: number, bizExtra?: Record<string, unknown>): Promise<void> {
  await fetch(`${TG(token)}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action: 'typing', ...(bizExtra ?? {}) }),
  }).catch(() => {})
}

function extractPrice(text: string): number | null {
  const m = text.toLowerCase().match(/(\d{2,4})'?\s*(yild|yıld|star|yildiz|yıldız|yildiza|yıldıza|ye|ya|звезд|зв\b)/)
  if (m) { const p = parseInt(m[1]); if (p >= 50 && p <= 5000) return p }
  return null
}

function extractBarePrice(text: string): number | null {
  const m = text.toLowerCase().match(/\b(\d{3,4})\b/)
  if (m) { const p = parseInt(m[1]); if (p >= 100 && p <= 5000) return p }
  return null
}

// Pick next content item for rotation (cycles through items by type)
function pickNextItem(
  items: Array<{ id: string; mediaType: string; description: string }>,
  lastPhotoId: string | null,
  lastVideoId: string | null,
  wantsVideo: boolean,
): typeof items[0] | null {
  if (!items.length) return null

  const filtered = items.filter((i) => i.mediaType === (wantsVideo ? 'video' : 'photo'))
  const pool = filtered.length ? filtered : items

  const lastId = wantsVideo ? lastVideoId : lastPhotoId
  if (!lastId) return pool[0]

  const idx = pool.findIndex((i) => i.id === lastId)
  if (idx === -1) return pool[0]
  return pool[(idx + 1) % pool.length]
}

Deno.serve(async () => {
  const dbg: string[] = []
  const log = (...args: unknown[]) => { const m = args.map((a) => (typeof a === 'string' ? a : String(a))).join(' '); console.error(m); dbg.push(m) }

  const { data: bots } = await db
    .from('bots')
    .select('id, token, tg_user_id')
    .filter('modules', 'cs', '["AI Chat"]')
    .eq('is_active', true)

  if (!bots?.length) return new Response(JSON.stringify({ ok: true, processed: 0, dbg }))

  let processed = 0

  for (const bot of bots) {
    try {
      const { data: config } = await db
        .from('ai_chat_config')
        .select('*')
        .eq('bot_id', bot.id)
        .maybeSingle()

      if (!config) continue

      // ── Balance check for bot owner ───────────────────────────────────────
      const ownerTgId = String((bot as any).tg_user_id ?? '')
      const messageCost = parseFloat(Deno.env.get('AI_MESSAGE_COST') ?? '0.025')
      let ownerBalance = 0
      if (ownerTgId && ownerTgId !== '0' && messageCost > 0) {
        const { data: txData, error: txErr } = await db.from('transactions').select('type, amount').eq('tg_user_id', ownerTgId)
        if (txErr) log('[balance-check] tx fetch error: ' + JSON.stringify(txErr))
        for (const t of (txData ?? []) as any[]) {
          if (t.type === 'topup') ownerBalance += Number(t.amount) || 0
          else if (t.type === 'spend') ownerBalance -= Math.abs(Number(t.amount) || 0)
        }
        log(`[balance-check] ownerTgId=${ownerTgId} balance=${ownerBalance} cost=${messageCost} txCount=${(txData ?? []).length}`)
        if (ownerBalance < messageCost) {
          // Throttle: only notify once per 2 hours
          const twoHoursAgo = new Date(Date.now() - 7200000).toISOString()
          const { data: recentNotif } = await db.from('platform_notifications')
            .select('id').eq('tg_user_id', ownerTgId).eq('type', 'balance_low').gte('created_at', twoHoursAgo)
            .limit(1).maybeSingle().catch(() => ({ data: null }))
          if (!recentNotif) {
            const platformToken = Deno.env.get('PLATFORM_BOT_TOKEN')
            const webappUrl = Deno.env.get('WEBAPP_URL') ?? 'https://botik3.vercel.app'
            if (platformToken) {
              await fetch(`https://api.telegram.org/bot${platformToken}/sendMessage`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: ownerTgId,
                  text: `⚠️ <b>Недостаточно средств для услуги</b>\n\nВаш баланс: <b>$${ownerBalance.toFixed(2)}</b>\nСтоимость сообщения: <b>$${messageCost.toFixed(3)}</b>\n\nПополните баланс чтобы продолжать зарабатывать 💰`,
                  parse_mode: 'HTML',
                  reply_markup: { inline_keyboard: [[{ text: '💳 Пополнить баланс', web_app: { url: webappUrl } }]] },
                }),
              }).catch(() => {})
            }
            try {
              await db.from('platform_notifications').insert({
                tg_user_id: ownerTgId, type: 'balance_low', amount: ownerBalance,
                message: `Недостаточно средств. Баланс: $${ownerBalance.toFixed(2)}`, seen: true,
              })
            } catch { /* non-critical */ }
          }
          continue
        }
      }

      // Business connection: if set, all sends go through business account
      const businessConnectionId = (config.business_connection_id as string | null) ?? undefined
      const bizExtra: Record<string, unknown> = businessConnectionId ? { business_connection_id: businessConnectionId } : {}

      // Delay config
      const readDelaySec = (config.read_delay_seconds as number | null) ?? 2
      const largeDelayEnabled = (config.large_delay_enabled as boolean | null) ?? false
      const largeDelaySec = (config.large_delay_seconds as number | null) ?? 60
      const inactivityResetMin = (config.inactivity_reset_minutes as number | null) ?? 10

      // Global bargain config
      const photoPrice = (config.photo_price as number | null) ?? 250
      const photoMinPrice = (config.photo_min_price as number | null) ?? 150
      const videoPrice = (config.video_price as number | null) ?? 1400
      const videoMinPrice = (config.video_min_price as number | null) ?? 900
      const bargainingEnabled = (config.bargaining_enabled as boolean | null) !== false

      // Load PPV items for this bot
      const { data: ppvItems } = await db
        .from('ppv_items')
        .select('id, title, description, media_type, media_url, price_stars')
        .eq('bot_id', bot.id)
        .order('created_at', { ascending: true })

      const items = (ppvItems ?? []).map((i, idx) => ({
        idx: idx + 1,
        id: i.id,
        title: i.title,
        description: i.description ?? '',
        mediaType: i.media_type as string,
        mediaUrl: i.media_url as string,
        priceStars: (i.price_stars as number | null) ?? (i.media_type === 'video' ? videoPrice : photoPrice),
      }))

      const catalog = items.length
        ? items.map((i) => {
            const price = !bargainingEnabled ? ` fiyat:${i.priceStars}` : ''
            return `ID:${i.idx} tip:${i.mediaType}${price} aciklama:${i.description || i.title}`
          }).join('\n')
        : 'Henuz icerik yok'

      // Get unread messages. Use a generous cutoff (max delay + buffer) so the cron can
      // see messages early enough to apply per-chat delay checks.
      const maxDelaySec = largeDelayEnabled ? Math.max(largeDelaySec, readDelaySec) : readDelaySec
      const cutoffSec = Math.max(maxDelaySec - 15, 30) // start seeing messages 15s before delay expires, min 30s
      const cutoff = new Date(Date.now() - cutoffSec * 1000).toISOString()
      // Only fetch messages that are unclaimed or have a stale lock (> 2 min old)
      const staleThreshold = new Date(Date.now() - 120000).toISOString()
      const { data: unreads } = await db
        .from('tg_updates')
        .select('id, chat_id, text, ts, message_id')
        .eq('bot_id', bot.id)
        .eq('type', 'message')
        .eq('replied', false)
        .not('text', 'is', null)
        .not('chat_id', 'is', null)
        .lt('ts', cutoff)
        .or(`locked_at.is.null,locked_at.lt.${staleThreshold}`)
        .order('ts', { ascending: true })

      if (!unreads?.length) continue

      // Group by chat_id
      const byChatId = new Map<number, typeof unreads>()
      for (const msg of unreads) {
        if (msg.chat_id == null) continue
        if (!byChatId.has(msg.chat_id)) byChatId.set(msg.chat_id, [])
        byChatId.get(msg.chat_id)!.push(msg)
      }

      const xaiKey = Deno.env.get('XAI_API_KEY')
      if (!xaiKey) { log('XAI_API_KEY not set'); continue }

      for (const [chatId, msgs] of byChatId) {
      try {
        log(`[ai-reply] chat=${chatId} msgs=${msgs.length}`)
        // Determine effective read delay using shared logic
        let lastRepliedTs: string | null = null
        if (largeDelayEnabled) {
          const { data: lastReplied } = await db
            .from('tg_updates')
            .select('ts, replied_at')
            .eq('bot_id', bot.id)
            .eq('chat_id', chatId)
            .eq('replied', true)
            .order('id', { ascending: false })
            .limit(1)
            .maybeSingle()
          // Prefer replied_at (actual bot reply time) over ts (message arrival time)
          lastRepliedTs = ((lastReplied?.replied_at ?? lastReplied?.ts) as string | null) ?? null
        }

        const effectiveDelaySec = getEffectiveDelay(
          { readDelaySec, largeDelayEnabled, largeDelaySec, inactivityResetMin },
          lastRepliedTs,
        )

        // Skip if oldest message hasn't aged enough yet (next cron run will pick it up)
        if (!shouldProcessNow(msgs[0].ts as string, effectiveDelaySec)) { log(`[ai-reply] chat=${chatId} not ready yet`); continue }

        // Atomically claim the lead message for this chat.
        // If another instance already claimed it (webhook or parallel cron), skip.
        const { data: claimedLead } = await db.from('tg_updates')
          .update({ locked_at: new Date().toISOString() })
          .eq('id', msgs[0].id)
          .eq('replied', false)
          .or(`locked_at.is.null,locked_at.lt.${staleThreshold}`)
          .select('id')
        if (!claimedLead?.length) { log(`[ai-reply] chat=${chatId} claim failed`); continue }
        log(`[ai-reply] chat=${chatId} claimed, fetching bundle`)

        // Bundle ALL unreplied messages for this chat (ordered by arrival time).
        // Use timestamp-based lower bound (not UUID) for correct ordering.
        const { data: allChatMsgs } = await db
          .from('tg_updates')
          .select('id, chat_id, text, ts, message_id')
          .eq('bot_id', bot.id)
          .eq('chat_id', chatId)
          .eq('type', 'message')
          .eq('replied', false)
          .not('text', 'is', null)
          .gte('ts', msgs[0].ts as string)
          .gte('ts', new Date(Date.now() - 6 * 3600 * 1000).toISOString())
          .order('ts', { ascending: true })
        const allMsgs = allChatMsgs?.length ? allChatMsgs : msgs

        // Bulk-claim the entire bundle so no other instance processes these messages
        if (allMsgs.length > 1) {
          await db.from('tg_updates')
            .update({ locked_at: new Date().toISOString() })
            .in('id', allMsgs.map((m) => m.id))
            .eq('replied', false)
            .or(`locked_at.is.null,locked_at.lt.${staleThreshold}`)
        }

        log(`[ai-reply] chat=${chatId} allMsgs=${allMsgs.length}, fetching history`)
        // Fetch conversation history
        const { data: history } = await db
          .from('tg_updates')
          .select('text, bot_reply')
          .eq('bot_id', bot.id)
          .eq('chat_id', chatId)
          .eq('type', 'message')
          .not('text', 'is', null)
          .eq('replied', true)
          .order('id', { ascending: false })
          .limit(20)

        // Check last 3 exchanges for video context
        const lastWasVideo = (history ?? []).slice(0, 3).some((h) =>
          VIDEO_TRIGGERS.some((w) => (h.bot_reply ?? '').toLowerCase().includes(w)) ||
          VIDEO_TRIGGERS.some((w) => (h.text ?? '').toLowerCase().includes(w))
        )

        // Load last-sent tracking for this user
        const { data: lastSent } = await db
          .from('ppv_last_sent')
          .select('last_photo_id, last_video_id, last_sent_type')
          .eq('bot_id', bot.id)
          .eq('chat_id', chatId)
          .maybeSingle()

        const lastPhotoId = (lastSent?.last_photo_id as string | null) ?? null
        const lastVideoId = (lastSent?.last_video_id as string | null) ?? null
        const lastSentType = (lastSent?.last_sent_type as 'video' | 'photo' | null) ?? null

        // Determine last content type — priority: DB last_sent_type > ppv IDs > text heuristic
        const lastTypeIsVideo = lastSentType === 'video' ? true
          : lastSentType === 'photo' ? false
          : lastVideoId !== null && lastPhotoId === null ? true
          : lastVideoId === null && lastPhotoId !== null ? false
          : lastWasVideo

        const userText = allMsgs.map((m) => m.text ?? '').join(' ').toLowerCase()
        const currentWantsVideo = VIDEO_TRIGGERS.some((w) => userText.includes(w))
        const isBargainEarly = BARGAIN_WORDS.some((w) => userText.includes(w)) && !CONTENT_WORDS.some((w) => userText.includes(w))
        const hasAnyHistory = lastVideoId !== null || lastPhotoId !== null || (history?.length ?? 0) > 0

        // Single source of truth: video when user says "video" OR prior context was video
        // and current message is not an explicit content switch (contains a content word like "foto").
        const extraTypeIsVideo = currentWantsVideo ? true : (hasAnyHistory && lastTypeIsVideo && !CONTENT_WORDS.some((w) => userText.includes(w)))
        const activeContentType: 'video' | 'photo' = extraTypeIsVideo ? 'video' : 'photo'

        // Build system prompt with catalog
        const systemPrompt = buildSystemPrompt({
          lang: config.lang as 'en' | 'ru' | 'tr',
          name: config.persona_name,
          age: config.persona_age,
          city: config.persona_city,
          customPrompt: config.prompt_type === 'custom' ? config.custom_prompt : undefined,
          catalog,
          photoPrice, photoMinPrice, videoPrice, videoMinPrice,
          bargainingEnabled,
          activeContentType,
          vipEnabled: config.vip_enabled === true,
          vipLink: config.vip_link ?? '',
        })

        const lang = (config.lang as string) ?? 'tr'

        function buildExtraRule(isVideo: boolean): string {
          const type = isVideo ? (lang === 'ru' ? 'ВИДЕО' : 'VIDEO') : (lang === 'ru' ? 'ФОТО' : lang === 'en' ? 'PHOTO' : 'FOTOĞRAF')
          if (!bargainingEnabled) {
            if (lang === 'ru') return `\nACTIVE TYPE: ${type}. Цена фиксированная — скидок нет. На любые просьбы о скидке: «извини солнышко цена фиксированная». Никаких цифр-скидок.`
            if (lang === 'en') return `\nACTIVE TYPE: ${type}. Price is fixed — no discounts. On any discount request: "sorry babe the price is fixed". Never reply with discount numbers.`
            return `\nACTIVE TYPE: ${type}. Fiyat sabittir — indirim yok. İndirim isteklerine SADECE: "üzgünüm canım bu sabit fiyat". Asla indirim rakamı verme.`
          }
          const p = isVideo ? videoPrice : photoPrice
          const m = isVideo ? videoMinPrice : photoMinPrice
          const gap = p - m
          const step1 = isVideo ? Math.round(m + gap * 0.75) : Math.round(p * 0.8)
          const step2 = isVideo ? Math.round(m + gap * 0.5) : Math.round((Math.round(p * 0.8) + m) / 2)
          const step3 = isVideo ? Math.round(m + gap * 0.25) : null
          const s2line = step3 !== null
            ? `2-й: ${step2}, 3-й: ${step3}` : `2-й: ${step2}`
          if (lang === 'ru') {
            return isVideo
              ? `\nACTIVE TYPE: ВИДЕО. На скидку отвечай ТОЛЬКО цифрой: 1-й: ${step1}, ${s2line}, финал: ${m}. Фото-цены не применять.`
              : `\nACTIVE TYPE: ФОТО. На скидку отвечай ТОЛЬКО цифрой: 1-й: ${step1}, ${s2line}, финал: ${m}. Видео-цены не применять.`
          }
          const s2en = step3 !== null ? `2nd: ${step2}, 3rd: ${step3}` : `2nd: ${step2}`
          if (lang === 'en') {
            return isVideo
              ? `\nACTIVE TYPE: VIDEO. On discount reply ONLY with a number: 1st: ${step1}, ${s2en}, final: ${m}. Do not use photo prices.`
              : `\nACTIVE TYPE: PHOTO. On discount reply ONLY with a number: 1st: ${step1}, ${s2en}, final: ${m}. Do not use video prices.`
          }
          const s2tr = step3 !== null ? `2.: ${step2}, 3.: ${step3}` : `2.: ${step2}`
          return isVideo
            ? `\nACTIVE TYPE: VIDEO. İndirimde SADECE rakam yaz: 1.: ${step1}, ${s2tr}, son: ${m}. Foto fiyatı kullanma.`
            : `\nACTIVE TYPE: PHOTO. İndirimde SADECE rakam yaz: 1.: ${step1}, ${s2tr}, son: ${m}. Video fiyatı kullanma.`
        }

        const extraRule = buildExtraRule(extraTypeIsVideo)

        // History is DESC (newest first). Slice at last delivery to prevent stale price contamination.
        const histArr = history ?? []
        const lastDelivIdx = histArr.findIndex((h) =>
          SEND_TRIGGERS.some((w) => (h.bot_reply ?? '').toLowerCase().includes(w))
        )
        let relevantHistArr = lastDelivIdx === -1 ? histArr : histArr.slice(0, lastDelivIdx + 1)
        // Prevent history contamination: if current message is casual chat and recent bot replies
        // are all pure numbers (bargaining prices like "800"), cut to last 4 exchanges.
        const isCasualMsg = !isBargainEarly && !CONTENT_WORDS.some((w) => userText.includes(w))
        if (isCasualMsg && relevantHistArr.length > 4) {
          const allPriceReplies = relevantHistArr.slice(0, 4).every((h) => /^\d+$/.test((h.bot_reply ?? '').trim()))
          if (allPriceReplies) relevantHistArr = relevantHistArr.slice(0, 4)
        }
        // Collapse consecutive identical bot replies so a contaminated history
        // (e.g. 20× "Selam canım naber") doesn't make Grok repeat the same reply for everything.
        relevantHistArr = relevantHistArr.filter((h, i, arr) => {
          if (i === 0) return true
          return (h.bot_reply ?? '').trim() !== (arr[i - 1].bot_reply ?? '').trim()
        })
        // Build conversation messages
        const convMessages: Array<{ role: string; content: string }> = []
        for (const h of [...relevantHistArr].reverse()) {
          if (h.text) convMessages.push({ role: 'user', content: h.text })
          if (h.bot_reply) convMessages.push({ role: 'assistant', content: h.bot_reply })
        }
        // Add all current unread messages
        for (const msg of allMsgs) {
          if (msg.text) convMessages.push({ role: 'user', content: msg.text })
        }

        log(`[ai-reply] chat=${chatId} convMsgs=${convMessages.length} about to deduct+grok`)

        // Deduct balance BEFORE calling Grok so charge is guaranteed regardless of Grok outcome
        if (ownerTgId && ownerTgId !== '0' && messageCost > 0) {
          const today = new Date()
          const dd = String(today.getDate()).padStart(2, '0')
          const mm = String(today.getMonth() + 1).padStart(2, '0')
          const dateStr = `${dd}.${mm}.${today.getFullYear()}`
          const { error: deductErr } = await db.from('transactions').insert({
            tg_user_id: ownerTgId,
            type: 'spend',
            amount: messageCost,
            description: 'AI Chat · 1 сообщение',
            date: dateStr,
            created_at: new Date().toISOString(),
          })
          if (deductErr) log('balance deduct failed:', JSON.stringify(deductErr))
        }

        // Call Grok
        log(`[ai-reply] chat=${chatId} calling grok model=${grokModel()}`)
        let grokResp: Response
        try {
          grokResp = await fetch(`${XAI_BASE}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${xaiKey}` },
            body: JSON.stringify({
              model: grokModel(),
              messages: [{ role: 'system', content: systemPrompt + extraRule }, ...convMessages],
              max_tokens: 100,
            }),
          })
        } catch (fetchErr) {
          log(`[ai-reply] chat=${chatId} grok fetch threw:`, String(fetchErr))
          continue
        }

        if (!grokResp.ok) {
          const errBody = await grokResp.text().catch(() => '')
          log(`[ai-reply] chat=${chatId} grok error status=${grokResp.status} body=${errBody.slice(0, 200)}`)
          continue
        }

        const grokData = await grokResp.json().catch((e: unknown) => { log('[ai-reply] grok json parse error:', String(e)); return null })
        if (!grokData) continue
        let raw: string = grokData.choices?.[0]?.message?.content ?? ''
        log(`[ai-reply] chat=${chatId} grok ok raw_len=${raw.length}`)
        if (!raw) { log(`[ai-reply] chat=${chatId} empty grok response`); continue }

        // Parse [PPV:N] tag
        const ppvMatch = raw.match(/\[PPV:(\d+)\]/)
        const ppvIdx = ppvMatch ? parseInt(ppvMatch[1]) : null
        raw = raw.replace(/\[PPV:\d+\]/g, '').trim()

        const hasSendTrigger = SEND_TRIGGERS.some((w) => raw.toLowerCase().includes(w))

        let customPrice: number | null = null
        if (isBargainEarly) {
          customPrice = extractPrice(raw) ?? extractPrice(userText) ?? extractBarePrice(userText)
        }
        if (!customPrice && hasSendTrigger && !CONTENT_WORDS.some((w) => userText.includes(w))) {
          // Pull agreed price from previous bot reply (e.g. bot said "800", user says "давай")
          // extractPrice handles "800 звезд"; extractBarePrice handles bare "800" (bargaining-only replies)
          const prevReply = (history ?? [])[0]?.bot_reply as string | null
          customPrice = prevReply ? (extractPrice(prevReply) ?? extractBarePrice(prevReply)) : null
        }

        const wantsVideo = extraTypeIsVideo

        // Show read receipt (✓✓) for business messages right before replying
        if (businessConnectionId) {
          const lastMsgId = allMsgs[allMsgs.length - 1].message_id as number | null
          if (lastMsgId) {
            await fetch(`${TG(bot.token)}/readBusinessMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ business_connection_id: businessConnectionId, chat_id: chatId, message_id: lastMsgId }),
            }).catch(() => {})
          }
        }

        await sendTyping(bot.token, chatId, bizExtra)
        const typingDelay = Math.min(Math.max(raw.length * 80, readDelaySec * 1000), 12000)
        await sleep(typingDelay)
        await sendTyping(bot.token, chatId, bizExtra)

        // Re-read any messages that arrived while we were "typing"
        const { data: lateMsgs } = await db.from('tg_updates')
          .select('id, text, ts, message_id')
          .eq('bot_id', bot.id).eq('chat_id', chatId).eq('type', 'message').eq('replied', false)
          .not('text', 'is', null).gte('ts', new Date(Date.now() - 6 * 3600 * 1000).toISOString())
          .order('ts', { ascending: true })
        const claimedSet = new Set(allMsgs.map(m => m.id))
        const lateArrivals = (lateMsgs ?? []).filter(m => !claimedSet.has(m.id))
        if (lateArrivals.length > 0) {
          await db.from('tg_updates').update({ locked_at: new Date().toISOString() })
            .in('id', lateArrivals.map(m => m.id)).eq('replied', false)
        }
        const allMsgsToMark = lateArrivals.length > 0 ? [...allMsgs, ...lateArrivals] : allMsgs

        // Send text reply
        log(`[ai-reply] chat=${chatId} sending message len=${raw.length}`)
        const sendResp = await fetch(`${TG(bot.token)}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: raw, ...bizExtra }),
        }).catch((e: unknown) => { log(`[ai-reply] chat=${chatId} sendMessage threw:`, String(e)); return null })
        if (sendResp && !sendResp.ok) {
          const errBody = await sendResp.text().catch(() => '')
          log(`[ai-reply] chat=${chatId} sendMessage error status=${sendResp.status} body=${errBody.slice(0, 200)}`)
        }

        let targetItem: typeof items[0] | null = null

        if (ppvIdx !== null) {
          // During bargaining: lock to last-sent item, ignore [PPV:N]
          if ((isBargainEarly || customPrice !== null) && items.length) {
            const lastId = wantsVideo ? lastVideoId : lastPhotoId
            if (lastId) {
              targetItem = items.find((i) => i.id === lastId) ?? null
            } else {
              const pool = items.filter((i) => i.mediaType === (wantsVideo ? 'video' : 'photo'))
              targetItem = pool.length ? pool[0] : items[0]
            }
          }
          if (!targetItem) targetItem = items.find((i) => i.idx === ppvIdx) ?? null
          // Fallback: if AI used wrong/missing PPV index, use next item in rotation
          if (!targetItem && items.length) {
            const pool = items.filter((i) => i.mediaType === (wantsVideo ? 'video' : 'photo'))
            targetItem = pool.length ? pool[0] : items[0]
          }
        } else if (hasSendTrigger && items.length && (isBargainEarly || customPrice !== null || CONTENT_WORDS.some((w) => userText.includes(w)))) {
          // Backup path when [PPV:N] tag is missing — fire when bargaining OR agreed price exists OR explicit content request.
          const lastId = wantsVideo ? lastVideoId : lastPhotoId
          if (lastId) {
            targetItem = items.find((i) => i.id === lastId) ?? null
          } else {
            const pool = items.filter((i) => i.mediaType === (wantsVideo ? 'video' : 'photo'))
            targetItem = pool.length ? pool[0] : items[0]
          }
        }

        if (targetItem?.mediaUrl) {
          const isVideo = targetItem.mediaType === 'video'
          const safePrice = !bargainingEnabled
            ? targetItem.priceStars
            : customPrice ? Math.max(customPrice, isVideo ? videoMinPrice : photoMinPrice) : (isVideo ? videoPrice : photoPrice)

          // Step 1: always-succeeds ID upsert — no schema-dependent columns.
          const trackIds: Record<string, unknown> = { bot_id: bot.id, chat_id: chatId, updated_at: new Date().toISOString() }
          if (targetItem.mediaType === 'video') trackIds.last_video_id = targetItem.id
          else trackIds.last_photo_id = targetItem.id
          await db.from('ppv_last_sent').upsert(trackIds, { onConflict: 'bot_id,chat_id' })
          // Step 2: disambiguation column — requires migration, silently no-ops if absent.
          await db.from('ppv_last_sent')
            .update({ last_sent_type: targetItem.mediaType })
            .eq('bot_id', bot.id)
            .eq('chat_id', chatId)

          await sendTyping(bot.token, chatId, bizExtra)
          await sleep(12000)

          const mediaResp = await fetch(`${TG(bot.token)}/sendPaidMedia`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              star_count: safePrice,
              media: [{ type: targetItem.mediaType, media: targetItem.mediaUrl }],
              caption: targetItem.description || targetItem.title,
              ...bizExtra,
            }),
          })

          if (!mediaResp.ok) {
            log('sendPaidMedia error:', await mediaResp.text())
          }
        }

        // Mark messages as replied — filter by replied=false so we never overwrite a message
        // that was already handled by the webhook (prevents double-send on race conditions).
        log(`[ai-reply] chat=${chatId} marking replied ids=${allMsgsToMark.map((m) => m.id).join(',')}`)
        const ids = allMsgsToMark.map((m) => m.id)
        await db.from('tg_updates')
          .update({ replied: true, bot_reply: raw, replied_at: new Date().toISOString() })
          .in('id', ids)
          .eq('replied', false)

        log(`[ai-reply] chat=${chatId} done`)
        processed += allMsgsToMark.length
      } catch (chatErr) {
        log(`[ai-reply] chat=${chatId} ERROR:`, String(chatErr))
      }
      } // end for byChatId
    } catch (err) {
      log(`ai-reply bot ${bot.id}:`, String(err))
    }
  }

  return new Response(JSON.stringify({ ok: true, processed, dbg }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
