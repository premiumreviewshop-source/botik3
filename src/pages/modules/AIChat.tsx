import { useState, useMemo, useEffect, useCallback } from 'react'
import { useApp } from '../../store/app'
import { useLang } from '../../store/lang'
import { IconBack, IconCheck, IconEdit, IconChevronRight } from '../../components/Icons'
import Input from '../../components/Input'
import Button from '../../components/Button'
import HintBox from '../../components/HintBox'
import BottomSheet from '../../components/BottomSheet'
import api from '../../api/client'
import type { Bot } from '../../types'
import { openTgLink } from '../../lib/tgUser'

function TgLink({ u }: { u: string }) {
  return <span onClick={() => openTgLink(u)} className="text-[rgba(0,255,170,0.9)] font-bold underline underline-offset-2 cursor-pointer">@{u}</span>
}

type PromptType = 'ready' | 'custom'

interface BotSettings {
  promptType: PromptType
  lang: 'en' | 'ru' | 'tr'
  persona: { name: string; age: string; city: string }
  customPrompt: string
}

const DEFAULT_SETTINGS: BotSettings = {
  promptType: 'ready',
  lang: 'tr',
  persona: { name: '', age: '', city: '' },
  customPrompt: '',
}

function BusinessRequirements() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.38)] mb-1">Требования для LS режима</p>
      {[
        { icon: '⭐', title: 'Telegram Premium', desc: 'Аккаунт владельца должен иметь Premium подписку' },
        { icon: '💼', title: 'Business Account', desc: 'Включи "Telegram Business" в настройках → Chatbots → добавь бота' },
        { icon: '🤖', title: 'Secretary Mode', desc: <>В <TgLink u="BotFather" /> → твой бот → Bot Settings → включи Secretary Mode</> },
        { icon: '🔑', title: 'Chat ID', desc: <>Твой личный Telegram ID (можно узнать через <TgLink u="getmyid_bot" />)</> },
      ].map(r => (
        <div key={r.icon} className="flex items-start gap-3 p-3 bg-[rgba(0,255,170,0.03)] border border-[rgba(0,255,170,0.1)] rounded-[12px]">
          <span className="text-[18px] leading-none mt-0.5 flex-shrink-0">{r.icon}</span>
          <div>
            <p className="text-[12px] font-bold text-[rgba(255,255,255,0.8)]">{r.title}</p>
            <p className="text-[11px] text-[rgba(255,255,255,0.38)] leading-snug">{r.desc}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// Persona fields - labels come from i18n at render time

function PromptForm({
  settings,
  onChange,
}: {
  settings: BotSettings
  onChange: (patch: Partial<BotSettings>) => void
}) {
  const { t, lang } = useLang()
  const PERSONA_FIELDS = [
    { key: 'name', label: lang === 'ru' ? 'Имя' : lang === 'tr' ? 'İsim' : 'Name', placeholder: 'Beren' },
    { key: 'age', label: lang === 'ru' ? 'Возраст' : lang === 'tr' ? 'Yaş' : 'Age', placeholder: '21' },
    { key: 'city', label: lang === 'ru' ? 'Город' : lang === 'tr' ? 'Şehir' : 'City', placeholder: 'Antalya' },
  ]
  const preview = useMemo(() => {
    if (settings.promptType !== 'ready' || !settings.persona.name) return ''
    const langLabel = settings.lang === 'ru' ? 'Russian' : settings.lang === 'tr' ? 'Turkish' : 'English'
    const p = settings.persona
    return `You are ${p.name}${p.age ? `, ${p.age} years old` : ''}${p.city ? `, from ${p.city}` : ''}. You speak naturally in ${langLabel}.`
  }, [settings.promptType, settings.persona, settings.lang])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 p-1 bg-[rgba(255,255,255,0.02)] border border-[rgba(0,255,170,0.12)] rounded-[14px]">
        {(['ready', 'custom'] as PromptType[]).map(pt => (
          <button key={pt} onClick={() => onChange({ promptType: pt })}
            className={`flex-1 py-2.5 rounded-[10px] text-[13px] font-bold transition-all duration-200 ${
              settings.promptType === pt
                ? 'bg-[#00ffaa] text-black shadow-[0_0_12px_rgba(0,255,170,0.35)]'
                : 'text-[rgba(255,255,255,0.4)]'
            }`}>
            {pt === 'ready' ? t.mods.readyPromptBtn : t.mods.customPromptBtn}
          </button>
        ))}
      </div>

      {settings.promptType === 'ready' ? (
        <>
          <div className="p-4 bg-[rgba(0,255,170,0.05)] border border-[rgba(0,255,170,0.2)] rounded-[14px] flex flex-col gap-3">
            <div>
              <p className="text-[12px] font-black text-[#00ffaa] mb-0.5 uppercase tracking-[0.5px]">◆ AI OFM PROMPT</p>
              <p className="text-[11px] text-[rgba(255,255,255,0.38)]">{lang === 'ru' ? 'Оптимизирован для контент-мейкеров' : lang === 'tr' ? 'İçerik yapımcıları için optimize edildi' : 'Optimized for content creators'}</p>
            </div>
            <div className="flex gap-2">
              {(['tr', 'en', 'ru'] as const).map(l => (
                <button key={l} onClick={() => onChange({ lang: l })}
                  className={`flex-1 py-2 rounded-[10px] text-[12px] font-bold border transition-all duration-200 ${
                    settings.lang === l
                      ? 'bg-[#00ffaa] border-[#00ffaa] text-black shadow-[0_0_10px_rgba(0,255,170,0.35)]'
                      : 'bg-transparent border-[rgba(0,255,170,0.2)] text-[rgba(255,255,255,0.5)] hover:border-[rgba(0,255,170,0.4)] hover:text-[#00ffaa]'
                  }`}>
                  {l === 'en' ? 'English' : l === 'ru' ? 'Russian' : 'Turkish'}
                </button>
              ))}
            </div>
          </div>
          {PERSONA_FIELDS.map(f => (
            <Input key={f.key} label={f.label}
              value={settings.persona[f.key as keyof typeof settings.persona]}
              onChange={v => onChange({ persona: { ...settings.persona, [f.key]: v } })}
              placeholder={f.placeholder} />
          ))}
          {preview && (
            <div className="p-3.5 bg-[rgba(255,255,255,0.02)] border border-[rgba(0,255,170,0.12)] rounded-[12px]">
              <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,170,0.5)] mb-1.5">{lang === 'ru' ? 'Превью промпта' : lang === 'tr' ? 'Prompt önizlemesi' : 'Prompt preview'}</p>
              <p className="text-[12px] text-[rgba(255,255,255,0.4)] leading-relaxed italic">"{preview}"</p>
            </div>
          )}
        </>
      ) : (
        <>
          <Input label={lang === 'ru' ? 'Системный промпт' : lang === 'tr' ? 'Sistem promptu' : 'System prompt'} value={settings.customPrompt}
            onChange={v => onChange({ customPrompt: v })}
            textarea rows={6} maxLength={2000} placeholder="You are a helpful assistant..." />
          <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-[rgba(255,170,0,0.08)] border border-[rgba(255,170,0,0.25)] px-3 py-2">
            <span className="text-[rgba(255,170,0,0.9)] text-[13px] leading-none mt-px">⚠</span>
            <p className="text-[11px] text-[rgba(255,170,0,0.75)] leading-snug">
              {lang === 'ru'
                ? 'Продажа PPV контента (ценообразование и торговля) работает только на языках EN / RU / TR. На других языках бот будет отвечать, но без логики продаж.'
                : lang === 'tr'
                ? 'PPV içerik satışı (fiyatlandırma ve pazarlık) yalnızca EN / RU / TR dillerinde çalışır. Diğer dillerde bot cevap verir ancak satış mantığı olmadan.'
                : 'PPV content sales (pricing & bargaining) only work in EN / RU / TR. In other languages the bot will reply but without sales logic.'}
            </p>
          </div>
        </>
      )}
    </div>
  )
}

