import { corsHeaders } from '../_shared/cors.ts'
import { db } from '../_shared/db.ts'
import { verifyAuth } from '../_shared/auth.ts'
import { checkAndDeduct } from '../_shared/balance.ts'

const WAVESPEED_BASE = () => Deno.env.get('WAVESPEED_BASE_URL') ?? 'https://api.wavespeed.ai/api/v3'
const WAN_ID = () => Deno.env.get('WAN_MODEL_ID') ?? 'alibaba/wan-2.7/image-edit-pro'
const COST_PER_PHOTO = 0.10

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
  if (!resp.ok) throw new Error(`Grok poses ${resp.status}: ${(await resp.text()).slice(0, 200)}`)
  const data = await resp.json()
  const text: string = data.choices?.[0]?.message?.content ?? ''
  if (!text) throw new Error('Grok: empty response')
  const parts = text.split('---SPLIT---').map((s: string) => s.trim()).filter(Boolean)
  if (parts.length === 0) throw new Error('Grok: no pose prompts')
  while (parts.length < count) parts.push(parts[parts.length - 1])
  return parts.slice(0, count)
}

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

async function wsPoll(key: string, taskId: string, maxMinutes = 7): Promise<string> {
  const pollUrl = taskId.startsWith('http') ? taskId : `${WAVESPEED_BASE()}/predictions/${taskId}`
  const iters = maxMinutes * 12
  for (let i = 0; i < iters; i++) {
    await new Promise(r => setTimeout(r, 5000))
    try {
      const resp = await fetch(pollUrl, { headers: { Authorization: `Bearer ${key}` } })
      if (!resp.ok) continue
      const body = await resp.json()
      const inner = (body.data ?? body) as Record<string, unknown>
      const status = inner.status as string | undefined
      if (status === 'completed' || status === 'succeeded') {
        const outputs = inner.outputs as string[] | undefined
        const url = outputs?.[0] ?? (inner.output_url as string | undefined)
        if (url) return url as string
        throw new Error('Wavespeed: completed but no output URL')
      }
      if (status === 'failed' || status === 'error') throw new Error('Wavespeed: job failed')
    } catch (e) {
      if (String(e).includes('failed') || String(e).includes('no output')) throw e
    }
  }
  throw new Error(`Wavespeed: timeout (${maxMinutes} min)`)
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

    // Deduct balance for all N photos upfront (one atomic transaction)
    const balErr = await checkAndDeduct(tgUserId, n * COST_PER_PHOTO, `Карусель (${n} фото)`)
    if (balErr) return respond(balErr, 402)

    // Create N placeholder generation rows with status 'carousel'
    // (sync-ai-jobs only processes 'processing' rows, so these are safe until Wan starts)
    const now = new Date().toISOString()
    const placeholderIds: string[] = []
    for (let i = 0; i < n; i++) {
      const { data: row } = await db.from('generations').insert({
        model_id: modelId,
        model_name: '',
        prompt: `Карусель поза ${i + 1}`,
        status: 'carousel',
        tg_user_id: tgUserId,
        cost: COST_PER_PHOTO,
        created_at: now,
        updated_at: now,
      }).select('id').single()
      if (row) placeholderIds.push((row as any).id)
    }

    const xaiKey = Deno.env.get('XAI_API_KEY') ?? ''
    const wavespeedKey = Deno.env.get('WAVESPEED_API_KEY') ?? ''
    const wanModelUrl = modelPreviewUrl ?? modelUrl

    const pipeline = (async () => {
      try {
        // Step 1: Nano Banana — transfers model into reference scene
        console.log('[carousel] Starting Nano Banana...')
        const nbTaskId = await wsStart(wavespeedKey, 'google/nano-banana-pro/edit', [modelUrl, refUrl], nanoBananaPrompt)
        const basePhotoUrl = await wsPoll(wavespeedKey, nbTaskId)
        console.log('[carousel] Nano Banana done:', basePhotoUrl.slice(0, 80))

        // Step 2: Grok — generate N pose prompts from base photo
        console.log('[carousel] Generating poses via Grok...')
        const posePrompts = await callGrokPoses(xaiKey, basePhotoUrl, n)
        console.log(`[carousel] Got ${posePrompts.length} pose prompts`)

        // Step 3: Seedream — apply poses in parallel
        console.log('[carousel] Starting Seedream jobs in parallel...')
        const seedResults: (string | null)[] = await Promise.all(
          posePrompts.map(async (posePrompt, i) => {
            try {
              const taskId = await wsStart(wavespeedKey, 'bytedance/seedream-v4.5/edit', [basePhotoUrl], posePrompt)
              const url = await wsPoll(wavespeedKey, taskId)
              console.log(`[carousel] Seedream ${i + 1} done`)
              return url
            } catch (err) {
              console.error(`[carousel] Seedream ${i + 1} failed:`, err)
              return null
            }
          })
        )

        // Step 4: Wan faceswap — start sequentially (prevents balance race, already deducted)
        console.log('[carousel] Starting Wan faceswap jobs...')
        for (let i = 0; i < seedResults.length; i++) {
          const genId = placeholderIds[i]
          const seedUrl = seedResults[i]
          if (!genId) continue

          if (!seedUrl) {
            await db.from('generations').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', genId)
            continue
          }

          try {
            const wanTaskId = await wsStart(wavespeedKey, WAN_ID(), [wanModelUrl, seedUrl], CAROUSEL_FACESWAP_PROMPT)
            // Update to 'processing' + job ID so sync-ai-jobs picks it up
            await db.from('generations').update({
              status: 'processing',
              wavespeed_job_id: wanTaskId,
              updated_at: new Date().toISOString(),
            }).eq('id', genId)
            console.log(`[carousel] Wan ${i + 1} started:`, wanTaskId.slice(0, 60))
          } catch (err) {
            console.error(`[carousel] Wan ${i + 1} failed:`, err)
            await db.from('generations').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', genId)
          }
        }

        console.log('[carousel] Pipeline complete')
      } catch (err) {
        console.error('[carousel] Pipeline error:', err)
        for (const id of placeholderIds) {
          await db.from('generations')
            .update({ status: 'failed', updated_at: new Date().toISOString() })
            .eq('id', id)
            .catch(() => {})
        }
      }
    })()

    // Keep function alive after response is sent
    ;(globalThis as any).EdgeRuntime?.waitUntil?.(pipeline)

    return respond({ ids: placeholderIds, status: 'carousel' })
  } catch (err) {
    console.error('[carousel-generate] handler error:', err)
    return respond({ error: 'Internal server error' }, 500)
  }
})
