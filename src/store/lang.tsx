import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { type Lang, TRANSLATIONS, detectLang, saveLang } from '../lib/i18n'

interface LangCtx {
  lang: Lang
  t: typeof TRANSLATIONS['en']
  setLang: (l: Lang) => void
}

const Ctx = createContext<LangCtx>(null!)

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang)

  const setLang = useCallback((l: Lang) => {
    saveLang(l)
    setLangState(l)
  }, [])

  return (
    <Ctx.Provider value={{ lang, t: TRANSLATIONS[lang], setLang }}>
      {children}
    </Ctx.Provider>
  )
}

export const useLang = () => useContext(Ctx)
