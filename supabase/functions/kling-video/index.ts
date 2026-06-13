import { corsHeaders } from '../_shared/cors.ts'
import { db } from '../_shared/db.ts'
import { checkAndDeduct } from '../_shared/balance.ts'

const VIDEO_COST: Record<string, number> = { '720p': 0.09, '1080p': 0.12 }

const KLING_BASE = 'https://api.kie.ai/api/v1'
const klingKey = () => Deno.env.get('KLING_API_KEY') ?? ''

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const {
      tgUserId, modelId, inputImageUrl, motionVideoUrl,
      mode, characterOrientation, prompt, botId,
    } = await req.json()

    if (!inputImageUrl || !motionVideoUrl) {
      return new Response(JSON.stringify({ error: 'inputImageUrl and motionVideoUrl required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const videoCost = VIDEO_COST[mode ?? '720p'] ?? 0.09
    if (tgUserId) {
      const balErr = await checkAndDeduct(String(tgUserId), videoCost, `Видео генерация ${mode ?? '720p'}`)
      if (balErr) return new Response(JSON.stringify(balErr), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

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
      tg_user_id: tgUserId ?? 0,
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

    if (error || !job) {
      return new Response(JSON.stringify({ error: error?.message ?? 'db error' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!taskId) {
      return new Response(JSON.stringify({ error: `Kling API error: ${klingText.slice(0, 200)}` }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ id: job.id, taskId, status: 'processing' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
