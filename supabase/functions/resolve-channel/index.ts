import { corsHeaders } from '../_shared/cors.ts'
import { db } from '../_shared/db.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { username, tgUserId } = await req.json()
    if (!username || !tgUserId) {
      return new Response(JSON.stringify({ error: 'username and tgUserId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = Deno.env.get('PLATFORM_BOT_TOKEN')
    if (!token) {
      return new Response(JSON.stringify({ error: 'PLATFORM_BOT_TOKEN not set' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const cleanUsername = username.startsWith('@') ? username : `@${username}`

    const chatResp = await fetch(`https://api.telegram.org/bot${token}/getChat?chat_id=${cleanUsername}`)
    const chatData = await chatResp.json()

    if (!chatData.ok) {
      return new Response(JSON.stringify({ error: chatData.description ?? 'Канал не найден' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const chat = chatData.result
    let photoUrl: string | null = null

    if (chat.photo?.small_file_id) {
      try {
        const fileResp = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${chat.photo.small_file_id}`)
        const fileData = await fileResp.json()
        if (fileData.ok && fileData.result?.file_path) {
          const tgFileUrl = `https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`
          // Download and re-upload to Supabase storage to avoid exposing bot token
          const imgResp = await fetch(tgFileUrl)
          if (imgResp.ok) {
            const buf = await imgResp.arrayBuffer()
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!
            const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
            const storagePath = `channel-photos/${tgUserId}_${Date.now()}.jpg`
            const uploadResp = await fetch(`${supabaseUrl}/storage/v1/object/model-images/${storagePath}`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
              body: buf,
            })
            if (uploadResp.ok) {
              photoUrl = `${supabaseUrl}/storage/v1/object/public/model-images/${storagePath}`
            }
          }
        }
      } catch { /* skip photo on error */ }
    }

    const { data: channel, error } = await db
      .from('channels')
      .upsert({
        tg_user_id: tgUserId,
        username: cleanUsername,
        chat_id: chat.id,
        title: chat.title ?? cleanUsername,
        photo_url: photoUrl,
      }, { onConflict: 'tg_user_id,username' })
      .select()
      .single()

    if (error) throw new Error(error.message)

    return new Response(JSON.stringify({ channel }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
