interface Props {
  value: string
  onChange: (v: string) => void
  label?: string
  placeholder?: string
  type?: string
  textarea?: boolean
  rows?: number
  maxLength?: number
  disabled?: boolean
  autoFocus?: boolean
}

const surface: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '16px',
  color: '#fff',
  fontSize: '14px',
  width: '100%',
  padding: '13px 16px',
  transition: 'border-color 0.2s, box-shadow 0.2s',
  backdropFilter: 'blur(20px)',
  boxShadow: '0 1px 0 rgba(255,255,255,0.05) inset',
  letterSpacing: '-0.01em',
}

export default function Input({ value, onChange, label, placeholder, type = 'text', textarea, rows = 4, maxLength, disabled, autoFocus }: Props) {
  const focusStyle = {
    borderColor: 'rgba(0,255,170,0.45)',
    boxShadow: '0 0 0 3px rgba(0,255,170,0.1), 0 1px 0 rgba(255,255,255,0.05) inset',
    background: 'rgba(0,255,170,0.04)',
  }

  const handleFocus = (e: React.FocusEvent<HTMLElement>) => {
    Object.assign(e.currentTarget.style, focusStyle)
  }
  const handleBlur = (e: React.FocusEvent<HTMLElement>) => {
    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
    e.currentTarget.style.boxShadow = '0 1px 0 rgba(255,255,255,0.05) inset'
    e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-[10px] font-black uppercase tracking-[1.8px] text-[rgba(255,255,255,0.38)]">
          {label}
        </label>
      )}
      {textarea ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          maxLength={maxLength}
          disabled={disabled}
          style={{ ...surface, resize: 'none', lineHeight: '1.55' }}
          className="placeholder-[rgba(255,255,255,0.18)]"
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          style={surface}
          className="placeholder-[rgba(255,255,255,0.18)]"
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
      )}
    </div>
  )
}