function dbToSettings(cfg: {
  prompt_type: string; lang: string
  persona_name: string; persona_age: string; persona_city: string; custom_prompt: string
}): BotSettings {
  return {
    promptType: (cfg.prompt_type as PromptType) ?? 'ready',
    lang: (cfg.lang as 'en' | 'ru' | 'tr') ?? 'tr',
    persona: { name: cfg.persona_name, age: cfg.persona_age, city: cfg.persona_city },
    customPrompt: cfg.custom_prompt,
  }
}

function VipSettings({
  vipEnabled, onVipEnabled,
  vipLink, onVipLink,
}: {
  vipEnabled: boolean; onVipEnabled: (v: boolean) => void
  vipLink: string; onVipLink: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between p-3.5 bg-[rgba(255,255,255,0.02)] border border-[rgba(0,255,170,0.12)] rounded-[14px]">
        <div>
          <p className="text-[13px] font-bold">Прогрев на VIP</p>
          <p className="text-[10px] text-[rgba(255,255,255,0.3)] mt-0.5">Бот продвигает VIP и делится ссылкой</p>
        </div>
        <button onClick={() => onVipEnabled(!vipEnabled)}
          className={`w-[46px] h-[26px] rounded-full relative transition-all duration-300 border flex-shrink-0 ${
            vipEnabled
              ? 'bg-[rgba(0,255,170,0.25)] border-[rgba(0,255,170,0.5)]'
              : 'bg-[rgba(255,255,255,0.06)] border-[rgba(255,255,255,0.1)]'
          }`}
          style={vipEnabled ? { boxShadow: '0 0 10px rgba(0,255,170,0.2)' } : {}}>
          <span className={`absolute top-[3px] w-5 h-5 rounded-full shadow-md transition-all duration-300 ${
            vipEnabled ? 'left-[23px] bg-[#00ffaa]' : 'left-[3px] bg-[rgba(255,255,255,0.35)]'
          }`}
            style={vipEnabled ? { boxShadow: '0 0 8px rgba(0,255,170,0.8)' } : {}} />
        </button>
      </div>
      {vipEnabled && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.38)]">VIP ссылка</p>
          <input
            type="text"
            value={vipLink}
            onChange={e => onVipLink(e.target.value)}
            className="w-full bg-[rgba(255,255,255,0.02)] border border-[rgba(0,255,170,0.2)] rounded-[10px] px-3 py-2.5 text-[13px] text-white outline-none focus:border-[rgba(0,255,170,0.5)] transition-all font-mono"
            placeholder="https://t.me/+xxxxxx"
          />
          <p className="text-[10px] text-[rgba(255,255,255,0.25)]">Ссылка на VIP канал или группу — бот поделится ею когда нужно</p>
        </div>
      )}
    </div>
  )
}

