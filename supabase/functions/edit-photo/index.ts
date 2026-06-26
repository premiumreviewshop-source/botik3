import { corsHeaders } from '../_shared/cors.ts'
import { db } from '../_shared/db.ts'
import { verifyAuth } from '../_shared/auth.ts'
import { checkAndDeduct } from '../_shared/balance.ts'

const WAVESPEED_BASE = () => Deno.env.get('WAVESPEED_BASE_URL') ?? 'https://api.wavespeed.ai/api/v3'
const WAN_ID = () => Deno.env.get('WAN_MODEL_ID') ?? 'alibaba/wan-2.7/image-edit-pro'
const EDIT_COST = 0.10

// ── Storage helper ────────────────────────────────────────────────────────────

async function ensurePublicUrl(url: string): Promise<string> {
  const storageMatch = url.match(/\/storage\/v1\/object\/(?:public\/)?([^\/]+)\/(.+)$/)
  if (storageMatch) {
    try {
      const [, bucket, path] = storageMatch
      const { data } = await db.storage.from(bucket).createSignedUrl(path, 3600)
      if (data?.signedUrl) return data.signedUrl
    } catch { /* fall through */ }
  }
  try {
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`fetch ${resp.status}`)
    const ct = resp.headers.get('content-type') ?? 'image/jpeg'
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg'
    const tmpPath = `tmp/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const bytes = await resp.arrayBuffer()
    await db.storage.from('model-images').upload(tmpPath, bytes, { contentType: ct, upsert: true })
    const { data } = await db.storage.from('model-images').createSignedUrl(tmpPath, 3600)
    if (data?.signedUrl) return data.signedUrl
  } catch { /* fall through */ }
  return url
}

async function saveToStorage(url: string, modelId: string, genId: string): Promise<string> {
  try {
    const resp = await fetch(url)
    if (!resp.ok) return url
    const ct = resp.headers.get('content-type') ?? 'image/jpeg'
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg'
    const path = `generated/${modelId}/${genId}.${ext}`
    const bytes = await resp.arrayBuffer()
    const { error } = await db.storage.from('model-images').upload(path, bytes, { contentType: ct, upsert: true })
    if (error) { console.error('[edit-photo] storage upload error:', error.message); return url }
    const { data } = db.storage.from('model-images').getPublicUrl(path)
    return data.publicUrl || url
  } catch (err) {
    console.error('[edit-photo] saveToStorage error:', err)
    return url
  }
}

// ── Grok templates ─────────────────────────────────────────────────────────────

const EXPR_REF_TEMPLATE = `Reference to image.

Change her facial expression only: cheeks puffed out with air, lips closed and pressed together, cute and playful look. Eyes looking straight at the camera, relaxed. Keep her face, hair, skin, tattoo, outfit and background identical to the reference.

*используй структуру этого промта для создания точнейшего промта для описания мимики, на основе фотографии которую я подкрепил. Важно чтобы ты писал сверху reference to image*`

const EXPR_TEXT_TEMPLATE = `Reference to image.

Change her facial expression only: cheeks puffed out with air, lips closed and pressed together, cute and playful look. Eyes looking straight at the camera, relaxed. Keep her face, hair, skin, tattoo, outfit and background identical to the reference.

*используй структуру этого промта для создания точнейшего промта для описания мимики. Но используй мое мое пожелание для того чтобы ты составил промт, который реализует мою желанную мимику. Важно чтобы ты писал сверху reference to image*

Мое пожелание *`

const POSE_REF_TEMPLATE = `Reference to image

make her tilt her head back slightly with eyes closed,
hair falling to one side,
hands resting on her knees

*используй структуру этого промта для создания точнейшего промта для описания позы, на основе фотографии которую я подкрепил. Важно чтобы ты писал сверху reference to image*`

const POSE_TEXT_TEMPLATE = `Reference to image

make her tilt her head back slightly with eyes closed,
hair falling to one side,
hands resting on her knees

*используй структуру этого промта для создания точнейшего промта для описания позы, на основе моего пожелания которую я подкрепил. Важно чтобы ты писал сверху reference to image*

Мое пожелание *`

const OUTFIT_PROMPT = `Reference to images.

Take the clothing item from the second image and put it on the woman from the first image.
Keep her face, hair, body, pose, and background exactly the same.
Only replace the clothing with the item from the second image.
Make it look natural and realistic.`

// ── Grok helper ───────────────────────────────────────────────────────────────

async function callGrok(xaiKey: string, xaiModel: string, imageUrls: string[], textPrompt: string): Promise<string> {
  const content: unknown[] = imageUrls.map(url => ({ type: 'image_url', image_url: { url } }))
  content.push({ type: 'text', text: textPrompt })
  const resp = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${xaiKey}` },
    body: JSON.stringify({ model: xaiModel, messages: [{ role: 'user', content }], max_tokens: 800 }),
  })
  if (!resp.ok) {
    console.error('[edit-photo] Grok error:', resp.status, (await resp.text().catch(() => '')).slice(0, 200))
    return ''
  }
  const data = await resp.json()
  return (data.choices?.[0]?.message?.content?.trim() as string) ?? ''
}

