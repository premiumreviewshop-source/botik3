import { corsHeaders } from '../_shared/cors.ts'
import { db } from '../_shared/db.ts'
import { verifyAuth } from '../_shared/auth.ts'

const respond = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}))
    const botToken = Deno.env.get('PLATFORM_BOT_TOKEN') ?? Deno.env.get('BOT_TOKEN') ?? ''
    const auth = await verifyAuth(body.initData, botToken)
    if ('error' in auth) return respond(auth, auth.status)
    const uid = auth.uid

    const { data, error } = await db.from('bots').select('*').eq('tg_user_id', uid).order('created_at')
    if (error) return respond({ error: 'Internal server error' }, 500)
    return respond({ bots: data ?? [] })
  } catch {
    return respond({ error: 'Internal server error' }, 500)
  }
})
