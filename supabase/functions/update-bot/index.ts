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

    const { id, name, handle, isActive, modules, chatId } = body
    if (!id) return respond({ error: 'id required' }, 400)

    const { data: bot } = await db.from('bots').select('tg_user_id').eq('id', id).single()
    if (!bot || String(bot.tg_user_id) !== uid) return respond({ error: 'Forbidden' }, 403)

    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name
    if (handle !== undefined) updates.handle = handle
    if (isActive !== undefined) updates.is_active = isActive
    if (modules !== undefined) updates.modules = modules
    if (chatId !== undefined) updates.chat_id = chatId

    if (Object.keys(updates).length > 0) {
      await db.from('bots').update(updates).eq('id', id)
    }

    return respond({ ok: true })
  } catch {
    return respond({ error: 'Internal server error' }, 500)
  }
})