// ── Background processing ─────────────────────────────────────────────────────

async function processGeneration(
  genId: string,
  type: string,
  modelId: string,
  imageUrls: string[],
  userPrompt: string | undefined,
  subMode: string | undefined,
  userText: string | undefined,
  wavespeedKey: string,
  xaiKey: string,
  xaiModel: string,
): Promise<void> {
  try {
    const publicUrls = await Promise.all(imageUrls.map(ensurePublicUrl))
    let finalPrompt = ''
    let finalImages: string[] = [publicUrls[0]]

    if (type === 'expression') {
      const modelPhotoUrl = publicUrls[0]
      if (subMode === 'text' && userText) {
        finalPrompt = await callGrok(xaiKey, xaiModel, [modelPhotoUrl], EXPR_TEXT_TEMPLATE + userText + '*')
      } else {
        const exprRefUrl = publicUrls[1] ?? modelPhotoUrl
        finalPrompt = await callGrok(xaiKey, xaiModel, [modelPhotoUrl, exprRefUrl], EXPR_REF_TEMPLATE)
        finalImages = [modelPhotoUrl]
      }
      if (!finalPrompt) finalPrompt = 'Reference to image. Change her facial expression to a natural smile. Keep all other features identical.'

    } else if (type === 'outfit') {
      finalPrompt = OUTFIT_PROMPT
      finalImages = publicUrls.slice(0, 2)

    } else if (type === 'pose') {
      const modelPhotoUrl = publicUrls[0]
      if (subMode === 'text' && userText) {
        finalPrompt = await callGrok(xaiKey, xaiModel, [modelPhotoUrl], POSE_TEXT_TEMPLATE + userText + '*')
      } else if (subMode === 'ref' && publicUrls[1]) {
        finalPrompt = await callGrok(xaiKey, xaiModel, [modelPhotoUrl, publicUrls[1]], POSE_REF_TEMPLATE)
      } else {
        finalPrompt = userPrompt ?? 'edit the photo'
      }
      if (!finalPrompt) finalPrompt = 'Reference to image. Change her pose naturally. Keep all other features identical.'
      finalImages = [modelPhotoUrl]

    } else if (type === 'create') {
      const [modelPhotoUrl, refPhotoUrl] = publicUrls
      finalImages = [modelPhotoUrl]
      finalPrompt = await callGrok(xaiKey, xaiModel, [refPhotoUrl, modelPhotoUrl],
        'give me a prompt so i can replicate first image. but use my character details my character is on second image')
      if (!finalPrompt) finalPrompt = 'A photorealistic portrait of a beautiful woman, professional studio lighting, high quality.'
    }

    const wanId = WAN_ID()
    const requestBody: Record<string, unknown> = { prompt: finalPrompt, enable_safety_checker: false }
    if (finalImages.length > 0) requestBody.images = finalImages

    console.log(`[edit-photo] POST /api/v3/${wanId}`, JSON.stringify(requestBody).slice(0, 300))

    const wavResp = await fetch(`${WAVESPEED_BASE()}/${wanId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${wavespeedKey}` },
      body: JSON.stringify(requestBody),
    })

    const wavText = await wavResp.text()
    console.log(`[edit-photo] WaveSpeed ${wavResp.status}:`, wavText.slice(0, 600))

    let wavData: Record<string, unknown> | null = null
    try { wavData = JSON.parse(wavText) } catch {}

    const bodyCode = wavData ? (wavData.code as number | undefined) : undefined
    const isError = !wavResp.ok || (bodyCode !== undefined && bodyCode !== 200)

    if (isError || !wavData) {
      const errMsg = `ERR:${wavResp.status}:${(wavData?.message as string | undefined) ?? wavText.slice(0, 80)}`
      await db.from('generations').update({ status: 'failed', image_url: errMsg, updated_at: new Date().toISOString() }).eq('id', genId)
      return
    }

    const inner = wavData.data as Record<string, unknown> | undefined
    const jobId =
      (inner?.id as string | undefined) ??
      (wavData.id as string | undefined) ??
      (wavData.prediction_id as string | undefined)
    const pollUrl = (inner?.urls as Record<string, string> | undefined)?.get
    const jobIdToStore = pollUrl ?? jobId

    // Check if immediately completed
    const outputs = inner?.outputs as string[] | undefined
    const outputUrl =
      outputs?.[0] ??
      (inner?.output as string | undefined) ??
      (inner?.output_url as string | undefined) ??
      (inner?.image as string | undefined) ?? null
    const wsStatus = (inner?.status as string | undefined) ?? ''

    if ((wsStatus === 'completed' || wsStatus === 'succeeded') && outputUrl) {
      const storedUrl = await saveToStorage(outputUrl, modelId, genId)
      await db.from('generations').update({ image_url: storedUrl, status: 'ready', updated_at: new Date().toISOString() }).eq('id', genId)
    } else if (jobIdToStore) {
      await db.from('generations').update({ wavespeed_job_id: jobIdToStore, updated_at: new Date().toISOString() }).eq('id', genId)
    } else {
      console.error('[edit-photo] No job_id or result in response:', wavText.slice(0, 300))
      await db.from('generations').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', genId)
    }
  } catch (err) {
    console.error('[edit-photo] processGeneration error:', err)
    await db.from('generations').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', genId).catch(() => {})
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

const respond = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const { type, modelId, imageUrls, prompt: userPrompt, subMode, userText, initData } = body

    const botToken = Deno.env.get('PLATFORM_BOT_TOKEN') ?? Deno.env.get('BOT_TOKEN') ?? ''
    const auth = await verifyAuth(initData, botToken)
    if ('error' in auth) return respond(auth, (auth as any).status)
    const tgUserId = (auth as any).uid

    if (!type || !modelId || !Array.isArray(imageUrls) || !imageUrls.length)
      return respond({ error: 'Missing required fields' }, 400)
    if (!['expression', 'outfit', 'pose', 'create'].includes(type))
      return respond({ error: 'Invalid type' }, 400)

    const balErr = await checkAndDeduct(tgUserId, EDIT_COST, `AI редактирование (${type})`)
    if (balErr) return respond(balErr, 402)

    const now = new Date().toISOString()
    const { data: genRow, error: dbErr } = await db.from('generations').insert({
      model_id: modelId,
      model_name: '',
      prompt: userPrompt ?? type,
      status: 'processing',
      tg_user_id: tgUserId,
      cost: EDIT_COST,
      created_at: now,
      updated_at: now,
    }).select('id').single()
    if (dbErr || !genRow) return respond({ error: 'DB error' }, 500)
    const genId = (genRow as any).id

    const wavespeedKey = Deno.env.get('WAVESPEED_API_KEY') ?? ''
    const xaiKey = Deno.env.get('XAI_API_KEY') ?? ''
    const xaiModel = Deno.env.get('XAI_MODEL') ?? 'grok-4.3'

    // Fire-and-forget: Grok call is slow, respond to client immediately
    processGeneration(genId, type, modelId, imageUrls, userPrompt, subMode, userText, wavespeedKey, xaiKey, xaiModel)
      .catch(err => {
        console.error('[edit-photo] background task failed:', err)
        db.from('generations').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', genId).catch(() => {})
      })

    return respond({ id: genId, status: 'processing' })
  } catch {
    return respond({ error: 'Internal server error' }, 500)
  }
})
