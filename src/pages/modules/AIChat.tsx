import { useState, useMemo } from 'react'
import { useApp } from '../../store/app'
import { IconBack, IconCheck, IconEdit } from '../../components/Icons'
import Input from '../../components/Input'
import Button from '../../components/Button'
import HintBox from '../../components/HintBox'
import type { Bot } from '../../types'

type PromptType = 'ready' | 'custom'

interface BotSettings {
  promptType: PromptType
  lang: 'en' | 'ru' | 'tr'
  persona: Record<string, string>
  customPrompt: string
  chatId: string
}

const DEFAULT_SETTINGS: BotSettings = {
  promptType: 'ready',
  lang: 'en',
  persona: { name: '', age: '', country: '' },
  customPrompt: '',
  chatId: '',
}

const PERSONA_FIELDS = [
  { key: 'name', label: 'Имя', placeholder: 'Sofia' },
  { key: 'age', label: 'Возраст', placeholder: '24' },
  { key: 'country', label: 'Страна', placeholder: 'Italy' },
]

function PromptForm({
  settings,
  onChange,
}: {
  settings: BotSettings
  onChange: (patch: Partial<BotSettings>) => void
}) {
  const preview = useMemo(() => {
    if (settings.promptType !== 'ready' || !settings.persona.name) return ''
    const langLabel = settings.lang === 'ru' ? 'Russian' : settings.lang === 'tr' ? 'Turkish' : 'English'
    const p = settings.persona
    return `You are ${p.name}${p.age ? `, ${p.age} years old` : ''}${p.country ? `, from ${p.country}` : ''}. You speak naturally and engagingly in ${langLabel}.`
  }, [settings.promptType, settings.persona, settings.lang])

  return (
    <div className="flex flex-col gap-3">
      {/* Prompt type toggle */}
      <div className="flex gap-2 p-1 bg-[#080808] border border-[rgba(0,255,136,0.12)] rounded-[14px]">
        {(['ready', 'custom'] as PromptType[]).map(t => (
          <button key={t} onClick={() => onChange({ promptType: t })}
            className={`flex-1 py-2.5 rounded-[10px] text-[13px] font-bold transition-all duration-200 ${
              settings.promptType === t
                ? 'bg-[#00ff88] text-black shadow-[0_0_12px_rgba(0,255,136,0.35)]'
                : 'text-[rgba(255,255,255,0.4)]'
            }`}>
            {t === 'ready' ? 'Готовый промпт' : 'Свой промпт'}
          </button>
        ))}
      </div>

      {settings.promptType === 'ready' ? (
        <>
          <div className="p-4 bg-[rgba(0,255,136,0.05)] border border-[rgba(0,255,136,0.2)] rounded-[14px] flex flex-col gap-3">
            <div>
              <p className="text-[12px] font-black text-[#00ff88] mb-0.5 uppercase tracking-[0.5px]">◆ AI OFM PROMPT</p>
              <p className="text-[11px] text-[rgba(255,255,255,0.38)]">Оптимизирован для контент-мейкеров</p>
            </div>
            <div className="flex gap-2">
              {(['en', 'ru', 'tr'] as const).map(l => (
                <button key={l} onClick={() => onChange({ lang: l })}
                  className={`flex-1 py-2 rounded-[10px] text-[12px] font-bold border transition-all duration-200 ${
                    settings.lang === l
                      ? 'bg-[#00ff88] border-[#00ff88] text-black shadow-[0_0_10px_rgba(0,255,136,0.35)]'
                      : 'bg-transparent border-[rgba(0,255,136,0.2)] text-[rgba(255,255,255,0.5)] hover:border-[rgba(0,255,136,0.4)] hover:text-[#00ff88]'
                  }`}>
                  {l === 'en' ? 'English' : l === 'ru' ? 'Russian' : 'Turkish'}
                </button>
              ))}
            </div>
          </div>
          {PERSONA_FIELDS.map(f => (
            <Input key={f.key} label={f.label} value={settings.persona[f.key]}
              onChange={v => onChange({ persona: { ...settings.persona, [f.key]: v } })}
              placeholder={f.placeholder} />
          ))}
          {preview && (
            <div className="p-3.5 bg-[#080808] border border-[rgba(0,255,136,0.12)] rounded-[12px]">
              <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,136,0.5)] mb-1.5">Превью промпта</p>
              <p className="text-[12px] text-[rgba(255,255,255,0.4)] leading-relaxed italic">"{preview}"</p>
            </div>
          )}
        </>
      ) : (
        <Input label="Системный промпт" value={settings.customPrompt}
          onChange={v => onChange({ customPrompt: v })}
          textarea rows={6} maxLength={2000} placeholder="You are a helpful assistant..." />
      )}

      <Input label="Chat ID пользователя" value={settings.chatId}
        onChange={v => onChange({ chatId: v })}
        placeholder="123456789" hint="Узнать ID: написать @userinfobot в Telegram" />
    </div>
  )
}

