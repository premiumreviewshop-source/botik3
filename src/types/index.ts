export type Page =
  | 'home'
  | 'bots'
  | 'bots/add'
  | 'balance'
  | 'referral'
  | 'settings'
  | 'module/aichat-ppv'
  | 'module/aichat'
  | 'module/ppv'
  | 'module/models'
  | 'module/models/create'
  | 'module/models/detail'
  | 'module/autopost'
  | 'module/autopost/captions'
  | 'module/autopost/schedule'

export type NavDir = 'forward' | 'back' | 'tab'

export interface TgUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
}

export interface Bot {
  id: string
  name: string
  handle: string
  isActive: boolean
  modules: string[]
  chatId?: string
  token?: string
}

export interface PPVItem {
  id: string
  botId: string
  title: string
  description: string
  priceStars: number
  mediaType: 'photo' | 'video'
  mediaUrl?: string
  purchases: number
}

export interface AIModel {
  id: string
  name: string
  status: 'processing' | 'ready' | 'failed'
  previewUrl?: string
  createdAt: string
}

export interface Transaction {
  id: string
  type: 'topup' | 'spend' | 'referral'
  amount: number
  description: string
  date: string
}

export interface GeneratedPhoto {
  id: string
  modelId: string
  modelName: string
  url: string
  createdAt: string
}

export interface StoragePhoto {
  id: string
  url: string
  label: string
}

export interface ReadyPost {
  id: string
  url?: string
  extraUrls?: string[]
  caption: string
  price?: number
  createdAt: string
}

export interface SavedPrompt {
  id: string
  name: string
  text: string
}

export interface SavedFooter {
  id: string
  name: string
  text: string
  gapLines: number
}
