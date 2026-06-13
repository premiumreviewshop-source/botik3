import { db } from '../_shared/db.ts'
import { buildSystemPrompt } from '../_shared/prompts.ts'

const XAI_BASE = 'https://api.x.ai/v1'
const grokModel = () => Deno.env.get('XAI_MODEL') ?? 'grok-3'

async function transcribeWithGroq(groqKey: string, botToken: string, fileId: string): Promise<string | null> {
  try {
    const fileInfo = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`).then(r => r.json()).catch(() => null)
    const filePath = fileInfo?.result?.file_path as string | null
    if (!filePath) return null
    const fileBytes = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`).then(r => r.arrayBuffer()).catch(() => null)
    if (!fileBytes) return null
    const ext = filePath.split('.').pop() ?? 'ogg'
    const mimeMap: Record<string, string> = { ogg: 'audio/ogg', mp4: 'video/mp4', m4a: 'audio/m4a', mp3: 'audio/mpeg', wav: 'audio/wav' }
    const mime = mimeMap[ext] ?? 'application/octet-stream'
    const form = new FormData()
    form.append('file', new Blob([fileBytes], { type: mime }), `audio.${ext}`)
    form.append('model', 'whisper-large-v3-turbo')
    const resp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${groqKey}` }, body: form,
    })
    if (!resp.ok) { console.error('[groq] transcribe error', resp.status, await resp.text().catch(() => '')); return null }
    const data = await resp.json()
    return (data.text as string | null)?.trim() ?? null
  } catch (e) { console.error('[groq] exception:', String(e)); return null }
}

async function analyzeImageWithVision(xaiKey: string, botToken: string, fileId: string): Promise<string | null> {
  try {
    const fileInfo = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`).then(r => r.json()).catch(() => null)
    const filePath = fileInfo?.result?.file_path as string | null
    if (!filePath) { console.error('[vision] no file path'); return null }
    const imgBytes = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`).then(r => r.arrayBuffer()).catch(() => null)
    if (!imgBytes) { console.error('[vision] no image bytes'); return null }
    // Chunked base64 to avoid stack overflow on large images
    const uint8 = new Uint8Array(imgBytes)
    let binary = ''
    for (let i = 0; i < uint8.length; i += 8192) {
      binary += String.fromCharCode(...uint8.subarray(i, i + 8192))
    }
    const b64 = btoa(binary)
    const resp = await fetch(`${XAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${xaiKey}` },
      body: JSON.stringify({
        model: grokModel(),
        messages: [{ role: 'user', content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
          { type: 'text', text: 'Describe what you see in 1-2 short sentences. Focus on the person if there is one.' }
        ]}],
        max_tokens: 80
      })
    }).catch((e) => { console.error('[vision] fetch error:', e); return null })
    if (!resp?.ok) {
      const errBody = await resp?.text().catch(() => '')
      console.error(`[vision] xai error status=${resp?.status} body=${errBody}`)
      return null
    }
    const data = await resp.json().catch(() => null)
    const result = (data?.choices?.[0]?.message?.content as string | null)?.trim() ?? null
    console.error(`[vision] ok desc=${result?.slice(0, 60)}`)
    return result
  } catch (e) { console.error('[vision] exception:', String(e)); return null }
}

const VIDEO_TRIGGERS = [
  'video', 'videosu', 'videonu', 'videolar', 'videosun', 'vid ',  // TR
  'видео', 'видос', 'видосик', 'ролик', 'запись', 'клип',          // RU (видос/видосик = colloquial)
  'clip', 'recording',                                             // EN
]
const SEND_TRIGGERS = [
  'atiyorum', 'atıyorum', 'gonderiyorum', 'gönderiyorum',          // TR
  'atayim', 'atayım', 'atıyım', 'atarim', 'atarım', 'atacağım',
  'göndereyim', 'gondereyim',
  'отправляю', 'шлю', 'посылаю', 'скину', 'скидываю', 'кидаю', 'кину',  // RU
  'отправлю', 'пришлю', 'покажу',
  'sending', 'sending you', "i'll send", "i'm sending",             // EN (generic phrases removed — appear in casual chat)
]
const BARGAIN_WORDS = [
  'pahali', 'pahalı', 'ucuz', 'olur', 'peki',                     // TR
  '150', '200', '250', '300', '400', '500', '600', '700',
  '800', '900', '1000', '1200', '1400',
  '1500', '1600', '1700', '1800', '1900', '2000', '2100', '2200', '2300', '2400', '2500',
  '3000', '3500', '4000', '4500', '5000',
  'дорого', 'дешевле', 'скидку', 'скидка', 'мало', 'нет денег',   // RU
  'expensive', 'too expensive', 'too much', 'cheaper', 'discount', // EN
  'broke', "can't afford", 'cant afford', 'lower the price',
  'go lower', 'lower it', 'reduce', 'deal',
]
const CONTENT_WORDS = [
  'göt', 'meme', 'video', 'foto', 'resim', 'amcık', 'amını', 'götünü', // TR ('am' removed — matches tamam/param/yaparım)
  'фото', 'видео', 'грудь', 'сиськи', 'попа',                          // RU general
  'пизду', 'пизда', 'пизды', 'киску', 'киска', 'кису', 'голую', 'нагую', 'голышом', // RU explicit
  'photo', 'boobs', 'ass', 'pussy', 'nude', 'naked', 'tits', 'vagina', // EN
]

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

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

// deno-lint-ignore no-explicit-any
function pickNext(items: any[], lastPhotoId: string | null, lastVideoId: string | null, wantsVideo: boolean) {
  if (!items.length) return null
  const pool = items.filter((i) => i.mediaType === (wantsVideo ? 'video' : 'photo'))
  const use = pool.length ? pool : items
  const lastId = wantsVideo ? lastVideoId : lastPhotoId
  if (!lastId) return use[0]
  const idx = use.findIndex((i) => i.id === lastId)
  return use[idx === -1 ? 0 : (idx + 1) % use.length]
}

Deno.serve(async (req) => {
  const botId = req.headers.get('x-telegram-bot-api-secret-token')
  if (!botId) return new Response('ok')

  const { data: bot } = await db
    .from('bots')
    .select('id, token, modules, is_active, chat_id, tg_user_id')
    .eq('id', botId)
    .maybeSingle()

  if (!bot?.is_active) return new Response('ok')

  let update: Record<string, unknown>
  try { update = await req.json() } catch { return new Response('ok') }

  const TG = `https://api.telegram.org/bot${bot.token}`

  // ── business_connection: auto-save connection ID ────────────────────────────
  if (update.business_connection) {
    const bc = update.business_connection as Record<string, unknown>
    const bcId = bc.id as string | undefined
    if (bcId) {
      const { data: cfgRow } = await db.from('ai_chat_config').select('id').eq('bot_id', bot.id).maybeSingle()
      if (cfgRow) {
        await db.from('ai_chat_config').update({ business_connection_id: bcId }).eq('bot_id', bot.id)
      } else {
        await db.from('ai_chat_config').insert({ bot_id: bot.id, business_connection_id: bcId })
      }
    }
    return new Response('ok')
  }

  // ── pre_checkout_query ────────────────────────────────────────────────────
  if (update.pre_checkout_query) {
    const pcq = update.pre_checkout_query as Record<string, unknown>
    await fetch(`${TG}/answerPreCheckoutQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pre_checkout_query_id: pcq.id, ok: true }),
    })
    return new Response('ok')
  }

  const msg = (update.message ?? update.business_message) as Record<string, unknown> | undefined
  if (!msg) return new Response('ok')

  const businessConnectionId = msg.business_connection_id as string | undefined
  const userId = (msg.from as Record<string, unknown>)?.id as number | null ?? null
  const chatId = (msg.chat as Record<string, unknown>)?.id as number | null ?? null
  const messageId = msg.message_id as number | undefined

  // ── successful_payment — BEFORE chatId guard (business-connection payments may lack chat.id) ──
  const payment = msg.successful_payment as Record<string, unknown> | undefined
  if (payment) {
    const effectiveChatId = chatId ?? userId  // fallback: userId is same as private chat_id
    const payloadStr = payment.invoice_payload as string | undefined
    const amountStars = (payment.total_amount as number | null) ?? 0
    const itemId: string | null = payloadStr?.startsWith('ppv:') ? (payloadStr.split(':')[1] ?? null) : null
    const fromData = msg.from as Record<string, unknown> | undefined
    const tgFirstName = (fromData?.first_name as string | null) ?? null
    const tgUsername = (fromData?.username as string | null) ?? null

    console.error('[PAYMENT] received:', JSON.stringify({ update_id: update.update_id, userId, chatId, effectiveChatId, amountStars, payloadStr, itemId, tgFirstName, tgUsername }))

    try {
      await db.from('tg_updates').upsert(
        { bot_id: bot.id, update_id: update.update_id as number, type: 'payment', user_id: userId, chat_id: effectiveChatId, amount: amountStars, payload: payloadStr, replied: true },
        { onConflict: 'bot_id,update_id', ignoreDuplicates: true },
      )
    } catch (e) { console.error('[PAYMENT] tg_updates upsert failed:', e) }

    // Try inserting with item_id (FK). If FK fails, retry without item_id so the sale is always recorded.
    let purchaseInserted = false
    if (itemId) {
      try {
        await db.from('ppv_purchases').insert({
          bot_id: bot.id, item_id: itemId, tg_user_id: userId,
          chat_id: effectiveChatId, amount_stars: amountStars, payload: payloadStr ?? null,
          tg_first_name: tgFirstName, tg_username: tgUsername,
        })
        purchaseInserted = true
        console.error('[PAYMENT] ppv_purchases inserted with item_id')
      } catch (e) { console.error('[PAYMENT] insert with item_id failed:', e) }
    }
    if (!purchaseInserted) {
      try {
        await db.from('ppv_purchases').insert({
          bot_id: bot.id, item_id: null, tg_user_id: userId,
          chat_id: effectiveChatId, amount_stars: amountStars, payload: payloadStr ?? null,
          tg_first_name: tgFirstName, tg_username: tgUsername,
        })
        console.error('[PAYMENT] ppv_purchases inserted without item_id (fallback)')
      } catch (e) { console.error('[PAYMENT] fallback insert also failed:', e) }
    }

    // ── Balance top-up via TG Stars ──────────────────────────────────────────
    if (payloadStr?.startsWith('topup:')) {
      const parts = payloadStr.split(':')
      const targetUserId = parts[1]
      const amtStr = parts[2]
      const nonce = parts[3] ?? ''
      const amountUsd = parseFloat(amtStr ?? '0')
      if (targetUserId && amountUsd > 0) {
        const noncePart = nonce ? ` #${nonce}` : ''
        const desc = `TG Stars · +$${amountUsd} (${amountStars} ⭐)${noncePart}`
        const now = new Date()
        const dateStr = `${now.getDate().toString().padStart(2,'0')}.${(now.getMonth()+1).toString().padStart(2,'0')}.${now.getFullYear()}`
        const { data: topupData, error: topupTxErr } = await db.from('transactions').upsert(
          { tg_user_id: targetUserId, type: 'topup', amount: amountUsd, description: desc, date: dateStr, created_at: now.toISOString() },
          { onConflict: 'tg_user_id,description', ignoreDuplicates: true }
        ).select('id')
        if (topupTxErr) console.error('[topup] tx upsert failed:', JSON.stringify(topupTxErr))
        const wasInserted = (topupData?.length ?? 0) > 0
        // Only notify if this handler actually inserted (prevents double-notify with credit_tgstars)
        if (wasInserted && effectiveChatId) {
          await fetch(`${TG}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: effectiveChatId,
              text: `✅ Баланс пополнен на $${amountUsd}!\n⭐ Списано: ${amountStars} звёзд`,
            }),
          }).catch(() => {})
        }
        const ownerChatId = Deno.env.get('OWNER_TG_ID')
        if (wasInserted && ownerChatId) {
          await fetch(`${TG}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: ownerChatId,
              text: `💰 <b>Пополнение</b>\nПользователь: <code>${targetUserId}</code>\nСумма: <b>+$${amountUsd}</b>\nМетод: TG Stars (${amountStars} ⭐)`,
              parse_mode: 'HTML',
            }),
          }).catch(() => {})
        }
      }
      return new Response('ok')
    }

    if (itemId) {
      const deliverTask = async () => {
        try {
          const { data: item } = await db.from('ppv_items')
            .select('title, description, media_type, media_url')
            .eq('id', itemId).maybeSingle()
          if (item?.media_url && effectiveChatId) {
            const method = item.media_type === 'video' ? 'sendVideo' : 'sendPhoto'
            const field = item.media_type === 'video' ? 'video' : 'photo'
            await fetch(`${TG}/${method}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: effectiveChatId, [field]: item.media_url, caption: item.description || item.title }),
            })
          }
          await db.rpc('increment_ppv_purchases', { item_id: itemId })
        } catch { /* ignore */ }
      }
      try {
        // deno-lint-ignore no-explicit-any
        ;(globalThis as any).EdgeRuntime?.waitUntil(deliverTask())
      } catch {
        deliverTask()
      }
    }

    return new Response('ok')
  }

  if (!chatId) return new Response('ok')

  // Skip messages sent by the business account owner themselves
  const ownerChatId = bot.chat_id as string | null ?? null
  if (businessConnectionId && ownerChatId && String(userId) === ownerChatId) return new Response('ok')

  // ── text / sticker / photo / video ───────────────────────────────────────
  const text = msg.text as string | undefined
  const sticker = msg.sticker as Record<string, unknown> | undefined
  const photos = msg.photo as unknown[] | undefined
  const video = msg.video as Record<string, unknown> | undefined
  const videoNote = msg.video_note as Record<string, unknown> | undefined
  const caption = msg.caption as string | undefined

  // Derive displayable text so all message types reach the AI
  const voice = msg.voice as Record<string, unknown> | undefined
  const audio = msg.audio as Record<string, unknown> | undefined

  let effectiveText: string | undefined = text
  let videoDurationMs = 0
  let watchAction: string | null = null
  if (!effectiveText) {
    if (sticker) {
      effectiveText = (sticker.emoji as string | null) || '[sticker]'
    } else if (photos) {
      const photoArr = photos as Array<Record<string, unknown>>
      const largest = photoArr[photoArr.length - 1]
      const photoFileId = largest?.file_id as string | undefined
      const xaiKey = Deno.env.get('XAI_API_KEY')
      if (xaiKey && photoFileId) {
        const desc = await analyzeImageWithVision(xaiKey, bot.token, photoFileId)
        if (desc) effectiveText = caption ? `${caption} [photo: ${desc}]` : `[photo: ${desc}]`
      }
      if (!effectiveText) effectiveText = caption ? `${caption} [photo]` : '[photo]'
    } else if (video) {
      const dur = video.duration as number | undefined
      videoDurationMs = Math.min((dur ?? 0) * 1000, 25000)
      watchAction = 'upload_video'
      const thumb = (video.thumbnail ?? video.thumb) as Record<string, unknown> | undefined
      const thumbFileId = thumb?.file_id as string | undefined
      const xaiKey = Deno.env.get('XAI_API_KEY')
      if (xaiKey && thumbFileId) {
        const desc = await analyzeImageWithVision(xaiKey, bot.token, thumbFileId)
        if (desc) effectiveText = caption ? `${caption} [video: ${desc}]` : `[video: ${desc}]`
      }
      if (!effectiveText) effectiveText = caption ? `${caption} [video]` : '[video]'
    } else if (videoNote) {
      const dur = videoNote.duration as number | undefined
      videoDurationMs = Math.min((dur ?? 0) * 1000, 60000)
      watchAction = 'record_video'
      const groqKey = Deno.env.get('GROQ_API_KEY')
      const noteFileId = videoNote.file_id as string | undefined
      if (groqKey && noteFileId) {
        const transcript = await transcribeWithGroq(groqKey, bot.token, noteFileId)
        if (transcript) effectiveText = `[кружок: "${transcript}"]`
      }
      if (!effectiveText) {
        const thumb = (videoNote.thumbnail ?? videoNote.thumb) as Record<string, unknown> | undefined
        const thumbFileId = thumb?.file_id as string | undefined
        const xaiKey = Deno.env.get('XAI_API_KEY')
        if (xaiKey && thumbFileId) {
          const desc = await analyzeImageWithVision(xaiKey, bot.token, thumbFileId)
          if (desc) effectiveText = `[круглое видео: ${desc}]`
        }
      }
      if (!effectiveText) effectiveText = '[круглое видео]'
    } else if (voice ?? audio) {
      const voiceObj = (voice ?? audio) as Record<string, unknown>
      const fileId = voiceObj.file_id as string
      const dur = voiceObj.duration as number | undefined
      const groqKey = Deno.env.get('GROQ_API_KEY')
      if (groqKey && fileId) {
        try {
          const fileInfo = await fetch(`${TG}/getFile?file_id=${fileId}`).then(r => r.json()).catch(() => null)
          const filePath = fileInfo?.result?.file_path as string | null
          if (filePath) {
            const audioBytes = await fetch(`https://api.telegram.org/file/bot${bot.token}/${filePath}`).then(r => r.arrayBuffer()).catch(() => null)
            if (audioBytes) {
              const form = new FormData()
              form.append('file', new Blob([audioBytes], { type: 'audio/ogg' }), 'voice.ogg')
              form.append('model', 'whisper-large-v3-turbo')
              const wResp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                method: 'POST',
                headers: { Authorization: `Bearer ${groqKey}` },
                body: form,
              })
              if (wResp.ok) {
                const wData = await wResp.json()
                const transcript = (wData.text as string | null)?.trim()
                if (transcript) effectiveText = `[voice: ${transcript}]`
              }
            }
          }
        } catch { /* fall through */ }
      }
      if (!effectiveText) effectiveText = dur ? `[voice message ${dur}s]` : '[voice message]'
    }
  }
  if (!effectiveText) return new Response('ok') // document, animation, etc.

  // Save to DB — dedup on update_id so Telegram retries are ignored
  const { data: savedMsg } = await db.from('tg_updates').upsert(
    {
      bot_id: bot.id,
      update_id: update.update_id as number,
      type: 'message',
      user_id: userId,
      chat_id: chatId,
      message_id: messageId ?? null,
      text: effectiveText,
      replied: false,
    },
    { onConflict: 'bot_id,update_id', ignoreDuplicates: true },
  ).select('id')
  if (!savedMsg?.length) return new Response('ok')

  // Only process if AI Chat module is active
  if (!Array.isArray(bot.modules) || !bot.modules.includes('AI Chat')) return new Response('ok')

  const { data: config } = await db
    .from('ai_chat_config')
    .select('*')
    .eq('bot_id', bot.id)
    .maybeSingle()
  if (!config) return new Response('ok')

  const readDelayMs = ((config.read_delay_seconds as number | null) ?? 2) * 1000
  const largeDelayEnabled = (config.large_delay_enabled as boolean | null) ?? false
  const largeDelaySec = (config.large_delay_seconds as number | null) ?? 60
  const inactivityResetMin = (config.inactivity_reset_minutes as number | null) ?? 10

  // Large delay mode: check if this chat is active or cold.
  // Active chat (last reply within inactivityResetMin) → handle here with normal readDelay.
  // Cold/first-message chat → defer to ai-reply cron which waits for largeDelaySec.
  if (largeDelayEnabled) {
    const { data: lastReply } = await db.from('tg_updates')
      .select('ts, replied_at')
      .eq('bot_id', bot.id)
      .eq('chat_id', chatId)
      .eq('replied', true)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()
    // Use replied_at (when bot actually sent reply) if available, fall back to ts (message arrival)
    const replyTime = (lastReply?.replied_at ?? lastReply?.ts) as string | null
    const msSinceReply = replyTime ? Date.now() - new Date(replyTime).getTime() : Infinity
    const isActive = msSinceReply < inactivityResetMin * 60_000
    // Cold chat or first message: let cron handle (typing + ✓✓ only after full largeDelay)
    if (!isActive) return new Response('ok')
    // Active chat: fall through to immediate reply path below
    void largeDelaySec // used only in cron path
  }

  // Normal (immediate) reply path ───────────────────────────────────────────

  // Atomic claim: mark our message as being processed.
  // Prevents concurrent webhook instances and the cron from processing the same message.
  const staleThreshold = new Date(Date.now() - 120000).toISOString() // 2 min stale lock
  const { data: claimed } = await db.from('tg_updates')
    .update({ locked_at: new Date().toISOString() })
    .eq('id', savedMsg[0].id)
    .eq('replied', false)
    .or(`locked_at.is.null,locked_at.lt.${staleThreshold}`)
    .select('id')
  if (!claimed?.length) return new Response('ok') // Another instance already claimed this

  // For business connections: sleep readDelay then show ✓✓ (marks message as read).
  // For regular bots: no sleep — reply instantly (read_delay_seconds only affects ✓✓ timing).
  if (businessConnectionId && messageId) {
    await sleep(readDelayMs)
    await fetch(`${TG}/readBusinessMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_connection_id: businessConnectionId, chat_id: chatId, message_id: messageId }),
    }).catch(() => {})
  }

  // Bundle: fetch ALL unreplied messages for this chat ordered by arrival time.
  // Also bulk-claim them to prevent concurrent instances from picking them up.
  const { data: allUnreplied } = await db.from('tg_updates')
    .select('id, text')
    .eq('bot_id', bot.id)
    .eq('chat_id', chatId)
    .eq('type', 'message')
    .eq('replied', false)
    .not('text', 'is', null)
    .gte('ts', new Date(Date.now() - 6 * 3600 * 1000).toISOString()) // max 6h old
    .order('ts', { ascending: true })

  // Bulk-claim the entire bundle so other instances skip these messages
  if (allUnreplied?.length) {
    await db.from('tg_updates')
      .update({ locked_at: new Date().toISOString() })
      .in('id', allUnreplied.map((m) => m.id))
      .eq('replied', false)
      .or(`locked_at.is.null,locked_at.lt.${staleThreshold}`)
  }

  // Global bargain config
  const photoPrice = (config.photo_price as number | null) ?? 250
  const photoMinPrice = (config.photo_min_price as number | null) ?? 150
  const videoPrice = (config.video_price as number | null) ?? 1400
  const videoMinPrice = (config.video_min_price as number | null) ?? 900
  const bargainingEnabled = (config.bargaining_enabled as boolean | null) !== false

  const { data: ppvRaw } = await db.from('ppv_items')
    .select('id, title, description, media_type, media_url, price_stars')
    .eq('bot_id', bot.id)
    .order('created_at', { ascending: true })

  const items = (ppvRaw ?? []).map((i, idx) => ({
    idx: idx + 1,
    id: i.id as string,
    title: i.title as string,
    description: (i.description ?? '') as string,
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

  const { data: history } = await db.from('tg_updates')
    .select('text, bot_reply')
    .eq('bot_id', bot.id).eq('chat_id', chatId).eq('type', 'message')
    .not('text', 'is', null).eq('replied', true)
    .order('id', { ascending: false }).limit(20)

  const lastWasVideo = (history ?? []).slice(0, 3).some((h) =>
    VIDEO_TRIGGERS.some((w) => (h.bot_reply ?? '').toLowerCase().includes(w)) ||
    VIDEO_TRIGGERS.some((w) => (h.text ?? '').toLowerCase().includes(w))
  )

  const { data: lastSent } = await db.from('ppv_last_sent')
    .select('last_photo_id, last_video_id, last_sent_type')
    .eq('bot_id', bot.id).eq('chat_id', chatId).maybeSingle()
  const lastPhotoId = (lastSent?.last_photo_id as string | null) ?? null
  const lastVideoId = (lastSent?.last_video_id as string | null) ?? null
  const lastSentType = (lastSent?.last_sent_type as 'video' | 'photo' | null) ?? null

  const lastTypeIsVideo = lastSentType === 'video' ? true
    : lastSentType === 'photo' ? false
    : lastVideoId !== null && lastPhotoId === null ? true
    : lastVideoId === null && lastPhotoId !== null ? false
    : lastWasVideo

  // Use the LAST (most recent) message for keyword detection
  const safeUnreplied = allUnreplied ?? []
  const lastText = (safeUnreplied[safeUnreplied.length - 1]?.text ?? effectiveText) as string
  const textLower = lastText.toLowerCase()
  const currentWantsVideo = VIDEO_TRIGGERS.some((w) => textLower.includes(w))
  const isBargainEarly = BARGAIN_WORDS.some((w) => textLower.includes(w)) && !CONTENT_WORDS.some((w) => textLower.includes(w))
  const hasAnyHistory = lastVideoId !== null || lastPhotoId !== null || (history?.length ?? 0) > 0

  const extraTypeIsVideo = currentWantsVideo ? true : (hasAnyHistory && lastTypeIsVideo && !CONTENT_WORDS.some((w) => textLower.includes(w)))
  const activeContentType: 'video' | 'photo' = extraTypeIsVideo ? 'video' : 'photo'

  const systemPrompt = buildSystemPrompt({
    lang: config.lang as 'en' | 'ru' | 'tr',
    name: config.persona_name as string,
    age: config.persona_age as string,
    city: config.persona_city as string,
    customPrompt: config.prompt_type === 'custom' ? (config.custom_prompt as string) : undefined,
    catalog,
    photoPrice, photoMinPrice, videoPrice, videoMinPrice,
    bargainingEnabled,
    activeContentType,
    vipEnabled: (config.vip_enabled as boolean) === true,
    vipLink: (config.vip_link as string) ?? '',
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
    const s2line = step3 !== null ? `2-й: ${step2}, 3-й: ${step3}` : `2-й: ${step2}`
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

  const hist = history ?? []
  const lastDelivIdx = hist.findIndex((h) =>
    SEND_TRIGGERS.some((w) => (h.bot_reply ?? '').toLowerCase().includes(w))
  )
  let relevantHist = lastDelivIdx === -1 ? hist : hist.slice(0, lastDelivIdx + 1)
  const isCasualMessage = !isBargainEarly && !CONTENT_WORDS.some((w) => textLower.includes(w))
  if (isCasualMessage && relevantHist.length > 4) {
    const allPriceReplies = relevantHist.slice(0, 4).every((h) => /^\d+$/.test((h.bot_reply ?? '').trim()))
    if (allPriceReplies) relevantHist = relevantHist.slice(0, 4)
  }
  // Collapse consecutive identical bot replies so contaminated history
  // (e.g. 20× "Selam canım naber") doesn't make Grok repeat the same reply for everything.
  relevantHist = relevantHist.filter((h, i, arr) => {
    if (i === 0) return true
    return (h.bot_reply ?? '').trim() !== (arr[i - 1].bot_reply ?? '').trim()
  })

  const convMessages: Array<{ role: string; content: string }> = []
  for (const h of [...relevantHist].reverse()) {
    if (h.text) convMessages.push({ role: 'user', content: h.text as string })
    if (h.bot_reply) convMessages.push({ role: 'assistant', content: h.bot_reply as string })
  }
  // Add all bundled unreplied messages (fallback to current text if DB returned nothing)
  if (safeUnreplied.length > 0) {
    for (const m of safeUnreplied) {
      if (m.text) convMessages.push({ role: 'user', content: m.text as string })
    }
  } else {
    convMessages.push({ role: 'user', content: effectiveText })
  }

  const bizExtra = businessConnectionId ? { business_connection_id: businessConnectionId } : {}

  // For video/кружок: show watch action and wait for the video duration before typing
  if (videoDurationMs > 0 && watchAction) {
    await fetch(`${TG}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: watchAction, ...bizExtra }),
    }).catch(() => {})
    await sleep(videoDurationMs)
  }

  // Show typing only NOW (after delay has already passed, right before calling Grok)
  await fetch(`${TG}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action: 'typing', ...bizExtra }),
  }).catch(() => {})

  const xaiKey = Deno.env.get('XAI_API_KEY')
  if (!xaiKey) return new Response('ok')

  // ── Balance check for bot owner ─────────────────────────────────────────────
  const ownerTgId = String((bot as any).tg_user_id ?? '')
  const messageCost = parseFloat(Deno.env.get('AI_MESSAGE_COST') ?? '0.025')
  let ownerBalance = 0
  if (ownerTgId && ownerTgId !== '0' && messageCost > 0) {
    const { data: txData, error: txErr } = await db.from('transactions').select('type, amount').eq('tg_user_id', ownerTgId)
    if (txErr) console.error('[balance-check] tx fetch error:', JSON.stringify(txErr))
    for (const t of (txData ?? []) as any[]) {
      if (t.type === 'topup') ownerBalance += Number(t.amount) || 0
      else if (t.type === 'spend') ownerBalance -= Math.abs(Number(t.amount) || 0)
    }
    console.error(`[balance-check] ownerTgId=${ownerTgId} balance=${ownerBalance} cost=${messageCost} txCount=${(txData ?? []).length}`)
    if (ownerBalance < messageCost) {
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
      return new Response('ok')
    }
  }

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
    if (deductErr) console.error('balance deduct failed:', JSON.stringify(deductErr))
  }

  let raw = ''
  try {
    console.error(`[grok] calling model=${grokModel()} msgs=${convMessages.length}`)
    const grokResp = await fetch(`${XAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${xaiKey}` },
      body: JSON.stringify({
        model: grokModel(),
        messages: [{ role: 'system', content: systemPrompt + extraRule }, ...convMessages],
        max_tokens: 100,
      }),
    })

    if (!grokResp.ok) {
      const errBody = await grokResp.text().catch(() => '')
      console.error(`[grok] error status=${grokResp.status} body=${errBody}`)
      return new Response('ok')
    }

    const grokData = await grokResp.json()
    raw = grokData.choices?.[0]?.message?.content ?? ''
    console.error(`[grok] ok raw_len=${raw.length} preview=${raw.slice(0, 40)}`)
    if (!raw) return new Response('ok')
  } catch (e) {
    console.error('[grok] exception:', String(e))
    return new Response('ok')
  }

  const ppvMatch = raw.match(/\[PPV:(\d+)\]/)
  const ppvIdx = ppvMatch ? parseInt(ppvMatch[1]) : null
  raw = raw.replace(/\[PPV:\d+\]/g, '').trim()

  const rawLower = raw.toLowerCase()
  const hasSendTrigger = SEND_TRIGGERS.some((w) => rawLower.includes(w))

  let customPrice: number | null = null
  if (isBargainEarly) {
    customPrice = extractPrice(raw) ?? extractPrice(lastText) ?? extractBarePrice(lastText)
  }
  if (!customPrice && hasSendTrigger && !CONTENT_WORDS.some((w) => textLower.includes(w))) {
    const prevReply = history?.[0]?.bot_reply as string | null
    customPrice = prevReply ? (extractPrice(prevReply) ?? extractBarePrice(prevReply)) : null
  }

  const wantsVideo = extraTypeIsVideo

  const delay = Math.min(raw.length * 100, 10000)
  await sleep(delay)

  // Re-read any messages that arrived while we were "typing"
  const { data: lateMsgs } = await db.from('tg_updates')
    .select('id, text')
    .eq('bot_id', bot.id).eq('chat_id', chatId).eq('type', 'message').eq('replied', false)
    .not('text', 'is', null).gte('ts', new Date(Date.now() - 6 * 3600 * 1000).toISOString())
    .order('ts', { ascending: true })
  const claimedSet = new Set((allUnreplied ?? []).map(m => m.id))
  const lateArrivals = (lateMsgs ?? []).filter(m => !claimedSet.has(m.id))
  if (lateArrivals.length > 0) {
    await db.from('tg_updates').update({ locked_at: new Date().toISOString() })
      .in('id', lateArrivals.map(m => m.id)).eq('replied', false)
  }

  console.error(`[send] chatId=${chatId} len=${raw.length}`)
  const sendResp = await fetch(`${TG}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: raw, ...bizExtra }),
  }).catch((e: unknown) => { console.error('[send] fetch threw:', String(e)); return null })
  if (sendResp && !sendResp.ok) {
    const errText = await sendResp.text().catch(() => '')
    console.error(`[send] TG error status=${sendResp.status} body=${errText}`)
  }

  // Mark ALL bundled messages as replied (including any that arrived during typing)
  const bundledIds = [...(allUnreplied ?? []).map((m) => m.id), ...lateArrivals.map(m => m.id)]
  await db.from('tg_updates')
    .update({ replied: true, bot_reply: raw, replied_at: new Date().toISOString() })
    .in('id', bundledIds)
    .eq('replied', false)

  let targetItem: typeof items[0] | null = null

  if (ppvIdx !== null) {
    if ((isBargainEarly || customPrice !== null) && items.length) {
      targetItem = pickNext(items, lastPhotoId, lastVideoId, wantsVideo)
    }
    if (!targetItem) targetItem = items.find((i) => i.idx === ppvIdx) ?? null
    if (!targetItem && items.length) {
      targetItem = pickNext(items, lastPhotoId, lastVideoId, wantsVideo)
    }
  } else if (hasSendTrigger && items.length && (isBargainEarly || customPrice !== null || CONTENT_WORDS.some((w) => textLower.includes(w)))) {
    targetItem = pickNext(items, lastPhotoId, lastVideoId, wantsVideo)
  }

  if (targetItem?.mediaUrl) {
    const isVideo = targetItem.mediaType === 'video'
    const finalPrice = !bargainingEnabled
      ? targetItem.priceStars
      : customPrice ? Math.max(customPrice, isVideo ? videoMinPrice : photoMinPrice) : (isVideo ? videoPrice : photoPrice)

    const updIds: Record<string, unknown> = { bot_id: bot.id, chat_id: chatId, updated_at: new Date().toISOString() }
    if (targetItem.mediaType === 'video') updIds.last_video_id = targetItem.id
    else updIds.last_photo_id = targetItem.id
    await db.from('ppv_last_sent').upsert(updIds, { onConflict: 'bot_id,chat_id' })
    await db.from('ppv_last_sent')
      .update({ last_sent_type: targetItem.mediaType })
      .eq('bot_id', bot.id)
      .eq('chat_id', chatId)

    const tgLocal = TG
    const item = targetItem
    const bizExtraLocal = bizExtra
    const sendMediaTask = async () => {
      await fetch(`${tgLocal}/sendChatAction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, action: isVideo ? 'upload_video' : 'upload_photo', ...bizExtraLocal }),
      }).catch(() => {})
      await sleep(12000)
      const mediaResp = await fetch(`${tgLocal}/sendPaidMedia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          star_count: finalPrice,
          payload: `ppv:${item.id}`,
          media: [{ type: item.mediaType, media: item.mediaUrl }],
          caption: item.description || item.title,
          ...bizExtraLocal,
        }),
      })
      if (!mediaResp.ok) {
        console.error('sendPaidMedia error:', await mediaResp.text())
      }
    }

    try {
      // deno-lint-ignore no-explicit-any
      ;(globalThis as any).EdgeRuntime?.waitUntil(sendMediaTask())
    } catch {
      sendMediaTask()
    }
  }

  return new Response('ok')
})
