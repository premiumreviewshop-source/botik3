import { type ReactNode } from 'react'
import { IconInfo } from './Icons'

export default function HintBox({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 p-3.5 rounded-[14px]"
      style={{
        background: 'linear-gradient(135deg, rgba(0,212,255,0.07), rgba(0,170,255,0.03))',
        border: '1px solid rgba(0,212,255,0.18)',
      }}>
      <IconInfo size={16} color="rgba(0,212,255,0.7)" className="flex-shrink-0 mt-0.5" />
      <div className="text-[12px] leading-relaxed text-[rgba(255,255,255,0.5)]">{children}</div>
    </div>
  )
}
