import { db } from '../_shared/db.ts'

const WAVESPEED_BASE = () => Deno.env.get('WAVESPEED_BASE_URL') ?? 'https://api.wavespeed.ai/api/v3'

async function pollJob(jobId: string): Promise<{ status: string; outputUrl?: string }> {
  const pollUrl = jobId.startsWith('http') ? jobId : `${WAVESPEED_BASE()}/predictions/${jobId}`
  const resp = await fetch(pollUrl, {
    headers: { Authorization: `Bearer ${Deno.env.get('WAVESPEED_API_KEY')}` },
  })
  if (!resp.ok) return { status: 'processing' }

  let body: Record<string, unknown>
  try { body = await resp.json() } catch { return { status: 'processing' } }

  const inner = (body.data ?? body) as Record<string, unknown>
  const status: string = (inner.status as string | undefined) ?? 'processing'
  const outputs = inner.outputs as string[] | undefined
  const outputUrl: string | undefined = outputs?.[0] ?? (inner.output_url as string | undefined)

  if (status === 'completed' || status === 'succeeded') return { status: 'ready', outputUrl }
  if (status === 'failed' || status === 'error') return { status: 'failed' }
  return { status: 'processing' }
}

Deno.serve(async () => {
  const [{ data: models }, { data: gens }] = await Promise.all([
    db.from('ai_models').select('id, wavespeed_job_id').eq('status', 'processing').not('wavespeed_job_id', 'is', null),
    db.from('generations').select('id, wavespeed_job_id').eq('status', 'processing').not('wavespeed_job_id', 'is', null),
  ])

  await Promise.all([
    ...(models ?? []).map(async (m: { id: string; wavespeed_job_id: string }) => {
      const result = await pollJob(m.wavespeed_job_id)
      if (result.status !== 'processing') {
        await db.from('ai_models').update({
          status: result.status,
          lora_url: result.outputUrl ?? null,
          updated_at: new Date().toISOString(),
        }).eq('id', m.id)
      }
    }),
    ...(gens ?? []).map(async (g: { id: string; wavespeed_job_id: string }) => {
      const result = await pollJob(g.wavespeed_job_id)
      if (result.status !== 'processing') {
        await db.from('generations').update({
          status: result.status,
          image_url: result.outputUrl ?? null,
          updated_at: new Date().toISOString(),
        }).eq('id', g.id)
      }
    }),
  ])

  return new Response(
    JSON.stringify({ ok: true, models: models?.length ?? 0, gens: gens?.length ?? 0 }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
