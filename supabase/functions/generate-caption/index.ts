import { corsHeaders } from '../_shared/cors.ts'
import { checkAndDeduct } from '../_shared/balance.ts'
import { verifyAuth } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'

async function isAdmin(id: string): Promise<boolean> {
  const envIds = (Deno.env.get('ADMIN_TG_IDS') ?? '').split(',').map((s: string) => s.trim()).filter(Boolean)
  if (envIds.includes(id)) return true
  try {
    const { data } = await db.from('admins').select('tg_user_id').eq('tg_user_id', id).maybeSingle()
    return !!data
  } catch { return false }
}

const CAPTION_COST = 0.025

const XAI_BASE = 'https://api.x.ai/v1'

const respond = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const SYSTEM: Record<string, string | null> = {
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
  tr: null,
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
    const { prompt, lang = 'ru', type = 'hot', footerText, gapLines = 1, imageUrl, initData } = await req.json()

    const botToken = Deno.env.get('PLATFORM_BOT_TOKEN') ?? Deno.env.get('BOT_TOKEN') ?? ''
    const auth = await verifyAuth(initData, botToken)
    if ('error' in auth) return respond(auth, auth.status)
    const tgUserId = auth.uid

    const admin = await isAdmin(tgUserId)
    if (!admin) {
      const balErr = await checkAndDeduct(tgUserId, CAPTION_COST, `Генерация описания · ${new Date().toISOString().slice(0, 19)}`)
      if (balErr) return respond(balErr, 402)
    }

    const hotUserPrompt: Record<string, string> = {
      en: 'Write a hot caption for this photo following the system instructions exactly.',
      ru: 'Напиши горячую провокационную подпись к этому фото строго по инструкциям.',
      tr: `Ты — очень похотливая, развратная турецкая девушка, настоящая ебучая шлюшка. Пишешь горячие интимные описания для своего эротического Telegram-канала в стиле «Senin Azran».
Пишешь строго от первого лица, будто шепчешь прямо в ухо подписчику — максимально лично, интимно и возбуждающе.

Технические правила (обязательно соблюдать):
• Только турецкий язык с дерзким естественным эротическим сленгом, идеально правильной грамматикой, правильными спряжениями и естественными оборотами.
• Длина: строго 80–85 символов включая пробелы и эмодзи.
• Одно цельное, плавное предложение или максимум два очень связанных. Логическая цепочка: начало → развитие ощущения/действия → мощное возбуждающее завершение.
• Максимум 1–2 эмодзи только в самом конце, связанные с телом или желанием.
• Без точек и запятых. Вопросительный знак — только если это реальный вопрос.
• Естественные переносы строк разрешены.
• Тон: максимально шлюший, teasing, похотливый, но грамматически безупречный.

Главное правило стиля:
Каждое описание должно быть максимально разным по структуре, началу предложения и используемой лексике. Никогда не начинай описания одинаково. Полностью меняй порядок слов, тип предложений и ритм. Пиши одним связным естественным текстом с одной чёткой мыслью. Избегай каши и нескольких смысловых развилок в одном описании.

Запрещено:
- Начинать описания с одних и тех же слов (bacaklarımı, kalçalarımı, memelerimi и т.д.).
- Использовать одну и ту же структуру или похожие фразы в разных описаниях.
- Повторять одни и те же слова и выражения между описаниями (araladım, havaya kaldırdım, doldur, zonkluyor, yanıyorum, derinlerine, hadi и т.п.).
- Любые грамматические ошибки и неестественные конструкции.
- Делать описания, которые слабо связаны с позой, ракурсом и деталями на конкретном изображении.

Правила разнообразия (применяются случайно):
• ~60% — провокационный вопрос или teasing + горячая фантазия о том, что бы вы делали вместе.
• ~40% — чувственное описание своих ощущений и тела.
• ~30–40% — мягкий байт-фильтр («sadece sevenler açsın», «özel sevenlere» и т.п.).
• Сильно меняй акцент и стиль каждого описания: иногда начинается с эмоции, иногда с действия, иногда с приглашения, иногда с вопроса.
• Финальные фразы сильно варьируй: hadi sok, içime al, doldur beni, derinlerime gir, dayanamıyorum, istiyooorum, çok istiyorum, göm hadi, akıyooorum, ver kendini и другие естественные варианты.

Важные требования к качеству:
• Полностью рандомизируй лексику, структуру и начало каждого описания. Делай их непохожими друг на друга.
• Всегда превращай в возбуждающую мини-историю с логичным развитием.
• Запрещено часто повторять «ıslak», «ateş», «söndür», «zonkluyor», «yanıyor» и подобные клише. Каждый раз используй свежие формулировки.
• С шансом 50% добавляй лёгкие эмоциональные восклицания (yaaa, offf, ayy, hımm и т.д.) в естественном месте, но не ломай ими грамматику.
• Удлинение финальных букв используй с шансом 40%. Количество удлинённых букв — рандомно от 2 до 5. Никогда не больше 5.

Важное дополнение по конкретике: Когда используешь слова вроде «doldur», «içime gir», «gömmeni» — обязательно конкретизируй часть тела.

Для этого изображения создай одно максимально естественное, цельное, грамматически идеальное и возбуждающее описание. Обязательно учитывай точную позу, ракурс и детали на фото. Следуй всем правилам выше.


*под эти фотки сделай описания которые не повторяются*`,
    }

    const customPrompt = type === 'custom' && typeof prompt === 'string' && prompt.trim()
      ? prompt.trim().slice(0, 500)
      : null
    const systemContent = customPrompt ?? SYSTEM[lang] ?? null

    const userContent = customPrompt
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
          ...(systemContent ? [{ role: 'system', content: systemContent }] : []),
          { role: 'user', content: buildUserContent(userContent, imageUrl) },
        ],
        temperature: 0.9,
        max_tokens: 200,
      }),
    })

    if (!resp.ok) {
      const err = await resp.text()
      console.error('Grok error:', resp.status, err.slice(0, 300))
      return respond({ error: 'AI service error' }, 502)
    }

    const data = await resp.json()
    let caption: string = data.choices[0].message.content.trim()

    if (footerText) {
      const gap = '\n'.repeat(Math.max(1, gapLines))
      caption = caption + gap + footerText
    }

    return respond({ caption })
  } catch {
    return respond({ error: 'Internal server error' }, 500)
  }
})
