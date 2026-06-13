interface Props {
  module: 'analytics' | 'autopost'
  onBack: () => void
}

const PLANS = [
  {
    id: 'year',
    label: 'Год',
    price: '$99.90',
    per: '$8.33 / мес',
    badge: '🔥 ВЫГОДНЕЕ ВСЕГО',
    save: 'Экономия 58%',
    desc: 'Максимальный результат за минимум денег',
    gradient: 'linear-gradient(135deg, #081a10 0%, #0a2016 50%, #071510 100%)',
    shimmerColor: 'rgba(0,255,170,0.12)',
    borderColor: 'rgba(0,255,170,0.28)',
    glowColor: 'rgba(0,255,170,0.12)',
    textColor: '#00ffaa',
    badgeBg: 'rgba(0,255,170,0.15)',
    badgeColor: '#00ffaa',
    badgeBorder: 'rgba(0,255,170,0.3)',
  },
  {
    id: '3mo',
    label: '3 месяца',
    price: '$39.90',
    per: '$13.30 / мес',
    badge: '⚡ ПОПУЛЯРНЫЙ ВЫБОР',
    save: 'Экономия 33%',
    desc: 'Лучший старт — успей за квартал',
    gradient: 'linear-gradient(135deg, #0e0815 0%, #150d22 50%, #0b0712 100%)',
    shimmerColor: 'rgba(167,139,250,0.12)',
    borderColor: 'rgba(167,139,250,0.25)',
    glowColor: 'rgba(167,139,250,0.08)',
    textColor: '#a78bfa',
    badgeBg: 'rgba(167,139,250,0.15)',
    badgeColor: '#a78bfa',
    badgeBorder: 'rgba(167,139,250,0.3)',
  },
  {
    id: 'month',
    label: 'Месяц',
    price: '$19.90',
    per: '$19.90 / мес',
    badge: null,
    save: null,
    desc: 'Попробуй без обязательств',
    gradient: 'linear-gradient(135deg, #0c0c14 0%, #111120 50%, #0a0a12 100%)',
    shimmerColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.09)',
    glowColor: 'transparent',
    textColor: 'rgba(255,255,255,0.6)',
    badgeBg: 'transparent',
    badgeColor: 'white',
    badgeBorder: 'transparent',
  },
]

const MODULE_FEATURES: Record<Props['module'], string[]> = {
  analytics: [
    '📊 AI-аналитика активности по всем ботам в реальном времени',
    '💰 Статистика продаж, PPV-доходов и транзакций',
    '⏰ Тепловая карта активности подписчиков по часам и дням',
    '📈 Аналитика автопостинга — охваты и публикации по каналам',
    '🤖 Детальная статистика AI-чатов: сообщения, уникальные чаттеры, скорость',
    '⭐ Баланс и история Stars-транзакций',
    '📋 Полная история продаж с фильтрами',
  ],
  autopost: [
    '🤖 AI-генерация продающих описаний для постов',
    '📸 Пакетная генерация для нескольких фото сразу',
    '📅 Планировщик публикаций по расписанию',
    '📢 Автопостинг в каналы Telegram одним кликом',
    '💾 Готовые посты — сохраняй и отправляй когда угодно',
    '📊 Аналитика публикаций по каналам',
    '🎨 Кастомные шаблоны футеров и премиум-эмодзи',
  ],
}

const MODULE_TITLE: Record<Props['module'], string> = {
  analytics: 'Аналитика',
  autopost: 'Автопостинг',
}

