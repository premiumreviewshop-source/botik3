import { supabase } from '../lib/supabase'
import { getTgUserId } from '../lib/tgUser'
import type {
  Bot, PPVItem, AIModel, GeneratedPhoto, ReadyPost,
  SavedPrompt, SavedFooter, SavedEmoji, PlanItem, Transaction, KlingJob, Channel,
} from '../types'

// ── helpers ──────────────────────────────────────────────────────────────────

function ok<T>(result: { data: T | null; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message)
  return result.data as NonNullable<T>
}

async function fn<T>(name: string, body?: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body })
  if (error) {
    let msg = error.message
    try {
      const body = await (error as any).context?.json?.()
      if (body?.error) msg = body.error
    } catch {}
    throw new Error(msg)
  }
  return data!
}

const uid = getTgUserId
const getInitData = () => (window as any).Telegram?.WebApp?.initData ?? ''

// ── row → type mappers ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapBot(r: any): Bot {
  return {
    id: r.id,
    name: r.name,
    handle: r.handle,
    isActive: r.is_active,
    modules: r.modules ?? [],
    chatId: r.chat_id ?? undefined,
    token: r.token,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapModel(r: any): AIModel {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    previewUrl: r.preview_url ?? r.lora_url ?? undefined,
    createdAt: r.created_at,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapGeneration(r: any): GeneratedPhoto {
  return {
    id: r.id,
    modelId: r.model_id ?? '',
    modelName: r.model_name ?? '',
    url: r.image_url ?? '',
    createdAt: r.created_at,
    status: r.status as GeneratedPhoto['status'],
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPost(r: any): ReadyPost {
  return {
    id: r.id,
    url: r.url ?? undefined,
    extraUrls: r.extra_urls ?? [],
    caption: r.caption ?? '',
    price: r.price ?? undefined,
    createdAt: r.created_at,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPPV(r: any): PPVItem {
  return {
    id: r.id,
    botId: r.bot_id,
    title: r.title,
    description: r.description ?? '',
    priceStars: r.price_stars,
    minPriceStars: r.min_price_stars ?? (r.media_type === 'video' ? 900 : 150),
    bargainingEnabled: r.bargaining_enabled ?? true,
    triggers: r.triggers ?? [],
    mediaType: r.media_type ?? 'photo',
    mediaUrl: r.media_url ?? undefined,
    purchases: r.purchases ?? 0,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPlan(r: any): PlanItem {
  // date_obj + time are stored in UTC; convert to local timezone for display
  const utcDt = new Date(`${r.date_obj}T${(r.time ?? '00:00').slice(0, 5)}:00Z`)
  const localHH = String(utcDt.getHours()).padStart(2, '0')
  const localMM = String(utcDt.getMinutes()).padStart(2, '0')
  const localY = utcDt.getFullYear()
  const localM = String(utcDt.getMonth() + 1).padStart(2, '0')
  const localD = String(utcDt.getDate()).padStart(2, '0')
  // Convert published_at to local time string for display
  let publishedAt: string | undefined
  if (r.published_at) {
    const pub = new Date(r.published_at)
    publishedAt = `${String(pub.getHours()).padStart(2, '0')}:${String(pub.getMinutes()).padStart(2, '0')} ${pub.getDate()} ${pub.toLocaleDateString('ru', { month: 'short' })}`
  }
  return {
    id: r.id,
    date: r.date,
    dateObj: `${localY}-${localM}-${localD}`,
    time: `${localHH}:${localMM}`,
    category: r.category,
    postId: r.post_id ?? undefined,
    postUrl: r.post_url ?? undefined,
    postCaption: r.post_caption ?? undefined,
    price: r.price ?? undefined,
    status: r.status ?? 'scheduled',
    publishedAt,
    editing: false,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapChannel(r: any): Channel {
  return {
    id: r.id,
    username: r.username,
    chatId: r.chat_id ?? null,
    title: r.title ?? r.username,
    photoUrl: r.photo_url ?? null,
    createdAt: r.created_at,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFooter(r: any): SavedFooter {
  return { id: r.id, name: r.name, text: r.text, gapLines: r.gap_lines ?? 1 }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapKlingJob(r: any): KlingJob {
  return {
    id: r.id,
    status: r.status,
    resultVideoUrl: r.result_video_url ?? '',
    createdAt: r.created_at,
  }
}

// ── api surface ───────────────────────────────────────────────────────────────

export const api = {
  bots: {
    list: async () => {
      const result = await fn<{ bots: object[] }>('list-bots', { initData: getInitData() })
      return result.bots.map(mapBot)
    },
    add: (data: { name?: string; token: string; chatId?: string }) =>
      fn<Bot>('add-bot', { ...data, initData: getInitData() }).then(mapBot),
    update: (
      id: string,
      data: Partial<Pick<Bot, 'name' | 'handle' | 'isActive' | 'modules'> & { chatId: string }>,
    ) => fn<{ ok: boolean }>('update-bot', { id, ...data, initData: getInitData() }),
    remove: (id: string) =>
      fn<{ ok: boolean }>('delete-bot', { id, initData: getInitData() }),
    reset: (id: string) =>
      fn<{ ok: boolean }>('delete-bot', { id, reset: true, initData: getInitData() }),
    stats: (id: string, period: 'today' | 'week' | 'month') =>
      fn<{
        messages: number; uniqueChatters: number; ppvSold: number
        ppvRevenue: number; ppvRevenueUsd: number; postsPublished: number
        starsBalance: number; starsEarned: number; starsWithdrawn: number
        salesHistory?: { id: string; createdAt: string; tgUserId: number | null; tgFirstName: string | null; tgUsername: string | null; amountStars: number; amountUsd: number; itemTitle: string | null }[]
      }>('analytics', { botId: id, period, initData: getInitData() }),
  },

  analytics: {
    get: (period: 'today' | 'week' | 'month', botId?: string) =>
      fn<{
        period: string; aiMessages: number; aiChats: number; aiAvgSec: number
        ppvSold: number; ppvRevenue: number; ppvRevenueUsd: number; ppvViews: number
        postsPublished: number; postsReach: number; postsInPlan: number
        botsActive: number; spark: number[]
        salesHistory: { id: string; createdAt: string; tgUserId: number | null; tgFirstName: string | null; tgUsername: string | null; amountStars: number; amountUsd: number; itemTitle: string | null }[]
      }>('analytics', { period, botId: botId ?? undefined, initData: getInitData() }),
    salesHistory: (botId?: string) =>
      fn<{ id: string; createdAt: string; tgUserId: number | null; amountStars: number; amountUsd: number; itemTitle: string | null }[]>(
        'analytics',
        { period: 'month', botId, initData: getInitData() },
      ).then((r: any) => r.salesHistory ?? []),
    heatmap: async () => ({ matrix: [] as number[][] }),
  },

  models: {
    list: async () => {
      const rows = ok(await supabase.from('ai_models').select('*').eq('tg_user_id', uid()).order('created_at'))
      return (rows as object[]).map(mapModel)
    },
    get: async (id: string) => {
      const row = ok(await supabase.from('ai_models').select('*').eq('id', id).single())
      return mapModel(row)
    },
    create: (data: { name: string; imageUrls: string[]; prompt?: string }) =>
      fn<{ id: string; name: string; status: string; triggerWord: string }>('create-model', { ...data, initData: getInitData() }),
    remove: async (id: string) => {
      ok(await supabase.from('ai_models').delete().eq('id', id).eq('tg_user_id', uid()))
      return { ok: true }
    },
  },

  generate: {
    list: async () => {
      const rows = ok(
        await supabase.from('generations').select('*').eq('tg_user_id', uid()).order('created_at', { ascending: false }),
      )
      return (rows as object[]).map(mapGeneration)
    },
    listByModel: async (modelId: string) => {
      const rows = ok(
        await supabase.from('generations').select('*')
          .eq('tg_user_id', uid())
          .eq('model_id', modelId)
          .order('created_at', { ascending: false }),
      )
      return (rows as object[]).map(mapGeneration)
    },
    start: (data: { prompt: string; modelId?: string; imageUrls?: string[] }) =>
      fn<{ id: string; status: string }>('generate-photo', { ...data, initData: getInitData() }),
    get: async (id: string) => {
      const row = ok(await supabase.from('generations').select('*').eq('id', id).single())
      return mapGeneration(row)
    },
    poll: (id: string) =>
      fn<GeneratedPhoto>('poll-generation', { id }),
    remove: async (id: string) => {
      ok(await supabase.from('generations').delete().eq('id', id).eq('tg_user_id', uid()))
      return { ok: true }
    },
  },

  posts: {
    list: async () => {
      const rows = ok(await supabase.from('posts').select('*').eq('tg_user_id', uid()).order('created_at'))
      return (rows as object[]).map(mapPost)
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    add: async (data: Partial<ReadyPost>) => {
      const row = ok(
        await supabase.from('posts').insert({
          url: data.url,
          extra_urls: data.extraUrls ?? [],
          caption: data.caption ?? '',
          price: data.price ?? null,
          tg_user_id: uid(),
        }).select('id').single(),
      )
      return row as { id: string }
    },
    update: async (id: string, data: Partial<ReadyPost>) => {
      ok(
        await supabase.from('posts').update({
          ...(data.url !== undefined && { url: data.url }),
          ...(data.extraUrls !== undefined && { extra_urls: data.extraUrls }),
          ...(data.caption !== undefined && { caption: data.caption }),
          ...(data.price !== undefined && { price: data.price }),
        }).eq('id', id).eq('tg_user_id', uid()),
      )
      return { ok: true }
    },
    remove: async (id: string) => {
      ok(await supabase.from('posts').delete().eq('id', id).eq('tg_user_id', uid()))
      return { ok: true }
    },
    removeMany: async (ids: string[]) => {
      ok(await supabase.from('posts').delete().in('id', ids).eq('tg_user_id', uid()))
      return { ok: true }
    },
  },

  ppv: {
    list: async () => {
      const rows = ok(await supabase.from('ppv_items').select('*').eq('tg_user_id', uid()).order('created_at'))
      return (rows as object[]).map(mapPPV)
    },
    add: async (data: Omit<PPVItem, 'id' | 'purchases'>) => {
      const row = ok(
        await supabase.from('ppv_items').insert({
          bot_id: data.botId,
          title: data.title,
          description: data.description,
          price_stars: data.priceStars,
          min_price_stars: data.minPriceStars,
          bargaining_enabled: data.bargainingEnabled,
          triggers: data.triggers,
          media_type: data.mediaType,
          media_url: data.mediaUrl ?? null,
          tg_user_id: uid(),
        }).select('id').single(),
      )
      return row as { id: string }
    },
    update: async (id: string, data: Partial<PPVItem>) => {
      ok(
        await supabase.from('ppv_items').update({
          ...(data.title !== undefined && { title: data.title }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.priceStars !== undefined && { price_stars: data.priceStars }),
          ...(data.minPriceStars !== undefined && { min_price_stars: data.minPriceStars }),
          ...(data.bargainingEnabled !== undefined && { bargaining_enabled: data.bargainingEnabled }),
          ...(data.triggers !== undefined && { triggers: data.triggers }),
          ...(data.mediaType !== undefined && { media_type: data.mediaType }),
          ...(data.mediaUrl !== undefined && { media_url: data.mediaUrl }),
        }).eq('id', id).eq('tg_user_id', uid()),
      )
      return { ok: true }
    },
    remove: async (id: string) => {
      ok(await supabase.from('ppv_items').delete().eq('id', id).eq('tg_user_id', uid()))
      return { ok: true }
    },
  },

  channels: {
    list: async (): Promise<Channel[]> => {
      const rows = ok(await supabase.from('channels').select('*').eq('tg_user_id', uid()).order('created_at'))
      return (rows as object[]).map(mapChannel)
    },
    resolve: async (username: string): Promise<Channel> => {
      const result = await fn<{ channel: object }>('resolve-channel', { username, tgUserId: uid() })
      return mapChannel(result.channel)
    },
    remove: async (id: string) => {
      ok(await supabase.from('channels').delete().eq('id', id).eq('tg_user_id', uid()))
      return { ok: true }
    },
  },

  autopost: {
    getPlan: async () => {
      const rows = ok(await supabase.from('content_plan').select('*').eq('tg_user_id', uid()).order('date'))
      return (rows as object[]).map(mapPlan)
    },
    savePlan: async (plan: PlanItem[], channelId?: string) => {
      ok(await supabase.from('content_plan').delete().eq('tg_user_id', uid()).not('id', 'is', null))
      if (plan.length) {
        const rows = plan.map((p) => {
          // Convert local date+time to UTC before storing
          const localDt = new Date(`${p.dateObj}T${p.time}:00`)
          return {
            id: p.id,
            date: p.date,
            date_obj: localDt.toISOString().slice(0, 10),
            time: localDt.toISOString().slice(11, 16),
            category: p.category,
            // post_id intentionally omitted: local post IDs are not valid DB UUIDs
            // and would violate the FK constraint. post_url/post_caption are sufficient for publishing.
            post_url: p.postUrl ?? null,
            post_caption: p.postCaption ?? null,
            price: p.price ?? null,
            status: p.status,
            channel_id: channelId ?? null,
            tg_user_id: uid(),
          }
        })
        ok(await supabase.from('content_plan').insert(rows))
      }
      return { ok: true }
    },
    enableAutopost: async (channelId: string) => {
      ok(
        await supabase.from('content_plan')
          .update({ channel_id: channelId })
          .eq('tg_user_id', uid())
          .eq('status', 'scheduled'),
      )
      return { ok: true }
    },
    disableAutopost: async () => {
      ok(
        await supabase.from('content_plan')
          .update({ channel_id: null })
          .eq('tg_user_id', uid())
          .eq('status', 'scheduled'),
      )
      return { ok: true }
    },
    isActive: async (): Promise<boolean> => {
      const { data } = await supabase.from('content_plan')
        .select('id')
        .eq('tg_user_id', uid())
        .eq('status', 'scheduled')
        .not('channel_id', 'is', null)
        .limit(1)
      return !!(data && data.length > 0)
    },
    updateItem: async (id: string, data: {
      time?: string; date?: string; dateObj?: string
      status?: string; price?: number | null; postCaption?: string | null
    }) => {
      const payload: Record<string, unknown> = {}
      if (data.date !== undefined) payload.date = data.date
      if (data.status !== undefined) payload.status = data.status
      if ('price' in data) payload.price = data.price ?? null
      if ('postCaption' in data) payload.post_caption = data.postCaption ?? null
      if (data.time && data.dateObj) {
        // Both provided: convert local date+time to UTC
        const localDt = new Date(`${data.dateObj}T${data.time}:00`)
        payload.date_obj = localDt.toISOString().slice(0, 10)
        payload.time = localDt.toISOString().slice(11, 16)
      } else {
        if (data.time !== undefined) payload.time = data.time
        if (data.dateObj !== undefined) payload.date_obj = data.dateObj
      }
      ok(await supabase.from('content_plan').update(payload).eq('id', id).eq('tg_user_id', uid()))
      return { ok: true }
    },
    publishNow: (id: string, channelId?: string) => fn<{ ok: boolean; debug?: { rawCaption?: string; compiledHtml?: string; parsedText?: string; parsedEntities?: object[] } }>('publish-post', { planItemId: id, channelId }),
    runPublish: () => fn<{ published: number; checked: number; total: number; active?: number; errors: string[] }>('auto-publish', {}),
    channelStats: async (): Promise<{ channelId: string; published: number; scheduled: number }[]> => {
      const { data } = await supabase.from('content_plan')
        .select('channel_id, status')
        .eq('tg_user_id', uid())
        .not('channel_id', 'is', null)
      const map: Record<string, { published: number; scheduled: number }> = {}
      for (const r of (data ?? []) as { channel_id: string; status: string }[]) {
        if (!map[r.channel_id]) map[r.channel_id] = { published: 0, scheduled: 0 }
        if (r.status === 'published') map[r.channel_id].published++
        else if (r.status === 'scheduled') map[r.channel_id].scheduled++
      }
      return Object.entries(map).map(([channelId, v]) => ({ channelId, ...v }))
    },
    publishedHours: async (): Promise<number[]> => {
      const { data } = await supabase.from('content_plan')
        .select('published_at')
        .eq('tg_user_id', uid())
        .eq('status', 'published')
        .not('published_at', 'is', null)
      const counts = Array(24).fill(0)
      for (const r of (data ?? []) as { published_at: string }[]) {
        const h = new Date(r.published_at).getHours()
        counts[h]++
      }
      return counts
    },
  },

  prompts: {
    list: async () => {
      const rows = ok(await supabase.from('saved_prompts').select('*').eq('tg_user_id', uid()).order('created_at'))
      return rows as SavedPrompt[]
    },
    add: async (data: { name: string; text: string }) => {
      const row = ok(await supabase.from('saved_prompts').insert({ ...data, tg_user_id: uid() }).select('id').single())
      return row as { id: string }
    },
    remove: async (id: string) => {
      ok(await supabase.from('saved_prompts').delete().eq('id', id).eq('tg_user_id', uid()))
      return { ok: true }
    },
  },

  footers: {
    list: async () => {
      const rows = ok(await supabase.from('saved_footers').select('*').eq('tg_user_id', uid()).order('created_at'))
      return (rows as object[]).map(mapFooter)
    },
    add: async (data: { name: string; text: string; gapLines: number }) => {
      const row = ok(
        await supabase
          .from('saved_footers')
          .insert({ name: data.name, text: data.text, gap_lines: data.gapLines, tg_user_id: uid() })
          .select('id')
          .single(),
      )
      return row as { id: string }
    },
    remove: async (id: string) => {
      ok(await supabase.from('saved_footers').delete().eq('id', id).eq('tg_user_id', uid()))
      return { ok: true }
    },
  },

  klingVideo: {
    list: async (modelId?: string) => {
      let q = supabase.from('kling_jobs').select('*').eq('tg_user_id', uid())
        .in('status', ['processing', 'pending', 'ready'])
        .order('created_at', { ascending: false })
      if (modelId) q = q.eq('model_id', modelId)
      const rows = ok(await q)
      return (rows as object[]).map(mapKlingJob)
    },
    start: (data: {
      modelId?: string
      inputImageUrl: string
      motionVideoUrl: string
      mode?: '720p' | '1080p'
      characterOrientation?: 'image' | 'video'
      prompt?: string
      botId?: string
    }) => fn<{ id: string; taskId: string; status: string }>('kling-video', { ...data, initData: getInitData() }),
    poll: (id: string) => fn<KlingJob>('poll-kling-video', { id }),
    remove: async (id: string) => {
      ok(await supabase.from('kling_jobs').delete().eq('id', id).eq('tg_user_id', uid()))
      return { ok: true }
    },
  },

  webhooks: {
    refresh: (botId: string) => fn<{ ok: boolean }>('refresh-webhook', { botId, tgUserId: uid() }),
  },

  payments: {
    debugNotify: (tgUserId: string) =>
      fn<{ status: number; tgResp: { ok: boolean; description?: string }; botTokenPrefix: string; chatId: string }>(
        'payments',
        { action: 'debug_notify', tgUserId },
      ),
  },

  transactions: {
    // Routes through the edge function (service role key) to bypass RLS on transactions table
    list: async (): Promise<Transaction[]> => {
      const initData = (window as any).Telegram?.WebApp?.initData ?? ''
      const { data } = await supabase.functions.invoke<{ transactions: any[] }>('payments', {
        body: { action: 'get_transactions', tgUserId: uid(), initData },
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data?.transactions ?? []).map((r: any) => ({
        id: r.id,
        type: r.type ?? 'topup',
        amount: r.amount ?? 0,
        description: r.description ?? '',
        date: r.created_at ? new Date(r.created_at).toLocaleDateString('ru') : '',
      }))
    },
  },

  emojis: {
    list: async (): Promise<SavedEmoji[]> => {
      const rows = ok(await supabase.from('saved_emojis').select('*').eq('tg_user_id', uid()).order('created_at'))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (rows as any[]).map(r => ({ id: r.id, stickerId: r.sticker_id, label: r.label, alt: r.alt_emoji ?? '✨' }))
    },
    add: async (data: { stickerId: string; label: string; alt: string }): Promise<{ id: string }> => {
      const row = ok(
        await supabase.from('saved_emojis').insert({ sticker_id: data.stickerId, label: data.label, alt_emoji: data.alt, tg_user_id: uid() }).select('id').single(),
      )
      return row as { id: string }
    },
    remove: async (id: string) => {
      ok(await supabase.from('saved_emojis').delete().eq('id', id).eq('tg_user_id', uid()))
      return { ok: true }
    },
    verify: (emojiId: string) =>
      fn<{ valid: boolean; emoji?: string; setName?: string | null; error?: string }>('verify-emoji', { emojiId }),
  },

  captions: {
    generate: (data: {
      prompt?: string; lang: string; type: 'hot' | 'custom'
      footerText?: string; gapLines?: number; imageUrl?: string
    }) => fn<{ caption: string }>('generate-caption', { ...data, initData: getInitData() }),
  },

  aiChat: {
    get: async (botId: string) => {
      const { data } = await supabase.from('ai_chat_config').select('*').eq('bot_id', botId).maybeSingle()
      return data as {
        prompt_type: 'ready' | 'custom'; lang: 'en' | 'ru' | 'tr'
        persona_name: string; persona_age: string; persona_city: string; custom_prompt: string
        photo_price: number | null; photo_min_price: number | null
        video_price: number | null; video_min_price: number | null
        bargaining_enabled: boolean | null
        business_connection_id: string | null
        read_delay_seconds: number | null
        large_delay_enabled: boolean | null
        large_delay_seconds: number | null
        inactivity_reset_minutes: number | null
        vip_enabled: boolean | null
        vip_link: string | null
      } | null
    },
    save: async (botId: string, cfg: {
      promptType: 'ready' | 'custom'; lang: 'en' | 'ru' | 'tr'
      personaName: string; personaAge: string; personaCity: string; customPrompt: string
      businessConnectionId?: string
      readDelaySeconds?: number
      largeDelayEnabled?: boolean
      largeDelaySeconds?: number
      inactivityResetMinutes?: number
      vipEnabled?: boolean
      vipLink?: string
    }) => {
      const payload = {
        bot_id: botId,
        tg_user_id: uid(),
        prompt_type: cfg.promptType,
        lang: cfg.lang,
        persona_name: cfg.personaName,
        persona_age: cfg.personaAge,
        persona_city: cfg.personaCity,
        custom_prompt: cfg.customPrompt,
        ...(cfg.businessConnectionId !== undefined && { business_connection_id: cfg.businessConnectionId || null }),
        ...(cfg.readDelaySeconds !== undefined && { read_delay_seconds: cfg.readDelaySeconds }),
        ...(cfg.largeDelayEnabled !== undefined && { large_delay_enabled: cfg.largeDelayEnabled }),
        ...(cfg.largeDelaySeconds !== undefined && { large_delay_seconds: cfg.largeDelaySeconds }),
        ...(cfg.inactivityResetMinutes !== undefined && { inactivity_reset_minutes: cfg.inactivityResetMinutes }),
        ...(cfg.vipEnabled !== undefined && { vip_enabled: cfg.vipEnabled }),
        ...(cfg.vipLink !== undefined && { vip_link: cfg.vipLink || null }),
        updated_at: new Date().toISOString(),
      }
      ok(await supabase.from('ai_chat_config').upsert(payload, { onConflict: 'bot_id' }))
      // Discard any pending (unread) messages so old language/persona context doesn't bleed in.
      // Mark as replied=true with no bot_reply so they're treated as done but excluded from history.
      await supabase.from('tg_updates')
        .update({ replied: true, locked_at: null })
        .eq('bot_id', botId).eq('type', 'message').eq('replied', false)
      await supabase.from('ppv_last_sent').delete().eq('bot_id', botId)
      return { ok: true }
    },
    saveBargainConfig: async (botId: string, cfg: {
      photoPrice: number; photoMinPrice: number
      videoPrice: number; videoMinPrice: number
      bargainingEnabled: boolean
    }) => {
      const payload = {
        bot_id: botId,
        tg_user_id: uid(),
        photo_price: cfg.photoPrice,
        photo_min_price: cfg.photoMinPrice,
        video_price: cfg.videoPrice,
        video_min_price: cfg.videoMinPrice,
        bargaining_enabled: cfg.bargainingEnabled,
        updated_at: new Date().toISOString(),
      }
      ok(await supabase.from('ai_chat_config').upsert(payload, { onConflict: 'bot_id' }))
      await supabase.from('tg_updates')
        .update({ replied: true, locked_at: null })
        .eq('bot_id', botId).eq('type', 'message').eq('replied', false)
      await supabase.from('ppv_last_sent').delete().eq('bot_id', botId)
      return { ok: true }
    },
  },
}

export default api
