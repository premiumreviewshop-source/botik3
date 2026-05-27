export default function StatusPill({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.5px] border ${
      active
        ? 'bg-[rgba(0,255,136,0.08)] text-[#00ff88] border-[rgba(0,255,136,0.3)]'
        : 'bg-[rgba(255,255,255,0.03)] text-[rgba(255,255,255,0.3)] border-[rgba(255,255,255,0.08)]'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
        active ? 'bg-[#00ff88] animate-dot' : 'bg-[rgba(255,255,255,0.2)]'
      }`}
        style={active ? { boxShadow: '0 0 5px rgba(0,255,136,1)' } : {}} />
      {active ? 'Online' : 'Off'}
    </span>
  )
}