export default function SubscriptionPaywall({ module, onBack }: Props) {
  const features = MODULE_FEATURES[module]
  const title = MODULE_TITLE[module]

  return (
    <div className="flex flex-col pb-10">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-[12px] flex items-center justify-center text-[18px] font-bold"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          ←
        </button>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(0,255,170,0.5)]">
            Автопостинг и Аналитика
          </p>
          <h1 className="text-[20px] font-black leading-tight">{title}</h1>
        </div>
      </div>

      <div className="px-5 mb-5">
        <p className="text-[13px] text-[rgba(255,255,255,0.4)] leading-[1.65]">
          Подключи модуль и получи полный доступ к инструментам автоматизации и аналитики.
        </p>
      </div>

      {/* Plans */}
      <div className="px-5 flex flex-col gap-3 mb-7">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className="relative overflow-hidden rounded-[22px]"
            style={{
              background: plan.gradient,
              border: `1px solid ${plan.borderColor}`,
              boxShadow: plan.glowColor !== 'transparent'
                ? `0 0 40px ${plan.glowColor}, inset 0 1px 0 rgba(255,255,255,0.06)`
                : 'inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
          >
            {/* Shimmer sweep */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `linear-gradient(90deg, transparent 0%, ${plan.shimmerColor} 50%, transparent 100%)`,
                width: '60%',
                animation: 'card-shimmer 3.5s ease-in-out infinite',
              }}
            />

            <div className="relative p-4">
              {plan.badge && (
                <span
                  className="inline-block px-2 py-0.5 rounded-[6px] text-[9px] font-black tracking-[1.5px] mb-3"
                  style={{
                    background: plan.badgeBg,
                    color: plan.badgeColor,
                    border: `1px solid ${plan.badgeBorder}`,
                  }}
                >
                  {plan.badge}
                </span>
              )}

              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="text-[24px] font-black leading-none" style={{ color: plan.textColor }}>
                    {plan.price}
                    <span className="text-[13px] font-semibold ml-1.5 text-[rgba(255,255,255,0.35)]">
                      / {plan.label.toLowerCase()}
                    </span>
                  </p>
                  <p className="text-[12px] mt-1.5 text-[rgba(255,255,255,0.38)]">{plan.desc}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[12px] font-bold" style={{ color: plan.textColor }}>{plan.per}</p>
                  {plan.save && (
                    <p className="text-[11px] font-black mt-1" style={{ color: plan.textColor, opacity: 0.7 }}>
                      {plan.save}
                    </p>
                  )}
                </div>
              </div>

              <button
                className="w-full mt-3.5 py-2.5 rounded-[12px] text-[13px] font-black tracking-wide transition-all active:scale-[0.97]"
                style={{
                  background: plan.glowColor !== 'transparent'
                    ? `linear-gradient(135deg, ${plan.textColor}22, ${plan.textColor}11)`
                    : 'rgba(255,255,255,0.06)',
                  color: plan.textColor,
                  border: `1px solid ${plan.borderColor}`,
                }}
              >
                Выбрать план
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Features */}
      <div className="px-5">
        <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.28)] mb-3">
          Что входит в модуль
        </p>
        <div className="flex flex-col gap-2.5 mb-5">
          {features.map((f, i) => (
            <div key={i} className="flex items-start gap-3">
              <div
                className="w-5 h-5 rounded-[6px] flex items-center justify-center text-[10px] font-black flex-shrink-0 mt-0.5"
                style={{ background: 'rgba(0,255,170,0.08)', border: '1px solid rgba(0,255,170,0.15)', color: '#00ffaa' }}
              >
                ✓
              </div>
              <p className="text-[13px] text-[rgba(255,255,255,0.5)] leading-[1.55]">{f}</p>
            </div>
          ))}
        </div>

        {/* Video guide */}
        <div
          className="p-4 rounded-[18px] flex items-center gap-3"
          style={{ background: 'rgba(167,139,250,0.05)', border: '1px solid rgba(167,139,250,0.14)' }}
        >
          <p className="text-[26px]">🎬</p>
          <div>
            <p className="text-[13px] font-bold text-white">Видеогайд по использованию</p>
            <p className="text-[12px] text-[rgba(255,255,255,0.35)] mt-0.5">
              Доступен в нашем Telegram-канале
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
