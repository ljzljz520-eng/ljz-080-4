import express from 'express'
import cors from 'cors'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { load, save } from './db.js'
import { assessMachine, rankTechnicians, chooseTechnician } from './dispatch.js'
import { MACHINE_TYPES, FAULT_CODES, MAINT_RULES, evaluateMaintenance } from './rules.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOAD_DIR = path.join(__dirname, 'data', 'uploads')
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const app = express()
app.use(cors())
app.use(express.json({ limit: '25mb' }))
app.use('/uploads', express.static(UPLOAD_DIR))

const STATUS_FLOW = ['assigned', 'accepted', 'enroute', 'arrived', 'completed', 'confirmed', 'rework']
const ACTION_LABEL = {
  created: '工单创建', assigned: '系统自动派单', accepted: '技师接单',
  enroute: '技师出发', arrived: '到达工地', completed: '维修保养完工',
  confirmed: '客户确认恢复作业', rework: '客户要求返工', reassigned: '改派技师'
}

let db = load()
const persist = () => save(db)
const now = () => Date.now()

function enrichMachine(m) {
  const site = db.sites.find(s => s.id === m.siteId) || null
  const activeOrder = db.orders.find(o => o.machineId === m.id &&
    !['completed', 'confirmed'].includes(o.status)) || null
  return { ...m, site, assessment: assessMachine(m), activeOrderId: activeOrder?.id || null }
}
function enrichOrder(o) {
  return {
    ...o,
    machine: db.machines.find(m => m.id === o.machineId) || null,
    site: db.sites.find(s => s.id === o.siteId) || null,
    technician: db.technicians.find(t => t.id === o.technicianId) || null
  }
}
const pushTimeline = (o, event) => { o.timeline.push({ t: now(), event, label: ACTION_LABEL[event] || event }) }
const genOrderCode = () => {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  db.meta.seq += 1
  return `BX${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${String(db.meta.seq).slice(-3)}`
}

// 对一台设备执行自动派单（若有未结工单则不重复派）
function autoDispatch(machine, { force = false } = {}) {
  const existing = db.orders.find(o => o.machineId === machine.id &&
    !['completed', 'confirmed'].includes(o.status))
  if (existing && !force) return { skipped: true, orderId: existing.id, reason: '已有进行中工单' }

  const assessment = assessMachine(machine)
  if (!assessment) return { skipped: true, reason: '无到期保养或故障' }

  const candidates = rankTechnicians(machine, db.technicians, {
    critical: assessment.fault?.severity === 'critical'
  })
  const picked = chooseTechnician(candidates)
  if (!picked) return { skipped: true, reason: '没有机型匹配的技师' }

  const order = {
    id: `wo-${db.meta.seq + 1}`, code: genOrderCode(),
    machineId: machine.id, siteId: machine.siteId,
    type: assessment.type, level: assessment.level, title: assessment.title,
    reason: assessment.reason, status: 'assigned', technicianId: picked.technicianId,
    candidates, createdAt: now(), assignedAt: now(),
    report: null, confirmation: null,
    timeline: [
      { t: now(), event: 'created', label: '设备数据同步触发：' + assessment.title },
      { t: now(), event: 'assigned', label: `系统自动派单：${picked.name}（${picked.distanceKm}km，评分 ${picked.score}）` }
    ]
  }
  db.orders.unshift(order)
  return { skipped: false, order }
}

// ---------- 基础数据 ----------
app.get('/health', (_req, res) => res.json({ ok: true, ts: now() }))

app.get('/api/meta', (_req, res) => {
  res.json({ machineTypes: MACHINE_TYPES, faultCodes: FAULT_CODES, maintRules: MAINT_RULES })
})

app.get('/api/overview', (_req, res) => {
  const machines = db.machines.map(enrichMachine)
  const needDispatch = machines.filter(m => m.assessment && !m.activeOrderId)
  const active = db.orders.filter(o => !['completed', 'confirmed'].includes(o.status))
  const pendingConfirm = db.orders.filter(o => o.status === 'completed')
  const critical = machines.filter(m => m.assessment?.fault?.severity === 'critical')
  const idleTech = db.technicians.filter(t => t.online && !active.some(o => o.technicianId === t.id))
  res.json({
    counts: {
      machines: machines.length, online: machines.filter(m => m.online).length,
      technicians: db.technicians.length, techOnline: db.technicians.filter(t => t.online).length,
      activeOrders: active.length, pendingConfirm: pendingConfirm.length,
      needDispatch: needDispatch.length, critical: critical.length
    },
    needDispatch: needDispatch.map(m => ({
      id: m.id, code: m.code, brand: m.brand, type: m.type, siteName: m.site?.name,
      title: m.assessment.title, faultSeverity: m.assessment.fault?.severity || null,
      overdueHours: m.assessment.reason.overdueHours
    })),
    pendingConfirm: pendingConfirm.map(enrichOrder).map(o => ({
      id: o.id, code: o.code, machineCode: o.machine?.code, siteName: o.site?.name,
      technicianName: o.technician?.name, completedAt: o.report?.completedAt
    })),
    idleTech: idleTech.map(t => ({ id: t.id, name: t.name, skills: t.skills }))
  })
})

