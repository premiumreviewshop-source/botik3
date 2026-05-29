import type { Bot, PPVItem, AIModel, GeneratedPhoto, ReadyPost, SavedPrompt, SavedFooter, PlanItem, Transaction } from '../types'

const BASE = '/api'

function tgInitData(): string {
  return (window as any).Telegram?.WebApp?.initData ?? ''
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const initData = tgInitData()
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(initData ? { 'x-telegram-init-data': initData } : {}),
    },
    ...init,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string }
    throw new Error(err.error ?? res.statusText)
  }
  return res.json()
}

const get = <T>(path: string) => req<T>(path)
const post = <T>(path: string, body: object) => req<T>(path, { method: 'POST', body: JSON.stringify(body) })
const patch = <T>(path: string, body: object) => req<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
const put = <T>(path: string, body: object) => req<T>(path, { method: 'PUT', body: JSON.stringify(body) })
const del = <T>(path: string) => req<T>(path, { method: 'DELETE' })

// Bots
export const api = {
  bots: {
    list: () => get<Bot[]>('/bots'),
    add: (data: { name?: string; handle?: string; token: string; chatId?: string }) => post<Bot>('/bots', data),
    update: (id: string, data: Partial<Pick<Bot, 'name' | 'handle' | 'isActive' | 'modules'> & { chatId: string }>) =>
      patch<{ ok: boolean }>(`/bots/${id}`, data),
    remove: (id: string) => del<{ ok: boolean }>(`/bots/${id}`),
    stats: (id: string, period: 'today' | 'week' | 'month') =>
      get<{ messages: number; uniqueChatters: number; ppvSold: number; ppvRevenue: number; postsPublished: number }>(`/bots/${id}/stats?period=${period}`),
  },

  analytics: {
    get: (period: 'today' | 'week' | 'month') =>
      get<{
        period: string; aiMessages: number; aiChats: number; aiAvgSec: number
        ppvSold: number; ppvRevenue: number; ppvViews: number
        postsPublished: number; postsReach: number; postsInPlan: number; botsActive: number; spark: number[]
      }>(`/analytics?period=${period}`),
    heatmap: () => get<{ matrix: number[][] }>('/analytics/heatmap'),
  },

  models: {
    list: () => get<AIModel[]>('/models'),
    get: (id: string) => get<AIModel>(`/models/${id}`),
    create: (data: { name: string; imageUrls: string[] }) => post<{ id: string; name: string; status: string; triggerWord: string }>('/models', data),
    remove: (id: string) => del<{ ok: boolean }>(`/models/${id}`),
  },

  generate: {
    list: () => get<GeneratedPhoto[]>('/generate'),
    start: (data: { prompt: string; modelId?: string }) => post<{ id: string; status: string }>('/generate', data),
    get: (id: string) => get<GeneratedPhoto>(`/generate/${id}`),
    remove: (id: string) => del<{ ok: boolean }>(`/generate/${id}`),
  },

  posts: {
    list: () => get<ReadyPost[]>('/posts'),
    add: (data: Partial<ReadyPost>) => post<{ id: string }>('/posts', data),
    update: (id: string, data: Partial<ReadyPost>) => put<{ ok: boolean }>(`/posts/${id}`, data),
    remove: (id: string) => del<{ ok: boolean }>(`/posts/${id}`),
    removeMany: (ids: string[]) => post<{ ok: boolean }>('/posts/delete-many', { ids }),
  },

  ppv: {
    list: () => get<PPVItem[]>('/ppv'),
    add: (data: Omit<PPVItem, 'id' | 'purchases'>) => post<{ id: string }>('/ppv', data),
    update: (id: string, data: Partial<PPVItem>) => put<{ ok: boolean }>(`/ppv/${id}`, data),
    remove: (id: string) => del<{ ok: boolean }>(`/ppv/${id}`),
  },

  autopost: {
    getPlan: () => get<PlanItem[]>('/autopost/plan'),
    savePlan: (plan: PlanItem[]) => post<{ ok: boolean }>('/autopost/plan', plan),
    updateItem: (id: string, data: { time?: string; status?: string }) =>
      patch<{ ok: boolean }>(`/autopost/plan/${id}`, data),
    publishNow: (id: string) => post<{ ok: boolean }>(`/autopost/plan/${id}/publish`, {}),
  },

  prompts: {
    list: () => get<SavedPrompt[]>('/prompts'),
    add: (data: { name: string; text: string }) => post<{ id: string }>('/prompts', data),
    remove: (id: string) => del<{ ok: boolean }>(`/prompts/${id}`),
  },

  footers: {
    list: () => get<SavedFooter[]>('/footers'),
    add: (data: { name: string; text: string; gapLines: number }) => post<{ id: string }>('/footers', data),
    remove: (id: string) => del<{ ok: boolean }>(`/footers/${id}`),
  },

  transactions: {
    list: () => get<Transaction[]>('/transactions'),
  },

  captions: {
    generate: (data: { prompt?: string; lang: string; type: 'hot' | 'custom'; footerText?: string; gapLines?: number }) =>
      post<{ caption: string }>('/captions/generate', data),
  },
}

export default api
