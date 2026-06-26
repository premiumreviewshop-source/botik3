import { en } from './translations/en'
import { ru } from './translations/ru'
import { tr } from './translations/tr'
import type { Translations } from './translations/en'

export type Lang = 'en' | 'ru' | 'tr'

export const TRANSLATIONS: Record<Lang, Translations> = { en, ru, tr }

export function detectLang(): Lang {
  const saved = localStorage.getItem('lang') as Lang | null
  if (saved && saved in TRANSLATIONS) return saved
  const tg = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.language_code ?? ''
  const nav = navigator.language.slice(0, 2).toLowerCase()
  const code = (tg || nav) as string
  if (code === 'ru') return 'ru'
  if (code === 'tr') return 'tr'
  return 'en'
}

export function saveLang(lang: Lang) {
  localStorage.setItem('lang', lang)
}
