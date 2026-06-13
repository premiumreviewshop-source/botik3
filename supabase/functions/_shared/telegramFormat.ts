function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export interface SavedEmojiRow {
  sticker_id: string
  label: string
  alt_emoji: string | null
}

// Compiles raw caption source format → Telegram HTML (parse_mode: HTML).
// If caption already contains <tg-emoji tags, it is returned unchanged (already compiled),
// UNLESS it also has unprocessed [text](url) markdown links (partial compilation state).
export function compileForTelegram(raw: string, emojis: SavedEmojiRow[]): string {
  if (!raw) return raw

  if (raw.includes('<tg-emoji')) {
    // Fully compiled — no markdown links left → return as-is
    if (!raw.includes('[')) return raw
    // Partially compiled: HTML emoji present but markdown links remain.
    // Mask existing HTML tags, compile links, restore, then apply bold/italic.
    const tc1: string[] = []
    let s = raw.replace(/<[^>]*>/g, t => { tc1.push(t); return `\x00${tc1.length - 1}\x00` })
    s = s.replace(/\[([^\]]*)\]\(([^)]*)\)/g, (_, t, u) => { const href = /^(https?:\/\/|tg:\/\/)/.test(u) ? u : `https://${u}`; return `<a href="${href}">${escapeHtml(t)}</a>` })
    s = s.replace(/\x00(\d+)\x00/g, (_, i) => tc1[+i])
    const tc2: string[] = []
    const masked2 = s.replace(/<[^>]*>/g, t => { tc2.push(t); return `\x00${tc2.length - 1}\x00` })
    const formatted2 = masked2
      .replace(/(?:^|(?<=[\s\x00]))\*_(.+?)_\*(?=[\s\x00,.:;!?]|$)/gs, '<b><i>$1</i></b>')
      .replace(/(?:^|(?<=[\s\x00]))_\*(.+?)\*_(?=[\s\x00,.:;!?]|$)/gs, '<b><i>$1</i></b>')
      .replace(/(?:^|(?<=[\s\x00]))\*(.+?)\*(?=[\s\x00,.:;!?]|$)/gs, '<b>$1</b>')
      .replace(/(?:^|(?<=[\s\x00]))_(.+?)_(?=[\s\x00,.:;!?]|$)/gs, '<i>$1</i>')
    return formatted2.replace(/\x00(\d+)\x00/g, (_, i) => tc2[+i])
  }

  const tokenRe = /(\{[^{}]{1,60}(?::\d+)?\}|\[[^\]]*\]\([^)]*\))/g
  const parts: string[] = []
  let cursor = 0
  let m: RegExpExecArray | null
  while ((m = tokenRe.exec(raw)) !== null) {
    if (m.index > cursor) parts.push(escapeHtml(raw.slice(cursor, m.index)))
    const tok = m[0]
    if (tok[0] === '{') {
      const withId = tok.match(/^\{(.+):(\d+)\}$/)
      if (withId) {
        parts.push(`<tg-emoji emoji-id="${withId[2]}">✨</tg-emoji>`)
      } else {
        const label = tok.slice(1, -1)
        const found = emojis.find(e => e.label === label)
        if (found) {
          parts.push(`<tg-emoji emoji-id="${found.sticker_id}">${found.alt_emoji ?? '✨'}</tg-emoji>`)
        } else {
          parts.push(escapeHtml(tok))
        }
      }
    } else {
      const lm = tok.match(/^\[([^\]]*)\]\(([^)]*)\)$/)!
      const href = /^(https?:\/\/|tg:\/\/)/.test(lm[2]) ? lm[2] : `https://${lm[2]}`
      parts.push(`<a href="${href}">${escapeHtml(lm[1])}</a>`)
    }
    cursor = m.index + tok.length
  }
  if (cursor < raw.length) parts.push(escapeHtml(raw.slice(cursor)))
  let result = parts.join('')

  // Apply bold/italic formatting WITHOUT corrupting existing HTML tags.
  // Replace all HTML tags with NUL placeholders → apply regex → restore tags.
  // This prevents the italic regex from matching underscores inside href attributes.
  const tagCache: string[] = []
  const masked = result.replace(/<[^>]*>/g, (tag) => {
    tagCache.push(tag)
    return `\x00${tagCache.length - 1}\x00`
  })

  // Boundary-aware bold/italic: opening delimiter must be at start of string or preceded
  // by whitespace; closing delimiter must be followed by whitespace, punctuation, or end
  // of string. This prevents a literal * or _ in the middle of a word (e.g. "50%*") from
  // being treated as a bold/italic marker and accidentally pairing with a footer's *[link]*.
  const formatted = masked
    .replace(/(?:^|(?<=[\s\x00]))\*_(.+?)_\*(?=[\s\x00,.:;!?]|$)/gs, '<b><i>$1</i></b>')
    .replace(/(?:^|(?<=[\s\x00]))_\*(.+?)\*_(?=[\s\x00,.:;!?]|$)/gs, '<b><i>$1</i></b>')
    .replace(/(?:^|(?<=[\s\x00]))\*(.+?)\*(?=[\s\x00,.:;!?]|$)/gs, '<b>$1</b>')
    .replace(/(?:^|(?<=[\s\x00]))_(.+?)_(?=[\s\x00,.:;!?]|$)/gs, '<i>$1</i>')

  result = formatted.replace(/\x00(\d+)\x00/g, (_, idx) => tagCache[parseInt(idx)])

  return result
}
