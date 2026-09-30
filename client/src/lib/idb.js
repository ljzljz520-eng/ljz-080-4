// IndexedDB：工单快照（离线可读）+ Outbox 发件箱（断网可填，联网自动同步）
const DB_NAME = 'fleetcare';
const DB_VERSION = 1;
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, run) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        const r = run(s);
        t.oncomplete = () => resolve(r?.result);
        t.onerror = () => reject(t.error);
      })
  );
}

export const kvSet = (key, value) => tx('kv', 'readwrite', (s) => s.put(value, key));
export const kvGet = (key) => tx('kv', 'readonly', (s) => s.get(key));
export const outboxAdd = (item) => tx('outbox', 'readwrite', (s) => s.put(item)).then(() => item);
export const outboxAll = () => tx('outbox', 'readonly', (s) => s.getAll());
export const outboxPut = (item) => tx('outbox', 'readwrite', (s) => s.put(item));
export const outboxDel = (id) => tx('outbox', 'readwrite', (s) => s.delete(id));
