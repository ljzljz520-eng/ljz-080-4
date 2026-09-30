import type { Machine, Meta, Order, Overview, Site, Technician } from '../types'
import { idbPut, idbGetAll, idbDelete, snapshotSave, snapshotGet } from './idb'

async function http<T>(url: string, options: RequestInit = {}, timeoutMs = 8000): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      ...options,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `请求失败 ${res.status}`)
    }
    return res.json() as Promise<T>
  } finally {
    clearTimeout(timer)
  }
}

// 带快照的 GET：联网返回新数据并存快照，断网返回最近快照
async function cachedGet<T>(key: string, url: string): Promise<{ data: T; stale: boolean }> {
  try {
    const data = await http<T>(url)
    await snapshotSave(key, data)
    return { data, stale: false }
  } catch {
    const snap = await snapshotGet<T>(key)
    if (snap) return { data: snap.value, stale: true }
    throw new Error('网络不可用，且本地无缓存')
  }
}

export interface OutboxItem {
  id?: number; orderId: string; kind: 'complete' | 'action'
  action?: string; body: unknown; createdAt: number; attempts: number; lastError?: string
}

export const api = {
  meta: () => http<Meta>('/api/meta'),
  overview: () => cachedGet<Overview>('overview', '/api/overview').then(r => r.data),
  overviewCached: () => cachedGet<Overview>('overview', '/api/overview'),
  machines: () => cachedGet<Machine[]>('machines', '/api/machines'),
  technicians: () => http<Technician[]>('/api/technicians'),
  sites: () => http<Site[]>('/api/sites'),
  parts: () => http<import('../types').PartCatalogItem[]>('/api/parts'),
  order: (id: string) => http<Order>(`/api/orders/${id}`),
  orders: (q = '') => cachedGet<Order[]>('orders', `/api/orders${q}`),
  orderCached: async (id: string) => {
    const key = `order-${id}`
    try {
      const data = await http<Order>(`/api/orders/${id}`)
      await snapshotSave(key, data)
      return { data, stale: false }
    } catch {
      const snap = await snapshotGet<Order>(key)
      if (snap) return { data: snap.value, stale: true }
      throw new Error('离线且本地无此工单缓存')
    }
  },
  telemetry: (b: unknown) => http('/api/telemetry', { method: 'POST', body: JSON.stringify(b) }),
  scanDispatch: () => http<{ dispatched: number }>('/api/dispatch/scan', { method: 'POST' }),
  act: (id: string, action: string, body: unknown = {}) =>
    http(`/api/orders/${id}/${action}`, { method: 'POST', body: JSON.stringify(body) }),
  complete: (id: string, body: unknown) =>
    http(`/api/orders/${id}/complete`, { method: 'POST', body: JSON.stringify(body) }, 20000),
  confirm: (id: string, body: unknown) =>
    http(`/api/orders/${id}/confirm`, { method: 'POST', body: JSON.stringify(body) }),
  reassign: (id: string, technicianId?: string) =>
    http(`/api/orders/${id}/reassign`, { method: 'POST', body: JSON.stringify({ technicianId }) }),
  setTechLocation: (id: string, patch: { lat?: number; lng?: number; online?: boolean }) =>
    http(`/api/technicians/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
}

// ---- 离线发件箱 -------------------------------------------------------------
export const outbox = {
  async add(item: Omit<OutboxItem, 'createdAt' | 'attempts'>) {
    await idbPut('outbox', { ...item, attempts: 0, createdAt: Date.now() })
    return idbGetAll<OutboxItem>('outbox').then(x => x.length)
  },
  list: () => idbGetAll<OutboxItem>('outbox'),
  async flush(onItem?: (x: OutboxItem, ok: boolean, err?: string) => void): Promise<number> {
    const items = await idbGetAll<OutboxItem>('outbox')
    let done = 0
    for (const it of items) {
      try {
        if (it.kind === 'complete') await api.complete(it.orderId, it.body)
        else await api.act(it.orderId, it.action!, it.body)
        await idbDelete('outbox', it.id!)
        done++
        onItem?.(it, true)
      } catch (e) {
        it.attempts += 1
        it.lastError = (e as Error).message
        await idbPut('outbox', it)
        onItem?.(it, false, it.lastError)
      }
    }
    return done
  }
}
