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

Deno.serve(async () => {
  const { data: jobs } = await db
    .from('kling_jobs')
    .select('*')
    .in('status', ['pending', 'processing'])
    .not('task_id', 'is', null)

  if (!jobs?.length) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  console.log(`sync-kling-jobs: processing ${jobs.length} jobs`)

  await Promise.all(jobs.map(async (job: Record<string, unknown>) => {
    try {
      const pollResp = await fetch(`${KLING_BASE}/jobs/recordInfo?taskId=${job.task_id}`, {
        headers: { Authorization: `Bearer ${klingKey()}` },
      })
      const pollText = await pollResp.text()
      console.log(`job ${job.id} poll: ${pollResp.status} ${pollText.slice(0, 300)}`)

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
      } catch {}

      if (mapped === 'ready' && resultVideoUrl) {
        await db.from('kling_jobs').update({
          status: 'ready',
          result_video_url: resultVideoUrl,
          updated_at: new Date().toISOString(),
        }).eq('id', job.id)

        if (job.bot_id) {
          const { data: bot } = await db.from('bots').select('token, chat_id').eq('id', job.bot_id).single()
          if (bot?.token && bot?.chat_id) {
            await sendVideoToTelegram(bot.token as string, bot.chat_id as string, resultVideoUrl)
          }
        }
        console.log(`job ${job.id} → ready: ${resultVideoUrl}`)
      } else if (mapped === 'failed') {
        await db.from('kling_jobs').update({
          status: 'failed',
          updated_at: new Date().toISOString(),
        }).eq('id', job.id)
        console.log(`job ${job.id} → failed`)
      }
    } catch (err) {
      console.error(`job ${job.id} error:`, String(err))
    }
  }))

  return new Response(JSON.stringify({ ok: true, processed: jobs.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
