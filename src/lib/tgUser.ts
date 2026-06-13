let _uid = 0
export const getTgUserId = () => _uid
export const setTgUserId = (id: number) => { _uid = id }

// Opens a Telegram user/bot/channel in Telegram.
// Uses WebApp.openTelegramLink when available (keeps user inside TG), otherwise window.open.
export function openTgLink(username: string) {
  const handle = username.startsWith('@') ? username.slice(1) : username
  const url = `https://t.me/${handle}`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tg = (window as any).Telegram?.WebApp
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(url)
  } else {
    window.open(url, '_blank', 'noopener')
  }
}
