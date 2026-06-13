import { useState, useEffect } from 'react'
import { IconChevronRight, IconPlus, IconTrash } from '../components/Icons'
import { useLang } from '../store/lang'
import { useApp } from '../store/app'
import api from '../api/client'
import { openTgLink } from '../lib/tgUser'
import type { Lang } from '../lib/i18n'
import type { SavedEmoji } from '../types'

const Y = '#fbbf24'
const YA = 'rgba(251,191,36,'
const G = Y
const GA = YA

function lsGet<T>(k: string, d: T): T {
  try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : d } catch { return d }
}
function lsSet(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }

function Toggle({ value, onChange, color = Y }: { value: boolean; onChange: (v: boolean) => void; color?: string }) {
  return (
    <button onClick={() => onChange(!value)} className="flex-shrink-0 transition-all duration-300"
      style={{
        width: 48, height: 27, borderRadius: 999, position: 'relative',
        ...(value
          ? { background: `linear-gradient(135deg, ${color}, ${color}bb)`, boxShadow: `0 0 12px ${color}44` }
          : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }),
      }}>
      <span style={{
        position: 'absolute', top: 3, width: 21, height: 21, borderRadius: '50%',
        transition: 'all 0.3s cubic-bezier(0.34,1.56,0.64,1)',
        ...(value ? { left: 24, background: '#020202', boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }
          : { left: 3, background: 'rgba(255,255,255,0.4)' }),
      }} />
    </button>
  )
}

function Section({ title, accent = Y, accentA = YA, children }: {
  title: string; accent?: string; accentA?: string; children: React.ReactNode
}) {
  return (
    <div className="animate-reveal-up">
      <div className="flex items-center gap-2 px-5 mb-2.5">
        <div className="w-1 h-3.5 rounded-full" style={{ background: `linear-gradient(180deg, ${accent}, ${accent}88)` }} />
        <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.35)]">{title}</p>
      </div>
      <div className="mx-5 rounded-[20px] overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: `1px solid ${accentA}0.14)` }}>
        {children}
      </div>
    </div>
  )
}

function Row({ label, value, onPress, right }: { label: string; value?: string; onPress?: () => void; right?: React.ReactNode }) {
  const content = (
    <div className="flex items-center justify-between px-4 py-4 transition-colors"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span className="text-[14px] font-semibold text-white">{label}</span>
      <div className="flex items-center gap-2.5">
        {value && <span className="text-[13px]" style={{ color: `${YA}0.5)` }}>{value}</span>}
        {right}
        {onPress && <IconChevronRight size={14} color={`${YA}0.3)`} />}
      </div>
    </div>
  )
  return onPress
    ? <button onClick={onPress} className="w-full text-left hover:bg-[rgba(255,255,255,0.02)] transition-colors">{content}</button>
    : <div>{content}</div>
}

const LANG_LABELS: Record<Lang, string> = { en: 'English', ru: 'Русский', tr: 'Türkçe' }

