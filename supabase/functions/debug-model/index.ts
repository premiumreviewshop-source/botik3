import { db } from '../_shared/db.ts'

const CHAT_ID = 1618945888
const BOT_ID = 'a955962a-f589-4b33-80ad-a04d99ec28dd'

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  if (action === 'clear-history') {
    const { error } = await db.from('tg_updates').delete()
      .eq('bot_id', BOT_ID).eq('type', 'message').eq('chat_id', CHAT_ID)
    // Also clear last-sent tracking so media type detection starts fresh
    const { error: e2 } = await db.from('ppv_last_sent').delete()
      .eq('bot_id', BOT_ID).eq('chat_id', CHAT_ID)
    return new Response(JSON.stringify({ cleared: true, error, tracking_error: e2 }), { headers: { 'Content-Type': 'application/json' } })
  }

  if (action === 'test-video') {
    const { data: bot } = await db.from('bots').select('token').eq('id', BOT_ID).maybeSingle()
    if (!bot) return new Response(JSON.stringify({ error: 'no bot' }))

    const { data: item } = await db.from('ppv_items')
      .select('id, title, description, media_type, media_url, price_stars')
      .eq('bot_id', BOT_ID).eq('media_type', 'video').maybeSingle()

    if (!item) return new Response(JSON.stringify({ error: 'no video item' }))

    const TG = `https://api.telegram.org/bot${bot.token}`

    // First check if the media URL is reachable
    const headResp = await fetch(item.media_url as string, { method: 'HEAD' }).catch((e) => ({ ok: false, status: 0, error: String(e) }))

    // Try sendPaidMedia
    const mediaResp = await fetch(`${TG}/sendPaidMedia`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        star_count: item.price_stars,
        media: [{ type: item.media_type, media: item.media_url }],
        caption: item.description || item.title,
      }),
    })
    const mediaData = await mediaResp.json()

    return new Response(JSON.stringify({
      item_media_url: item.media_url,
      item_media_type: item.media_type,
      item_price_stars: item.price_stars,
      media_url_reachable: (headResp as Response).ok,
      media_url_status: (headResp as Response).status,
      telegram_ok: mediaData.ok,
      telegram_error: mediaData.description ?? null,
      telegram_error_code: mediaData.error_code ?? null,
    }, null, 2), { headers: { 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
})
