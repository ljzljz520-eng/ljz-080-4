import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
const DB_FILE = path.join(DATA_DIR, 'db.json')

// ---- 种子数据 ---------------------------------------------------------------
function seed() {
  const now = Date.now()
  const sites = [
    { id: 'site-01', name: '滨江大道高架工地', contact: '周工', phone: '13900000101', address: '上海市浦东新区滨江大道', lat: 31.22, lng: 121.52 },
    { id: 'site-02', name: '临港产业园二期', contact: '吴姐', phone: '139000000202', address: '上海市浦东新区临港大道', lat: 30.91, lng: 121.93 },
    { id: 'site-03', name: '昆山花桥住宅项目', contact: '陈经理', phone: '13900000303', address: '江苏省昆山市花桥镇', lat: 31.30, lng: 121.13 },
    { id: 'site-04', name: '苏州工业园管廊', contact: '刘队', phone: '13900000404', address: '江苏省苏州市苏州工业园区', lat: 31.32, lng: 120.68 }
  ]

  const machines = [
    // 挖机：距上次保养已 263h -> 一级保养到期；带故障码 E305
    { id: 'm-001', code: 'EX-SH-001', brand: '三一 SY215C', type: 'excavator', siteId: 'site-01',
      hours: 5263, lastMaintHours: 5000, faultCodes: ['E305', 'F700'], online: true,
      lat: 31.221, lng: 121.519, updatedAt: now - 1000 * 60 * 12 },
    // 吊车：距上次 820h -> 三级大保养到期；C402 高危制动器
    { id: 'm-002', code: 'CR-SH-014', brand: '徐工 QY25K5', type: 'crane', siteId: 'site-02',
      hours: 4820, lastMaintHours: 4000, faultCodes: ['C402'], online: true,
      lat: 30.912, lng: 121.928, updatedAt: now - 1000 * 60 * 40 },
    // 压路机：距上次 405h -> 二级保养到期，无故障
    { id: 'm-003', code: 'RL-SZ-007', brand: '徐工 XS223J', type: 'roller', siteId: 'site-04',
      hours: 2405, lastMaintHours: 2000, faultCodes: [], online: true,
      lat: 31.325, lng: 120.675, updatedAt: now - 1000 * 60 * 90 },
    // 挖机：正常，仅 E512 低危通讯
    { id: 'm-004', code: 'EX-KS-022', brand: '卡特 CAT320', type: 'excavator', siteId: 'site-03',
      hours: 3120, lastMaintHours: 3000, faultCodes: ['E512'], online: false,
      lat: 31.298, lng: 121.131, updatedAt: now - 1000 * 60 * 60 * 26 },
    // 吊车：机油压力低 critical，立即派单
    { id: 'm-005', code: 'CR-SH-031', brand: '中联 ZTC250', type: 'crane', siteId: 'site-01',
      hours: 6095, lastMaintHours: 6000, faultCodes: ['E101'], online: true,
      lat: 31.215, lng: 121.525, updatedAt: now - 1000 * 60 * 3 }
  ]

  const technicians = [
    { id: 't-01', name: '张师傅', phone: '13800000101', skills: ['excavator', 'crane'],
      lat: 31.23, lng: 121.50, online: true, completedToday: 2 },
    { id: 't-02', name: '李建国', phone: '13800000202', skills: ['crane', 'roller'],
      lat: 30.95, lng: 121.90, online: true, completedToday: 1 },
    { id: 't-03', name: '王强', phone: '13800000303', skills: ['excavator', 'roller'],
      lat: 31.31, lng: 120.72, online: true, completedToday: 0 },
    { id: 't-04', name: '赵敏', phone: '13800000404', skills: ['excavator', 'crane', 'roller'],
      lat: 31.28, lng: 121.20, online: false, completedToday: 3 },
    { id: 't-05', name: '孙磊', phone: '13800000505', skills: ['roller', 'excavator'],
      lat: 31.33, lng: 120.66, online: true, completedToday: 1 }
  ]

  // 一条进行中的工单，方便技师端直接看到待处理
  const orders = [
    {
      id: 'wo-1001', code: 'BX20260930001', machineId: 'm-004', siteId: 'site-03',
      type: 'fault', title: '远程通讯模块离线', level: null,
      reason: { codes: ['E512'], overdueHours: 0 },
      status: 'enroute', technicianId: 't-03',
      createdAt: now - 1000 * 60 * 55, assignedAt: now - 1000 * 60 * 52,
      acceptedAt: now - 1000 * 60 * 45, enrouteAt: now - 1000 * 60 * 40,
      candidates: [
        { technicianId: 't-03', name: '王强', distanceKm: 1.7, score: 88, reason: '机型匹配 · 距离最近' },
        { technicianId: 't-01', name: '张师傅', distanceKm: 36.2, score: 61, reason: '机型匹配 · 距离较远' }
      ],
      report: null, confirmation: null, timeline: [
        { t: now - 1000 * 60 * 55, event: 'created', label: '设备数据同步触发工单' },
        { t: now - 1000 * 60 * 52, event: 'assigned', label: '系统自动派单：王强' },
        { t: now - 1000 * 60 * 45, event: 'accepted', label: '技师已接单' },
        { t: now - 1000 * 60 * 40, event: 'enroute', label: '技师已出发' }
      ]
    }
  ]

  return {
    meta: { createdAt: now, seq: 1001 },
    sites, machines, technicians, orders,
    parts: [
      { id: 'p-01', name: '机油滤芯', spec: '原厂', unit: '个' },
      { id: 'p-02', name: '柴油机油 CI-4 15W-40', spec: '18L/桶', unit: '桶' },
      { id: 'p-03', name: '液压油回油滤芯', spec: '适配 SY215', unit: '个' },
      { id: 'p-04', name: '空气滤芯', spec: '内外芯套装', unit: '套' },
      { id: 'p-05', name: '柴油滤芯', spec: '油水分离器', unit: '个' },
      { id: 'p-06', name: '钢丝绳润滑脂', spec: '2kg', unit: '桶' },
      { id: 'p-07', name: '卷扬制动片', spec: 'QY25K5 专用', unit: '副' },
      { id: 'p-08', name: '液压油 L-HM46', spec: '200L', unit: '桶' }
    ]
  }
}

// ---- 存取 -------------------------------------------------------------------
export function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(seed(), null, 2))
}

export function load() {
  ensureDb()
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'))
}

export function save(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2))
}

export function resetDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  const db = seed()
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2))
  console.log('✅ 数据已重置，共 %d 台设备 / %d 名技师 / %d 张工单',
    db.machines.length, db.technicians.length, db.orders.length)
}

if (process.argv[1] && process.argv[1].endsWith('db.js')) resetDb()
