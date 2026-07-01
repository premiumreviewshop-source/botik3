import { corsHeaders } from '../_shared/cors.ts'
import { db } from '../_shared/db.ts'
import { verifyAuth } from '../_shared/auth.ts'
import { checkAndDeduct } from '../_shared/balance.ts'

const WAVESPEED_BASE = () => Deno.env.get('WAVESPEED_BASE_URL') ?? 'https://api.wavespeed.ai/api/v3'
const NB_ID = 'google/nano-banana-pro/edit'
const WAN_ID = () => Deno.env.get('WAN_MODEL_ID') ?? 'alibaba/wan-2.7/image-edit-pro'
const COST_PER_PHOTO = 0.325

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

async function markGenerationsFailed(ids: string[], now: string) {
  for (const id of ids) {
    await db.from('generations').update({ status: 'failed', updated_at: now }).eq('id', id).catch(() => {})
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const { modelUrl, refUrl, nanoBananaPrompt, count, modelId, modelPreviewUrl, initData, model } = body
    const stage1Model = model === 'wan' ? WAN_ID() : NB_ID

    if (!modelUrl || !refUrl || !nanoBananaPrompt || !count || !modelId)
      return respond({ error: 'Missing required fields' }, 400)

    const botToken = Deno.env.get('PLATFORM_BOT_TOKEN') ?? Deno.env.get('BOT_TOKEN') ?? ''
    const auth = await verifyAuth(initData, botToken)
    if ('error' in auth) return respond(auth, (auth as any).status)
    const tgUserId = (auth as any).uid

    const n = Math.min(Math.max(1, Number(count)), 10)

    // 1. Deduct balance for all N photos upfront
    const balErr = await checkAndDeduct(tgUserId, n * COST_PER_PHOTO, `Карусель (${n} фото) · ${new Date().toISOString().slice(0, 19)}`)
    if (balErr) return respond(balErr, 402)

    const now = new Date().toISOString()
    const placeholderIds: string[] = []

    // 2. Create N placeholder generation rows (status 'carousel' — ignored by sync-ai-jobs cleanup)
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
        await markGenerationsFailed(placeholderIds, now)
        return respond({ error: 'DB error creating generation' }, 500)
      }
      placeholderIds.push((row as any).id)
    }

    // 3. Insert carousel_jobs BEFORE starting NB — if this fails the table probably doesn't exist
    const { data: cjRow, error: cjErr } = await db.from('carousel_jobs').insert({
      tg_user_id: tgUserId,
      model_id: modelId,
      model_url: modelUrl,
      ref_url: refUrl,
      nano_banana_prompt: nanoBananaPrompt,
      model_preview_url: modelPreviewUrl ?? null,
      count: n,
      stage: 'nano_banana',
      nano_banana_job_id: null,
      generation_ids: placeholderIds,
      created_at: now,
      updated_at: now,
    }).select('id').single()

    if (cjErr || !cjRow) {
      console.error('[carousel-generate] carousel_jobs insert error:', cjErr)
      await markGenerationsFailed(placeholderIds, now)
      return respond({ error: 'carousel_jobs table missing — apply migration in Supabase SQL Editor' }, 500)
    }

    const cjId = (cjRow as any).id

    // 4. Start Nano Banana — gives it a head start before first cron tick
    const wavespeedKey = Deno.env.get('WAVESPEED_API_KEY') ?? ''
    try {
      const nbJobId = await wsStart(wavespeedKey, stage1Model, [modelUrl, refUrl], nanoBananaPrompt)
      await db.from('carousel_jobs').update({
        nano_banana_job_id: nbJobId,
        updated_at: new Date().toISOString(),
      }).eq('id', cjId)
    } catch (err) {
      console.error('[carousel-generate] Nano Banana start failed:', err)
      await db.from('carousel_jobs').update({ stage: 'failed', updated_at: new Date().toISOString() }).eq('id', cjId)
      await markGenerationsFailed(placeholderIds, now)
      return respond({ error: 'Не удалось запустить Nano Banana' }, 502)
    }

    return respond({ ids: placeholderIds, status: 'carousel' })
  } catch (err) {
    console.error('[carousel-generate] handler error:', err)
    return respond({ error: 'Internal server error' }, 500)
  }
})
