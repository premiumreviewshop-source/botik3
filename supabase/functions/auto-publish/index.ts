import { corsHeaders } from '../_shared/cors.ts'
import { db } from '../_shared/db.ts'
import { compileForTelegram } from '../_shared/telegramFormat.ts'
import { parseTelegramCaption } from '../_shared/tgCaption.ts'
import { postViaMTProto } from '../_shared/tgUserPost.ts'

async function postToChat(
  token: string,
  chatId: string | number,
  msgText: string,
  entities: any[],
  postUrl: string | null,
): Promise<Response> {
  if (postUrl) {
    try {
      const imgResp = await fetch(postUrl)
      if (imgResp.ok) {
        const blob = await imgResp.blob()
        const form = new FormData()
        form.append('chat_id', String(chatId))
        form.append('caption', msgText)
        if (entities.length > 0) form.append('caption_entities', JSON.stringify(entities))
        form.append('photo', blob, 'photo.jpg')
        return fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body: form })
      }
    } catch { /* fall through to URL method */ }
    return fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        photo: postUrl,
        caption: msgText,
        ...(entities.length > 0 ? { caption_entities: entities } : {}),
      }),
    })
  }
  return fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: msgText || '—',
      ...(entities.length > 0 ? { entities } : {}),
    }),
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Fetch ALL scheduled items — filter channel/bot in JS to avoid OR syntax issues
    const { data: allScheduled, error } = await db
      .from('content_plan')
      .select('*')
      .eq('status', 'scheduled')

    if (error) throw error

    const totalScheduled = (allScheduled ?? []).length
    const items = (allScheduled ?? []).filter(
      (item: any) => item.channel_id != null || item.bot_id != null,
    )

    if (!items.length) {
      return new Response(
        JSON.stringify({ published: 0, checked: 0, total: totalScheduled, active: 0, errors: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const now = new Date()
    const due = items.filter((item: any) => {
      if (item.scheduled_at) return new Date(item.scheduled_at) <= now
      // date_obj + time stored in UTC — 'Z' makes it explicit
      const hhmm = (item.time as string | null)?.slice(0, 5) ?? '00:00'
      return new Date(`${item.date_obj}T${hhmm}:00Z`) <= now
    })

    const platformToken = Deno.env.get('PLATFORM_BOT_TOKEN')
    if (!platformToken) throw new Error('PLATFORM_BOT_TOKEN not set')

    const stagingChatId = Deno.env.get('STAGING_CHAT_ID')
    const userSession = Deno.env.get('PLATFORM_USER_SESSION')
    const tgApiId = Deno.env.get('TG_API_ID')
    const tgApiHash = Deno.env.get('TG_API_HASH')
    const canUseMTProto = !!(userSession && tgApiId && tgApiHash)

    let published = 0
    const errors: string[] = []

    for (const item of due) {
      let chatId: string | number | null = null

      if (item.channel_id) {
        const { data: ch } = await db.from('channels').select('username').eq('id', item.channel_id).single()
        chatId = ch?.username ?? null
      } else if (item.bot_id) {
        const { data: bot } = await db.from('bots').select('chat_id').eq('id', item.bot_id).single()
        chatId = bot?.chat_id ?? null
      }

      if (!chatId) {
        errors.push(`item ${item.id}: no chat_id (channel_id=${item.channel_id})`)
        continue
      }

      // Compile raw caption → HTML, then parse HTML → plain text + entities
      const { data: emojiRows } = await db.from('saved_emojis').select('sticker_id, label, alt_emoji').eq('tg_user_id', item.tg_user_id)
      const html = compileForTelegram(item.post_caption ?? '', emojiRows ?? [])
      const { text: msgText, entities } = parseTelegramCaption(html)
      console.log(`[auto-publish] item ${item.id} raw:`, JSON.stringify(item.post_caption?.slice(0, 300)))
      console.log(`[auto-publish] item ${item.id} html:`, JSON.stringify(html?.slice(0, 500)))
      console.log(`[auto-publish] item ${item.id} entities:`, JSON.stringify(entities))
      console.log(`[auto-publish] item ${item.id} canUseMTProto:`, canUseMTProto, 'channel_id:', item.channel_id)

      let success = false

      if (item.channel_id && item.price && item.price > 0 && item.post_url) {
        // Try MTProto first for paid media (supports custom emoji + paid natively via InputMediaPaidMedia)
        if (canUseMTProto) {
          console.log(`[auto-publish] item ${item.id} trying MTProto paid media`)
          const result = await postViaMTProto({
            apiId: parseInt(tgApiId!), apiHash: tgApiHash!, session: userSession!,
            chatId, text: msgText, entities, photoUrl: item.post_url, starsAmount: item.price,
          })
          if (result.ok) { success = true; console.log(`[auto-publish] item ${item.id} MTProto paid OK`) }
          else { console.error(`[auto-publish] item ${item.id} MTProto paid failed:`, result.error) }
        }
        if (!success) {
          // Fallback: Bot API sendPaidMedia via multipart
          let paidResp: Response
          try {
            const imgResp = await fetch(item.post_url)
            if (!imgResp.ok) throw new Error(`img fetch ${imgResp.status}`)
            const blob = await imgResp.blob()
            const form = new FormData()
            form.append('chat_id', String(chatId))
            form.append('star_count', String(item.price))
            form.append('media', JSON.stringify([{ type: 'photo', media: 'attach://photo' }]))
            form.append('photo', blob, 'photo.jpg')
            if (msgText) form.append('caption', msgText)
            if (entities.length > 0) form.append('caption_entities', JSON.stringify(entities))
            paidResp = await fetch(`https://api.telegram.org/bot${platformToken}/sendPaidMedia`, { method: 'POST', body: form })
          } catch {
            paidResp = await fetch(`https://api.telegram.org/bot${platformToken}/sendPaidMedia`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: String(chatId), star_count: item.price, media: [{ type: 'photo', media: item.post_url }], ...(msgText ? { caption: msgText } : {}), ...(entities.length > 0 ? { caption_entities: entities } : {}) }),
            })
          }
          const paidData = await paidResp.json()
          if (paidData.ok) { success = true }
          else { errors.push(`item ${item.id}: sendPaidMedia failed — ${paidData.description}`) }
        }
      } else if (item.channel_id) {
        let mtprotoErr: string | undefined
        let stagingErr: string | undefined

        if (canUseMTProto) {
          console.log(`[auto-publish] item ${item.id} trying MTProto for`, chatId)
          const result = await postViaMTProto({
            apiId: parseInt(tgApiId!),
            apiHash: tgApiHash!,
            session: userSession!,
            chatId,
            text: msgText,
            entities,
            photoUrl: item.post_url ?? null,
          })
          if (result.ok) {
            console.log(`[auto-publish] item ${item.id} MTProto OK`)
            success = true
          } else {
            console.error(`[auto-publish] item ${item.id} MTProto failed:`, result.error)
            mtprotoErr = result.error
          }
        }

        if (!success && stagingChatId) {
          console.log(`[auto-publish] item ${item.id} trying staging+forward`)
          const stagingResp = await postToChat(platformToken, stagingChatId, msgText, entities, item.post_url ?? null)
          const stagingData = await stagingResp.json()
          if (!stagingData.ok) {
            stagingErr = `staging failed — ${stagingData.description}`
            console.error(`[auto-publish] item ${item.id} staging failed:`, stagingData.description)
          } else {
            const fwdResp = await fetch(`https://api.telegram.org/bot${platformToken}/forwardMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: chatId, from_chat_id: stagingChatId, message_id: stagingData.result.message_id }),
            })
            const fwdData = await fwdResp.json()
            fetch(`https://api.telegram.org/bot${platformToken}/deleteMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: stagingChatId, message_id: stagingData.result.message_id }),
            }).catch(() => {})
            if (fwdData.ok) {
              success = true
            } else {
              stagingErr = `forward failed — ${fwdData.description}`
            }
          }
        }

        if (!success) {
          // Last resort: direct Bot API (requires bot to be channel admin)
          const resp = await postToChat(platformToken, chatId, msgText, entities, item.post_url ?? null)
          const tgData = await resp.json()
          if (tgData.ok) {
            success = true
          } else {
            errors.push(`item ${item.id}: all methods failed — mtproto: ${mtprotoErr ?? 'skipped'}, staging: ${stagingErr ?? 'skipped'}, direct: ${tgData.description}`)
          }
        }
      } else if (item.bot_id) {
        // Direct Bot API for bot_id targets (groups/private)
        const resp = await postToChat(platformToken, chatId, msgText, entities, item.post_url ?? null)
        const tgData = await resp.json()
        if (tgData.ok) {
          success = true
        } else {
          errors.push(`item ${item.id}: tg ${tgData.error_code} — ${tgData.description}`)
        }
      }

      if (success) {
        await db.from('content_plan').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', item.id)
        published++
      }
    }

    return new Response(
      JSON.stringify({ published, checked: due.length, total: totalScheduled, active: items.length, errors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
