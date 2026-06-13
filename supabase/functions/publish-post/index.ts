import { corsHeaders } from '../_shared/cors.ts'
import { db } from '../_shared/db.ts'
import { compileForTelegram } from '../_shared/telegramFormat.ts'
import { parseTelegramCaption } from '../_shared/tgCaption.ts'
import { postViaMTProto } from '../_shared/tgUserPost.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { planItemId, channelId: overrideChannelId } = await req.json()
    if (!planItemId) {
      return new Response(JSON.stringify({ error: 'planItemId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: item } = await db.from('content_plan').select('*').eq('id', planItemId).single()
    if (!item) {
      return new Response(JSON.stringify({ error: 'Plan item not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const resolvedChannelId = item.channel_id ?? overrideChannelId ?? null

    let chatId: string | number | null = null
    if (resolvedChannelId) {
      const { data: ch } = await db.from('channels').select('username').eq('id', resolvedChannelId).single()
      chatId = ch?.username ?? null
    } else if (item.bot_id) {
      const { data: bot } = await db.from('bots').select('chat_id').eq('id', item.bot_id).single()
      chatId = bot?.chat_id ?? null
    }
    if (!chatId) {
      return new Response(JSON.stringify({ error: 'chat_id not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const platformToken = Deno.env.get('PLATFORM_BOT_TOKEN')
    if (!platformToken) {
      return new Response(JSON.stringify({ error: 'PLATFORM_BOT_TOKEN not set' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Compile raw caption → HTML, then parse HTML → plain text + entities
    const { data: emojiRows } = await db.from('saved_emojis').select('sticker_id, label, alt_emoji').eq('tg_user_id', item.tg_user_id)
    const html = compileForTelegram(item.post_caption ?? '', emojiRows ?? [])
    const { text: msgText, entities } = parseTelegramCaption(html)
    console.log('[publish-post] raw caption:', JSON.stringify(item.post_caption?.slice(0, 500)))
    console.log('[publish-post] compiled html:', JSON.stringify(html?.slice(0, 1000)))
    console.log('[publish-post] msgText:', JSON.stringify(msgText?.slice(0, 500)))
    console.log('[publish-post] entities:', JSON.stringify(entities))


    const stagingChatId = Deno.env.get('STAGING_CHAT_ID')
    const userSession = Deno.env.get('PLATFORM_USER_SESSION')
    const tgApiId = Deno.env.get('TG_API_ID')
    const tgApiHash = Deno.env.get('TG_API_HASH')
    const canUseMTProto = !!(userSession && tgApiId && tgApiHash)

    if (resolvedChannelId && item.price && item.price > 0 && item.post_url) {
      // Try MTProto first (supports custom emoji + paid media natively via InputMediaPaidMedia)
      let paidOk = false
      let paidMTProtoErr: string | undefined
      if (canUseMTProto) {
        console.log('[publish-post] trying MTProto paid media for', chatId)
        const result = await postViaMTProto({
          apiId: parseInt(tgApiId!), apiHash: tgApiHash!, session: userSession!,
          chatId, text: msgText, entities, photoUrl: item.post_url, starsAmount: item.price,
        })
        if (result.ok) { paidOk = true; console.log('[publish-post] MTProto paid OK') }
        else { paidMTProtoErr = result.error; console.error('[publish-post] MTProto paid failed:', result.error) }
      }

      if (!paidOk) {
        // Fallback: Bot API sendPaidMedia via multipart (URL-only fails with "wrong type of web page content")
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
        if (paidData.ok) { paidOk = true }
        else {
          return new Response(JSON.stringify({ error: `sendPaidMedia failed: ${paidData.description}`, debug: { paidMTProtoErr } }), {
            status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }

      if (paidOk) {
        await db.from('content_plan').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', planItemId)
        return new Response(JSON.stringify({ ok: true, debug: { usedPaidMedia: true, usedMTProto: !paidMTProtoErr } }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    let tgData: any
    let mtprotoError: string | undefined
    let stagingError: string | undefined

    if (canUseMTProto && resolvedChannelId) {
      console.log('[publish-post] trying MTProto for', chatId)
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
        console.log('[publish-post] MTProto OK')
        tgData = { ok: true, result: {} }
      } else {
        console.error('[publish-post] MTProto failed:', result.error)
        mtprotoError = result.error
      }
    }

    if (!tgData && stagingChatId && resolvedChannelId) {
      // Step 1: post to staging group
      let stagingResp: Response
      if (item.post_url) {
        // Download photo as blob — Telegram can't fetch CloudFront/CDN URLs directly
        let stagingPhotoResp: Response
        try {
          const imgResp = await fetch(item.post_url)
          if (imgResp.ok) {
            const blob = await imgResp.blob()
            const form = new FormData()
            form.append('chat_id', String(stagingChatId))
            form.append('caption', msgText)
            if (entities.length > 0) form.append('caption_entities', JSON.stringify(entities))
            form.append('photo', blob, 'photo.jpg')
            stagingPhotoResp = await fetch(`https://api.telegram.org/bot${platformToken}/sendPhoto`, { method: 'POST', body: form })
          } else {
            throw new Error(`img fetch failed: ${imgResp.status}`)
          }
        } catch {
          // Fallback to URL if blob download fails
          stagingPhotoResp = await fetch(`https://api.telegram.org/bot${platformToken}/sendPhoto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: stagingChatId,
              photo: item.post_url,
              caption: msgText,
              ...(entities.length > 0 ? { caption_entities: entities } : {}),
            }),
          })
        }
        stagingResp = stagingPhotoResp!
      } else {
        stagingResp = await fetch(`https://api.telegram.org/bot${platformToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: stagingChatId,
            text: msgText || '—',
            ...(entities.length > 0 ? { entities } : {}),
          }),
        })
      }
      const stagingData = await stagingResp.json()
      if (!stagingData.ok) {
        stagingError = `staging failed: ${stagingData.description}`
        console.error('[publish-post]', stagingError)
      } else {
        // Step 2: forward staging → channel (preserves custom_emoji entities)
        const fwdResp = await fetch(`https://api.telegram.org/bot${platformToken}/forwardMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            from_chat_id: stagingChatId,
            message_id: stagingData.result.message_id,
          }),
        })
        tgData = await fwdResp.json()
        // Clean up staging message regardless of forward result
        fetch(`https://api.telegram.org/bot${platformToken}/deleteMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: stagingChatId, message_id: stagingData.result.message_id }),
        }).catch(() => {})
        if (!tgData.ok) {
          stagingError = `forward failed: ${tgData.description}`
          console.error('[publish-post]', stagingError)
          tgData = undefined
        }
      }
    }

    if (!tgData && resolvedChannelId) {
      // All channel paths failed — return clear error
      const reason = mtprotoError ?? stagingError ?? 'Не удалось опубликовать'
      const friendly = reason.toLowerCase().includes('not a member') || reason.toLowerCase().includes('admin')
        ? 'Добавь @WeloPosting как администратора канала с правом «Публикация сообщений»'
        : reason
      return new Response(JSON.stringify({ error: friendly, debug: { mtprotoError, stagingError, chatId: String(chatId) } }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!tgData) {
      // Direct Bot API — only for bot_id targets (no channel)
      console.log('[publish-post] trying direct Bot API for', chatId)
      if (item.post_url) {
        let directResp: Response
        try {
          const imgResp = await fetch(item.post_url)
          if (imgResp.ok) {
            const blob = await imgResp.blob()
            const form = new FormData()
            form.append('chat_id', String(chatId))
            form.append('caption', msgText)
            if (entities.length > 0) form.append('caption_entities', JSON.stringify(entities))
            form.append('photo', blob, 'photo.jpg')
            directResp = await fetch(`https://api.telegram.org/bot${platformToken}/sendPhoto`, { method: 'POST', body: form })
          } else {
            throw new Error(`img fetch failed: ${imgResp.status}`)
          }
        } catch {
          directResp = await fetch(`https://api.telegram.org/bot${platformToken}/sendPhoto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              photo: item.post_url,
              caption: msgText,
              ...(entities.length > 0 ? { caption_entities: entities } : {}),
            }),
          })
        }
        tgData = await directResp!.json()
      } else {
        const tgResp = await fetch(`https://api.telegram.org/bot${platformToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: msgText || '—',
            ...(entities.length > 0 ? { entities } : {}),
          }),
        })
        tgData = await tgResp.json()
      }
    }

    if (!tgData?.ok) {
      let errMsg = tgData?.description ?? stagingError ?? mtprotoError ?? 'publish failed'
      if (typeof errMsg === 'string' && (errMsg.toLowerCase().includes('not a member') || errMsg.toLowerCase().includes('kicked') || errMsg.toLowerCase().includes('admin'))) {
        errMsg = 'Добавь @WeloPosting как администратора канала с правом «Публикация сообщений»'
      }
      return new Response(JSON.stringify({
        error: errMsg,
        debug: { mtprotoError, stagingError, tgData, chatId: String(chatId), resolvedChannelId },
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    await db.from('content_plan').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', planItemId)

    const sentEntities = tgData.result?.caption_entities ?? tgData.result?.entities ?? []
    const sentText = tgData.result?.text ?? tgData.result?.caption ?? null
    const usedMTProto = canUseMTProto && resolvedChannelId && !mtprotoError
    const usedStaging = !usedMTProto && !!(stagingChatId && resolvedChannelId)
    return new Response(JSON.stringify({ ok: true, entities: sentEntities, sentText, debug: { usedMTProto, usedStaging, mtprotoError, entitiesBuilt: entities.length, rawCaption: item.post_caption, compiledHtml: html, parsedText: msgText, parsedEntities: entities } }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
