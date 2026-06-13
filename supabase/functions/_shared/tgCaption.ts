export interface TgEntity {
  type: string
  offset: number
  length: number
  url?: string
  custom_emoji_id?: string
}

// Parses HTML produced by compileForTelegram() back into plain text + structured entities.
// Telegram Bot API guarantees custom_emoji entities work; HTML <tg-emoji> rendering is unreliable for bots.
export function parseTelegramCaption(html: string): { text: string; entities: TgEntity[] } {
  if (!html) return { text: '', entities: [] }

  const entities: TgEntity[] = []
  const stack: Array<{ tag: string; startOffset: number; url?: string; emojiId?: string }> = []
  let text = ''
  let i = 0

  while (i < html.length) {
    if (html[i] !== '<') {
      const next = html.indexOf('<', i)
      const seg = next >= 0 ? html.slice(i, next) : html.slice(i)
      text += unescapeHtml(seg)
      i += seg.length
      continue
    }

    const close = html.indexOf('>', i)
    if (close < 0) { text += html.slice(i); break }

    const raw = html.slice(i + 1, close)
    i = close + 1

    if (raw.startsWith('/')) {
      // Closing tag — pop matching entry from stack
      const tagName = raw.slice(1).split(' ')[0].toLowerCase()
      for (let j = stack.length - 1; j >= 0; j--) {
        const entry = stack[j]
        if (entry.tag === tagName || (tagName === 'tg-emoji' && entry.tag === 'tg-emoji')) {
          stack.splice(j, 1)
          const length = text.length - entry.startOffset
          if (length > 0) {
            if (entry.emojiId) {
              entities.push({ type: 'custom_emoji', offset: entry.startOffset, length, custom_emoji_id: entry.emojiId })
            } else if (entry.tag === 'b') {
              entities.push({ type: 'bold', offset: entry.startOffset, length })
            } else if (entry.tag === 'i') {
              entities.push({ type: 'italic', offset: entry.startOffset, length })
            } else if (entry.tag === 'a' && entry.url) {
              entities.push({ type: 'text_link', offset: entry.startOffset, length, url: entry.url })
            }
          }
          break
        }
      }
    } else if (!raw.endsWith('/')) {
      // Opening tag
      const sp = raw.indexOf(' ')
      const tagName = (sp > 0 ? raw.slice(0, sp) : raw).toLowerCase()
      const attrs = sp > 0 ? raw.slice(sp) : ''

      if (tagName === 'tg-emoji') {
        const m = attrs.match(/emoji-id="([^"]+)"/)
        stack.push({ tag: 'tg-emoji', startOffset: text.length, emojiId: m?.[1] })
      } else if (tagName === 'b') {
        stack.push({ tag: 'b', startOffset: text.length })
      } else if (tagName === 'i') {
        stack.push({ tag: 'i', startOffset: text.length })
      } else if (tagName === 'a') {
        const m = attrs.match(/href="([^"]*)"/)
        stack.push({ tag: 'a', startOffset: text.length, url: m?.[1] })
      }
    }
  }

  return { text, entities }
}

function unescapeHtml(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}
