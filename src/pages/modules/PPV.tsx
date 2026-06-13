import { useState, useRef, useEffect } from 'react'
import { useApp } from '../../store/app'
import { useLang } from '../../store/lang'
import { IconBack, IconUpload, IconEdit, IconVideo, IconImage, IconPlus, IconBox } from '../../components/Icons'
import Button from '../../components/Button'
import BottomSheet from '../../components/BottomSheet'
import Input from '../../components/Input'
import { supabase, supabaseUrl } from '../../lib/supabase'
import { getTgUserId } from '../../lib/tgUser'
import api from '../../api/client'
import type { PPVItem } from '../../types'

async function uploadMedia(file: File): Promise<string> {
  const isVideo = file.type.startsWith('video') || /\.(mp4|avi|wmv|mkv|3gp|m4v|flv|webm)$/i.test(file.name)
  const ext = isVideo ? 'mp4' : (file.name.split('.').pop() ?? 'bin')
  const contentType = isVideo ? 'video/mp4' : file.type
  const path = `${getTgUserId()}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('ppv-media').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType,
  })
  if (error) throw new Error(error.message)
  return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/ppv-media/${path}`
}

interface BargainConfig {
  photoPrice: number
  photoMinPrice: number
  videoPrice: number
  videoMinPrice: number
  bargainingEnabled: boolean
}

