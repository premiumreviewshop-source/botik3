export type Page =
  | 'home'
  | 'bots'
  | 'bots/add'
  | 'bots/detail'
  | 'balance'
  | 'referral'
  | 'settings'
  | 'module/aichat-ppv'
  | 'module/aichat'
  | 'module/ppv'
  | 'module/models'
  | 'module/models/create'
  | 'module/models/detail'
  | 'module/analytics'
  | 'module/autopost'
  | 'module/autopost/captions'
  | 'module/autopost/schedule'
  | 'module/autopost/analytics'
  | 'admin'

export interface KlingJob {
  id: string
  status: 'pending' | 'processing' | 'ready' | 'failed'
  resultVideoUrl: string
  createdAt: string
}

export type NavDir = 'forward' | 'back' | 'tab'

export interface ModuleSubscription {
  module_name: 'analytics' | 'autopost'
  plan: 'month' | '3mo' | 'year'
  amount_usd: number
  expires_at: string
  created_at: string
}

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
  minPriceStars: number
  bargainingEnabled: boolean
  triggers: string[]
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
  type: 'topup' | 'spend' | 'referral' | 'referral_payout'
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
  status?: 'carousel' | 'processing' | 'ready' | 'failed'
  prompt?: string
  cost?: number
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

export interface SavedEmoji {
  id: string
  stickerId: string
  label: string
  alt: string  // the exact Unicode emoji character required by Telegram (documentAttributeCustomEmoji.alt)
}

export interface Channel {
  id: string
  username: string
  chatId: number | null
  title: string
  photoUrl: string | null
  createdAt: string
}

export type PlanStatus = 'scheduled' | 'published' | 'cancelled'
export interface PlanItem {
  id: string
  date: string
  dateObj: string
  time: string
  category: 'free' | 'paid' | 'fix'
  postId?: string
  postUrl?: string
  postCaption?: string
  price?: number
  status: PlanStatus
  publishedAt?: string
  editing: boolean
}
