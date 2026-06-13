import { corsHeaders } from '../_shared/cors.ts'
import { db } from '../_shared/db.ts'
import { verifyAuth } from '../_shared/auth.ts'

const respond = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const botToken = Deno.env.get('PLATFORM_BOT_TOKEN') ?? Deno.env.get('BOT_TOKEN') ?? ''
    const auth = await verifyAuth(body.initData, botToken)
    if ('error' in auth) return respond(auth, auth.status)
    const uid = auth.uid

    const { id, reset } = body
    if (!id) return respond({ error: 'id required' }, 400)

    const { data: bot } = await db.from('bots').select('tg_user_id').eq('id', id).single()
    if (!bot || String(bot.tg_user_id) !== uid) return respond({ error: 'Forbidden' }, 403)

    if (reset) {
      await db.from('bots').update({ modules: [], is_active: false }).eq('id', id)
      await db.from('ai_chat_config').delete().eq('bot_id', id)
      await db.from('ppv_last_sent').delete().eq('bot_id', id)
      await db.from('tg_updates').update({ replied: true }).eq('bot_id', id).eq('replied', false)
    } else {
      await db.from('bots').delete().eq('id', id)
    }

    return respond({ ok: true })
  } catch {
    return respond({ error: 'Internal server error' }, 500)
  }
})
