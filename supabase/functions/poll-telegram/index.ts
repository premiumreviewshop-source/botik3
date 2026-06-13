import { db } from '../_shared/db.ts'

Deno.serve(async () => {
  const { data: bots } = await db
    .from('bots')
    .select('id, token, tg_offset')
    .eq('is_active', true)

  if (!bots?.length) return new Response(JSON.stringify({ ok: true, results: [] }))

  const results: Array<{ botId: string; updates: number; error?: string }> = []

  for (const bot of bots) {
    try {
      const url =
        `https://api.telegram.org/bot${bot.token}/getUpdates` +
        `?offset=${bot.tg_offset + 1}&limit=100&timeout=0`

      const resp = await fetch(url)
      if (!resp.ok) {
        results.push({ botId: bot.id, updates: 0, error: `HTTP ${resp.status}` })
        continue
      }

      const data = await resp.json()
      if (!data.ok || !data.result?.length) {
        results.push({ botId: bot.id, updates: 0 })
        continue
      }

      let maxOffset: number = bot.tg_offset
      const rows: Array<{
        bot_id: string
        update_id: number
        type: string
        user_id: number | null
        amount: number | null
        payload: string | null
        text: string | null
        chat_id: number | null
      }> = []

      for (const upd of data.result) {
        maxOffset = Math.max(maxOffset, upd.update_id)

        let type = 'message'
        let userId: number | null = null
        let amount: number | null = null
        let payload: string | null = null
        let text: string | null = null
        let chatId: number | null = null

        if (upd.message) {
          userId = upd.message.from?.id ?? null
          chatId = upd.message.chat?.id ?? null
          if (upd.message.successful_payment) {
            type = 'payment'
            amount = upd.message.successful_payment.total_amount
            payload = upd.message.successful_payment.invoice_payload
          } else {
            text = upd.message.text ?? null
          }
        } else if (upd.pre_checkout_query) {
          type = 'pre_checkout'
          userId = upd.pre_checkout_query.from?.id ?? null
          chatId = upd.pre_checkout_query.from?.id ?? null
          await fetch(`https://api.telegram.org/bot${bot.token}/answerPreCheckoutQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pre_checkout_query_id: upd.pre_checkout_query.id, ok: true }),
          })
        }

        rows.push({ bot_id: bot.id, update_id: upd.update_id, type, user_id: userId, amount, payload, text, chat_id: chatId })
      }

      if (rows.length) {
        await db.from('tg_updates').upsert(rows, { onConflict: 'bot_id,update_id', ignoreDuplicates: true })
      }
      await db.from('bots').update({ tg_offset: maxOffset }).eq('id', bot.id)

      results.push({ botId: bot.id, updates: data.result.length })
    } catch (err) {
      results.push({ botId: bot.id, updates: 0, error: String(err) })
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
