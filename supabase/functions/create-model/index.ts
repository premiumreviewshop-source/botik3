import { corsHeaders } from '../_shared/cors.ts'
import { db } from '../_shared/db.ts'
import { checkAndDeduct } from '../_shared/balance.ts'

const CREATION_COST = 0.075

const WAVESPEED_BASE = () => Deno.env.get('WAVESPEED_BASE_URL') ?? 'https://api.wavespeed.ai/api/v3'
const SEEDREAM_ID = () => Deno.env.get('SEEDREAM_MODEL_ID') ?? 'bytedance/seedream-v4/edit'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { name, imageUrls, prompt, tgUserId } = await req.json()
    if (!name || !imageUrls?.length) {
      return new Response(JSON.stringify({ error: 'name and imageUrls required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Only charge for AI generation flow (prompt present or multiple images)
    const isAiFlow = !!(prompt || imageUrls.length > 1)
    if (isAiFlow && tgUserId) {
      const balErr = await checkAndDeduct(String(tgUserId), CREATION_COST, 'Создание AI-модели')
      if (balErr) return new Response(JSON.stringify(balErr), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const triggerWord = name.toLowerCase().replace(/\s+/g, '_') + '_tok'

    const { data: model, error } = await db
      .from('ai_models')
      .insert({ name, status: 'processing', trigger_word: triggerWord, preview_url: imageUrls[0] ?? null, tg_user_id: tgUserId ?? 0 })
      .select()
      .single()

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Own-model flow: single image + no prompt → no generation needed, mark ready immediately
    if (!prompt && imageUrls.length === 1) {
      await db.from('ai_models').update({ status: 'ready', updated_at: new Date().toISOString() }).eq('id', model.id)
      return new Response(
        JSON.stringify({ id: model.id, name: model.name, status: 'ready', triggerWord, resultUrl: imageUrls[0] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
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
      return new Response(
        JSON.stringify({ error: `Wavespeed ${wsResp.status}: ${wsText}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    let wsData: Record<string, unknown>
    try {
      wsData = JSON.parse(wsText)
    } catch {
      await db.from('ai_models').update({ status: 'failed' }).eq('id', model.id)
      return new Response(
        JSON.stringify({ error: `Wavespeed invalid JSON: ${wsText}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
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

    return new Response(
      JSON.stringify({
        id: model.id,
        name: model.name,
        status: isReady ? 'ready' : 'processing',
        triggerWord,
        jobId,
        resultUrl,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
