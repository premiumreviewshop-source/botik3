Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok')

  const botToken = Deno.env.get('PLATFORM_BOT_TOKEN')
  if (!botToken) return new Response('ok')

  try {
    const update = await req.json()
    const msg = update.message
    if (msg?.text?.startsWith('/start')) {
      const chatId = msg.chat.id
      const webappUrl = Deno.env.get('WEBAPP_URL') ?? 'https://botik3.vercel.app'
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: '👋 <b>Добро пожаловать!</b>\n\nЗдесь вы можете автоматизировать работу с подписчиками и зарабатывать больше с помощью AI.',
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '🚀 Начать зарабатывать', web_app: { url: webappUrl } }]],
          },
        }),
      })
    }
  } catch { /* ignore */ }

  return new Response('ok')
})
