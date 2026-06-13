import { corsHeaders } from '../_shared/cors.ts'
import { db } from '../_shared/db.ts'

const KLING_BASE = 'https://api.kie.ai/api/v1'
const klingKey = () => Deno.env.get('KLING_API_KEY') ?? ''

async function sendVideoToTelegram(token: string, chatId: string, videoUrl: string) {
  const resp = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, video: videoUrl }),
  })
  console.log('sendVideo TG:', resp.status, (await resp.text()).slice(0, 200))
}

function extractVideoUrl(data: Record<string, unknown>): string | undefined {
  // Primary: kie.ai recordInfo format — resultJson is a JSON string
  if (data?.resultJson) {
    try {
      const rj = JSON.parse(data.resultJson as string)
      const url = rj?.resultUrls?.[0]
      if (url) return url
    } catch {}
  }
  // Fallbacks for other response shapes
  const videos = data?.videos as Array<{ url: string }> | undefined
  const works = data?.works as Array<{ resource?: { url: string }; url?: string }> | undefined
  return videos?.[0]?.url
    ?? works?.[0]?.resource?.url
    ?? works?.[0]?.url
    ?? (data?.output_url as string | undefined)
    ?? (data?.video_url as string | undefined)
    ?? ((data?.outputs as string[] | undefined)?.[0])
}

function mapStatus(raw: string | undefined): 'ready' | 'failed' | 'processing' {
  if (!raw) return 'processing'
  const s = raw.toLowerCase()
  if (s === 'success' || s === 'succeed' || s === 'completed' || s === 'done') return 'ready'
  if (s === 'fail' || s === 'failed' || s === 'error') return 'failed'
  // waiting / queuing / generating → processing
  return 'processing'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { id } = await req.json()
    if (!id) {
      return new Response(JSON.stringify({ error: 'id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: job, error } = await db.from('kling_jobs').select('*').eq('id', id).single()
    if (error || !job) {
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const reply = (status: string, resultVideoUrl: string, createdAt: string) =>
      new Response(JSON.stringify({ id: job.id, status, resultVideoUrl, createdAt }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })

    // Already done — return immediately
    if (job.status === 'ready' || job.status === 'failed') {
      return reply(job.status, job.result_video_url ?? '', job.created_at)
    }

    if (!job.task_id) {
      await db.from('kling_jobs').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', id)
      return reply('failed', '', job.created_at)
    }

    const pollResp = await fetch(`${KLING_BASE}/jobs/recordInfo?taskId=${job.task_id}`, {
      headers: { Authorization: `Bearer ${klingKey()}` },
    })
    const pollText = await pollResp.text()
    // Full log so we can see exactly what Kling returns
    console.log(`poll-kling-video id=${id} taskId=${job.task_id} http=${pollResp.status} body=${pollText}`)

    let mapped: 'ready' | 'failed' | 'processing' = 'processing'
    let resultVideoUrl: string | undefined

    try {
      const pollData = JSON.parse(pollText)
      const data = (pollData?.data ?? pollData) as Record<string, unknown>
      // kie.ai recordInfo uses 'state' field
      mapped = mapStatus((data?.state ?? data?.status) as string | undefined)
      resultVideoUrl = extractVideoUrl(data)
      // If video URL present but status unclear — treat as ready
      if (mapped === 'processing' && resultVideoUrl) mapped = 'ready'
    } catch (e) {
      console.error('poll parse error:', e)
    }

    if (mapped === 'ready' && resultVideoUrl) {
      await db.from('kling_jobs').update({
        status: 'ready',
        result_video_url: resultVideoUrl,
        updated_at: new Date().toISOString(),
      }).eq('id', id)

      if (job.bot_id) {
        const { data: bot } = await db.from('bots').select('token, chat_id').eq('id', job.bot_id).single()
        if (bot?.token && bot?.chat_id) {
          await sendVideoToTelegram(bot.token as string, bot.chat_id as string, resultVideoUrl)
        }
      }
      return reply('ready', resultVideoUrl, job.created_at)
    }

    if (mapped === 'failed') {
      await db.from('kling_jobs').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', id)
      return reply('failed', '', job.created_at)
    }

    return reply('processing', '', job.created_at)
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
