import { useState } from 'react'
import { useApp } from '../../store/app'
import { IconBack, IconUpload, IconEdit, IconVideo, IconImage } from '../../components/Icons'
import Button from '../../components/Button'
import BottomSheet from '../../components/BottomSheet'
import Input from '../../components/Input'
import type { PPVItem } from '../../types'

const MOCK_PPV: PPVItem[] = [
  { id: '1', botId: '1', title: 'Exclusive Set', description: 'Morning photoshoot exclusive', priceStars: 150, mediaType: 'photo', purchases: 23 },
  { id: '2', botId: '1', title: 'Behind The Scenes', description: 'Full video BTS', priceStars: 250, mediaType: 'video', purchases: 11 },
  { id: '3', botId: '1', title: 'Weekend Vibes', description: 'Casual weekend photos', priceStars: 100, mediaType: 'photo', purchases: 38 },
]

export default function PPV() {
  const { goBack } = useApp()
  const [items, setItems] = useState<PPVItem[]>(MOCK_PPV)
  const [editing, setEditing] = useState<PPVItem | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editPrice, setEditPrice] = useState('')

  const openEdit = (item: PPVItem) => {
    setEditing(item)
    setEditTitle(item.title)
    setEditDesc(item.description)
    setEditPrice(String(item.priceStars))
  }

  const saveEdit = () => {
    if (!editing) return
    setItems(items.map(i => i.id === editing.id
      ? { ...i, title: editTitle, description: editDesc, priceStars: Number(editPrice) || i.priceStars }
      : i
    ))
    setEditing(null)
  }

  return (
    <div className="flex flex-col gap-5 pt-4">
      <div className="flex items-center gap-3 px-5">
        <button onClick={goBack}
          className="w-9 h-9 rounded-full bg-[rgba(0,255,136,0.06)] border border-[rgba(0,255,136,0.2)] flex items-center justify-center hover:bg-[rgba(0,255,136,0.12)] transition-colors">
          <IconBack size={20} color="#00ff88" />
        </button>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[2px] text-[rgba(0,255,136,0.5)]">Контент</p>
          <h1 className="text-[22px] font-black tracking-tight">PPV Контент</h1>
        </div>
      </div>

      {/* Upload zone */}
      <div className="px-5">
        <button className="w-full py-8 rounded-[20px] border-2 border-dashed border-[rgba(0,255,136,0.2)]
          bg-[rgba(0,255,136,0.03)] hover:border-[rgba(0,255,136,0.4)] hover:bg-[rgba(0,255,136,0.06)]
          flex flex-col items-center gap-3 transition-all duration-200">
          <div className="w-12 h-12 rounded-full bg-[rgba(0,255,136,0.08)] border border-[rgba(0,255,136,0.25)] flex items-center justify-center"
            style={{ boxShadow: '0 0 14px rgba(0,255,136,0.1)' }}>
            <IconUpload size={22} color="#00ff88" />
          </div>
          <div className="text-center">
            <p className="text-[14px] font-bold text-tw">Загрузить контент</p>
            <p className="text-[12px] text-[rgba(255,255,255,0.32)]">Фото или видео</p>
          </div>
        </button>
      </div>

      {/* Grid */}
      <div className="px-5">
        <p className="text-[10px] font-black uppercase tracking-[2px] text-[rgba(255,255,255,0.38)] mb-3">{items.length} элементов</p>
        <div className="grid grid-cols-2 gap-2.5">
          {items.map(item => (
            <div key={item.id}
              className="group relative bg-[#080808] border border-[rgba(0,255,136,0.12)] rounded-[16px] overflow-hidden
                hover:border-[rgba(0,255,136,0.3)] transition-all duration-200">
              <div className="aspect-[4/3] bg-[rgba(0,255,136,0.02)] flex items-center justify-center">
                {item.mediaType === 'video'
                  ? <IconVideo size={28} color="rgba(0,255,136,0.2)" />
                  : <IconImage size={28} color="rgba(0,255,136,0.2)" />
                }
              </div>
              <div className="p-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[9px] font-black uppercase tracking-[0.5px] px-1.5 py-0.5 rounded-full border ${
                    item.mediaType === 'video'
                      ? 'bg-[rgba(0,255,136,0.08)] text-[#00ff88] border-[rgba(0,255,136,0.2)]'
                      : 'bg-[rgba(0,255,136,0.05)] text-[rgba(0,255,136,0.7)] border-[rgba(0,255,136,0.15)]'
                  }`}>
                    {item.mediaType === 'video' ? 'ВИДЕО' : 'ФОТО'}
                  </span>
                  <span className="text-[11px] font-bold text-amber-s">⭐ {item.priceStars}</span>
                </div>
                <p className="text-[13px] font-bold truncate">{item.title}</p>
                <p className="text-[10px] text-[rgba(255,255,255,0.28)] mt-0.5">{item.purchases} покупок</p>
              </div>
              <button onClick={() => openEdit(item)}
                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <div className="w-9 h-9 rounded-full bg-[rgba(0,255,136,0.2)] border border-[rgba(0,255,136,0.4)] flex items-center justify-center">
                  <IconEdit size={18} color="#00ff88" />
                </div>
              </button>
            </div>
          ))}
        </div>
      </div>

      <BottomSheet isOpen={!!editing} onClose={() => setEditing(null)} title="Редактировать">
        <Input label="Название" value={editTitle} onChange={setEditTitle} placeholder="Заголовок контента" />
        <Input label="Описание" value={editDesc} onChange={setEditDesc} textarea rows={3} placeholder="Описание под сообщением..." />
        <Input label="Цена (Stars ⭐)" value={editPrice} onChange={setEditPrice} type="number" placeholder="150" />
        <Button fullWidth onClick={saveEdit}>Сохранить</Button>
      </BottomSheet>
    </div>
  )
}
