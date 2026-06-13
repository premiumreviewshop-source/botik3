function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Compiles caption source format → Telegram HTML (parse_mode: HTML).
//
// Source format (stored in readyPosts / contentPlan):
//   {Label}      → <tg-emoji emoji-id="ID">ALT</tg-emoji>  (looked up from savedEmojis; ALT = documentAttributeCustomEmoji.alt)
//   {Label:ID}   → <tg-emoji emoji-id="ID">✨</tg-emoji>  (embedded ID — no alt available)
//   [text](url)  → <a href="url">text</a>
//   *_text_*     → <b><i>text</i></b>
//   *text*       → <b>text</b>
//   _text_       → <i>text</i>
//   plain text   → HTML-escaped
export function compileForTelegram(raw: string, emojis: { label: string; stickerId: string; alt?: string }[] = []): string {
  if (!raw) return raw

  if (raw.includes('<tg-emoji')) {
    if (!raw.includes('[')) return raw
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

  // Step 1: replace {Label} tokens and [text](url) links, escape everything else
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
        if (found) parts.push(`<tg-emoji emoji-id="${found.stickerId}">${found.alt ?? '✨'}</tg-emoji>`)
        else parts.push(escapeHtml(tok))
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

  // Step 2: mask HTML tags with NUL placeholders so bold/italic regex can't match
  // inside tag attributes, then apply boundary-aware formatting, then restore tags.
  // NUL is included in boundary sets so {emoji}*[link]* works (emoji tag ends with \x00).
  const tagCache: string[] = []
  const masked = result.replace(/<[^>]*>/g, (tag) => {
    tagCache.push(tag)
    return `\x00${tagCache.length - 1}\x00`
  })

  const formatted = masked
    .replace(/(?:^|(?<=[\s\x00]))\*_(.+?)_\*(?=[\s\x00,.:;!?]|$)/gs, '<b><i>$1</i></b>')
    .replace(/(?:^|(?<=[\s\x00]))_\*(.+?)\*_(?=[\s\x00,.:;!?]|$)/gs, '<b><i>$1</i></b>')
    .replace(/(?:^|(?<=[\s\x00]))\*(.+?)\*(?=[\s\x00,.:;!?]|$)/gs, '<b>$1</b>')
    .replace(/(?:^|(?<=[\s\x00]))_(.+?)_(?=[\s\x00,.:;!?]|$)/gs, '<i>$1</i>')

  result = formatted.replace(/\x00(\d+)\x00/g, (_, idx) => tagCache[parseInt(idx)])

  return result
}