app.get('/api/parts', (_req, res) => res.json(db.parts))

app.get('/api/sites', (_req, res) => res.json(db.sites))
app.post('/api/sites', (req, res) => {
  const { name, contact, phone, address, lat, lng } = req.body
  if (!name || lat == null || lng == null) return res.status(400).json({ error: '工地名称与坐标必填' })
  const site = { id: `site-${Date.now()}`, name, contact: contact || '', phone: phone || '', address: address || '', lat, lng }
  db.sites.push(site); persist()
  res.status(201).json(site)
})

// ---------- 设备 ----------
app.get('/api/machines', (req, res) => {
  let list = db.machines.map(enrichMachine)
  if (req.query.siteId) list = list.filter(m => m.siteId === req.query.siteId)
  if (req.query.type) list = list.filter(m => m.type === req.query.type)
  res.json(list)
})
app.get('/api/machines/:id', (req, res) => {
  const m = db.machines.find(x => x.id === req.params.id)
  if (!m) return res.status(404).json({ error: '设备不存在' })
  const orders = db.orders.filter(o => o.machineId === m.id).map(enrichOrder)
  res.json({ ...enrichMachine(m), maintenance: evaluateMaintenance(m), orders })
})

// 租赁公司遥测同步：新增/更新设备并自动派单
app.post('/api/telemetry', (req, res) => {
  const b = req.body
  if (!b.code || !b.type || !MACHINE_TYPES[b.type])
    return res.status(400).json({ error: '设备编号 code 与合法机型 type 必填' })
  if (b.lat == null || b.lng == null || !b.siteId)
    return res.status(400).json({ error: '所在工地 siteId 与坐标必填' })
  if (!db.sites.find(s => s.id === b.siteId)) return res.status(400).json({ error: '工地不存在' })

  let machine = db.machines.find(m => m.code === b.code)
  const isNew = !machine
  if (isNew) {
    machine = { id: `m-${Date.now()}`, code: b.code, lastMaintHours: b.hours || 0 }
    db.machines.push(machine)
  }
  Object.assign(machine, {
    brand: b.brand || machine.brand || '未登记品牌',
    type: b.type, siteId: b.siteId,
    hours: Number(b.hours ?? machine.hours ?? 0),
    faultCodes: Array.isArray(b.faultCodes) ? b.faultCodes : (machine.faultCodes || []),
    online: b.online !== false, lat: b.lat, lng: b.lng,
    updatedAt: now()
  })
  if (b.lastMaintHours != null) machine.lastMaintHours = Number(b.lastMaintHours)

  const result = autoDispatch(machine)
  persist()
  res.status(201).json({
    synced: true, isNew, machine: enrichMachine(machine),
    dispatch: result.skipped
      ? { dispatched: false, reason: result.reason, orderId: result.orderId || null }
      : { dispatched: true, orderId: result.order.id, technician: result.order.candidates.find(c => c.technicianId === result.order.technicianId)?.name || '已派技师' }
  })
})

// ---------- 技师 ----------
app.get('/api/technicians', (_req, res) => {
  const active = db.orders.filter(o => !['completed', 'confirmed'].includes(o.status))
  res.json(db.technicians.map(t => ({
    ...t,
    skills: t.skills,
    activeOrder: active.find(o => o.technicianId === t.id)?.id || null
  })))
})
app.patch('/api/technicians/:id', (req, res) => {
  const t = db.technicians.find(x => x.id === req.params.id)
  if (!t) return res.status(404).json({ error: '技师不存在' })
  const { lat, lng, online } = req.body
  if (lat != null) t.lat = Number(lat)
  if (lng != null) t.lng = Number(lng)
  if (online != null) t.online = !!online
  persist()
  res.json(t)
})

// ---------- 工单 ----------
app.get('/api/orders', (req, res) => {
  let list = db.orders.map(enrichOrder)
  if (req.query.technicianId) list = list.filter(o => o.technicianId === req.query.technicianId)
  if (req.query.status) list = list.filter(o => o.status === req.query.status)
  if (req.query.siteId) list = list.filter(o => o.siteId === req.query.siteId)
  res.json(list)
})
app.get('/api/orders/:id', (req, res) => {
  const o = db.orders.find(x => x.id === req.params.id)
  if (!o) return res.status(404).json({ error: '工单不存在' })
  res.json(enrichOrder(o))
})

app.post('/api/dispatch/scan', (_req, res) => {
  const results = []
  for (const m of db.machines) {
    const before = db.orders.length
    const r = autoDispatch(m)
    if (!r.skipped && db.orders.length > before) results.push({ machineCode: m.code, orderId: r.order.id })
  }
  persist()
  res.json({ dispatched: results.length, results })
})

