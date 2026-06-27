import { corsHeaders } from '../_shared/cors.ts'
import { db } from '../_shared/db.ts'
import { verifyAuth } from '../_shared/auth.ts'
import { checkAndDeduct } from '../_shared/balance.ts'

const WAVESPEED_BASE = () => Deno.env.get('WAVESPEED_BASE_URL') ?? 'https://api.wavespeed.ai/api/v3'
const COST_PER_PHOTO = 0.10

async function wsStart(key: string, model: string, images: string[], prompt: string): Promise<string> {
  const resp = await fetch(`${WAVESPEED_BASE()}/${model}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ images, prompt, enable_safety_checker: false }),
  })
  if (!resp.ok) throw new Error(`Wavespeed ${model} ${resp.status}: ${(await resp.text()).slice(0, 200)}`)
  const data = await resp.json()
  const inner = data.data as Record<string, unknown> | undefined
  const pollUrl = (inner?.urls as Record<string, string> | undefined)?.get
  const jobId = (inner?.id as string | undefined) ?? (data.id as string | undefined)
  const taskId = pollUrl ?? jobId
  if (!taskId) throw new Error('Wavespeed: no task ID in response')
  return taskId as string
}

const respond = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const { modelUrl, refUrl, nanoBananaPrompt, count, modelId, modelPreviewUrl, initData } = body

    if (!modelUrl || !refUrl || !nanoBananaPrompt || !count || !modelId)
      return respond({ error: 'Missing required fields' }, 400)

    const botToken = Deno.env.get('PLATFORM_BOT_TOKEN') ?? Deno.env.get('BOT_TOKEN') ?? ''
    const auth = await verifyAuth(initData, botToken)
    if ('error' in auth) return respond(auth, (auth as any).status)
    const tgUserId = (auth as any).uid

    const n = Math.min(Math.max(1, Number(count)), 10)

    // Deduct balance for all N photos upfront
    const balErr = await checkAndDeduct(tgUserId, n * COST_PER_PHOTO, `Карусель (${n} фото)`)
    if (balErr) return respond(balErr, 402)

    // Create N placeholder generation rows (status 'carousel' — ignored by sync-ai-jobs cleanup)
    const now = new Date().toISOString()
    const placeholderIds: string[] = []
    for (let i = 0; i < n; i++) {
      const { data: row, error } = await db.from('generations').insert({
        model_id: modelId,
        model_name: '',
        prompt: `Карусель поза ${i + 1}`,
        status: 'carousel',
        tg_user_id: tgUserId,
        cost: COST_PER_PHOTO,
        created_at: now,
        updated_at: now,
      }).select('id').single()
      if (error || !row) {
        console.error('[carousel-generate] generation insert error:', error)
        return respond({ error: 'DB error creating generation' }, 500)
      }
      placeholderIds.push((row as any).id)
    }

    // Start Nano Banana immediately — gives it a head start before first cron tick
    const wavespeedKey = Deno.env.get('WAVESPEED_API_KEY') ?? ''
    let nanoBananaJobId: string | null = null
    try {
      nanoBananaJobId = await wsStart(wavespeedKey, 'google/nano-banana-pro/edit', [modelUrl, refUrl], nanoBananaPrompt)
    } catch (err) {
      console.error('[carousel-generate] Nano Banana start failed:', err)
      // Store without job ID — cron will retry or mark failed
    }

    // Persist pipeline state — cron drives it from here
    const { error: cjErr } = await db.from('carousel_jobs').insert({
      tg_user_id: tgUserId,
      model_id: modelId,
      model_url: modelUrl,
      ref_url: refUrl,
      nano_banana_prompt: nanoBananaPrompt,
      model_preview_url: modelPreviewUrl ?? null,
      count: n,
      stage: nanoBananaJobId ? 'nano_banana' : 'failed',
      nano_banana_job_id: nanoBananaJobId,
      generation_ids: placeholderIds,
      created_at: now,
      updated_at: now,
    })

    if (cjErr) {
      console.error('[carousel-generate] carousel_jobs insert error:', cjErr)
      // Non-fatal — cron won't pick it up but balance already deducted
    }

    if (!nanoBananaJobId) {
      for (const id of placeholderIds) {
        await db.from('generations').update({ status: 'failed', updated_at: now }).eq('id', id)
      }
      return respond({ error: 'Не удалось запустить Nano Banana' }, 502)
    }

    return respond({ ids: placeholderIds, status: 'carousel' })
  } catch (err) {
    console.error('[carousel-generate] handler error:', err)
    return respond({ error: 'Internal server error' }, 500)
  }
})
