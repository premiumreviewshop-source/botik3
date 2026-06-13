import { corsHeaders } from '../_shared/cors.ts'
import { db } from '../_shared/db.ts'
import { checkAndDeduct } from '../_shared/balance.ts'
import { verifyAuth } from '../_shared/auth.ts'

const VIDEO_COST: Record<string, number> = { '720p': 0.09, '1080p': 0.12 }

const KLING_BASE = 'https://api.kie.ai/api/v1'
const klingKey = () => Deno.env.get('KLING_API_KEY') ?? ''

const respond = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const {
      modelId, inputImageUrl, motionVideoUrl,
      mode, characterOrientation, prompt, botId, initData,
    } = await req.json()

    if (!inputImageUrl || !motionVideoUrl) {
      return respond({ error: 'inputImageUrl and motionVideoUrl required' }, 400)
    }

    const botToken = Deno.env.get('PLATFORM_BOT_TOKEN') ?? Deno.env.get('BOT_TOKEN') ?? ''
    const auth = await verifyAuth(initData, botToken)
    if ('error' in auth) return respond(auth, auth.status)
    const tgUserId = auth.uid

    const videoCost = VIDEO_COST[mode ?? '720p'] ?? 0.09
    const balErr = await checkAndDeduct(tgUserId, videoCost, `Видео генерация ${mode ?? '720p'}`)
    if (balErr) return respond(balErr, 402)

    const klingBody = {
      model: 'kling-2.6/motion-control',
      input: {
        input_urls: [inputImageUrl],
        video_urls: [motionVideoUrl],
        character_orientation: characterOrientation ?? 'image',
        mode: mode ?? '720p',
        ...(prompt && { prompt }),
      },
    }

    console.log('Kling createTask:', JSON.stringify(klingBody).slice(0, 400))

    const klingResp = await fetch(`${KLING_BASE}/jobs/createTask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${klingKey()}`,
      },
      body: JSON.stringify(klingBody),
    })

    const klingText = await klingResp.text()
    console.log('Kling response:', klingResp.status, klingText.slice(0, 500))

    let taskId: string | undefined
    try {
      const d = JSON.parse(klingText)
      taskId = d?.data?.taskId ?? d?.taskId ?? d?.task_id ?? d?.data?.task_id
    } catch {}

    const { data: job, error } = await db.from('kling_jobs').insert({
      tg_user_id: tgUserId,
      model_id: modelId ?? null,
      task_id: taskId ?? null,
      status: taskId ? 'processing' : 'failed',
      input_image_url: inputImageUrl,
      motion_video_url: motionVideoUrl,
      mode: mode ?? '720p',
      character_orientation: characterOrientation ?? 'image',
      prompt: prompt ?? null,
      bot_id: botId ?? null,
    }).select().single()

    if (error || !job) return respond({ error: error?.message ?? 'db error' }, 500)

    if (!taskId) {
      return respond({ error: 'Video service error' }, 502)
    }

    return respond({ id: job.id, taskId, status: 'processing' })
  } catch {
    return respond({ error: 'Internal server error' }, 500)
  }
})
