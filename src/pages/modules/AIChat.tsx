import { useState, useMemo } from 'react'
import { useApp } from '../../store/app'
import { IconBack, IconCheck } from '../../components/Icons'
import Input from '../../components/Input'
import Button from '../../components/Button'
import HintBox from '../../components/HintBox'

type PromptType = 'ready' | 'custom'

const PERSONA_FIELDS = [
  { key: 'name', label: 'Имя', placeholder: 'Sofia' },
  { key: 'age', label: 'Возраст', placeholder: '24' },
  { key: 'country', label: 'Страна', placeholder: 'Italy' },
]

export default function AIChat() {
  const { bots, setBots, selectedBotId, setSelectedBotId, goBack, navigate } = useApp()
  const [promptType, setPromptType] = useState<PromptType>('ready')
  const [lang, setLang] = useState<'en' | 'ru' | 'tr'>('en')
  const [persona, setPersona] = useState<Record<string, string>>({ name: '', age: '', country: '' })
  const [customPrompt, setCustomPrompt] = useState('')
  const [chatId, setChatId] = useState('')
  const [saved, setSaved] = useState(false)

  const preview = useMemo(() => {
    if (promptType !== 'ready' || !persona.name) return ''
    const langLabel = lang === 'ru' ? 'Russian' : lang === 'tr' ? 'Turkish' : 'English'
    return `You are ${persona.name}${persona.age ? `, ${persona.age} years old` : ''}${persona.country ? `, from ${persona.country}` : ''}. You speak naturally and engagingly in ${langLabel}.`
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptType, persona.name, persona.age, persona.country, lang])

  const activeChatters = bots.filter(b => b.modules.includes('AI Chat') && b.isActive)
  const availableBots = bots.filter(b =>
    (b.modules.length === 0 || b.modules.includes('AI Chat')) &&
    !(b.modules.includes('AI Chat') && b.isActive)
  )

  const handleSave = async () => {
    if (selectedBotId) {
      setBots(bots.map(b => b.id === selectedBotId ? { ...b, modules: [...new Set([...b.modules, 'AI Chat'])] } : b))
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
                <div key={b.id} className="flex items-center gap-1.5 flex-shrink-0 bg-[rgba(0,255,136,0.07)] border border-[rgba(0,255,136,0.2)] rounded-full pl-1 pr-2.5 py-1">
                  <div className="w-5 h-5 rounded-full bg-[rgba(0,255,136,0.15)] flex items-center justify-center text-[8px] font-black text-[#00ff88]">
                    {b.name.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-[11px] font-bold text-[rgba(255,255,255,0.75)]">{b.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bot selector */}
      <div className="px-5">
        <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.38)] mb-2">Бот</p>
        {availableBots.length === 0 ? (
          <div className="p-3 bg-[rgba(251,191,36,0.05)] border border-[rgba(251,191,36,0.2)] rounded-[12px]">
            <p className="text-[12px] text-amber-400 font-bold mb-1">Нет доступных ботов</p>
            <p className="text-[11px] text-[rgba(255,255,255,0.4)]">Все боты заняты другими модулями. <button onClick={() => navigate('bots')} className="text-[rgba(0,255,136,0.7)] underline">Перейди в Боты</button> и сбрось нужный.</p>
          </div>
        ) : (
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
        )}
      </div>

      {/* Prompt type */}
      <div className="px-5">
        <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.38)] mb-2">Тип промпта</p>
        <div className="flex gap-2 p-1 bg-[#080808] border border-[rgba(0,255,136,0.12)] rounded-[14px]">
          {(['ready', 'custom'] as PromptType[]).map(t => (
            <button key={t} onClick={() => setPromptType(t)}
              className={`flex-1 py-2.5 rounded-[10px] text-[13px] font-bold transition-all duration-200 ${
                promptType === t
                  ? 'bg-[#00ff88] text-black shadow-[0_0_12px_rgba(0,255,136,0.35)]'
                  : 'text-[rgba(255,255,255,0.4)] hover:text-tw'
              }`}>
              {t === 'ready' ? 'Готовый промпт' : 'Свой промпт'}
            </button>
          ))}
        </div>
      </div>

      {promptType === 'ready' ? (
        <div className="flex flex-col gap-3 px-5">
          <div className="p-4 bg-[rgba(0,255,136,0.05)] border border-[rgba(0,255,136,0.2)] rounded-[14px] flex flex-col gap-3">
            <div>
              <p className="text-[12px] font-black text-[#00ff88] mb-0.5 uppercase tracking-[0.5px]">◆ AI OFM PROMPT</p>
              <p className="text-[11px] text-[rgba(255,255,255,0.38)]">Оптимизирован для контент-мейкеров</p>
            </div>
            <div className="flex gap-2">
              {(['en', 'ru', 'tr'] as const).map(l => (
                <button key={l} onClick={() => setLang(l)}
                  className={`flex-1 py-2 rounded-[10px] text-[12px] font-bold border transition-all duration-200 ${
                    lang === l
                      ? 'bg-[#00ff88] border-[#00ff88] text-black shadow-[0_0_10px_rgba(0,255,136,0.35)]'
                      : 'bg-transparent border-[rgba(0,255,136,0.2)] text-[rgba(255,255,255,0.5)] hover:border-[rgba(0,255,136,0.4)] hover:text-[#00ff88]'
                  }`}>
                  {l === 'en' ? 'English' : l === 'ru' ? 'Russian' : 'Turkish'}
                </button>
              ))}
            </div>
          </div>
          {PERSONA_FIELDS.map(f => (
            <Input key={f.key} label={f.label} value={persona[f.key]}
              onChange={v => setPersona(p => ({ ...p, [f.key]: v }))} placeholder={f.placeholder} />
          ))}
          {preview && (
            <div className="p-3.5 bg-[#080808] border border-[rgba(0,255,136,0.12)] rounded-[12px]">
              <p className="text-[9px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,136,0.5)] mb-1.5">Превью промпта</p>
              <p className="text-[12px] text-[rgba(255,255,255,0.4)] leading-relaxed italic">"{preview}"</p>
            </div>
          )}
        </div>
      ) : (
        <div className="px-5">
          <Input label="Системный промпт" value={customPrompt} onChange={setCustomPrompt}
            textarea rows={6} maxLength={2000} placeholder="You are a helpful assistant..." />
        </div>
      )}

      <div className="flex flex-col gap-3 px-5">
        <Input label="Chat ID пользователя" value={chatId} onChange={setChatId}
          placeholder="123456789" hint="Узнать ID: написать @userinfobot в Telegram" />
        <HintBox>Chat ID нужен, чтобы бот знал, кому отвечать в роли AI-персонажа.</HintBox>
        <Button fullWidth onClick={handleSave} disabled={saved}>
          {saved ? <><IconCheck size={18} /> Сохранено!</> : 'Сохранить настройки'}
        </Button>
      </div>
    </div>
  )
}
