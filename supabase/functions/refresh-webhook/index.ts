import { corsHeaders } from '../_shared/cors.ts'
import { db } from '../_shared/db.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { botId, tgUserId } = await req.json()
    if (!botId) {
      return new Response(JSON.stringify({ error: 'botId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: bot } = await db
      .from('bots')
      .select('id, token')
      .eq('id', botId)
      .eq('tg_user_id', tgUserId)
      .maybeSingle()

    if (!bot) {
      return new Response(JSON.stringify({ error: 'Bot not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/telegram-webhook`
    const res = await fetch(`https://api.telegram.org/bot${bot.token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: bot.id,
        allowed_updates: ['message', 'pre_checkout_query', 'business_connection', 'business_message'],
      }),
    })

    const result = await res.json()
    return new Response(JSON.stringify({ ok: result.ok, description: result.description }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
