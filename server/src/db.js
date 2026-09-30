// 极简 JSON 文件持久化（零原生依赖，适合演示/单机部署；可平滑替换为 Postgres）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const EMPTY = {
  sites: [],
  machines: [],
  technicians: [],
  workOrders: [],
  telemetry: [],
  seq: { sites: 0, machines: 0, technicians: 0, workOrders: 0, telemetry: 0 }
};

let cache = null;
let writeTimer = null;
let writing = Promise.resolve();

function loadRaw() {
  try {
    const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return { ...structuredClone(EMPTY), ...raw, seq: { ...EMPTY.seq, ...(raw.seq || {}) } };
  } catch {
    return structuredClone(EMPTY);
  }
}

export function db() {
  if (!cache) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    cache = loadRaw();
  }
  return cache;
}

// 防抖落盘 + 串行写入，避免并发写坏文件
export function persist() {
  return new Promise((resolve) => {
    clearTimeout(writeTimer);
    writeTimer = setTimeout(() => {
      writing = writing.then(
        () =>
          new Promise((res) => {
            const tmp = `${DB_FILE}.tmp`;
            fs.writeFile(tmp, JSON.stringify(cache, null, 2), (err) => {
              if (err) {
                console.error('[db] persist failed:', err.message);
                return res();
              }
              fs.rename(tmp, DB_FILE, () => res());
            });
          })
      ).then(resolve);
    }, 50);
  });
}

export async function resetDb(data) {
  cache = { ...structuredClone(EMPTY), ...data, seq: { ...EMPTY.seq, ...(data.seq || {}) } };
  await persist();
}

export function nextId(collection, prefix) {
  const d = db();
  d.seq[collection] = (d.seq[collection] || 0) + 1;
  return `${prefix}${String(d.seq[collection]).padStart(3, '0')}`;
}