export default function AIChat() {
  const { bots, setBots, selectedBotId, setSelectedBotId, goBack, navigate } = useApp()

  // Settings stored per-bot
  const [botSettings, setBotSettings] = useState<Record<string, BotSettings>>({})
  // Draft for new bot form
  const [draft, setDraft] = useState<BotSettings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)

  // Edit sheet state
  const [editingBot, setEditingBot] = useState<Bot | null>(null)
  const [editDraft, setEditDraft] = useState<BotSettings>(DEFAULT_SETTINGS)
  const [editSaved, setEditSaved] = useState(false)

  const activeChatters = bots.filter(b => b.modules.includes('AI Chat') && b.isActive)
  const availableBots = bots.filter(b =>
    (b.modules.length === 0 || b.modules.includes('AI Chat')) &&
    !(b.modules.includes('AI Chat') && b.isActive)
  )

  const openEditSheet = (bot: Bot) => {
    setEditDraft(botSettings[bot.id] ?? DEFAULT_SETTINGS)
    setEditSaved(false)
    setEditingBot(bot)
  }

  const saveEdit = () => {
    if (!editingBot) return
    setBotSettings(prev => ({ ...prev, [editingBot.id]: editDraft }))
    setEditSaved(true)
    setTimeout(() => { setEditSaved(false); setEditingBot(null) }, 1200)
  }

  const handleSave = () => {
    if (selectedBotId) {
      setBots(bots.map(b => b.id === selectedBotId ? { ...b, modules: [...new Set([...b.modules, 'AI Chat'])] } : b))
      setBotSettings(prev => ({ ...prev, [selectedBotId]: draft }))
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex flex-col gap-5 pt-4">
      <div className="flex items-center gap-3 px-5">
        <button onClick={goBack}
          className="w-9 h-9 rounded-full bg-[rgba(0,255,136,0.06)] border border-[rgba(0,255,136,0.2)] flex items-center justify-center hover:bg-[rgba(0,255,136,0.12)] transition-colors">
          <IconBack size={20} color="#00ff88" />
        </button>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[2px] text-[rgba(0,255,136,0.5)]">Настройка</p>
          <h1 className="text-[22px] font-black tracking-tight">AI Chatting</h1>
        </div>
      </div>

      {/* Active chatters strip */}
      {activeChatters.length > 0 && (
        <div className="px-5">
          <div className="flex items-center gap-2 p-3 bg-[rgba(0,255,136,0.04)] border border-[rgba(0,255,136,0.14)] rounded-[14px]">
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00ff88] opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00ff88]" />
              </span>
              <p className="text-[10px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,136,0.6)]">Активны</p>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto">
              {activeChatters.map(b => (
                <button key={b.id} onClick={() => openEditSheet(b)}
                  className="flex items-center gap-1.5 flex-shrink-0 bg-[rgba(0,255,136,0.07)] border border-[rgba(0,255,136,0.2)] rounded-full pl-1 pr-2.5 py-1 hover:border-[rgba(0,255,136,0.45)] hover:bg-[rgba(0,255,136,0.12)] transition-all duration-150">
                  <div className="w-5 h-5 rounded-full bg-[rgba(0,255,136,0.15)] flex items-center justify-center text-[8px] font-black text-[#00ff88]">
                    {b.name.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-[11px] font-bold text-[rgba(255,255,255,0.75)]">{b.name}</span>
                  <IconEdit size={10} color="rgba(0,255,136,0.5)" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bot selector */}
      {availableBots.length > 0 && (
        <div className="px-5">
          <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.38)] mb-2">Подключить бота</p>
          <div className="scroll-x flex gap-2 pb-1">
            {availableBots.map(b => (
              <button key={b.id} onClick={() => setSelectedBotId(b.id)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-[13px] font-bold border transition-all duration-200 ${
                  selectedBotId === b.id
                    ? 'bg-[#00ff88] border-[#00ff88] text-black shadow-[0_0_16px_rgba(0,255,136,0.4)]'
                    : 'bg-[#080808] border-[rgba(0,255,136,0.18)] text-[rgba(255,255,255,0.6)] hover:border-[rgba(0,255,136,0.4)]'
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
            <p className="text-[12px] text-amber-400 font-bold mb-1">Нет доступных ботов</p>
            <p className="text-[11px] text-[rgba(255,255,255,0.4)]">Все боты заняты другими модулями. <button onClick={() => navigate('bots')} className="text-[rgba(0,255,136,0.7)] underline">Перейди в Боты</button> и сбрось нужный.</p>
          </div>
        </div>
      )}

      {/* New bot settings form — only shown when a bot is selected */}
      {availableBots.length > 0 && (
        <>
          <div className="px-5">
            <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.38)] mb-3">Настройки промпта</p>
            <PromptForm settings={draft} onChange={patch => setDraft(prev => ({ ...prev, ...patch }))} />
          </div>
          <div className="flex flex-col gap-3 px-5">
            <HintBox>Chat ID нужен, чтобы бот знал, кому отвечать в роли AI-персонажа.</HintBox>
            <Button fullWidth onClick={handleSave} disabled={saved || !selectedBotId}>
              {saved ? <><IconCheck size={18} /> Сохранено!</> : 'Сохранить настройки'}
            </Button>
          </div>
        </>
      )}

      {/* Edit sheet for active chatter */}
      {editingBot && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/70" onClick={() => setEditingBot(null)} />
          <div className="relative bg-[#0d0d0d] border-t border-[rgba(0,255,136,0.15)] rounded-t-[24px] max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[2px] text-[rgba(0,255,136,0.5)]">Настройки чаттера</p>
                <h2 className="text-[18px] font-black">{editingBot.name}</h2>
              </div>
              <button onClick={() => setEditingBot(null)}
                className="w-8 h-8 rounded-full bg-[rgba(255,255,255,0.06)] flex items-center justify-center text-[rgba(255,255,255,0.4)] hover:text-white transition-colors text-lg leading-none">
                ×
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 pb-5 flex flex-col gap-4">
              <PromptForm settings={editDraft} onChange={patch => setEditDraft(prev => ({ ...prev, ...patch }))} />
              <HintBox>Chat ID нужен, чтобы бот знал, кому отвечать в роли AI-персонажа.</HintBox>
              <Button fullWidth onClick={saveEdit} disabled={editSaved}>
                {editSaved ? <><IconCheck size={18} /> Сохранено!</> : 'Сохранить изменения'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
