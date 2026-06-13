import { assertEquals, assertStringIncludes, assertNotMatch } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { buildSystemPrompt } from './prompts.ts'

const BASE = {
  name: 'Azra',
  age: '21',
  city: 'Antalya',
  catalog: 'test catalog',
}

const VIP_LINK = 'https://t.me/+testvip123'

// ─── VIP disabled (default) ────────────────────────────────────────────────

Deno.test('TR: VIP disabled → no VIP block in prompt', () => {
  const p = buildSystemPrompt({ ...BASE, lang: 'tr', vipEnabled: false, vipLink: VIP_LINK })
  assertNotMatch(p, /VIP SICAK TUTMA/)
  assertNotMatch(p, new RegExp(VIP_LINK.replace(/[+]/g, '\\+')))
})

Deno.test('RU: VIP disabled → no VIP block in prompt', () => {
  const p = buildSystemPrompt({ ...BASE, lang: 'ru', vipEnabled: false, vipLink: VIP_LINK })
  assertNotMatch(p, /VIP ПРОГРЕВ/)
  assertNotMatch(p, new RegExp(VIP_LINK.replace(/[+]/g, '\\+')))
})

Deno.test('EN: VIP disabled → no VIP block in prompt', () => {
  const p = buildSystemPrompt({ ...BASE, lang: 'en', vipEnabled: false, vipLink: VIP_LINK })
  assertNotMatch(p, /VIP WARM-UP/)
  assertNotMatch(p, new RegExp(VIP_LINK.replace(/[+]/g, '\\+')))
})

// ─── VIP enabled with link ────────────────────────────────────────────────

Deno.test('TR: VIP enabled → block and link present', () => {
  const p = buildSystemPrompt({ ...BASE, lang: 'tr', vipEnabled: true, vipLink: VIP_LINK })
  assertStringIncludes(p, 'VIP SICAK TUTMA')
  assertStringIncludes(p, VIP_LINK)
})

Deno.test('RU: VIP enabled → block and link present', () => {
  const p = buildSystemPrompt({ ...BASE, lang: 'ru', vipEnabled: true, vipLink: VIP_LINK })
  assertStringIncludes(p, 'VIP ПРОГРЕВ')
  assertStringIncludes(p, VIP_LINK)
})

Deno.test('EN: VIP enabled → block and link present', () => {
  const p = buildSystemPrompt({ ...BASE, lang: 'en', vipEnabled: true, vipLink: VIP_LINK })
  assertStringIncludes(p, 'VIP WARM-UP')
  assertStringIncludes(p, VIP_LINK)
})

// ─── VIP enabled but no link → no block injected ─────────────────────────

Deno.test('TR: VIP enabled but empty link → no VIP block', () => {
  const p = buildSystemPrompt({ ...BASE, lang: 'tr', vipEnabled: true, vipLink: '' })
  assertNotMatch(p, /VIP SICAK TUTMA/)
})

Deno.test('RU: VIP enabled but empty link → no VIP block', () => {
  const p = buildSystemPrompt({ ...BASE, lang: 'ru', vipEnabled: true, vipLink: '' })
  assertNotMatch(p, /VIP ПРОГРЕВ/)
})

Deno.test('EN: VIP enabled but empty link → no VIP block', () => {
  const p = buildSystemPrompt({ ...BASE, lang: 'en', vipEnabled: true, vipLink: '' })
  assertNotMatch(p, /VIP WARM-UP/)
})

// ─── VIP enabled omitted (undefined) → no block ───────────────────────────

Deno.test('TR: vipEnabled undefined → no VIP block', () => {
  const p = buildSystemPrompt({ ...BASE, lang: 'tr', vipLink: VIP_LINK })
  assertNotMatch(p, /VIP SICAK TUTMA/)
})

Deno.test('RU: vipEnabled undefined → no VIP block', () => {
  const p = buildSystemPrompt({ ...BASE, lang: 'ru', vipLink: VIP_LINK })
  assertNotMatch(p, /VIP ПРОГРЕВ/)
})

Deno.test('EN: vipEnabled undefined → no VIP block', () => {
  const p = buildSystemPrompt({ ...BASE, lang: 'en', vipLink: VIP_LINK })
  assertNotMatch(p, /VIP WARM-UP/)
})

