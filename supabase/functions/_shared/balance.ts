import { db } from './db.ts'

export async function getBalance(tgUserId: string): Promise<number> {
  const { data } = await db
    .from('transactions')
    .select('type, amount')
    .eq('tg_user_id', tgUserId)
  let balance = 0
  for (const t of (data ?? []) as { type: string; amount: number }[]) {
    if (t.type === 'topup') balance += Number(t.amount) || 0
    else if (t.type === 'spend') balance -= Math.abs(Number(t.amount) || 0)
  }
  return balance
}

export async function checkAndDeduct(
  tgUserId: string,
  cost: number,
  description: string,
): Promise<{ error: string } | null> {
  const balance = await getBalance(tgUserId)
  if (balance < cost) {
    return {
      error: `Недостаточно средств. Баланс: $${balance.toFixed(2)}, требуется: $${cost.toFixed(3)}. Пополните баланс.`,
    }
  }
  const now = new Date()
  const dateStr = `${now.getDate().toString().padStart(2,'0')}.${(now.getMonth()+1).toString().padStart(2,'0')}.${now.getFullYear()}`
  await db.from('transactions').insert({
    tg_user_id: tgUserId,
    type: 'spend',
    amount: cost,
    description,
    date: dateStr,
    created_at: now.toISOString(),
  })
  return null
}