function DelaySettings({
  readDelay, onReadDelay,
  largeDelayEnabled, onLargeDelayEnabled,
  largeDelaySec, onLargeDelaySec,
  inactivityMin, onInactivityMin,
}: {
  readDelay: number; onReadDelay: (v: number) => void
  largeDelayEnabled: boolean; onLargeDelayEnabled: (v: boolean) => void
  largeDelaySec: number; onLargeDelaySec: (v: number) => void
  inactivityMin: number; onInactivityMin: (v: number) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* Regular delay */}
      <div className="flex flex-col gap-1.5">
        <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.38)]">Задержка перед прочтением (сек)</p>
        <input
          type="number" min={0} max={3600}
          value={readDelay}
          onChange={e => { const n = parseInt(e.target.value); if (!isNaN(n) && n >= 0) onReadDelay(n) }}
          className="w-full bg-[rgba(255,255,255,0.02)] border border-[rgba(0,255,170,0.2)] rounded-[10px] px-3 py-2.5 text-[13px] text-white outline-none focus:border-[rgba(0,255,170,0.5)] transition-all font-mono"
          placeholder="2"
        />
        <p className="text-[10px] text-[rgba(255,255,255,0.25)]">Через {readDelay} сек после получения сообщения появятся ✓✓</p>
      </div>

      {/* Large delay toggle */}
      <div className="flex items-center justify-between p-3.5 bg-[rgba(255,255,255,0.02)] border border-[rgba(0,255,170,0.12)] rounded-[14px]">
        <div>
          <p className="text-[13px] font-bold">Большая задержка</p>
          <p className="text-[10px] text-[rgba(255,255,255,0.3)] mt-0.5">Для первых и «холодных» сообщений</p>
        </div>
        <button onClick={() => onLargeDelayEnabled(!largeDelayEnabled)}
          className={`w-[46px] h-[26px] rounded-full relative transition-all duration-300 border flex-shrink-0 ${
            largeDelayEnabled
              ? 'bg-[rgba(0,255,170,0.25)] border-[rgba(0,255,170,0.5)]'
              : 'bg-[rgba(255,255,255,0.06)] border-[rgba(255,255,255,0.1)]'
          }`}
          style={largeDelayEnabled ? { boxShadow: '0 0 10px rgba(0,255,170,0.2)' } : {}}>
          <span className={`absolute top-[3px] w-5 h-5 rounded-full shadow-md transition-all duration-300 ${
            largeDelayEnabled ? 'left-[23px] bg-[#00ffaa]' : 'left-[3px] bg-[rgba(255,255,255,0.35)]'
          }`}
            style={largeDelayEnabled ? { boxShadow: '0 0 8px rgba(0,255,170,0.8)' } : {}} />
        </button>
      </div>

      {largeDelayEnabled && (
        <div className="p-4 bg-[rgba(0,255,170,0.03)] border border-[rgba(0,255,170,0.15)] rounded-[14px] flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-bold text-[rgba(255,255,255,0.55)]">Большая задержка (сек)</p>
            <input
              type="number" min={1} max={3600}
              value={largeDelaySec}
              onChange={e => { const n = parseInt(e.target.value); if (!isNaN(n) && n >= 1) onLargeDelaySec(n) }}
              className="w-full bg-[rgba(255,255,255,0.02)] border border-[rgba(0,255,170,0.2)] rounded-[10px] px-3 py-2.5 text-[13px] text-white outline-none focus:border-[rgba(0,255,170,0.5)] transition-all font-mono"
              placeholder="60"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-bold text-[rgba(255,255,255,0.55)]">Сброс через (мин)</p>
            <input
              type="number" min={1} max={1440}
              value={inactivityMin}
              onChange={e => { const n = parseInt(e.target.value); if (!isNaN(n) && n >= 1) onInactivityMin(n) }}
              className="w-full bg-[rgba(255,255,255,0.02)] border border-[rgba(0,255,170,0.2)] rounded-[10px] px-3 py-2.5 text-[13px] text-white outline-none focus:border-[rgba(0,255,170,0.5)] transition-all font-mono"
              placeholder="10"
            />
          </div>
          <div className="p-3 bg-[rgba(0,255,170,0.05)] border border-[rgba(0,255,170,0.12)] rounded-[10px]">
            <p className="text-[10px] text-[rgba(255,255,255,0.45)] leading-relaxed">
              Первое сообщение или после {inactivityMin} мин молчания → бот ждёт {largeDelaySec} сек перед прочтением.
              Если пользователь отвечает в течение {inactivityMin} мин — используется обычная задержка ({readDelay} сек).
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AIChat() {
  const { bots, setBots, selectedBotId, setSelectedBotId, goBack, navigate } = useApp()
  const { t } = useLang()

  const [draft, setDraft] = useState<BotSettings>(DEFAULT_SETTINGS)
  const [chatId, setChatId] = useState('')
  const [readDelay, setReadDelay] = useState(2)
  const [largeDelayEnabled, setLargeDelayEnabled] = useState(false)
  const [largeDelaySec, setLargeDelaySec] = useState(60)
  const [inactivityMin, setInactivityMin] = useState(10)
  const [vipEnabled, setVipEnabled] = useState(false)
  const [vipLink, setVipLink] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [editingBot, setEditingBot] = useState<Bot | null>(null)
  const [editDraft, setEditDraft] = useState<BotSettings>(DEFAULT_SETTINGS)
  const [editChatId, setEditChatId] = useState('')
  const [editReadDelay, setEditReadDelay] = useState(2)
  const [editLargeDelayEnabled, setEditLargeDelayEnabled] = useState(false)
  const [editLargeDelaySec, setEditLargeDelaySec] = useState(60)
  const [editInactivityMin, setEditInactivityMin] = useState(10)
  const [editVipEnabled, setEditVipEnabled] = useState(false)
  const [editVipLink, setEditVipLink] = useState('')
  const [editSaved, setEditSaved] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editSaveError, setEditSaveError] = useState<string | null>(null)

  const activeChatters = bots.filter(b => b.modules.includes('AI Chat') && b.isActive)
  const availableBots = bots.filter(b =>
    (b.modules.length === 0 || b.modules.includes('AI Chat')) &&
    !(b.modules.includes('AI Chat') && b.isActive)
  )

  // Load config from DB when a bot is selected
  useEffect(() => {
    if (!selectedBotId) return
    const bot = bots.find(b => b.id === selectedBotId)
    if (bot?.chatId) setChatId(bot.chatId)
    api.aiChat.get(selectedBotId).then(cfg => {
      if (cfg) {
        setDraft(dbToSettings(cfg))
        if (cfg.read_delay_seconds != null) setReadDelay(cfg.read_delay_seconds)
        if (cfg.large_delay_enabled != null) setLargeDelayEnabled(cfg.large_delay_enabled)
        if (cfg.large_delay_seconds != null) setLargeDelaySec(cfg.large_delay_seconds)
        if (cfg.inactivity_reset_minutes != null) setInactivityMin(cfg.inactivity_reset_minutes)
        if (cfg.vip_enabled != null) setVipEnabled(cfg.vip_enabled)
        if (cfg.vip_link != null) setVipLink(cfg.vip_link)
      }
    }).catch(() => {})
  }, [selectedBotId])

  const openEditSheet = useCallback((bot: Bot) => {
    setEditDraft(DEFAULT_SETTINGS)
    setEditChatId(bot.chatId ?? '')
    setEditReadDelay(2)
    setEditLargeDelayEnabled(false)
    setEditLargeDelaySec(60)
    setEditInactivityMin(10)
    setEditVipEnabled(false)
    setEditVipLink('')
    setEditSaved(false)
    setEditingBot(bot)
    api.aiChat.get(bot.id).then(cfg => {
      if (cfg) {
        setEditDraft(dbToSettings(cfg))
        if (cfg.read_delay_seconds != null) setEditReadDelay(cfg.read_delay_seconds)
        if (cfg.large_delay_enabled != null) setEditLargeDelayEnabled(cfg.large_delay_enabled)
        if (cfg.large_delay_seconds != null) setEditLargeDelaySec(cfg.large_delay_seconds)
        if (cfg.inactivity_reset_minutes != null) setEditInactivityMin(cfg.inactivity_reset_minutes)
        if (cfg.vip_enabled != null) setEditVipEnabled(cfg.vip_enabled)
        if (cfg.vip_link != null) setEditVipLink(cfg.vip_link)
      }
    }).catch(() => {})
  }, [])

  const saveEdit = async () => {
    if (!editingBot) return
    setEditSaving(true)
    setEditSaveError(null)
    try {
      await Promise.all([
        api.bots.update(editingBot.id, { chatId: editChatId }),
        api.aiChat.save(editingBot.id, {
          promptType: editDraft.promptType,
          lang: editDraft.lang,
          personaName: editDraft.persona.name,
          personaAge: editDraft.persona.age,
          personaCity: editDraft.persona.city,
          customPrompt: editDraft.customPrompt,
          readDelaySeconds: editReadDelay,
          largeDelayEnabled: editLargeDelayEnabled,
          largeDelaySeconds: editLargeDelaySec,
          inactivityResetMinutes: editInactivityMin,
          vipEnabled: editVipEnabled,
          vipLink: editVipLink,
        }),
        api.webhooks.refresh(editingBot.id).catch(() => {}),
      ])
      setBots(bots.map(b => b.id === editingBot.id ? { ...b, chatId: editChatId } : b))
      setEditSaved(true)
      setTimeout(() => { setEditSaved(false); setEditingBot(null) }, 1200)
    } catch (e) {
      console.error(e)
      setEditSaveError(e instanceof Error ? e.message : 'Ошибка сохранения')
    } finally {
      setEditSaving(false)
    }
  }

  const handleSave = async () => {
    if (!selectedBotId) return
    setSaving(true)
    setSaveError(null)
    try {
      const newModules = [...new Set([...bots.find(b => b.id === selectedBotId)!.modules, 'AI Chat'])]
      await Promise.all([
        api.bots.update(selectedBotId, { modules: newModules, chatId }),
        api.aiChat.save(selectedBotId, {
          promptType: draft.promptType,
          lang: draft.lang,
          personaName: draft.persona.name,
          personaAge: draft.persona.age,
          personaCity: draft.persona.city,
          customPrompt: draft.customPrompt,
          readDelaySeconds: readDelay,
          largeDelayEnabled: largeDelayEnabled,
          largeDelaySeconds: largeDelaySec,
          inactivityResetMinutes: inactivityMin,
          vipEnabled: vipEnabled,
          vipLink: vipLink,
        }),
        api.webhooks.refresh(selectedBotId).catch(() => {}),
      ])
      setBots(bots.map(b => b.id === selectedBotId ? { ...b, modules: newModules, chatId } : b))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      console.error(e)
      setSaveError(e instanceof Error ? e.message : 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 pt-4">
      <div className="flex items-center gap-3 px-5 animate-slide-up">
        <button onClick={goBack}
          className="w-10 h-10 rounded-[14px] flex items-center justify-center transition-all duration-200 active:scale-[0.92]"
          style={{ background: 'rgba(0,255,170,0.06)', border: '1px solid rgba(0,255,170,0.2)' }}>
          <IconBack size={20} color="#00ffaa" />
        </button>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[2.5px] text-[rgba(0,255,170,0.45)]">{t.mods.configure}</p>
          <h1 className="text-[22px] font-black tracking-tight">AI Chatting</h1>
        </div>
      </div>

      {activeChatters.length > 0 && (
        <div className="px-5">
          <div className="flex items-center gap-2 p-3 bg-[rgba(0,255,170,0.04)] border border-[rgba(0,255,170,0.14)] rounded-[14px]">
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00ffaa] opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00ffaa]" />
              </span>
              <p className="text-[10px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,170,0.6)]">{t.mods.activeBots}</p>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto">
              {activeChatters.map(b => (
                <button key={b.id} onClick={() => openEditSheet(b)}
                  className="flex items-center gap-1.5 flex-shrink-0 bg-[rgba(0,255,170,0.07)] border border-[rgba(0,255,170,0.2)] rounded-full pl-1 pr-2.5 py-1 hover:border-[rgba(0,255,170,0.45)] hover:bg-[rgba(0,255,170,0.12)] transition-all duration-150">
                  <div className="w-5 h-5 rounded-full bg-[rgba(0,255,170,0.15)] flex items-center justify-center text-[8px] font-black text-[#00ffaa]">
                    {b.name.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-[11px] font-bold text-[rgba(255,255,255,0.75)]">{b.name}</span>
                  <IconEdit size={10} color="rgba(0,255,170,0.5)" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {availableBots.length > 0 && (
        <div className="px-5">
          <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.38)] mb-2">{t.mods.connectBotLabel}</p>
          <div className="scroll-x flex gap-2 pb-1">
            {availableBots.map(b => (
              <button key={b.id} onClick={() => setSelectedBotId(b.id)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-[13px] font-bold border transition-all duration-200 ${
                  selectedBotId === b.id
                    ? 'bg-[#00ffaa] border-[#00ffaa] text-black shadow-[0_0_16px_rgba(0,255,170,0.4)]'
                    : 'bg-[rgba(255,255,255,0.02)] border-[rgba(0,255,170,0.18)] text-[rgba(255,255,255,0.6)] hover:border-[rgba(0,255,170,0.4)]'
                }`}
                style={{ scrollSnapAlign: 'start' }}>
                {b.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {availableBots.length === 0 && activeChatters.length === 0 && (
        <div className="px-5">
          <div className="p-3 bg-[rgba(251,191,36,0.05)] border border-[rgba(251,191,36,0.2)] rounded-[12px]">
            <p className="text-[12px] text-amber-400 font-bold mb-1">{t.mods.noBotsAvailable}</p>
            <p className="text-[11px] text-[rgba(255,255,255,0.4)]">{t.mods.noBotsAvailable}. <button onClick={() => navigate('bots')} className="text-[rgba(0,255,170,0.7)] underline">{t.nav.bots}</button></p>
          </div>
        </div>
      )}

      {availableBots.length === 0 && activeChatters.length > 0 && (
        <div className="px-5">
          <button onClick={() => navigate('bots')}
            className="w-full flex items-center gap-3 p-4 rounded-[18px] text-left transition-all active:scale-[0.98]"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(0,255,170,0.2)' }}>
            <div className="w-10 h-10 rounded-[13px] flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(0,255,170,0.07)', border: '1px solid rgba(0,255,170,0.2)' }}>
              <span className="text-[20px]">🤖</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold text-white">Добавить ещё чатера</p>
              <p className="text-[11px] text-[rgba(255,255,255,0.35)] mt-0.5">Подключи нового бота в разделе «Боты»</p>
            </div>
            <IconChevronRight size={16} color="rgba(0,255,170,0.4)" />
          </button>
        </div>
      )}

      {availableBots.length > 0 && (
        <>
          <div className="px-5">
            <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.38)] mb-3">{t.mods.promptSettingsLabel}</p>
            <PromptForm settings={draft} onChange={patch => setDraft(prev => ({ ...prev, ...patch }))} />
          </div>
          <div className="px-5">
            <div className="h-px bg-[rgba(255,255,255,0.06)] mb-5" />
            <BusinessRequirements />
            <div className="mt-4 flex flex-col gap-3">
              <div>
                <Input
                  label="Chat ID (личный Telegram ID)"
                  value={chatId}
                  onChange={setChatId}
                  placeholder="Например: 123456789"
                />
                <p className="text-[11px] text-[rgba(255,255,255,0.3)] mt-1.5 leading-relaxed">
                  Узнать свой ID можно через{' '}
                  <TgLink u="getmyid_bot" />{' '}
                  — напиши боту /start, он пришлёт твой ID
                </p>
              </div>
              <DelaySettings
                readDelay={readDelay} onReadDelay={setReadDelay}
                largeDelayEnabled={largeDelayEnabled} onLargeDelayEnabled={setLargeDelayEnabled}
                largeDelaySec={largeDelaySec} onLargeDelaySec={setLargeDelaySec}
                inactivityMin={inactivityMin} onInactivityMin={setInactivityMin}
              />
              <VipSettings
                vipEnabled={vipEnabled} onVipEnabled={setVipEnabled}
                vipLink={vipLink} onVipLink={setVipLink}
              />
            </div>
          </div>
          <div className="flex flex-col gap-3 px-5">
            <HintBox>{t.mods.hintBotReply}</HintBox>
            {saveError && (
              <div className="p-3 bg-[rgba(251,60,60,0.08)] border border-[rgba(251,60,60,0.3)] rounded-[10px]">
                <p className="text-[12px] text-red-400 font-bold">Ошибка: {saveError}</p>
              </div>
            )}
            <Button fullWidth onClick={handleSave} disabled={saved || saving || !selectedBotId}>
              {saved ? <><IconCheck size={18} /> {t.mods.savedOkLabel}</> : saving ? t.mods.savingLabel : t.mods.saveSettingsBtn}
            </Button>
            <p className="text-[10px] text-[rgba(255,255,255,0.25)] text-center -mt-1">1 сообщение = $0.025 с баланса</p>
          </div>
        </>
      )}

      <BottomSheet
        isOpen={!!editingBot}
        onClose={() => setEditingBot(null)}
        title={editingBot?.name ?? ''}
        footer={
          <div className="flex flex-col gap-2">
            {editSaveError && (
              <div className="p-2 bg-[rgba(251,60,60,0.08)] border border-[rgba(251,60,60,0.3)] rounded-[8px]">
                <p className="text-[11px] text-red-400 font-bold">Ошибка: {editSaveError}</p>
              </div>
            )}
            <Button fullWidth onClick={saveEdit} disabled={editSaved || editSaving}>
              {editSaved ? <><IconCheck size={18} /> {t.mods.savedOkLabel}</> : editSaving ? t.mods.savingLabel : t.mods.saveChangesBtn}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <PromptForm settings={editDraft} onChange={patch => setEditDraft(prev => ({ ...prev, ...patch }))} />
          <div className="h-px bg-[rgba(255,255,255,0.06)]" />
          <BusinessRequirements />
          <div>
            <Input
              label="Chat ID (личный Telegram ID)"
              value={editChatId}
              onChange={setEditChatId}
              placeholder="Например: 123456789"
            />
            <p className="text-[11px] text-[rgba(255,255,255,0.3)] mt-1.5 leading-relaxed">
              Узнать свой ID можно через{' '}
              <TgLink u="userinfobot" />{' '}
              — напиши боту /start, он пришлёт твой ID
            </p>
          </div>
          <DelaySettings
            readDelay={editReadDelay} onReadDelay={setEditReadDelay}
            largeDelayEnabled={editLargeDelayEnabled} onLargeDelayEnabled={setEditLargeDelayEnabled}
            largeDelaySec={editLargeDelaySec} onLargeDelaySec={setEditLargeDelaySec}
            inactivityMin={editInactivityMin} onInactivityMin={setEditInactivityMin}
          />
          <VipSettings
            vipEnabled={editVipEnabled} onVipEnabled={setEditVipEnabled}
            vipLink={editVipLink} onVipLink={setEditVipLink}
          />
        </div>
      </BottomSheet>
    </div>
  )
}
