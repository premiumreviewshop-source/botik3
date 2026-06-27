import { db } from '../_shared/db.ts'

const WAVESPEED_BASE = () => Deno.env.get('WAVESPEED_BASE_URL') ?? 'https://api.wavespeed.ai/api/v3'
const WAN_ID = () => Deno.env.get('WAN_MODEL_ID') ?? 'alibaba/wan-2.7/image-edit-pro'

const POSE_GENERATOR_SYSTEM = `Ты — эксперт по позированию моделей, композиции и работе с референсами. Тебе дана фотография девушки. Твоя задача — не генерировать изображение с нуля, а создать максимально точный и эффективный промт для модели Seedream v4.5 edit, который позволит изменить позу девушки на этой фотографии. Этапы работы:
1. Глубокий анализ референса
Внимательно проанализируй: • Ракурс камеры и угол съёмки • Композицию кадра • Положение тела, рук, ног и головы на оригинальном фото • Освещение, направление взгляда, выражение лица • Одежду, фон и общее настроение
2. Создание новой позы
На основе анализа придумай одну новую, кардинально отличающуюся позу, которая: • Полностью соответствует тому же ракурсу, композиции и кадрированию фотографии • Идеально подходит именно этой девушке (фигура, пропорции, стиль) • Выглядит естественно и органично в данном ракурсе • Является флиртующей, сексуально-привлекательной и выразительной • Чётко передаёт понятный смысл и настроение позы (не должна быть однотипной или скучной) • Раскрывает фигуру модели с выгодной стороны максимально открыто и выгодно • Использует разные, интересные, сексуальные и флиртующие позы, которые показывают модель как можно лучше и откровеннее, с открытыми ракурсами тела с разных сторон (повороты корпуса, изгибы, выгодные углы бёдер, талии, груди, ног и силуэта)
Поза должна быть заметно другой по сравнению с оригиналом (кардинальное изменение положения тела, рук, ног, изгиба корпуса, наклона головы и т.д.), но при этом оставаться 100% гармоничной для этого конкретного ракурса и композиции.
3. Формирование промта
Составь детальный, чёткий и оптимизированный промт специально для Seedream v4.5 edit, который позволит модели: • Сохранить лицо девушки, её внешность, освещение, ракурс, фон и одежду максимально близко к оригиналу • Полностью изменить позу на новую, которую ты придумал • Сделать результат естественным и высококачественным Промт должен содержать конкретные указания по: • Положению корпуса, бёдер, плеч • Размещению и изгибу рук и ног • Наклону и повороту головы • Направлению взгляда • Напряжению мышц и изгибам тела • Общему настроению (флирт, уверенность, игривость и т.д.) Важно: Поза должна быть живой, естественной и идеально вписываться в существующий кадр. Избегай шаблонных поз. Каждая новая поза должна ощущаться свежей и интересной.

отправляй исключительно промт без прелюдий`

const CAROUSEL_FACESWAP_PROMPT = `Replace the woman in the second reference image with the woman from the first reference image. The first image is the identity reference and must be strictly preserved: keep her face, body shape, exact proportions, and silhouette unchanged. Do not modify anatomy, do not stretch or resize body parts. Use the outfit from the second reference image. The clothing, styling, and fit must match the second image exactly. Transfer the woman from the first image into the pose of the second image, matching body position precisely while keeping original proportions. The second image defines the environment: keep the same background, camera angle, framing, perspective, and composition. Match the lighting from the second image exactly: same light direction, intensity, shadows, highlights, and color grading. Match the image quality of the second photo: same resolution, sharpness, noise level, skin detail, lens characteristics, and overall realism. Do not enhance or degrade quality — replicate it exactly. Ensure seamless blending into the scene with correct depth and perspective. No stylization, no reinterpretation, no body reshaping. Photorealistic, natural result good quality, delete tattoo on hand, no text`

// ── Wavespeed helpers ────────────────────────────────────────────────────────