app.post('/api/orders/:id/reassign', (req, res) => {
  const o = db.orders.find(x => x.id === req.params.id)
  if (!o) return res.status(404).json({ error: '工单不存在' })
  const machine = db.machines.find(m => m.id === o.machineId)
  const exclude = new Set([o.technicianId])
  const candidates = rankTechnicians(machine, db.technicians).filter(c => !exclude.has(c.technicianId))
  let picked = req.body.technicianId
    ? candidates.find(c => c.technicianId === req.body.technicianId)
    : (candidates.find(c => c.online) || candidates[0])
  if (!picked) return res.status(400).json({ error: '没有可改派的技师' })
  o.technicianId = picked.technicianId
  o.status = 'assigned'; o.assignedAt = now()
  o.acceptedAt = o.enrouteAt = o.arrivedAt = null
  o.candidates = candidates
  pushTimeline(o, 'reassigned')
  o.timeline[o.timeline.length - 1].label = `改派：${picked.name}（${picked.distanceKm}km）`
  persist()
  res.json(enrichOrder(o))
})

// 技师动作：accept / enroute / arrive
app.post('/api/orders/:id/:action(accept|enroute|arrive)', (req, res) => {
  const o = db.orders.find(x => x.id === req.params.id)
  if (!o) return res.status(404).json({ error: '工单不存在' })
  const map = { accept: ['assigned', 'accepted', 'acceptedAt'], enroute: ['accepted', 'enroute', 'enrouteAt'], arrive: ['enroute', 'arrived', 'arrivedAt'] }
  const [from, to, tsKey] = map[req.params.action]
  if (o.status !== from && !(req.params.action === 'accept' && o.status === 'rework'))
    return res.status(409).json({ error: `当前状态 ${o.status} 不能执行该操作` })
  o.status = to; o[tsKey] = now()
  if (req.params.action === 'accept' && o.status === 'rework') o.status = 'accepted'
  pushTimeline(o, to)
  persist()
  res.json(enrichOrder(o))
})

// 完工上报：用料 / 照片 / 停机时长 / 诊断 / 作业内容
app.post('/api/orders/:id/complete', (req, res) => {
  const o = db.orders.find(x => x.id === req.params.id)
  if (!o) return res.status(404).json({ error: '工单不存在' })
  if (!['arrived', 'rework'].includes(o.status))
    return res.status(409).json({ error: '需到达工地后才能完工上报' })
  const b = req.body
  if (!b.diagnosis?.trim()) return res.status(400).json({ error: '诊断说明必填' })
  if (!(b.parts || []).length && !b.workDone?.trim())
    return res.status(400).json({ error: '至少填写用料或作业内容' })

  const photos = []
  for (const p of b.photos || []) {
    if (!p.dataUrl) continue
    const m = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/.exec(p.dataUrl)
    if (!m) { photos.push({ ...p, url: p.url || '' }); continue }
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1]
    const fname = `${o.id}-${Date.now()}-${photos.length + 1}.${ext}`
    fs.writeFileSync(path.join(UPLOAD_DIR, fname), Buffer.from(m[2], 'base64'))
    photos.push({ url: `/uploads/${fname}`, caption: p.caption || '', takenAt: p.takenAt || now() })
  }

  o.report = {
    diagnosis: b.diagnosis.trim(),
    workDone: (b.workDone || '').trim(),
    parts: (b.parts || []).filter(p => p.name && p.qty > 0)
      .map(p => ({ name: p.name, spec: p.spec || '', qty: Number(p.qty), unit: p.unit || '' })),
    downtimeMin: Number(b.downtimeMin || 0),
    recovered: b.recovered !== false,
    photos,
    clientNote: (req.body.clientNote || '').trim() || undefined,
    completedAt: now()
  }
  o.status = 'completed'
  const tech = db.technicians.find(t => t.id === o.technicianId)
  if (tech) tech.completedToday = (tech.completedToday || 0) + 1
  pushTimeline(o, 'completed')
  persist()
  res.json(enrichOrder(o))
})

// 客户确认：恢复作业 / 返工
app.post('/api/orders/:id/confirm', (req, res) => {
  const o = db.orders.find(x => x.id === req.params.id)
  if (!o) return res.status(404).json({ error: '工单不存在' })
  if (o.status !== 'completed') return res.status(409).json({ error: '工单尚未完工，无法确认' })
  const recovered = req.body.recovered !== false
  o.confirmation = {
    recovered,
    contactName: (req.body.contactName || '').trim(),
    note: (req.body.note || '').trim(),
    confirmedAt: now()
  }
  o.status = recovered ? 'confirmed' : 'rework'
  pushTimeline(o, recovered ? 'confirmed' : 'rework')
  if (!recovered) o.timeline[o.timeline.length - 1].label = `客户要求返工：${o.confirmation.note || '未填原因'}`
  persist()
  res.json(enrichOrder(o))
})

// ---------- 生产静态托管 ----------
const distDir = path.join(__dirname, '..', 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get(/^\/(?!api|uploads|health).*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')))
}

const PORT = process.env.PORT || 4000
app.listen(PORT, () => console.log(`🛠  工擎云护 API 运行于 http://localhost:${PORT}`))
