import { corsHeaders } from '../_shared/cors.ts'
import { db } from '../_shared/db.ts'
import { checkAndDeduct } from '../_shared/balance.ts'
import { verifyAuth } from '../_shared/auth.ts'

const CREATION_COST = 0.075

const WAVESPEED_BASE = () => Deno.env.get('WAVESPEED_BASE_URL') ?? 'https://api.wavespeed.ai/api/v3'
const SEEDREAM_ID = () => Deno.env.get('SEEDREAM_MODEL_ID') ?? 'bytedance/seedream-v4/edit'

const respond = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { name, imageUrls, prompt, initData } = await req.json()
    if (!name || !imageUrls?.length) return respond({ error: 'name and imageUrls required' }, 400)

    const botToken = Deno.env.get('PLATFORM_BOT_TOKEN') ?? Deno.env.get('BOT_TOKEN') ?? ''
    const auth = await verifyAuth(initData, botToken)
    if ('error' in auth) return respond(auth, auth.status)
    const tgUserId = auth.uid

    const isAiFlow = !!(prompt || imageUrls.length > 1)
    if (isAiFlow) {
      const balErr = await checkAndDeduct(tgUserId, CREATION_COST, 'Создание AI-модели')
      if (balErr) return respond(balErr, 402)
    }

    const triggerWord = name.toLowerCase().replace(/\s+/g, '_') + '_tok'

    const { data: model, error } = await db
      .from('ai_models')
      .insert({ name, status: 'processing', trigger_word: triggerWord, preview_url: imageUrls[0] ?? null, tg_user_id: tgUserId })
      .select()
      .single()

    if (error) return respond({ error: error.message }, 500)

    if (!prompt && imageUrls.length === 1) {
      await db.from('ai_models').update({ status: 'ready', updated_at: new Date().toISOString() }).eq('id', model.id)
      return respond({ id: model.id, name: model.name, status: 'ready', triggerWord, resultUrl: imageUrls[0] })
    }

    const requestBody: Record<string, unknown> = {
      images: imageUrls,
      enable_sync_mode: true,
      ...(prompt ? { prompt } : {}),
    }

    const modelId = SEEDREAM_ID()
    console.log(`POST /api/v3/${modelId}:`, JSON.stringify(requestBody))

    const wsResp = await fetch(`${WAVESPEED_BASE()}/${modelId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('WAVESPEED_API_KEY')}`,
      },
      body: JSON.stringify(requestBody),
    })

    const wsText = await wsResp.text()
    console.log('Wavespeed response:', wsResp.status, wsText.slice(0, 800))

    if (!wsResp.ok) {
      await db.from('ai_models').update({ status: 'failed' }).eq('id', model.id)
      return respond({ error: 'AI service error' }, 502)
    }

    let wsData: Record<string, unknown>
    try {
      wsData = JSON.parse(wsText)
    } catch {
      await db.from('ai_models').update({ status: 'failed' }).eq('id', model.id)
      return respond({ error: 'AI service returned invalid response' }, 502)
    }

    const data = wsData.data as Record<string, unknown> | undefined
    const jobId = (data?.id as string | undefined) ?? (wsData.id as string | undefined)
    const outputs = data?.outputs as string[] | undefined
    const resultUrl = outputs?.[0] ?? (data?.output_url as string | undefined)
    const wsStatus: string = (data?.status as string | undefined) ?? 'processing'
    const wsFailed = wsStatus === 'failed' || wsStatus === 'error'
    const isReady = (wsStatus === 'completed' || wsStatus === 'succeeded') && !!resultUrl

    await db.from('ai_models').update({
      ...(jobId ? { wavespeed_job_id: jobId } : {}),
      ...(resultUrl ? { lora_url: resultUrl } : {}),
      status: isReady ? 'ready' : wsFailed ? 'failed' : 'processing',
      updated_at: new Date().toISOString(),
    }).eq('id', model.id)

    return respond({ id: model.id, name: model.name, status: isReady ? 'ready' : 'processing', triggerWord, jobId, resultUrl })
  } catch {
    return respond({ error: 'Internal server error' }, 500)
  }
})
