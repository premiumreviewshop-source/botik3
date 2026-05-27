import { useState } from 'react'
import { useApp } from '../store/app'
import { IconStar } from '../components/Icons'
import Button from '../components/Button'
import Input from '../components/Input'

const QUICK = [10, 25, 50]
const TX_ICONS: Record<string, string> = { topup: '↑', spend: '↓', referral: '◈' }
const TX_COLORS: Record<string, string> = {
  topup: 'text-[#00ff88]', spend: 'text-red-400', referral: 'text-amber-s',
}

export default function Balance() {
  const { balance, transactions } = useApp()
  const [custom, setCustom] = useState('')
  const [selected, setSelected] = useState<number | null>(null)

  return (
    <div className="flex flex-col gap-5 pt-4">
      <div className="px-5">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[#00ff88] text-[10px]" style={{ textShadow: '0 0 8px rgba(0,255,136,0.9)' }}>◆</span>
          <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.38)]">Финансы</p>
        </div>
        <h1 className="text-[24px] font-black tracking-tight mb-4">Баланс</h1>

        {/* Balance card */}
        <div className="rounded-[20px] p-6 bg-[#080808] border border-[rgba(0,255,136,0.25)]"
          style={{ boxShadow: '0 0 40px rgba(0,255,136,0.06), inset 0 0 40px rgba(0,255,136,0.02)' }}>
          <p className="text-[9px] font-black uppercase tracking-[2px] text-[rgba(0,255,136,0.5)] mb-3">Текущий баланс</p>
          <p className="text-[54px] font-black leading-none text-[#00ff88]"
            style={{ textShadow: '0 0 28px rgba(0,255,136,0.4)' }}>
            ${balance.toFixed(2)}
          </p>
          <p className="text-[12px] text-[rgba(255,255,255,0.32)] mt-3">≈ {Math.round(balance * 50)} ⭐ Telegram Stars</p>
        </div>
      </div>

      {/* Top-up */}
      <div className="px-5">
        <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.38)] mb-3">Пополнить</p>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {QUICK.map(amt => (
            <button key={amt} onClick={() => { setSelected(amt); setCustom('') }}
              className={`py-3 rounded-[14px] text-[15px] font-bold border transition-all duration-200 ${
                selected === amt
                  ? 'bg-[#00ff88] border-[#00ff88] text-black shadow-[0_0_20px_rgba(0,255,136,0.45)]'
                  : 'bg-[#080808] border-[rgba(0,255,136,0.18)] text-tw hover:border-[rgba(0,255,136,0.4)] hover:bg-[rgba(0,255,136,0.05)]'
              }`}>
              +${amt}
            </button>
          ))}
        </div>
        <Input value={custom} onChange={v => { setCustom(v); setSelected(null) }}
          placeholder="Своя сумма ($)" type="number" />
        <div className="mt-3">
          <Button fullWidth disabled={!selected && !custom}>
            <IconStar size={18} color="currentColor" />
            Оплатить через Stars
          </Button>
        </div>
        <p className="text-[11px] text-[rgba(255,255,255,0.18)] text-center mt-2">
          1 $ ≈ 50 ⭐ · Безопасно через Telegram
        </p>
      </div>

      {/* History */}
      <div className="px-5">
        <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.38)] mb-3">История транзакций</p>
        <div className="flex flex-col gap-2">
          {transactions.map(tx => (
            <div key={tx.id} className="flex items-center gap-3 p-3.5 bg-[#080808] border border-[rgba(0,255,136,0.1)] rounded-[14px]">
              <div className="w-9 h-9 rounded-full bg-[rgba(0,255,136,0.06)] border border-[rgba(0,255,136,0.18)] flex items-center justify-center font-black flex-shrink-0 text-[#00ff88] text-[14px]">
                {TX_ICONS[tx.type]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold truncate">{tx.description}</p>
                <p className="text-[11px] text-[rgba(255,255,255,0.25)]">{tx.date}</p>
              </div>
              <span className={`text-[15px] font-bold ${TX_COLORS[tx.type]}`}>
                {tx.amount > 0 ? '+' : ''}${Math.abs(tx.amount).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
