import { useState } from 'react'
import { IconChevronRight } from '../components/Icons'

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      className={`w-[46px] h-[26px] rounded-full relative transition-all duration-300 border ${
        value
          ? 'bg-[rgba(0,255,136,0.25)] border-[rgba(0,255,136,0.5)]'
          : 'bg-[rgba(255,255,255,0.06)] border-[rgba(255,255,255,0.1)]'
      }`}
      style={value ? { boxShadow: '0 0 10px rgba(0,255,136,0.2)' } : {}}>
      <span className={`absolute top-[3px] w-5 h-5 rounded-full shadow-md transition-all duration-300 ${
        value ? 'left-[23px] bg-[#00ff88]' : 'left-[3px] bg-[rgba(255,255,255,0.35)]'
      }`}
        style={value ? { boxShadow: '0 0 8px rgba(0,255,136,0.8)' } : {}} />
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 px-5 mb-2">
        <span className="text-[#00ff88] text-[10px]" style={{ textShadow: '0 0 8px rgba(0,255,136,0.9)' }}>◆</span>
        <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.38)]">{title}</p>
      </div>
      <div className="mx-5 bg-[#080808] border border-[rgba(0,255,136,0.12)] rounded-[16px] overflow-hidden divide-y divide-[rgba(0,255,136,0.07)]">
        {children}
      </div>
    </div>
  )
}

function Row({ label, value, onPress, right }: { label: string; value?: string; onPress?: () => void; right?: React.ReactNode }) {
  const inner = (
    <div className="flex items-center justify-between px-4 py-3.5 hover:bg-[rgba(0,255,136,0.03)] transition-colors">
      <span className="text-[14px] font-medium">{label}</span>
      <div className="flex items-center gap-2">
        {value && <span className="text-[13px] text-[rgba(255,255,255,0.32)]">{value}</span>}
        {right}
        {onPress && <IconChevronRight size={16} color="rgba(0,255,136,0.3)" />}
      </div>
    </div>
  )
  return onPress ? <button onClick={onPress} className="w-full text-left">{inner}</button> : <div>{inner}</div>
}

export default function Settings() {
  const [notifMsg, setNotifMsg] = useState(true)
  const [notifPayment, setNotifPayment] = useState(true)
  const [notifRef, setNotifRef] = useState(false)

  return (
    <div className="flex flex-col gap-5 pt-4">
      <div className="px-5">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[#00ff88] text-[10px]" style={{ textShadow: '0 0 8px rgba(0,255,136,0.9)' }}>◆</span>
          <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.38)]">Система</p>
        </div>
        <h1 className="text-[24px] font-black tracking-tight">Настройки</h1>
      </div>

      <Section title="Бот">
        <Row label="API токен" value="••••••••4728" onPress={() => {}} />
        <Row label="Chat ID" value="@userinfobot" onPress={() => {}} />
      </Section>

      <Section title="Подписка">
        <Row label="Тариф" value="PRO" />
        <Row label="Сообщений" value="4 382 / 10 000" />
        <Row label="Обновить план" onPress={() => {}} />
      </Section>

      <Section title="Уведомления">
        <Row label="Новые сообщения" right={<Toggle value={notifMsg} onChange={setNotifMsg} />} />
        <Row label="Платежи" right={<Toggle value={notifPayment} onChange={setNotifPayment} />} />
        <Row label="Рефералы" right={<Toggle value={notifRef} onChange={setNotifRef} />} />
      </Section>

      <Section title="Аккаунт">
        <Row label="Язык" value="Русский" onPress={() => {}} />
        <Row label="Поддержка" onPress={() => {}} />
        <div>
          <button className="w-full text-left px-4 py-3.5 text-[14px] font-medium text-red-400 hover:bg-[rgba(239,68,68,0.05)] transition-colors">
            Выйти из аккаунта
          </button>
        </div>
      </Section>

      <p className="text-center text-[10px] text-[rgba(0,255,136,0.18)] pb-2 tracking-[1.5px] uppercase">
        AI Bot Platform v1.0.0
      </p>
    </div>
  )
}
