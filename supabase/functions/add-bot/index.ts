import { corsHeaders } from '../_shared/cors.ts'
import { db } from '../_shared/db.ts'
import { verifyAuth } from '../_shared/auth.ts'

const respond = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { token, name: customName, chatId, initData } = await req.json()
    if (!token) return respond({ error: 'token required' }, 400)

    const botToken = Deno.env.get('PLATFORM_BOT_TOKEN') ?? Deno.env.get('BOT_TOKEN') ?? ''
    const auth = await verifyAuth(initData, botToken)
    if ('error' in auth) return respond(auth, auth.status)
    const tgUserId = auth.uid

    const meResp = await fetch(`https://api.telegram.org/bot${token}/getMe`)
    const me = await meResp.json()
    if (!me.ok) {
      return respond({ error: me.description ?? 'Invalid bot token' }, 400)
    }

    const { data: bot, error } = await db
      .from('bots')
      .insert({
        name: customName ?? me.result.first_name,
        handle: me.result.username ?? '',
        token,
        chat_id: chatId ?? null,
        is_active: true,
        modules: [],
        tg_user_id: tgUserId,
      })
      .select()
      .single()

    if (error) return respond({ error: error.message }, 500)

    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/telegram-webhook`
    await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: bot.id,
        allowed_updates: ['message', 'pre_checkout_query', 'business_connection', 'business_message'],
        drop_pending_updates: true,
      }),
    }).catch(() => {})

    return respond(bot)
  } catch {
    return respond({ error: 'Internal server error' }, 500)
  }
})
