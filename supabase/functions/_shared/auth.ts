// Verifies Telegram Mini App initData signature and returns the authenticated tg_user_id.
// Spec: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
const MAX_AGE_SECONDS = 86400

export async function verifyAuth(
  initData: unknown,
  botToken: string,
): Promise<{ uid: string } | { error: string; status: number }> {
  const raw = String(initData ?? '').trim()
  if (!raw) return { error: 'Telegram authentication required', status: 401 }
  if (!botToken) return { error: 'Server misconfiguration', status: 500 }
  try {
    const uid = await verifyInitData(raw, botToken)
    return { uid }
  } catch (e) {
    return { error: `Auth failed: ${(e as Error).message}`, status: 403 }
  }
}

export async function verifyInitData(initData: string, botToken: string): Promise<string> {
  if (!initData || !botToken) throw new Error('Missing initData or botToken')

  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) throw new Error('Missing hash in initData')

  params.delete('hash')
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

  const enc = new TextEncoder()
  const webAppDataKey = await crypto.subtle.importKey(
    'raw', enc.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const secretBytes = await crypto.subtle.sign('HMAC', webAppDataKey, enc.encode(botToken))

  const dataKey = await crypto.subtle.importKey(
    'raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', dataKey, enc.encode(dataCheckString))
  const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')

  if (computed !== hash) throw new Error('Invalid initData signature')

  const authDate = Number(params.get('auth_date') ?? 0)
  if (Date.now() / 1000 - authDate > MAX_AGE_SECONDS) throw new Error('initData expired')

  const userStr = params.get('user')
  if (!userStr) throw new Error('Missing user field in initData')

  let user: { id?: number }
  try { user = JSON.parse(userStr) } catch { throw new Error('Invalid user JSON in initData') }
  if (!user?.id) throw new Error('Missing user.id in initData')

  return String(user.id)
}
