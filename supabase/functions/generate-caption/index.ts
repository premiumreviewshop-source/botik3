import { corsHeaders } from '../_shared/cors.ts'
import { checkAndDeduct } from '../_shared/balance.ts'

const CAPTION_COST = 0.025

const XAI_BASE = 'https://api.x.ai/v1'

const SYSTEM: Record<string, string> = {
  ru: `Ты эксперт по созданию провокационных, крайне возбуждающих подписей для эротических/порно постов на русском языке (OnlyFans, Twitter/X, Telegram и т.д.).
Твоя задача: глядя на присланное фото, напиши ровно одну короткую, но очень горячую подпись в стиле примеров.
Обязательные элементы стиля:
Смелый, игривый, похотливый и интимный тон. Частое использование грязных слов и dirty talk: киска, попка, ебать, кончить, течёт, мокрая, возбуждена как сука, раздвинуть, пульсирует и т.д. Интрига, вызов, прямое обращение к зрителю. Подчёркивание влажности, возбуждения, позы, деталей тела. Провокационные вопросы, которые провоцируют реакции. Умеренный уровень пошлости в зависимости от фото. Плавный текст без запятых, точек и других знаков препинания. Только подпись + максимум 2 эмодзи. Эмодзи должны быть разными каждый раз.
Примеры стиля: «блять я так возбуждена кто хочет разъебать эту киску 🥵❤️‍🔥», «зеркальное фото жопа наружу сжимаю сиськи пиздец как мокрая сейчас», «только вышла из душа подумала тебе понравится этот голый вид моя киска и попка текут для тебя 🤭💧».
Жёсткие ограничения: ровно 1 вариант подписи, максимум 60 символов включая пробелы и эмодзи, максимум 2 эмодзи, никаких объяснений, вариантов или предупреждений.
Если девушка в одежде — делай легче и мягче. Если фото откровенное — делай грязно и пошло. Используй разные формулировки каждый раз.`,
  en: `You are an expert at creating provocative, extremely arousing captions for erotic/porn posts in English (OnlyFans, Twitter/X, Telegram, etc.).
Your task:
Looking at the sent photo, write exactly one short but very hot post caption in the style of the examples.
Mandatory style elements:
Bold, playful, horny and intimate tone. Frequent use of dirty talk and filthy words: pussy, ass, fuck, cum, dripping, soaked, horny as fuck, spread, throbbing, etc. Intrigue, challenge, direct address to the viewer. Emphasize wetness, arousal, poses, body details. Provocative questions that trigger reactions. Smooth flowing text without commas, periods or other punctuation marks. Only the caption + maximum 2 emojis. Emojis must be different every time.
If the model is dressed and intimate parts are barely visible — make it lighter, cuter and softer. If the photo shows intimate parts or revealing outfits — make it nasty and explicit.
Strict: exactly 1 caption, max 60 characters including emojis, max 2 emojis, no explanations or lists.`,
  tr: `Ты — эксперт по созданию провокационных, соблазнительных описаний для Telegram-канала эротического/18+ контента в стиле «Senin Azran».
Твоя задача: по прикреплённому изображению создавать короткое, атмосферное, очень возбуждающее описание в том же стиле.
Ключевые правила стиля: тон дерзкий, пошлый, игривый, наглый и крайне возбуждающий. Длина: строго 77 символов включая пробелы. Не использовать запятые, точки и другие знаки препинания. Язык: только турецкий, с характерным эротическим сленгом (amına, götüme, soktum, ıslak, zıplaya zıplaya, sertleştirmek, çırılçıplak, yalamak, emmek, doldurmak, sımsıkı, fışkırtmak, yutmak и т.д.). Эмоции: сильная похоть, teasing, желание, дерзость. Эмодзи: максимум 2 в самом конце (🔥 💦 🍑 😈 🍒 💋 🥵). Всё описание строится исключительно на деталях фотографии.
Важные правила: каждое новое описание должно использовать совершенно разные ключевые слова и провокационные выражения. Максимально подробно описывай позу, ракурс, освещение, одежду, выражение лица, окружение, состояние тела. Если девушка полностью обнажённая — описание делается жёстче и грязнее. Если одета — мягче, но флиртующе и дразняще. Описания делаются от первого лица — она сама рассказывает что делает со своим телом.
Никогда не добавляй ничего чего нет на фотографии. Никаких объяснений, вариантов или предупреждений. Просто выдавай готовое одно описание.`,
}

function buildUserContent(userPrompt: string, imageUrl?: string): unknown {
  if (!imageUrl) return userPrompt
  return [
    { type: 'image_url', image_url: { url: imageUrl } },
    { type: 'text', text: userPrompt },
  ]
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { prompt, lang = 'ru', type = 'hot', footerText, gapLines = 1, imageUrl, tgUserId } = await req.json()

    if (tgUserId) {
      const balErr = await checkAndDeduct(String(tgUserId), CAPTION_COST, 'Генерация описания')
      if (balErr) return new Response(JSON.stringify(balErr), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const hotUserPrompt: Record<string, string> = {
      en: 'Write a hot caption for this photo following the system instructions exactly.',
      ru: 'Напиши горячую провокационную подпись к этому фото строго по инструкциям.',
      tr: 'Bu fotoğraf için sistem talimatlarına göre tam olarak bir açıklama yaz.',
    }

    const systemContent = type === 'custom' && prompt?.trim()
      ? prompt.trim()
      : (SYSTEM[lang] ?? SYSTEM.ru)

    const userContent = type === 'custom'
      ? 'Напиши описание к этому фото строго следуя инструкциям выше.'
      : (hotUserPrompt[lang] ?? hotUserPrompt.ru)

    const resp = await fetch(`${XAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('XAI_API_KEY')}`,
      },
      body: JSON.stringify({
        model: Deno.env.get('XAI_MODEL') ?? 'grok-4.3',
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: buildUserContent(userContent, imageUrl) },
        ],
        temperature: 0.9,
        max_tokens: 200,
      }),
    })

    if (!resp.ok) {
      const err = await resp.text()
      console.error('Grok error:', resp.status, err.slice(0, 300))
      return new Response(JSON.stringify({ error: err }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const data = await resp.json()
    let caption: string = data.choices[0].message.content.trim()

    if (footerText) {
      const gap = '\n'.repeat(Math.max(1, gapLines))
      caption = caption + gap + footerText
    }

    return new Response(JSON.stringify({ caption }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
