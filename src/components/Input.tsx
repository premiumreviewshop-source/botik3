import clsx from 'clsx'

interface Props {
  label?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  hint?: string
  textarea?: boolean
  maxLength?: number
  rows?: number
  className?: string
  autoFocus?: boolean
}

export default function Input({ label, value, onChange, placeholder, type = 'text',
  hint, textarea, maxLength, rows = 4, className, autoFocus }: Props) {
  const base = clsx(
    'w-full bg-[#080808] border border-[rgba(0,255,136,0.15)] rounded-[12px] px-4 py-3',
    'text-[15px] text-tw',
    'transition-all duration-200',
    'focus:border-[rgba(0,255,136,0.5)] focus:shadow-[0_0_12px_rgba(0,255,136,0.12)] focus:outline-none',
    className,
  )

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-[10px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,136,0.55)]">{label}</label>
      )}
      {textarea ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={rows}
          autoFocus={autoFocus}
          className={clsx(base, 'resize-none leading-relaxed')}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          autoFocus={autoFocus}
          className={base}
        />
      )}
      <div className="flex justify-between items-center">
        {hint && <p className="text-[11px] text-tw-d leading-snug">{hint}</p>}
        {maxLength && (
          <p className="text-[11px] text-tw-d ml-auto">{value.length}/{maxLength}</p>
        )}
      </div>
    </div>
  )
}