async function pollJob(jobId: string): Promise<{ status: string; outputUrl?: string }> {
  const pollUrl = jobId.startsWith('http') ? jobId : `${WAVESPEED_BASE()}/predictions/${jobId}`
  try {
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
  } catch {
    return { status: 'processing' }
  }
}

async function wsStart(key: string, model: string, images: string[], prompt: string): Promise<string> {
  const resp = await fetch(`${WAVESPEED_BASE()}/${model}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ images, prompt, enable_safety_checker: false }),
  })
  if (!resp.ok) throw new Error(`Wavespeed ${model} ${resp.status}: ${(await resp.text()).slice(0, 150)}`)
  const data = await resp.json()
  const inner = data.data as Record<string, unknown> | undefined
  const pollUrl = (inner?.urls as Record<string, string> | undefined)?.get
  const jobId = (inner?.id as string | undefined) ?? (data.id as string | undefined)
  const taskId = pollUrl ?? jobId
  if (!taskId) throw new Error('Wavespeed: no task ID')
  return taskId as string
}

// ── Grok helper ──────────────────────────────────────────────────────────────

async function callGrokPoses(xaiKey: string, imageUrl: string, count: number): Promise<string[]> {
  const suffix = `\n\nСоздай РОВНО ${count} РАЗНЫХ промтов, каждый для уникальной позы. Разделяй промты строго через ---SPLIT---. Никаких нумераций, никакого вводного текста — только промты.`
  const resp = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${xaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'grok-4.3',
      messages: [{ role: 'user', content: [
        { type: 'text', text: POSE_GENERATOR_SYSTEM + suffix },
        { type: 'image_url', image_url: { url: imageUrl } },
      ]}],
      max_tokens: 3000,
    }),
  })
  if (!resp.ok) throw new Error(`Grok ${resp.status}: ${(await resp.text()).slice(0, 150)}`)
  const data = await resp.json()
  const text: string = data.choices?.[0]?.message?.content ?? ''
  if (!text) throw new Error('Grok: empty response')
  const parts = text.split('---SPLIT---').map((s: string) => s.trim()).filter(Boolean)
  if (parts.length === 0) throw new Error('Grok: no prompts returned')
  while (parts.length < count) parts.push(parts[parts.length - 1])
  return parts.slice(0, count)
}

// ── Carousel pipeline stages ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processNanoBananaStage(job: any): Promise<void> {
  const now = new Date().toISOString()
  const generationIds: string[] = job.generation_ids ?? []

  if (!job.nano_banana_job_id) {
    console.error('[carousel] carousel_job has no nano_banana_job_id:', job.id)
    await markCarouselFailed(job.id, generationIds, now)
    return
  }

  const result = await pollJob(job.nano_banana_job_id)
  if (result.status === 'processing') return // still running, try next tick

  if (result.status === 'failed' || !result.outputUrl) {
    console.error('[carousel] Nano Banana failed for job:', job.id)
    await markCarouselFailed(job.id, generationIds, now)
    return
  }

  const basePhotoUrl = result.outputUrl
  console.log('[carousel] NB done, calling Grok for poses...')

  const xaiKey = Deno.env.get('XAI_API_KEY') ?? ''
  const wavespeedKey = Deno.env.get('WAVESPEED_API_KEY') ?? ''
  let posePrompts: string[]
  try {
    posePrompts = await callGrokPoses(xaiKey, basePhotoUrl, job.count)
  } catch (err) {
    console.error('[carousel] Grok poses failed:', err)
    await markCarouselFailed(job.id, generationIds, now)
    return
  }

  // Start all Seedream jobs in parallel
  const seedreamJobIds: string[] = []
  for (const posePrompt of posePrompts) {
    try {
      const taskId = await wsStart(wavespeedKey, 'bytedance/seedream-v4.5/edit', [basePhotoUrl], posePrompt)
      seedreamJobIds.push(taskId)
    } catch (err) {
      console.error('[carousel] Seedream start failed:', err)
      seedreamJobIds.push('failed')
    }
  }

  await db.from('carousel_jobs').update({
    stage: 'seedream',
    base_photo_url: basePhotoUrl,
    pose_prompts: posePrompts,
    seedream_job_ids: seedreamJobIds,
    updated_at: now,
  }).eq('id', job.id)

  console.log(`[carousel] Seedream started (${seedreamJobIds.length} jobs)`)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processSeedreamStage(job: any): Promise<void> {
  const now = new Date().toISOString()
  const seedreamJobIds: string[] = job.seedream_job_ids ?? []
  const generationIds: string[] = job.generation_ids ?? []

  // Poll all Seedream jobs
  const results = await Promise.all(seedreamJobIds.map(id =>
    id === 'failed' ? Promise.resolve({ status: 'failed' as const }) : pollJob(id)
  ))

  // If any still processing, wait for next tick
  if (results.some(r => r.status === 'processing')) return

  console.log('[carousel] All Seedream done, starting Wan faceswaps...')
  const wavespeedKey = Deno.env.get('WAVESPEED_API_KEY') ?? ''
  const wanModelUrl: string = job.model_preview_url ?? job.model_url

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const genId = generationIds[i]
    if (!genId) continue

    if (result.status === 'failed' || !result.outputUrl) {
      await db.from('generations').update({ status: 'failed', updated_at: now }).eq('id', genId)
      continue
    }

    try {
      const wanTaskId = await wsStart(wavespeedKey, WAN_ID(), [wanModelUrl, result.outputUrl], CAROUSEL_FACESWAP_PROMPT)
      await db.from('generations').update({
        status: 'processing',
        wavespeed_job_id: wanTaskId,
        updated_at: now,
      }).eq('id', genId)
      console.log(`[carousel] Wan started for gen ${genId}`)
    } catch (err) {
      console.error(`[carousel] Wan start failed for gen ${genId}:`, err)
      await db.from('generations').update({ status: 'failed', updated_at: now }).eq('id', genId)
    }
  }

  await db.from('carousel_jobs').update({ stage: 'done', updated_at: now }).eq('id', job.id)
}

async function markCarouselFailed(jobId: string, generationIds: string[], now: string): Promise<void> {
  await db.from('carousel_jobs').update({ stage: 'failed', updated_at: now }).eq('id', jobId)
  for (const id of generationIds) {
    await db.from('generations').update({ status: 'failed', updated_at: now }).eq('id', id).catch(() => {})
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async () => {
  const now = new Date().toISOString()

  // 1. Mark stale processing generations (no job ID) as failed
  //    Exclude 'carousel' status — those wait for cron to start Wan
  await db.from('generations')
    .update({ status: 'failed', updated_at: now })
    .eq('status', 'processing')
    .is('wavespeed_job_id', null)

  // 2. Poll existing Wavespeed jobs (ai_models + regular generations)
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
          updated_at: now,
        }).eq('id', m.id)
      }
    }),
    ...(gens ?? []).map(async (g: { id: string; wavespeed_job_id: string }) => {
      const result = await pollJob(g.wavespeed_job_id)
      if (result.status !== 'processing') {
        await db.from('generations').update({
          status: result.status,
          image_url: result.outputUrl ?? null,
          updated_at: now,
        }).eq('id', g.id)
      }
    }),
  ])

  // 3. Advance carousel pipeline stages
  const { data: carouselJobs } = await db
    .from('carousel_jobs')
    .select('*')
    .in('stage', ['nano_banana', 'seedream'])

  for (const job of (carouselJobs ?? [])) {
    try {
      if (job.stage === 'nano_banana') await processNanoBananaStage(job)
      else if (job.stage === 'seedream') await processSeedreamStage(job)
    } catch (err) {
      console.error(`[carousel] unhandled error for job ${job.id}:`, err)
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      models: models?.length ?? 0,
      gens: gens?.length ?? 0,
      carousel: carouselJobs?.length ?? 0,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
