import { useApp } from '../../store/app'
import { useLang } from '../../store/lang'
import { IconBack, IconSend, IconChevronRight } from '../../components/Icons'
import SubscriptionPaywall from '../../components/SubscriptionPaywall'

export default function AutoPost() {
  const { navigate, goBack, isAdmin } = useApp()
  const { t } = useLang()

  if (!isAdmin) return <SubscriptionPaywall module="autopost" onBack={goBack} />

  return (
    <div className="flex flex-col gap-5 pt-4 pb-8">
      <div className="flex items-center gap-3 px-5 animate-slide-up">
        <button onClick={goBack}
          className="w-10 h-10 rounded-[14px] flex items-center justify-center transition-all duration-200 active:scale-[0.92]"
          style={{ background: 'rgba(0,255,170,0.06)', border: '1px solid rgba(0,255,170,0.2)' }}>
          <IconBack size={20} color="#00ffaa" />
        </button>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[2.5px] text-[rgba(0,255,170,0.45)]">{t.mods.moduleLabel}</p>
          <h1 className="text-[22px] font-black tracking-tight leading-tight">{t.mods.autoPostHubTitle}</h1>
        </div>
      </div>

      <div className="px-5">
        <button onClick={() => navigate('module/autopost/schedule')}
          className="w-full text-left rounded-[22px] overflow-hidden active:scale-[0.98] transition-all duration-200"
          style={{ background: 'rgba(167,139,250,0.05)', border: '1px solid rgba(167,139,250,0.2)', backdropFilter: 'blur(12px)' }}>
          <div className="p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-[16px] flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, rgba(167,139,250,0.18), rgba(0,255,170,0.06))', border: '1px solid rgba(167,139,250,0.3)' }}>
                <IconSend size={24} color="#a78bfa" />
              </div>
              <span className="text-[9px] font-black uppercase tracking-[1px] px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.28)', color: '#a78bfa' }}>
                TG · Auto
              </span>
            </div>
            <p className="text-[21px] font-extrabold mb-2 tracking-tight text-white">{t.mods.scheduleTitle}</p>
            <p className="text-[13px] text-[rgba(255,255,255,0.35)] leading-relaxed mb-4">{t.mods.scheduleDesc}</p>
            <div className="flex items-center justify-between pt-3.5" style={{ borderTop: '1px solid rgba(167,139,250,0.1)' }}>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full animate-dot-blink" style={{ background: '#a78bfa', boxShadow: '0 0 6px #a78bfa' }} />
                <span className="text-[9px] font-black uppercase tracking-[0.5px] text-[rgba(167,139,250,0.7)]">Ready</span>
              </div>
              <div className="flex items-center gap-1 text-[13px] font-bold text-[#a78bfa]">
                {t.mods.configure} <IconChevronRight size={15} color="#a78bfa" />
              </div>
            </div>
          </div>
        </button>
      </div>
    </div>
  )
}