export default function PPV() {
  const { bots, ppvItems, setPpvItems, goBack, navigate } = useApp()
  const { t, lang } = useLang()
  const [activeBotId, setActiveBotId] = useState<string | null>(null)

  // Global bargain config
  const [bargainConfig, setBargainConfig] = useState<BargainConfig>({ photoPrice: 250, photoMinPrice: 150, videoPrice: 1400, videoMinPrice: 900, bargainingEnabled: true })
  const [showBargainConfig, setShowBargainConfig] = useState(false)
  const [bargainDraft, setBargainDraft] = useState<{ photoPrice: string; photoMinPrice: string; videoPrice: string; videoMinPrice: string; bargainingEnabled: boolean }>({ photoPrice: '250', photoMinPrice: '150', videoPrice: '1400', videoMinPrice: '900', bargainingEnabled: true })
  const [itemPrices, setItemPrices] = useState<Record<string, string>>({})
  const [priceError, setPriceError] = useState('')
  const [bargainSaving, setBargainSaving] = useState(false)
  const [promptType, setPromptType] = useState<'ready' | 'custom' | null>(null)

  // Item add/edit state
  const [editing, setEditing] = useState<PPVItem | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editFileInputRef = useRef<HTMLInputElement>(null)
  const [editMediaUrl, setEditMediaUrl] = useState<string | undefined>(undefined)
  const [editMediaType, setEditMediaType] = useState<'photo' | 'video'>('photo')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingPreview, setPendingPreview] = useState<string | null>(null)
  const [pendingType, setPendingType] = useState<'photo' | 'video'>('photo')
  const [showAdd, setShowAdd] = useState(false)
  const [addTitle, setAddTitle] = useState('')
  const [addDesc, setAddDesc] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [editFile, setEditFile] = useState<File | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const chatters = bots.filter(b => b.modules.includes('AI Chat'))
  const activeBot = chatters.find(b => b.id === activeBotId) ?? null
  const botItems = activeBotId ? ppvItems.filter(i => i.botId === activeBotId) : []

  // Load bargain config + prompt type when bot is selected
  useEffect(() => {
    if (!activeBotId) return
    setPromptType(null)
    api.aiChat.get(activeBotId).then(cfg => {
      if (!cfg) return
      setPromptType(cfg.prompt_type ?? 'ready')
      setBargainConfig({
        photoPrice: cfg.photo_price ?? 250,
        photoMinPrice: cfg.photo_min_price ?? 150,
        videoPrice: cfg.video_price ?? 1400,
        videoMinPrice: cfg.video_min_price ?? 900,
        bargainingEnabled: cfg.bargaining_enabled !== false,
      })
    }).catch(() => {})
  }, [activeBotId])

  const openBargainConfig = () => {
    setBargainDraft({
      photoPrice: String(bargainConfig.photoPrice),
      photoMinPrice: String(bargainConfig.photoMinPrice),
      videoPrice: String(bargainConfig.videoPrice),
      videoMinPrice: String(bargainConfig.videoMinPrice),
      bargainingEnabled: bargainConfig.bargainingEnabled,
    })
    // Sync itemPrices from current items
    const prices: Record<string, string> = {}
    botItems.forEach(i => { prices[i.id] = String(i.priceStars || '') })
    setItemPrices(prices)
    setPriceError('')
    setShowBargainConfig(true)
  }

  const saveBargainConfig = async () => {
    if (!activeBotId) return
    // Validate: when bargaining disabled, all items need a price
    if (!bargainDraft.bargainingEnabled && botItems.length > 0) {
      const missing = botItems.some(i => !Number(itemPrices[i.id]))
      if (missing) { setPriceError(t.mods.setPriceError); return }
    }
    setPriceError('')
    setBargainSaving(true)
    try {
      const cfg = {
        photoPrice: Math.max(1, Number(bargainDraft.photoPrice) || 250),
        photoMinPrice: Math.max(1, Number(bargainDraft.photoMinPrice) || 150),
        videoPrice: Math.max(1, Number(bargainDraft.videoPrice) || 1400),
        videoMinPrice: Math.max(1, Number(bargainDraft.videoMinPrice) || 900),
        bargainingEnabled: bargainDraft.bargainingEnabled,
      }
      cfg.photoMinPrice = Math.min(cfg.photoMinPrice, cfg.photoPrice)
      cfg.videoMinPrice = Math.min(cfg.videoMinPrice, cfg.videoPrice)
      await api.aiChat.saveBargainConfig(activeBotId, cfg)
      // Save per-item prices when bargaining disabled
      if (!bargainDraft.bargainingEnabled) {
        await Promise.all(botItems.map(i =>
          api.ppv.update(i.id, { priceStars: Math.max(1, Number(itemPrices[i.id]) || 0) })
        ))
        setPpvItems(ppvItems.map(i => botItems.some(b => b.id === i.id)
          ? { ...i, priceStars: Math.max(1, Number(itemPrices[i.id]) || i.priceStars) }
          : i
        ))
      }
      setBargainConfig(cfg)
      setShowBargainConfig(false)
    } catch (err) { console.error(err) }
    finally { setBargainSaving(false) }
  }

  const handleMediaFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError('')
    if (/\.mov$/i.test(file.name)) {
      setUploadError(lang === 'ru' ? 'MOV не поддерживается Telegram. Конвертируй в MP4. На iPhone: Настройки → Камера → Форматы → Совместимый' : lang === 'tr' ? 'MOV Telegram tarafından desteklenmiyor. MP4\'e dönüştür.' : 'MOV is not supported by Telegram. Convert to MP4.')
      e.target.value = ''
      return
    }
    const type: 'photo' | 'video' = file.type.startsWith('video') || /\.(mp4|avi|wmv|mkv|3gp|m4v|flv|webm)$/i.test(file.name) ? 'video' : 'photo'
    setPendingFile(file); setPendingPreview(URL.createObjectURL(file)); setPendingType(type)
    setAddTitle(''); setAddDesc('')
    setShowAdd(true); e.target.value = ''
  }

  const saveNewItem = async () => {
    if (!pendingFile || !activeBotId) return
    setAddLoading(true)
    try {
      const mediaUrl = await uploadMedia(pendingFile)
      const defaultPrice = pendingType === 'video' ? bargainConfig.videoPrice : bargainConfig.photoPrice
      const defaultMin = pendingType === 'video' ? bargainConfig.videoMinPrice : bargainConfig.photoMinPrice
      const { id } = await api.ppv.add({
        botId: activeBotId,
        title: addTitle || t.mods.newContentTitle,
        description: addDesc,
        priceStars: defaultPrice,
        minPriceStars: defaultMin,
        bargainingEnabled: bargainConfig.bargainingEnabled,
        triggers: [],
        mediaType: pendingType,
        mediaUrl,
      })
      setPpvItems([...ppvItems, {
        id, botId: activeBotId,
        title: addTitle || t.mods.newContentTitle,
        description: addDesc,
        priceStars: defaultPrice,
        minPriceStars: defaultMin,
        bargainingEnabled: bargainConfig.bargainingEnabled,
        triggers: [],
        mediaType: pendingType, mediaUrl, purchases: 0,
      }])
      setPendingFile(null); setPendingPreview(null); setShowAdd(false)
      setAddTitle(''); setAddDesc('')
    } catch (err) { console.error(err) }
    finally { setAddLoading(false) }
  }

  const openEdit = (item: PPVItem) => {
    setEditing(item); setEditTitle(item.title); setEditDesc(item.description)
    setEditMediaUrl(item.mediaUrl); setEditMediaType(item.mediaType); setEditFile(null)
  }

  const handleEditMediaFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError('')
    if (/\.mov$/i.test(file.name)) {
      setUploadError(lang === 'ru' ? 'MOV не поддерживается Telegram. Конвертируй в MP4. На iPhone: Настройки → Камера → Форматы → Совместимый' : lang === 'tr' ? 'MOV Telegram tarafından desteklenmiyor. MP4\'e dönüştür.' : 'MOV is not supported by Telegram. Convert to MP4.')
      e.target.value = ''
      return
    }
    setEditFile(file); setEditMediaUrl(URL.createObjectURL(file))
    setEditMediaType(file.type.startsWith('video') || /\.(mp4|avi|wmv|mkv|3gp|m4v|flv|webm)$/i.test(file.name) ? 'video' : 'photo')
    e.target.value = ''
  }

  const saveEdit = async () => {
    if (!editing) return
    setEditLoading(true)
    try {
      let mediaUrl = editMediaUrl
      if (editFile) mediaUrl = await uploadMedia(editFile)
      await api.ppv.update(editing.id, { title: editTitle, description: editDesc, triggers: [], mediaUrl, mediaType: editMediaType })
      setPpvItems(ppvItems.map(i => i.id === editing.id
        ? { ...i, title: editTitle, description: editDesc, triggers: [], mediaUrl, mediaType: editMediaType }
        : i
      ))
      setEditing(null); setEditFile(null)
    } catch (err) { console.error(err) }
    finally { setEditLoading(false) }
  }

  const removeItem = async (id: string) => {
    await api.ppv.remove(id).catch(() => {})
    setPpvItems(ppvItems.filter(i => i.id !== id))
  }

  const photoWarn = Number(bargainDraft.photoMinPrice) > Number(bargainDraft.photoPrice)
  const videoWarn = Number(bargainDraft.videoMinPrice) > Number(bargainDraft.videoPrice)

  return (
    <div className="flex flex-col gap-5 pt-4">
      <div className="flex items-center gap-3 px-5">
        <button onClick={activeBotId ? () => setActiveBotId(null) : goBack}
          className="w-10 h-10 rounded-[14px] flex items-center justify-center transition-all duration-200 active:scale-[0.92]"
          style={{ background: 'rgba(0,255,170,0.06)', border: '1px solid rgba(0,255,170,0.2)' }}>
          <IconBack size={20} color="#00ffaa" />
        </button>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[2px] text-[rgba(0,255,170,0.5)]">
            {activeBot ? activeBot.name : t.mods.contentBadge}
          </p>
          <h1 className="text-[22px] font-black tracking-tight">
            {activeBot ? t.mods.ppvStorageTitle : `PPV ${t.mods.contentBadge}`}
          </h1>
        </div>
      </div>

      {chatters.length === 0 && (
        <div className="px-5">
          <div className="p-4 bg-[rgba(251,191,36,0.05)] border border-[rgba(251,191,36,0.2)] rounded-[14px] text-center">
            <p className="text-[14px] font-bold text-amber-400 mb-1">{t.mods.noChattersBots}</p>
            <p className="text-[12px] text-[rgba(255,255,255,0.4)] mb-3">{t.mods.noChattersDesc}</p>
            <button onClick={() => navigate('module/aichat')}
              className="text-[12px] font-bold text-[rgba(0,255,170,0.8)] underline">
              {t.mods.goToAIChatBtn}
            </button>
          </div>
        </div>
      )}

      {chatters.length > 0 && !activeBotId && (
        <div className="px-5 flex flex-col gap-3">
          <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.38)]">{t.mods.chooseChatterLabel}</p>
          {chatters.map(bot => {
            const count = ppvItems.filter(i => i.botId === bot.id).length
            return (
              <button key={bot.id} onClick={() => setActiveBotId(bot.id)}
                className="flex items-center gap-3.5 p-4 rounded-[16px] text-left hover:brightness-110 transition-all duration-200"
                style={{ background: 'linear-gradient(135deg, rgba(18,24,60,0.75), rgba(8,11,30,0.9))', border: '1px solid rgba(0,255,170,0.14)' }}>
                <div className="w-11 h-11 rounded-full bg-[rgba(0,255,170,0.07)] border border-[rgba(0,255,170,0.2)] flex items-center justify-center text-[13px] font-black text-[#00ffaa] flex-shrink-0">
                  {bot.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[16px] font-bold truncate">{bot.name}</p>
                  <p className="text-[12px] text-[rgba(255,255,255,0.32)]">{bot.handle}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${bot.isActive ? 'bg-[#00ffaa]' : 'bg-[rgba(255,255,255,0.2)]'}`}
                    style={bot.isActive ? { boxShadow: '0 0 6px rgba(0,255,170,1)' } : {}} />
                  <span className="text-[11px] text-[rgba(255,255,255,0.3)]">{count} {t.mods.filesLabel}</span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {chatters.length > 0 && !activeBotId && (
        <div className="px-5">
          <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.38)] mb-3">
            {lang === 'ru' ? 'Хранилище контента' : lang === 'tr' ? 'İçerik Arşivi' : 'Content Storage'}
          </p>
          <div style={{ background: 'rgba(255,255,255,0.025)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.07)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)', overflow: 'hidden' }}>
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 rounded-full" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.4), rgba(255,255,255,0.1))' }} />
                <p className="text-[11px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.4)]">
                  {lang === 'ru' ? 'Все материалы' : lang === 'tr' ? 'Tüm Materyaller' : 'All Content'}
                </p>
              </div>
              <span className="text-[12px] font-bold text-[rgba(255,255,255,0.35)]">
                {ppvItems.length} {lang === 'ru' ? 'файлов' : lang === 'tr' ? 'dosya' : 'files'}
              </span>
            </div>
            {ppvItems.length === 0 ? (
              <div className="px-4 py-6 text-center" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <p className="text-[13px] text-[rgba(255,255,255,0.28)]">
                  {lang === 'ru' ? 'Нет загруженных материалов' : lang === 'tr' ? 'Yüklenmiş içerik yok' : 'No content uploaded yet'}
                </p>
              </div>
            ) : (
              <>
                {ppvItems.slice(0, 3).map(item => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="w-9 h-9 rounded-[11px] overflow-hidden bg-[rgba(0,255,170,0.06)] border border-[rgba(0,255,170,0.15)] flex-shrink-0 flex items-center justify-center">
                      {item.mediaUrl && item.mediaType === 'photo'
                        ? <img src={item.mediaUrl} className="w-full h-full object-cover" alt="" />
                        : <IconVideo size={16} color="rgba(0,255,170,0.4)" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold truncate text-white">{item.title}</p>
                      <p className="text-[11px] text-[rgba(255,255,255,0.3)]">{item.purchases} {lang === 'ru' ? 'покупок' : lang === 'tr' ? 'satış' : 'purchases'}</p>
                    </div>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,255,170,0.08)', color: 'rgba(0,255,170,0.7)', border: '1px solid rgba(0,255,170,0.15)' }}>
                      {item.mediaType === 'video' ? (lang === 'ru' ? 'ВИДЕО' : 'VIDEO') : (lang === 'ru' ? 'ФОТО' : 'PHOTO')}
                    </span>
                  </div>
                ))}
                {ppvItems.length > 3 && (
                  <div className="px-4 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <p className="text-[11px] text-[rgba(255,255,255,0.25)] text-center">
                      {lang === 'ru' ? `+ ещё ${ppvItems.length - 3} · выберите бота чтобы посмотреть все` : `+ ${ppvItems.length - 3} more · select a bot to view all`}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {activeBot && (
        <>
          {/* Global bargain settings */}
          <div className="px-5">
            <button onClick={openBargainConfig}
              className="w-full flex items-center justify-between p-4 rounded-[16px] hover:brightness-110 transition-all duration-200"
              style={{ background: 'linear-gradient(135deg, rgba(18,24,60,0.75), rgba(8,11,30,0.9))', border: '1px solid rgba(0,255,170,0.18)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[12px] bg-[rgba(0,255,170,0.08)] border border-[rgba(0,255,170,0.2)] flex items-center justify-center text-[16px]">
                  ⚡
                </div>
                <div className="text-left">
                  <p className="text-[14px] font-bold">{t.mods.bargainSettingsBtn}</p>
                  <p className="text-[11px] text-[rgba(255,255,255,0.35)]">
                    {bargainConfig.bargainingEnabled
                      ? `${lang === 'ru' ? 'Фото' : lang === 'tr' ? 'Fotoğraf' : 'Photo'} ⭐${bargainConfig.photoMinPrice}–${bargainConfig.photoPrice} · ${lang === 'ru' ? 'Видео' : 'Video'} ⭐${bargainConfig.videoMinPrice}–${bargainConfig.videoPrice}`
                      : t.mods.fixedPricesOff}
                  </p>
                </div>
              </div>
              <span className="text-[rgba(0,255,170,0.5)] text-[13px]">›</span>
            </button>
          </div>

          {promptType === 'custom' && (
            <div className="px-5">
              <div className="p-3.5 bg-[rgba(251,191,36,0.05)] border border-[rgba(251,191,36,0.2)] rounded-[14px]">
                <p className="text-[13px] font-bold text-amber-400 mb-1">{t.mods.ppvUnavailableTitle}</p>
                <p className="text-[11px] text-[rgba(255,255,255,0.4)]">
                  {t.mods.ppvUnavailableDesc}
                </p>
              </div>
            </div>
          )}

          <div className="px-5">
            <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleMediaFile} />
            <button onClick={() => fileInputRef.current?.click()}
              className="w-full py-6 rounded-[20px] border-2 border-dashed border-[rgba(0,255,170,0.2)]
                bg-[rgba(0,255,170,0.03)] hover:border-[rgba(0,255,170,0.4)] hover:bg-[rgba(0,255,170,0.06)]
                flex flex-col items-center gap-2.5 transition-all duration-200">
              <div className="w-11 h-11 rounded-full bg-[rgba(0,255,170,0.08)] border border-[rgba(0,255,170,0.25)] flex items-center justify-center"
                style={{ boxShadow: '0 0 14px rgba(0,255,170,0.1)' }}>
                <IconUpload size={20} color="#00ffaa" />
              </div>
              <div className="text-center">
                <p className="text-[13px] font-bold">{t.mods.uploadContentBtn}</p>
                <p className="text-[11px] text-[rgba(255,255,255,0.32)]">{lang === 'ru' ? `Фото или видео для ${activeBot.name}` : lang === 'tr' ? `${activeBot.name} için fotoğraf veya video` : `Photo or video for ${activeBot.name}`}</p>
              </div>
            </button>
            {uploadError && (
              <p className="text-[12px] font-bold text-red-400 mt-2 text-center">{uploadError}</p>
            )}
          </div>

          <div className="px-5">
            <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.38)] mb-3">
              {botItems.length} {t.mods.filesLabel}
            </p>
            {botItems.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center rounded-[16px]" style={{ background: 'linear-gradient(135deg, rgba(14,18,50,0.5), rgba(8,11,24,0.7))', border: '1px solid rgba(0,255,170,0.08)' }}>
                <IconBox size={32} color="rgba(0,255,170,0.25)" />
                <p className="text-[13px] text-[rgba(255,255,255,0.3)]">{t.mods.noContentForBot} {activeBot.name}</p>
                <button onClick={() => fileInputRef.current?.click()}
                  className="text-[12px] font-bold text-[rgba(0,255,170,0.7)] underline">
                  {t.mods.uploadFirst}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {botItems.map(item => (
                  <div key={item.id}
                    className="group relative rounded-[16px] overflow-hidden hover:brightness-110 transition-all duration-200"
                    style={{ background: 'linear-gradient(135deg, rgba(16,22,55,0.85), rgba(8,11,28,0.95))', border: '1px solid rgba(0,255,170,0.14)' }}>
                    <div className="aspect-[4/3] bg-[rgba(0,255,170,0.02)] overflow-hidden flex items-center justify-center">
                      {item.mediaUrl ? (
                        item.mediaType === 'video'
                          ? <video src={item.mediaUrl} className="w-full h-full object-cover" muted playsInline />
                          : <img src={item.mediaUrl} className="w-full h-full object-cover" alt="" />
                      ) : (
                        item.mediaType === 'video'
                          ? <IconVideo size={28} color="rgba(0,255,170,0.2)" />
                          : <IconImage size={28} color="rgba(0,255,170,0.2)" />
                      )}
                    </div>
                    <div className="p-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-[9px] font-black uppercase tracking-[0.5px] px-1.5 py-0.5 rounded-full border ${
                          item.mediaType === 'video'
                            ? 'bg-[rgba(0,255,170,0.08)] text-[#00ffaa] border-[rgba(0,255,170,0.2)]'
                            : 'bg-[rgba(0,255,170,0.05)] text-[rgba(0,255,170,0.7)] border-[rgba(0,255,170,0.15)]'
                        }`}>
                          {item.mediaType === 'video' ? (lang === 'ru' ? 'ВИДЕО' : 'VIDEO') : (lang === 'ru' ? 'ФОТО' : 'PHOTO')}
                        </span>
                        <span className="text-[11px] font-bold text-[rgba(0,255,170,0.7)]">
                          {bargainConfig.bargainingEnabled
                            ? (item.mediaType === 'video'
                                ? `⭐${bargainConfig.videoMinPrice}–${bargainConfig.videoPrice}`
                                : `⭐${bargainConfig.photoMinPrice}–${bargainConfig.photoPrice}`)
                            : `⭐${item.priceStars}`}
                        </span>
                      </div>
                      <p className="text-[13px] font-bold truncate">{item.title}</p>
                      <p className="text-[10px] text-[rgba(255,255,255,0.28)] mt-0.5">{item.purchases} {t.mods.purchasesLabel}</p>
                    </div>
                    <button onClick={() => openEdit(item)}
                      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="w-9 h-9 rounded-full bg-[rgba(0,255,170,0.2)] border border-[rgba(0,255,170,0.4)] flex items-center justify-center">
                        <IconEdit size={18} color="#00ffaa" />
                      </div>
                    </button>
                  </div>
                ))}
                <button onClick={() => fileInputRef.current?.click()}
                  className="aspect-[4/3] rounded-[16px] border-2 border-dashed border-[rgba(0,255,170,0.12)]
                    hover:border-[rgba(0,255,170,0.3)] hover:bg-[rgba(0,255,170,0.03)] transition-all duration-200
                    flex flex-col items-center justify-center gap-2">
                  <IconPlus size={22} color="rgba(0,255,170,0.3)" />
                  <p className="text-[10px] text-[rgba(255,255,255,0.25)]">{t.mods.addLabel}</p>
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Global bargain config sheet */}
      <BottomSheet
        isOpen={showBargainConfig}
        onClose={() => setShowBargainConfig(false)}
        title={t.mods.bargainSettingsBtn}
        footer={
          <Button fullWidth onClick={saveBargainConfig} disabled={bargainSaving || (bargainDraft.bargainingEnabled && (photoWarn || videoWarn))}>
            {bargainSaving ? t.common.loading : `${t.common.save} ${t.mods.bargainSettingsBtn.toLowerCase()}`}
          </Button>
        }
      >
        <div className="flex flex-col gap-4">

          {/* Bargaining toggle */}
          <button onClick={() => setBargainDraft(d => ({ ...d, bargainingEnabled: !d.bargainingEnabled }))}
            className={`flex items-center justify-between p-3.5 rounded-[14px] border transition-all ${
              bargainDraft.bargainingEnabled
                ? 'bg-[rgba(0,255,170,0.06)] border-[rgba(0,255,170,0.3)]'
                : 'bg-[rgba(255,59,48,0.05)] border-[rgba(255,59,48,0.25)]'
            }`}>
            <div>
              <p className="text-[13px] font-bold text-left">
                {bargainDraft.bargainingEnabled ? t.mods.bargainEnabledTitle : t.mods.bargainDisabledTitle}
              </p>
              <p className="text-[10px] text-[rgba(255,255,255,0.4)] text-left mt-0.5">
                {bargainDraft.bargainingEnabled
                  ? t.mods.bargainEnabledDesc
                  : t.mods.bargainDisabledDesc}
              </p>
            </div>
            <div className={`w-11 h-6 rounded-full transition-all relative ${bargainDraft.bargainingEnabled ? 'bg-[#00ffaa]' : 'bg-[rgba(255,255,255,0.12)]'}`}>
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${bargainDraft.bargainingEnabled ? 'left-5' : 'left-0.5'}`} />
            </div>
          </button>

          {/* Price range (only when bargaining enabled) */}
          {bargainDraft.bargainingEnabled && <>
            <div className="p-3.5 bg-[rgba(0,255,170,0.02)] border border-[rgba(0,255,170,0.1)] rounded-[14px]">
              <p className="text-[11px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,170,0.6)] mb-3">{lang === 'ru' ? 'Фото' : lang === 'tr' ? 'Fotoğraf' : 'Photo'}</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] font-bold text-[rgba(255,255,255,0.45)]">{t.mods.normalPriceLabel}</p>
                  <input type="number" value={bargainDraft.photoPrice}
                    onChange={e => setBargainDraft(d => ({ ...d, photoPrice: e.target.value }))}
                    className="bg-[#0d0d0d] border border-[rgba(0,255,170,0.12)] rounded-[10px] px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[rgba(0,255,170,0.4)]"
                    placeholder="250" />
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] font-bold text-[rgba(255,255,255,0.45)]">{t.mods.minPriceLabel}</p>
                  <input type="number" value={bargainDraft.photoMinPrice}
                    onChange={e => setBargainDraft(d => ({ ...d, photoMinPrice: e.target.value }))}
                    className="bg-[#0d0d0d] border border-[rgba(0,255,170,0.12)] rounded-[10px] px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[rgba(0,255,170,0.4)]"
                    placeholder="150" />
                </div>
              </div>
              {photoWarn && <p className="text-[11px] font-bold text-amber-400 mt-2">{t.mods.minPriceWarn}</p>}
              <p className="text-[10px] text-[rgba(255,255,255,0.3)] mt-2">
                {t.mods.bargainRangePrefix} {bargainDraft.photoPrice} → {bargainDraft.photoMinPrice} ⭐
              </p>
            </div>

            <div className="p-3.5 bg-[rgba(0,255,170,0.02)] border border-[rgba(0,255,170,0.1)] rounded-[14px]">
              <p className="text-[11px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,170,0.6)] mb-3">Video</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] font-bold text-[rgba(255,255,255,0.45)]">{t.mods.normalPriceLabel}</p>
                  <input type="number" value={bargainDraft.videoPrice}
                    onChange={e => setBargainDraft(d => ({ ...d, videoPrice: e.target.value }))}
                    className="bg-[#0d0d0d] border border-[rgba(0,255,170,0.12)] rounded-[10px] px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[rgba(0,255,170,0.4)]"
                    placeholder="1400" />
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] font-bold text-[rgba(255,255,255,0.45)]">{t.mods.minPriceLabel}</p>
                  <input type="number" value={bargainDraft.videoMinPrice}
                    onChange={e => setBargainDraft(d => ({ ...d, videoMinPrice: e.target.value }))}
                    className="bg-[#0d0d0d] border border-[rgba(0,255,170,0.12)] rounded-[10px] px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[rgba(0,255,170,0.4)]"
                    placeholder="900" />
                </div>
              </div>
              {videoWarn && <p className="text-[11px] font-bold text-amber-400 mt-2">{t.mods.minPriceWarn}</p>}
              <p className="text-[10px] text-[rgba(255,255,255,0.3)] mt-2">
                {t.mods.bargainRangePrefix} {bargainDraft.videoPrice} → {bargainDraft.videoMinPrice} ⭐
              </p>
            </div>
          </>}

          {/* Per-item prices (only when bargaining disabled) */}
          {!bargainDraft.bargainingEnabled && botItems.length > 0 && (
            <div className="p-3.5 bg-[rgba(0,255,170,0.02)] border border-[rgba(0,255,170,0.1)] rounded-[14px]">
              <p className="text-[11px] font-black uppercase tracking-[1.5px] text-[rgba(0,255,170,0.6)] mb-3">{t.mods.itemPricesLabel}</p>
              <div className="flex flex-col gap-2">
                {botItems.map(item => (
                  <div key={item.id} className="flex items-center gap-3">
                    <p className="text-[12px] flex-1 truncate text-[rgba(255,255,255,0.7)]">{item.title}</p>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-[rgba(0,255,170,0.6)]">⭐</span>
                      <input
                        type="number"
                        value={itemPrices[item.id] ?? String(item.priceStars)}
                        onChange={e => setItemPrices(p => ({ ...p, [item.id]: e.target.value }))}
                        className="w-20 bg-[#0d0d0d] border border-[rgba(0,255,170,0.12)] rounded-[8px] px-2 py-1.5 text-[13px] text-white focus:outline-none focus:border-[rgba(0,255,170,0.4)]"
                        placeholder="250"
                        min="1"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!bargainDraft.bargainingEnabled && botItems.length === 0 && (
            <p className="text-[12px] text-[rgba(255,255,255,0.35)] text-center py-2">
              {t.mods.addContentForPrices}
            </p>
          )}

          {priceError && <p className="text-[12px] font-bold text-red-400">{priceError}</p>}

        </div>
      </BottomSheet>

      {/* Add sheet */}
      <BottomSheet
        isOpen={showAdd}
        onClose={() => { setShowAdd(false); setPendingFile(null); setPendingPreview(null) }}
        title={t.mods.newContentTitle}
        footer={
          <Button fullWidth onClick={saveNewItem} disabled={addLoading}>
            {addLoading ? t.common.loading : <><IconPlus size={16} /> {t.mods.addToPPV}</>}
          </Button>
        }
      >
        {pendingPreview && (
          <div className="rounded-[14px] overflow-hidden border border-[rgba(0,255,170,0.2)] bg-black mb-1 flex items-center justify-center">
            {pendingType === 'video'
              ? <video src={pendingPreview} className="max-w-full max-h-[40vh] w-auto h-auto" controls muted playsInline />
              : <img src={pendingPreview} className="max-w-full max-h-[40vh] w-auto h-auto block" alt="" />
            }
          </div>
        )}
        <Input label={t.mods.nameLabel} value={addTitle} onChange={setAddTitle} placeholder="Exclusive Set..." />
        <Input label={t.mods.descriptionWithNote} value={addDesc} onChange={setAddDesc} textarea rows={2} placeholder={t.mods.descShortLabel + '...'} />
      </BottomSheet>

      {/* Edit sheet */}
      <BottomSheet
        isOpen={!!editing}
        onClose={() => { setEditing(null); setEditFile(null) }}
        title={t.mods.editTitle}
        footer={
          <div className="flex gap-2">
            <Button fullWidth onClick={saveEdit} disabled={editLoading}>
              {editLoading ? t.common.loading : t.common.save}
            </Button>
            <button onClick={() => editing && removeItem(editing.id)}
              className="px-4 py-3 rounded-[14px] bg-[rgba(255,59,48,0.1)] border border-[rgba(255,59,48,0.25)] text-[rgba(255,59,48,0.8)] text-[13px] font-bold hover:bg-[rgba(255,59,48,0.2)] transition-all">
              {t.common.delete}
            </button>
          </div>
        }
      >
        <input ref={editFileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleEditMediaFile} />
        <div className="relative rounded-[14px] overflow-hidden border border-[rgba(0,255,170,0.2)] bg-black flex items-center justify-center">
          {editMediaUrl ? (
            editMediaType === 'video'
              ? <video src={editMediaUrl} className="max-w-full max-h-[35vh] w-auto h-auto" controls muted playsInline />
              : <img src={editMediaUrl} className="max-w-full max-h-[35vh] w-auto h-auto block" alt="" />
          ) : (
            <div className="py-10 flex flex-col items-center gap-2 text-[rgba(255,255,255,0.2)]">
              {editMediaType === 'video' ? <IconVideo size={32} color="rgba(0,255,170,0.2)" /> : <IconImage size={32} color="rgba(0,255,170,0.2)" />}
            </div>
          )}
          <button onClick={() => editFileInputRef.current?.click()}
            className="absolute bottom-2 right-2 flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-black/70 border border-[rgba(0,255,170,0.4)] text-[11px] font-bold text-[#00ffaa] hover:bg-[rgba(0,255,170,0.15)] transition-all">
            <IconUpload size={12} color="#00ffaa" /> {t.mods.changeMediaBtn}
          </button>
        </div>
        <Input label={t.mods.nameLabel} value={editTitle} onChange={setEditTitle} placeholder={t.mods.contentTitlePlaceholder} />
        <Input label={t.mods.descShortLabel} value={editDesc} onChange={setEditDesc} textarea rows={2} placeholder={t.mods.descShortLabel + '...'} />
      </BottomSheet>
    </div>
  )
}