function LangModal({ onClose }: { onClose: () => void }) {
  const { lang, setLang, t } = useLang()
  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full rounded-t-[24px] pb-8 animate-sheet"
        style={{ background: 'rgba(14,16,30,0.98)', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 mb-4">
          <div className="w-10 h-1 rounded-full bg-[rgba(255,255,255,0.15)]" />
        </div>
        <p className="text-[13px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.35)] text-center mb-4">{t.settings.langModal}</p>
        {(['en', 'ru', 'tr'] as Lang[]).map(l => (
          <button key={l} onClick={() => { setLang(l); onClose() }}
            className="w-full flex items-center justify-between px-6 py-4 transition-colors hover:bg-[rgba(255,255,255,0.03)]">
            <span className="text-[16px] font-semibold text-white">{LANG_LABELS[l]}</span>
            {lang === l && <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px]" style={{ background: Y, color: '#020202' }}>✓</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Premium Emoji Section ─────────────────────────────────────────────────────

function PremiumEmojiSection() {
  const { savedEmojis, setSavedEmojis } = useApp()
  const [newStickerId, setNewStickerId] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [verifyState, setVerifyState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [verifyMsg, setVerifyMsg] = useState('')
  const [verifiedAlt, setVerifiedAlt] = useState<string | null>(null)

  const resetForm = () => { setNewStickerId(''); setNewLabel(''); setShowAddForm(false); setVerifyState('idle'); setVerifyMsg(''); setVerifiedAlt(null) }

  const verifyEmoji = async () => {
    const id = newStickerId.trim(); if (!id) return
    setVerifyState('loading'); setVerifyMsg(''); setVerifiedAlt(null)
    try {
      const r = await api.emojis.verify(id)
      if (r.valid) { setVerifiedAlt(r.emoji ?? '✨'); setVerifyState('ok'); setVerifyMsg(`${r.emoji ?? '✨'} Найдено${r.setName ? ` · ${r.setName}` : ''}`) }
      else { setVerifyState('error'); setVerifyMsg(r.error ?? 'Не найдено') }
    } catch { setVerifyState('error'); setVerifyMsg('Ошибка сети') }
  }

  const addEmoji = async () => {
    const id = newStickerId.trim(); if (!id) return
    const label = newLabel.trim() || id.slice(-6)
    let alt = verifiedAlt
    if (!alt) { try { const r = await api.emojis.verify(id); alt = r.valid && r.emoji ? r.emoji : '✨' } catch { alt = '✨' } }
    const tempId = Date.now().toString()
    const emoji: SavedEmoji = { id: tempId, stickerId: id, label, alt }
    const optimistic = [...savedEmojis, emoji]
    setSavedEmojis(optimistic); resetForm()
    try {
      const r = await api.emojis.add({ stickerId: id, label, alt })
      setSavedEmojis(optimistic.map(e => e.id === tempId ? { ...e, id: r.id } : e))
    } catch {}
  }

  const removeEmoji = (id: string) => { setSavedEmojis(savedEmojis.filter(e => e.id !== id)); api.emojis.remove(id).catch(() => {}) }

  return (
    <div className="animate-reveal-up">
      <div className="flex items-center gap-2 px-5 mb-2.5">
        <div className="w-1 h-3.5 rounded-full" style={{ background: `linear-gradient(180deg, ${G}, #f59e0b)` }} />
        <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.35)]">Premium Emoji</p>
      </div>

      <div className="mx-5 rounded-[20px] p-4"
        style={{ background: 'rgba(255,255,255,0.025)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: `1px solid ${GA}0.14)` }}>

        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] text-[rgba(255,255,255,0.35)]">
            {savedEmojis.length > 0 ? `${savedEmojis.length} emoji сохранено` : 'Добавь свои premium emoji для постов'}
          </p>
          {!showAddForm && (
            <button onClick={() => setShowAddForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[11px] font-bold transition-all active:scale-95"
              style={{ background: `${GA}0.08)`, border: `1px solid ${GA}0.25)`, color: G }}>
              <IconPlus size={12} color={G} /> Добавить
            </button>
          )}
        </div>

        {showAddForm && (
          <div className="mb-3 p-3.5 rounded-[16px] flex flex-col gap-3"
            style={{ background: `${GA}0.04)`, border: `1px solid ${GA}0.15)` }}>
            <div>
              <p className="text-[11px] font-bold text-[rgba(255,255,255,0.45)] mb-1.5">Sticker ID</p>
              <div className="flex gap-2">
                <input value={newStickerId}
                  onChange={e => { setNewStickerId(e.target.value); setVerifyState('idle'); setVerifyMsg(''); setVerifiedAlt(null) }}
                  placeholder="5368324170671202286"
                  className="flex-1 bg-[rgba(255,255,255,0.03)] rounded-[10px] px-3 py-2.5 text-[12px] text-white outline-none font-mono"
                  style={{ border: `1px solid ${GA}0.2)` }} />
                <button onClick={verifyEmoji} disabled={!newStickerId.trim() || verifyState === 'loading'}
                  className="px-3 py-2.5 rounded-[10px] text-[11px] font-bold flex-shrink-0 disabled:opacity-40 transition-all"
                  style={{ border: `1px solid ${GA}0.3)`, color: `${GA}0.8)` }}>
                  {verifyState === 'loading' ? '...' : 'Проверить'}
                </button>
              </div>
              {verifyMsg && <p className={`text-[11px] mt-1.5 font-bold ${verifyState === 'ok' ? 'text-[#00ffaa]' : 'text-red-400'}`}>{verifyState === 'ok' ? '✓ ' : '✗ '}{verifyMsg}</p>}
              <div className="mt-2 p-2.5 rounded-[10px]" style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.15)' }}>
                <p className="text-[10px] text-[rgba(255,220,100,0.8)] font-bold mb-0.5">Где взять ID?</p>
                <p className="text-[10px] text-[rgba(255,255,255,0.35)]">
                  Отправь emoji в <span onClick={() => openTgLink('GetStickerIDs_Bot')}
                    className="text-[rgba(0,255,170,0.9)] font-bold underline cursor-pointer">@GetStickerIDs_Bot</span> → скопируй <span className="font-mono text-white">custom_emoji_id</span>
                </p>
              </div>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[rgba(255,255,255,0.45)] mb-1.5">Название</p>
              <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
                placeholder="Огонь, Сердечко, ..."
                className="w-full bg-[rgba(255,255,255,0.03)] rounded-[10px] px-3 py-2.5 text-[13px] text-white outline-none"
                style={{ border: `1px solid ${GA}0.2)` }} />
            </div>
            <div className="flex gap-2">
              <button onClick={addEmoji} disabled={!newStickerId.trim()}
                className="flex-1 py-2.5 rounded-[10px] text-[13px] font-black disabled:opacity-40"
                style={{ background: G, color: '#000' }}>
                Сохранить
              </button>
              <button onClick={resetForm}
                className="px-4 py-2.5 rounded-[10px] text-[13px] text-[rgba(255,255,255,0.4)]"
                style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                Отмена
              </button>
            </div>
          </div>
        )}

        {savedEmojis.length === 0 && !showAddForm ? (
          <div className="flex flex-col items-center gap-1.5 py-6 rounded-[14px]"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-[26px]">✨</p>
            <p className="text-[12px] text-[rgba(255,255,255,0.3)]">Нет premium emoji</p>
            <p className="text-[10px] text-[rgba(255,255,255,0.18)] text-center px-6 leading-relaxed">
              Добавь emoji из Telegram Premium стикер-паков
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {savedEmojis.map(e => (
              <div key={e.id} className="flex items-center gap-3 p-3 rounded-[12px]"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0"
                  style={{ background: `${GA}0.07)`, border: `1px solid ${GA}0.2)` }}>
                  <span className="text-[16px]">✨</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold truncate text-white">{e.label}</p>
                  <p className="text-[10px] text-[rgba(255,255,255,0.25)] font-mono truncate">{e.stickerId}</p>
                </div>
                <button onClick={() => removeEmoji(e.id)}
                  className="w-7 h-7 flex items-center justify-center rounded-[8px] transition-all active:scale-90"
                  style={{ background: 'rgba(255,80,80,0.06)', border: '1px solid rgba(255,80,80,0.15)' }}>
                  <IconTrash size={13} color="rgba(255,80,80,0.6)" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Settings() {
  const { t, lang } = useLang()
  const { user } = useApp()
  const [notifMsg, setNotifMsg] = useState(() => lsGet('notif_msg', true))
  const [notifPayment, setNotifPayment] = useState(() => lsGet('notif_payment', true))
  const [notifRef, setNotifRef] = useState(() => lsGet('notif_ref', false))
  const [langOpen, setLangOpen] = useState(false)

  useEffect(() => { lsSet('notif_msg', notifMsg) }, [notifMsg])
  useEffect(() => { lsSet('notif_payment', notifPayment) }, [notifPayment])
  useEffect(() => { lsSet('notif_ref', notifRef) }, [notifRef])

  return (
    <>
      <div className="flex flex-col gap-5 pb-4">
        <div className="px-5 animate-reveal-up">
          <p className="text-[11px] font-bold uppercase tracking-[2px]" style={{ color: `${YA}0.5)` }}>{t.settings.section}</p>
          <h1 className="text-[26px] font-black tracking-tight mt-0.5">{t.settings.title}</h1>
        </div>

        <Section title={t.settings.sNotif}>
          <Row label={t.settings.newMsg} right={<Toggle value={notifMsg} onChange={setNotifMsg} />} />
          <Row label={t.settings.payments} right={<Toggle value={notifPayment} onChange={setNotifPayment} />} />
          <Row label={t.settings.referrals} right={<Toggle value={notifRef} onChange={setNotifRef} />} />
        </Section>

        <Section title={t.settings.sAccount}>
          <Row label={t.settings.language} value={LANG_LABELS[lang]} onPress={() => setLangOpen(true)} />
          <Row label={t.settings.support} onPress={() => {}} />
        </Section>

        <PremiumEmojiSection />

        <div className="pb-2">
          <p className="text-center text-[10px] text-[rgba(255,255,255,0.12)] tracking-[2px] uppercase">AI Bot Platform v1.0.0</p>
          <p className="text-center text-[10px] text-[rgba(255,255,255,0.1)] mt-1">TG ID: {user.id} · @{user.username ?? '—'}</p>
        </div>
      </div>

      {langOpen && <LangModal onClose={() => setLangOpen(false)} />}
    </>
  )
}
