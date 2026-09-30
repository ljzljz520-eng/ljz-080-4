import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, nextId, persist } from './db.js';
import { MACHINE_TYPES, MAINTENANCE_RULES, FAULT_CODES } from './engine.js';
import { dispatchForMachine, runDispatchAll } from './dispatch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));

const nowIso = () => new Date().toISOString();

// ---------- 幂等：离线上报/重试可能重复投递，按 clientReqId 去重 ----------
function idempotent(handler) {
  return async (req, res) => {
    const key = req.header('x-client-req-id') || req.body?.clientReqId;
    const store = db().reqIds || (db().reqIds = {});
    if (key && store[key]) {
      res.set('X-Idempotent-Replay', '1');
      return res.json(store[key]);
    }
    // 拦截 json：成功响应登记幂等；同时包一层 status，避免 res.status(409).json 产生新对象绕过拦截
    const origJson = res.json.bind(res);
    res.json = (body) => {
      if (key && res.statusCode >= 200 && res.statusCode < 300) store[key] = body;
      return origJson(body);
    };
    const origStatus = res.status.bind(res);
    res.status = (code) => {
      const r = origStatus(code);
      if (r !== res) r.json = res.json.bind(res);
      return r;
    };
    try {
      await handler(req, res);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  };
}

const addEvent = (wo, type, text) => {
  wo.events.push({ at: nowIso(), type, text });
  wo.updatedAt = nowIso();
};

const publicOrder = (wo) => wo;

// ---------- 基础数据 ----------
app.get('/api/meta', (_req, res) => {
  res.json({ machineTypes: MACHINE_TYPES, rules: MAINTENANCE_RULES, faultCodes: FAULT_CODES });
});

app.get('/api/sites', (_req, res) => res.json(db().sites));
app.post('/api/sites', (req, res) => {
  const { name, customerName, customerId, address, lat, lng } = req.body;
  if (!name || lat == null || lng == null) return res.status(400).json({ error: '工地名称与坐标必填' });
  const site = { id: nextId('sites', 'SITE-'), name, customerName: customerName || '', customerId: customerId || '', address: address || '', location: { lat: +lat, lng: +lng } };
  db().sites.push(site);
  persist();
  res.json(site);
});

app.get('/api/machines', (_req, res) => res.json(db().machines));
app.post('/api/machines', (req, res) => {
  const { code, name, type, siteId, hours, lastServiceHours } = req.body;
  if (!code || !MACHINE_TYPES[type]) return res.status(400).json({ error: '设备编码与机型必填' });
  if (db().machines.some((m) => m.code === code)) return res.status(409).json({ error: '设备编码已存在' });
  const machine = { id: nextId('machines', 'M-'), code, name: name || code, type, siteId: siteId || null, hours: +hours || 0, lastServiceHours: +lastServiceHours || 0, faultCodes: [], updatedAt: nowIso() };
  db().machines.push(machine);
  persist();
  res.json(machine);
});

app.get('/api/technicians', (_req, res) => res.json(db().technicians));
app.post('/api/technicians', (req, res) => {
  const { name, phone, skills, lat, lng, status } = req.body;
  if (!name || !Array.isArray(skills) || lat == null || lng == null) return res.status(400).json({ error: '姓名、技能机型、坐标必填' });
  const t = { id: nextId('technicians', 'T-'), name, phone: phone || '', skills, location: { lat: +lat, lng: +lng }, status: status || 'idle', active: true };
  db().technicians.push(t);
  persist();
  res.json(t);
});

// ---------- 租赁公司工况同步（小时数 / 故障码 / 所在工地）----------
app.post('/api/telemetry', idempotent(async (req, res) => {
  const records = Array.isArray(req.body?.records) ? req.body.records : [req.body];
  const results = [];
  for (const r of records) {
    if (!r?.code) {
      results.push({ skipped: '缺少设备编码 code' });
      continue;
    }
    let machine = db().machines.find((m) => m.code === r.code);
    if (!machine) {
      if (!r.type || !MACHINE_TYPES[r.type]) {
        results.push({ code: r.code, skipped: '新设备缺少机型 type，无法建档' });
        continue;
      }
      machine = { id: nextId('machines', 'M-'), code: r.code, name: r.name || r.code, type: r.type, siteId: null, hours: 0, lastServiceHours: 0, faultCodes: [] };
      db().machines.push(machine);
    }
    if (r.name) machine.name = r.name;
    if (r.type && MACHINE_TYPES[r.type]) machine.type = r.type;
    if (r.siteCode) {
      const site = db().sites.find((s) => s.name === r.siteCode || s.id === r.siteCode);
      if (site) machine.siteId = site.id;
    } else if (r.siteId) {
      machine.siteId = r.siteId;
    }
    if (typeof r.hours === 'number') machine.hours = r.hours;
    if (typeof r.lastServiceHours === 'number') machine.lastServiceHours = r.lastServiceHours;
    if (Array.isArray(r.faultCodes)) machine.faultCodes = r.faultCodes;
    machine.updatedAt = nowIso();

    const tel = { id: nextId('telemetry', 'TEL-'), machineId: machine.id, code: machine.code, hours: machine.hours, faultCodes: machine.faultCodes, siteId: machine.siteId, receivedAt: nowIso() };
    db().telemetry.push(tel);
    if (db().telemetry.length > 500) db().telemetry.shift();

    // 同步后立即评估并自动派单
    const dispatch = dispatchForMachine(machine, { maxKm: req.body?.maxKm ?? 60 });
    results.push({ code: machine.code, hours: machine.hours, faultCodes: machine.faultCodes, dispatch });
  }
  persist();
  res.json({ received: results.length, results });
}));

// ---------- 手动触发全盘扫描派单 ----------
app.post('/api/dispatch/run', (_req, res) => {
  const results = runDispatchAll({ maxKm: 60 });
  const created = results.flatMap((r) => r.created || []);
  res.json({ results, createdCount: created.length, created });
});

// ---------- 工单 ----------
app.get('/api/work-orders', (req, res) => {
  let list = [...db().workOrders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const { status, technicianId, siteId, machineId } = req.query;
  if (status) list = list.filter((w) => w.status === status);
  if (technicianId) list = list.filter((w) => w.technicianId === technicianId);
  if (siteId) list = list.filter((w) => w.siteId === siteId);
  if (machineId) list = list.filter((w) => w.machineId === machineId);
  res.json(list);
});

app.get('/api/work-orders/:id', (req, res) => {
  const wo = db().workOrders.find((w) => w.id === req.params.id);
  if (!wo) return res.status(404).json({ error: '工单不存在' });
  res.json(wo);
});

const FLOW = ['dispatched', 'accepted', 'enroute', 'onsite', 'in_progress'];
app.post('/api/work-orders/:id/transition', idempotent(async (req, res) => {
  const wo = db().workOrders.find((w) => w.id === req.params.id);
  if (!wo) return res.status(404).json({ error: '工单不存在' });
  const { to } = req.body || {};
  if (![...FLOW, 'cancelled'].includes(to)) return res.status(400).json({ error: '非法状态' });
  const labels = { dispatched: '已派单', accepted: '技师已接单', enroute: '前往工地', onsite: '已到场', in_progress: '作业中', cancelled: '已取消' };
  if (to !== 'cancelled' && FLOW.indexOf(to) < FLOW.indexOf(wo.status)) {
    return res.status(409).json({ error: `工单已处于「${labels[wo.status]}」，不能回退到「${labels[to]}」`, status: wo.status });
  }
  if (wo.status === to) {
    return res.status(409).json({ error: `工单已处于「${labels[wo.status]}」，无需重复操作`, status: wo.status });
  }
  wo.status = to;
  addEvent(wo, 'transition', labels[to]);
  persist();
  res.json(publicOrder(wo));
}));

// 技师完工上报（离线 Outbox 联网后投递，幂等）
app.post('/api/work-orders/:id/report', idempotent(async (req, res) => {
  const wo = db().workOrders.find((w) => w.id === req.params.id);
  if (!wo) return res.status(404).json({ error: '工单不存在' });
  const b = req.body || {};
  const materials = Array.isArray(b.materials) ? b.materials : [];
  if (!materials.length && !b.notes && !(b.photos || []).length) {
    return res.status(400).json({ error: '请至少填写用料、照片或作业说明' });
  }
  wo.materials = materials.map((m) => ({ name: m.name, spec: m.spec || '', qty: +m.qty || 0, unit: m.unit || '件' }));
  wo.photos = Array.isArray(b.photos) ? b.photos : [];
  wo.downtimeMinutes = Math.max(0, +b.downtimeMinutes || 0);
  wo.notes = b.notes || '';
  wo.checklistDone = Array.isArray(b.checklistDone) ? b.checklistDone : [];
  wo.status = 'pending_confirm';
  wo.completedAt = nowIso();
  addEvent(wo, 'report', `技师完工上报：停机 ${wo.downtimeMinutes} 分钟，用料 ${wo.materials.length} 项，照片 ${wo.photos.length} 张`);
  persist();
  res.json(publicOrder(wo));
}));

// 客户确认是否恢复作业
app.post('/api/work-orders/:id/confirm', idempotent(async (req, res) => {
  const wo = db().workOrders.find((w) => w.id === req.params.id);
  if (!wo) return res.status(404).json({ error: '工单不存在' });
  if (!['pending_confirm', 'confirmed', 'rejected'].includes(wo.status)) {
    return res.status(409).json({ error: '工单尚未完工，暂不能确认' });
  }
  const { resume, comment } = req.body || {};
  wo.confirmation = { resume: !!resume, comment: comment || '', at: nowIso(), confirmer: req.body?.confirmer || wo.customerName || '' };
  wo.status = resume ? 'confirmed' : 'rejected';
  addEvent(wo, 'confirm', resume ? `客户确认恢复作业${comment ? '：' + comment : ''}` : `客户认为未恢复，要求返工${comment ? '：' + comment : ''}`);
  if (resume) {
    const m = db().machines.find((x) => x.id === wo.machineId);
    if (m) {
      m.lastServiceHours = Math.max(m.lastServiceHours || 0, wo.hours || m.hours || 0);
      m.faultCodes = [];
      m.updatedAt = nowIso();
    }
  }
  persist();
  res.json(publicOrder(wo));
}));

// ---------- 照片：离线快照 base64，随 Outbox 上传 ----------
app.post('/api/photos', idempotent(async (req, res) => {
  const { dataUrl, filename } = req.body || {};
  const match = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/.exec(dataUrl || '');
  if (!match) return res.status(400).json({ error: '照片需为 data URL 格式' });
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const buf = Buffer.from(match[2], 'base64');
  if (buf.length > 12 * 1024 * 1024) return res.status(413).json({ error: '单张照片不能超过 12MB' });
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const rel = `/uploads/${id}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, `${id}.${ext}`), buf);
  res.json({ url: rel, filename: filename || `photo.${ext}`, size: buf.length });
}));

// ---------- 调度看板汇总 ----------
app.get('/api/dashboard', (_req, res) => {
  const d = db();
  const by = (key) => d.workOrders.reduce((acc, w) => ((acc[w[key]] = (acc[w[key]] || 0) + 1), acc), {});
  res.json({
    counts: {
      machines: d.machines.length,
      sites: d.sites.length,
      technicians: d.technicians.filter((t) => t.active !== false).length,
      workOrders: d.workOrders.length
    },
    ordersByStatus: by('status'),
    ordersByTechnician: by('technicianName'),
    openOrders: d.workOrders.filter((w) => !['done', 'confirmed', 'cancelled'].includes(w.status)).length,
    waitingConfirm: d.workOrders.filter((w) => w.status === 'pending_confirm').length
  });
});

// 生产环境：托管前端构建产物
const CLIENT_DIST = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get(/^(?!\/api|\/uploads).*/, (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`FleetCare API listening on http://localhost:${PORT}`));
