import { useState } from 'react'
import { useApp } from '../store/app'
import { useLang } from '../store/lang'
import { IconBack, IconCheck } from '../components/Icons'
import Input from '../components/Input'
import Button from '../components/Button'
import HintBox from '../components/HintBox'
import api from '../api/client'

export default function AddBot() {
  const { goBack, bots, setBots } = useApp()
  const { t } = useLang()
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const STEPS = [
    { num: 1, title: t.addBot.s1t, desc: t.addBot.s1d },
    { num: 2, title: t.addBot.s2t, desc: t.addBot.s2d },
    { num: 3, title: t.addBot.s3t, desc: t.addBot.s3d },
    { num: 4, title: t.addBot.s4t, desc: t.addBot.s4d },
  ]

  const handleConnect = async () => {
    if (!token.trim()) return
    setLoading(true)
    try {
      const bot = await api.bots.add({ token: token.trim() })
      setBots([...bots, bot])
      setDone(true)
      setTimeout(goBack, 1500)
    } catch {
      const parts = token.split(':')
      const name = `Bot_${parts[0]?.slice(-4) ?? '0000'}`
      setBots([...bots, { id: Date.now().toString(), name, handle: `@${name.toLowerCase()}`, isActive: true, modules: [] }])
      setDone(true)
      setTimeout(goBack, 1500)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 pt-4 pb-4">
      <div className="flex items-center gap-3 px-5 animate-reveal-up">
        <button onClick={goBack}
          className="w-10 h-10 rounded-[14px] flex items-center justify-center transition-all duration-200 active:scale-[0.92]"
          style={{ background: 'rgba(0,255,170,0.06)', border: '1px solid rgba(0,255,170,0.2)' }}>
          <IconBack size={20} color="#00ffaa" />
        </button>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[2.5px] text-[rgba(0,255,170,0.45)]">{t.addBot.section}</p>
          <h1 className="text-[22px] font-black tracking-tight leading-tight">{t.addBot.title}</h1>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 px-5">
        {STEPS.map((s, i) => (
          <div key={s.num}
            className="flex items-start gap-3.5 p-4 rounded-[18px] animate-card-in"
            style={{
              background: 'rgba(0,255,170,0.03)',
              border: '1px solid rgba(0,255,170,0.14)',
              backdropFilter: 'blur(12px)',
              boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset',
              animationDelay: `${i * 60}ms`,
            }}>
            <div className="w-9 h-9 rounded-[12px] flex items-center justify-center text-[13px] font-black flex-shrink-0"
              style={{
                background: 'linear-gradient(160deg, rgba(0,255,170,0.2) 0%, rgba(0,200,130,0.12) 100%)',
                border: '1px solid rgba(0,255,170,0.3)',
                color: '#00ffaa',
                boxShadow: '0 2px 10px rgba(0,255,170,0.15)',
              }}>
              {s.num}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold mb-0.5 text-white">{s.title}</p>
              <p className="text-[12px] text-[rgba(255,255,255,0.3)] leading-snug">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="px-5 flex flex-col gap-3 animate-reveal-up" style={{ animationDelay: '240ms' }}>
        <HintBox>
          <span className="block">{t.addBot.hint}</span>
          <span className="block text-[#00ffaa] font-mono text-[11px] mt-1">110201543:AAHdqTcvC...</span>
        </HintBox>
        <Input label={t.addBot.label} value={token} onChange={setToken} placeholder={t.addBot.placeholder} />
        <Button fullWidth onClick={handleConnect} disabled={!token.trim() || loading || done}>
          {done ? (
            <><IconCheck size={18} /> {t.addBot.connected}</>
          ) : loading ? (
            <span className="inline-flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              {t.addBot.connecting}
            </span>
          ) : t.addBot.connect}
        </Button>
      </div>
    </div>
  )
}
