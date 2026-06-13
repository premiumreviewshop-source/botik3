import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { emojiId } = await req.json()
    if (!emojiId) {
      return new Response(JSON.stringify({ error: 'emojiId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = Deno.env.get('PLATFORM_BOT_TOKEN')
    if (!token) {
      return new Response(JSON.stringify({ error: 'PLATFORM_BOT_TOKEN not set' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const resp = await fetch(`https://api.telegram.org/bot${token}/getCustomEmojiStickers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ custom_emoji_ids: [String(emojiId)] }),
    })
    const data = await resp.json()

    if (!data.ok) {
      return new Response(JSON.stringify({ valid: false, error: data.description }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const stickers = data.result ?? []
    if (!stickers.length) {
      return new Response(JSON.stringify({ valid: false, error: 'ID не найден — это не custom emoji ID' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const s = stickers[0]
    return new Response(
      JSON.stringify({ valid: true, emoji: s.emoji ?? '✨', setName: s.set_name ?? null, isAnimated: s.is_animated ?? false, isVideo: s.is_video ?? false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
