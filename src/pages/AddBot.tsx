import { useState } from 'react'
import { useApp } from '../store/app'
import { IconBack, IconCheck } from '../components/Icons'
import Input from '../components/Input'
import Button from '../components/Button'
import HintBox from '../components/HintBox'

const STEPS = [
  { num: 1, title: 'Открой @BotFather', desc: 'Найди @BotFather в Telegram и начни диалог' },
  { num: 2, title: 'Создай бота', desc: 'Отправь /newbot и следуй инструкциям' },
  { num: 3, title: 'Скопируй токен', desc: 'BotFather выдаст токен вида 123456:ABCdef...' },
  { num: 4, title: 'Вставь сюда', desc: 'Вставь токен в поле ниже и нажми Подключить' },
]

export default function AddBot() {
  const { goBack, bots, setBots } = useApp()
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const handleConnect = async () => {
    if (!token.trim()) return
    setLoading(true)
    await new Promise(r => setTimeout(r, 1400))
    const parts = token.split(':')
    const name = `Bot_${parts[0]?.slice(-4) ?? '0000'}`
    setBots([...bots, {
      id: Date.now().toString(),
      name,
      handle: `@${name.toLowerCase()}`,
      isActive: true,
      modules: [],
    }])
    setDone(true)
    setLoading(false)
    setTimeout(goBack, 1500)
  }

  return (
    <div className="flex flex-col gap-5 pt-4">
      <div className="flex items-center gap-3 px-5">
        <button onClick={goBack}
          className="w-9 h-9 rounded-full bg-[rgba(0,255,136,0.06)] border border-[rgba(0,255,136,0.2)] flex items-center justify-center
            hover:bg-[rgba(0,255,136,0.12)] transition-colors">
          <IconBack size={20} color="#00ff88" />
        </button>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[2px] text-[rgba(0,255,136,0.5)]">Настройка</p>
          <h1 className="text-[22px] font-black tracking-tight leading-tight">Добавить бота</h1>
        </div>
      </div>

      <div className="flex flex-col gap-2 px-5">
        {STEPS.map(s => (
          <div key={s.num} className="flex items-start gap-3.5 p-4 bg-[#080808] border border-[rgba(0,255,136,0.1)] rounded-[14px]">
            <div className="w-8 h-8 rounded-full bg-[rgba(0,255,136,0.07)] border border-[rgba(0,255,136,0.25)] flex items-center justify-center text-[13px] font-black text-[#00ff88] flex-shrink-0"
              style={{ boxShadow: '0 0 8px rgba(0,255,136,0.12)' }}>
              {s.num}
            </div>
            <div>
              <p className="text-[14px] font-bold mb-0.5">{s.title}</p>
              <p className="text-[12px] text-[rgba(255,255,255,0.35)]">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="px-5 flex flex-col gap-3">
        <HintBox>
          Токен выглядит так: <span className="text-[#00ff88] font-mono">110201543:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw</span>
        </HintBox>
        <Input label="API токен бота" value={token} onChange={setToken}
          placeholder="123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw" />
        <Button fullWidth onClick={handleConnect} disabled={!token.trim() || loading || done}>
          {done ? (
            <><IconCheck size={18} /> Подключено!</>
          ) : loading ? (
            <span className="inline-flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              Подключаем...
            </span>
          ) : 'Подключить бота'}
        </Button>
      </div>
    </div>
  )
}