// ─── VIP with custom prompt ───────────────────────────────────────────────

Deno.test('Custom prompt + VIP enabled → VIP block appended', () => {
  const p = buildSystemPrompt({
    ...BASE, lang: 'en',
    customPrompt: 'My custom instructions',
    vipEnabled: true, vipLink: VIP_LINK,
  })
  assertStringIncludes(p, 'VIP WARM-UP')
  assertStringIncludes(p, VIP_LINK)
  assertStringIncludes(p, 'My custom instructions')
})

Deno.test('Custom prompt + VIP disabled → no VIP block', () => {
  const p = buildSystemPrompt({
    ...BASE, lang: 'en',
    customPrompt: 'My custom instructions',
    vipEnabled: false, vipLink: VIP_LINK,
  })
  assertNotMatch(p, /VIP WARM-UP/)
})

// ─── Link appears in correct language context ────────────────────────────

Deno.test('TR: VIP block mentions sending link when user asks', () => {
  const p = buildSystemPrompt({ ...BASE, lang: 'tr', vipEnabled: true, vipLink: VIP_LINK })
  assertStringIncludes(p, 'VIP bağlantısını')
})

Deno.test('RU: VIP block mentions sending link when user asks', () => {
  const p = buildSystemPrompt({ ...BASE, lang: 'ru', vipEnabled: true, vipLink: VIP_LINK })
  assertStringIncludes(p, 'ссылку на VIP')
})

Deno.test('EN: VIP block mentions sending link when user asks', () => {
  const p = buildSystemPrompt({ ...BASE, lang: 'en', vipEnabled: true, vipLink: VIP_LINK })
  assertStringIncludes(p, 'share your VIP link')
})

// ─── Link must appear verbatim (no dot-stripping rule) ────────────────────

Deno.test('TR: exact link with dots appears verbatim in mandatory rule', () => {
  const link = 't.me/vasya'
  const p = buildSystemPrompt({ ...BASE, lang: 'tr', vipEnabled: true, vipLink: link })
  assertStringIncludes(p, `${link}`)
  assertStringIncludes(p, 'ZORUNLU')
})

Deno.test('RU: exact link with dots appears verbatim in mandatory rule', () => {
  const link = 't.me/vasya'
  const p = buildSystemPrompt({ ...BASE, lang: 'ru', vipEnabled: true, vipLink: link })
  assertStringIncludes(p, `${link}`)
  assertStringIncludes(p, 'ОБЯЗАТЕЛЬНО')
})

Deno.test('EN: exact link with dots appears verbatim in mandatory rule', () => {
  const link = 't.me/vasya'
  const p = buildSystemPrompt({ ...BASE, lang: 'en', vipEnabled: true, vipLink: link })
  assertStringIncludes(p, `${link}`)
  assertStringIncludes(p, 'MANDATORY')
})

// ─── catalog still present after VIP block ───────────────────────────────

Deno.test('TR: catalog appears after VIP block', () => {
  const p = buildSystemPrompt({ ...BASE, lang: 'tr', vipEnabled: true, vipLink: VIP_LINK, catalog: 'my test catalog' })
  const vipIdx = p.indexOf('VIP SICAK TUTMA')
  const catIdx = p.indexOf('my test catalog')
  assertEquals(vipIdx < catIdx, true)
})

Deno.test('RU: catalog appears after VIP block', () => {
  const p = buildSystemPrompt({ ...BASE, lang: 'ru', vipEnabled: true, vipLink: VIP_LINK, catalog: 'my test catalog' })
  const vipIdx = p.indexOf('VIP ПРОГРЕВ')
  const catIdx = p.indexOf('my test catalog')
  assertEquals(vipIdx < catIdx, true)
})

Deno.test('EN: catalog appears after VIP block', () => {
  const p = buildSystemPrompt({ ...BASE, lang: 'en', vipEnabled: true, vipLink: VIP_LINK, catalog: 'my test catalog' })
  const vipIdx = p.indexOf('VIP WARM-UP')
  const catIdx = p.indexOf('my test catalog')
  assertEquals(vipIdx < catIdx, true)
})
