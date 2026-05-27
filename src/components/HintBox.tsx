import { type ReactNode } from 'react'
import { IconInfo } from './Icons'

export default function HintBox({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 p-3.5 rounded-[12px] bg-[rgba(0,255,136,0.04)] border border-[rgba(0,255,136,0.18)]">
      <IconInfo size={16} color="rgba(0,255,136,0.65)" className="flex-shrink-0 mt-0.5" />
      <p className="text-[12px] leading-relaxed text-[rgba(255,255,255,0.45)]">{children}</p>
    </div>
  )
}
