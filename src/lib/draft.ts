// 完工报告离线草稿（含照片 base64，存 IndexedDB，避免 localStorage 配额限制）
import { idbPut, idbGetAll, idbDelete } from './idb'
import type { Part } from '../types'

export interface DraftPhoto { dataUrl: string; caption: string }
export interface CompleteDraft {
  diagnosis: string; workDone: string; parts: Part[]
  downtimeMin: number; recovered: boolean; photos: DraftPhoto[]
  savedAt: number
}

const key = (orderId: string) => `draft-${orderId}`

export async function saveDraft(orderId: string, d: Omit<CompleteDraft, 'savedAt'>) {
  await idbPut('photos', { key: key(orderId), ...d, savedAt: Date.now() })
}
export async function loadDraft(orderId: string): Promise<CompleteDraft | null> {
  const all = await idbGetAll<{ key: string } & CompleteDraft>('photos')
  return all.find(x => x.key === key(orderId)) || null
}
export async function clearDraft(orderId: string) { await idbDelete('photos', key(orderId)) }

export function emptyDraft(): CompleteDraft {
  return { diagnosis: '', workDone: '', parts: [], downtimeMin: 0, recovered: true, photos: [], savedAt: 0 }
}
