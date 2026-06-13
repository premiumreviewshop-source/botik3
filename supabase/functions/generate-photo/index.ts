import { corsHeaders } from '../_shared/cors.ts'
import { db } from '../_shared/db.ts'
import { checkAndDeduct } from '../_shared/balance.ts'

const GENERATION_COST = 0.10

const WAVESPEED_BASE = () => Deno.env.get('WAVESPEED_BASE_URL') ?? 'https://api.wavespeed.ai/api/v3'
const WAN_ID = () => Deno.env.get('WAN_MODEL_ID') ?? 'alibaba/wan-2.7/image-edit-pro'

function extractOutputUrl(data: Record<string, unknown> | undefined): string | undefined {
  if (!data) return undefined
  const outputs = data.outputs as string[] | undefined
  return outputs?.[0]
    ?? (data.output as string | undefined)
    ?? (data.output_url as string | undefined)
    ?? (data.result as string | undefined)
    ?? (data.result_url as string | undefined)
    ?? ((data.results as string[] | undefined)?.[0])
    ?? ((data.images as string[] | undefined)?.[0])
    ?? (data.image as string | undefined)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { prompt, modelId, imageUrls, tgUserId } = await req.json()
    if (!prompt) {
      return new Response(JSON.stringify({ error: 'prompt required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (tgUserId) {
      const balErr = await checkAndDeduct(String(tgUserId), GENERATION_COST, 'FaceSwap генерация')
      if (balErr) return new Response(JSON.stringify(balErr), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    let modelName: string | undefined
    if (modelId) {
      const { data: m } = await db.from('ai_models').select('name').eq('id', modelId).single()
      if (m) modelName = m.name
    }

    const { data: gen, error } = await db
      .from('generations')
      .insert({
        model_id: modelId ?? null,
        model_name: modelName ?? null,
        prompt,
        status: 'processing',
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

    const urls: string[] = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : []

    const requestBody: Record<string, unknown> = {
      prompt,
      enable_safety_checker: false,
    }
    if (urls.length > 0) {
      requestBody.images = urls
    }

    const wanId = WAN_ID()
    console.log(`POST /api/v3/${wanId}:`, JSON.stringify(requestBody).slice(0, 300))

    const wsResp = await fetch(`${WAVESPEED_BASE()}/${wanId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('WAVESPEED_API_KEY')}`,
      },
      body: JSON.stringify(requestBody),
    })

    const wsText = await wsResp.text()
    console.log('Wavespeed generate-photo:', wsResp.status, wsText.slice(0, 600))

    let wsData: Record<string, unknown> | null = null
    try { wsData = JSON.parse(wsText) } catch {}

    const wsBodyCode = wsData ? (wsData.code as number | undefined) : undefined
    const isWsError = !wsResp.ok || (wsBodyCode !== undefined && wsBodyCode !== 200)

    if (!isWsError && wsData) {
      const data = wsData.data as Record<string, unknown> | undefined
      const jobId =
        (data?.id as string | undefined) ??
        (wsData.id as string | undefined) ??
        (wsData.prediction_id as string | undefined)
      // Prefer the full poll URL provided by WaveSpeed (data.urls.get) over constructing from ID
      const pollUrl = (data?.urls as Record<string, string> | undefined)?.get
      const jobIdToStore = pollUrl ?? jobId
      console.log('Wavespeed jobId:', jobId, 'pollUrl:', pollUrl)
      if (jobIdToStore) {
        await db.from('generations').update({ wavespeed_job_id: jobIdToStore }).eq('id', gen.id)
      } else {
        console.warn('Wavespeed: no job ID or poll URL in response', wsText.slice(0, 300))
      }
      // Handle sync response: result already in outputs
      const resultUrl = extractOutputUrl(data)
      const wsStatus = (data?.status as string | undefined) ?? ''
      if ((wsStatus === 'completed' || wsStatus === 'succeeded') && resultUrl) {
        await db.from('generations').update({ status: 'ready', image_url: resultUrl }).eq('id', gen.id)
      } else if (wsStatus === 'failed' || wsStatus === 'error') {
        await db.from('generations').update({ status: 'failed', image_url: `ERR:ws_failed` }).eq('id', gen.id)
      }
    } else {
      const errMsg = `ERR:${wsResp.status}:${(wsData?.message as string | undefined) ?? wsText.slice(0, 80)}`
      await db.from('generations').update({ status: 'failed', image_url: errMsg }).eq('id', gen.id)
      console.error('Wavespeed error:', wsResp.status, wsText.slice(0, 400))
    }

    return new Response(JSON.stringify({ id: gen.id, status: 'processing' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
