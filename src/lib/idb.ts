// IndexedDB 薄封装：离线照片 & 发件箱存储（localStorage 存不下 base64 大图）
const DB_NAME = 'fleetcare-offline', DB_VERSION = 1
let dbp: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('outbox'))
        db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true })
      if (!db.objectStoreNames.contains('snapshots'))
        db.createObjectStore('snapshots', { keyPath: 'key' })
      if (!db.objectStoreNames.contains('photos'))
        db.createObjectStore('photos', { keyPath: 'key' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbp
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode)
    const req = run(t.objectStore(store))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }))
}

export async function idbPut(store: string, value: unknown): Promise<void> {
  const db = await open()
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(store, 'readwrite')
    t.objectStore(store).put(value)
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })
}

export function idbGetAll<T>(store: string): Promise<T[]> {
  return tx(store, 'readonly', s => s.getAll() as IDBRequest<T[]>)
}

export async function idbDelete(store: string, key: IDBValidKey): Promise<void> {
  const db = await open()
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(store, 'readwrite')
    t.objectStore(store).delete(key)
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })
}

export async function snapshotSave(key: string, value: unknown) {
  await idbPut('snapshots', { key, value, savedAt: Date.now() })
}
export async function snapshotGet<T>(key: string): Promise<{ value: T; savedAt: number } | null> {
  const all = await idbGetAll<{ key: string; value: T; savedAt: number }>('snapshots')
  return all.find(s => s.key === key) || null
}
