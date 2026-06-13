import { corsHeaders } from '../_shared/cors.ts'
import { db } from '../_shared/db.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { token, name: customName, chatId, tgUserId } = await req.json()
    if (!token) {
      return new Response(JSON.stringify({ error: 'token required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const meResp = await fetch(`https://api.telegram.org/bot${token}/getMe`)
    const me = await meResp.json()
    if (!me.ok) {
      return new Response(
        JSON.stringify({ error: me.description ?? 'Invalid bot token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
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
        tg_user_id: tgUserId ?? 0,
      })
      .select()
      .single()

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Register Telegram webhook for instant replies
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

    return new Response(JSON.stringify(bot), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
