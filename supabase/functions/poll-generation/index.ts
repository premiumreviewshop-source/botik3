import { corsHeaders } from '../_shared/cors.ts'
import { db } from '../_shared/db.ts'

const WAVESPEED_BASE = () => Deno.env.get('WAVESPEED_BASE_URL') ?? 'https://api.wavespeed.ai/api/v3'

function extractOutputUrl(inner: Record<string, unknown>): string | undefined {
  const outputs = inner.outputs as string[] | undefined
  return outputs?.[0]
    ?? (inner.output as string | undefined)
    ?? (inner.output_url as string | undefined)
    ?? (inner.result as string | undefined)
    ?? (inner.result_url as string | undefined)
    ?? ((inner.results as string[] | undefined)?.[0])
    ?? ((inner.images as string[] | undefined)?.[0])
    ?? (inner.image as string | undefined)
}

function buildPollUrl(jobIdOrUrl: string): string {
  // If WaveSpeed gave us the full poll URL directly, use it as-is
  if (jobIdOrUrl.startsWith('http')) return jobIdOrUrl
  return `${WAVESPEED_BASE()}/predictions/${jobIdOrUrl}`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { id } = await req.json()
    if (!id) {
      return new Response(JSON.stringify({ error: 'id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: gen, error } = await db
      .from('generations')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !gen) {
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // If already done, return immediately
    if (gen.status === 'ready' || gen.status === 'failed') {
      const errMsg = gen.status === 'failed' && (gen.image_url as string | undefined)?.startsWith('ERR:')
        ? gen.image_url as string
        : undefined
      console.log('poll-generation result:', gen.status, errMsg ?? gen.image_url)
      return new Response(
        JSON.stringify({
          id: gen.id,
          modelId: gen.model_id ?? '',
          modelName: gen.model_name ?? '',
          url: gen.status === 'ready' ? (gen.image_url ?? '') : '',
          createdAt: gen.created_at,
          status: gen.status,
          error: errMsg,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Still processing — poll WaveSpeed directly if we have a job ID or poll URL
    if (gen.wavespeed_job_id) {
      const pollUrl = buildPollUrl(gen.wavespeed_job_id as string)
      const wsResp = await fetch(pollUrl, {
        headers: { Authorization: `Bearer ${Deno.env.get('WAVESPEED_API_KEY')}` },
      })

      const wsText = await wsResp.text()
      console.log('poll-generation WS:', wsResp.status, 'url:', pollUrl, 'body:', wsText.slice(0, 400))

      if (wsResp.ok) {
        try {
          const wsData = JSON.parse(wsText)
          const inner = (wsData.data ?? wsData) as Record<string, unknown>
          const wsStatus = (inner.status as string | undefined) ?? 'processing'
          const resultUrl = extractOutputUrl(inner)

          console.log('poll-generation status:', wsStatus, 'resultUrl:', resultUrl)

          if (wsStatus === 'completed' || wsStatus === 'succeeded') {
            await db.from('generations').update({
              status: 'ready',
              image_url: resultUrl ?? null,
              updated_at: new Date().toISOString(),
            }).eq('id', gen.id)

            return new Response(
              JSON.stringify({
                id: gen.id,
                modelId: gen.model_id ?? '',
                modelName: gen.model_name ?? '',
                url: resultUrl ?? '',
                createdAt: gen.created_at,
                status: 'ready',
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            )
          }

          if (wsStatus === 'failed' || wsStatus === 'error') {
            await db.from('generations').update({
              status: 'failed',
              updated_at: new Date().toISOString(),
            }).eq('id', gen.id)

            return new Response(
              JSON.stringify({ id: gen.id, modelId: gen.model_id ?? '', modelName: gen.model_name ?? '', url: '', createdAt: gen.created_at, status: 'failed' }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            )
          }
        } catch (parseErr) {
          console.error('poll-generation parse error:', parseErr, wsText.slice(0, 200))
        }
      } else {
        console.error('poll-generation WS error:', wsResp.status, wsText.slice(0, 200))
      }
    } else {
      console.warn('poll-generation: no wavespeed_job_id for gen', gen.id)
    }

    // Still processing
    return new Response(
      JSON.stringify({
        id: gen.id,
        modelId: gen.model_id ?? '',
        modelName: gen.model_name ?? '',
        url: gen.image_url ?? '',
        createdAt: gen.created_at,
        status: 'processing',
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
