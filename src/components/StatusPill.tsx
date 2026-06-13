export default function StatusPill({ active }: { active: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.8px]"
      style={active ? {
        background: 'rgba(0,255,170,0.1)',
        border: '1px solid rgba(0,255,170,0.3)',
        color: '#00ffaa',
        boxShadow: '0 0 12px rgba(0,255,170,0.12)',
      } : {
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        color: 'rgba(255,255,255,0.3)',
      }}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? 'animate-dot' : ''}`}
        style={active
          ? { background: '#00ffaa', boxShadow: '0 0 5px rgba(0,255,170,1)' }
          : { background: 'rgba(255,255,255,0.2)' }
        } />
      {active ? 'Online' : 'Off'}
    </span>
  )
}
