// 演示数据：上海及周边工地 / 技师 / 设备（部分设备预置在保养阈值前，点“推送模拟工况”即触发派单）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetDb, db, nextId, persist } from './db.js';
import { dispatchForMachine } from './dispatch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

const sites = [
  { id: 'SITE-001', name: '浦东机场扩建工地', customerId: 'C01', customerName: '上海浦建集团', address: '上海市浦东新区机场镇', location: { lat: 31.152, lng: 121.815 } },
  { id: 'SITE-002', name: '临港新城道路工地', customerId: 'C02', customerName: '临港市政公司', address: '上海市浦东新区临港大道', location: { lat: 30.92, lng: 121.93 } },
  { id: 'SITE-003', name: '青浦产业园工地', customerId: 'C03', customerName: '青浦建工', address: '上海市青浦区工业园', location: { lat: 31.18, lng: 121.1 } },
  { id: 'SITE-004', name: '昆山花桥工地', customerId: 'C04', customerName: '花桥城投', address: '江苏省昆山市花桥镇', location: { lat: 31.3, lng: 121.05 } }
];

const technicians = [
  { id: 'T-001', name: '王建国', phone: '13800000001', skills: ['excavator', 'crane'], location: { lat: 31.2, lng: 121.55 }, status: 'idle', active: true },
  { id: 'T-002', name: '李卫民', phone: '13800000002', skills: ['excavator', 'roller'], location: { lat: 31.03, lng: 121.23 }, status: 'busy', active: true },
  { id: 'T-003', name: '赵铁山', phone: '13800000003', skills: ['crane'], location: { lat: 31.38, lng: 121.25 }, status: 'idle', active: true },
  { id: 'T-004', name: '孙晓峰', phone: '13800000004', skills: ['roller', 'excavator'], location: { lat: 30.92, lng: 121.55 }, status: 'idle', active: true },
  { id: 'T-005', name: '周大勇', phone: '13800000005', skills: ['excavator', 'crane', 'roller'], location: { lat: 31.05, lng: 121.8 }, status: 'idle', active: true }
];

const machines = [
  { id: 'M-001', code: 'EX-001', name: '小松 PC200 挖掘机', type: 'excavator', siteId: 'SITE-001', hours: 498, lastServiceHours: 0, faultCodes: [] },
  { id: 'M-002', code: 'EX-002', name: '卡特 320D 挖掘机', type: 'excavator', siteId: 'SITE-003', hours: 995, lastServiceHours: 600, faultCodes: [] },
  { id: 'M-003', code: 'CR-001', name: '徐工 QY25K 吊车', type: 'crane', siteId: 'SITE-001', hours: 498, lastServiceHours: 0, faultCodes: [] },
  { id: 'M-004', code: 'CR-002', name: '三一 STC500 吊车', type: 'crane', siteId: 'SITE-004', hours: 2395, lastServiceHours: 2000, faultCodes: [] },
  { id: 'M-005', code: 'RO-002', name: '徐工 XS223J 压路机', type: 'roller', siteId: 'SITE-003', hours: 295, lastServiceHours: 0, faultCodes: [] },
  { id: 'M-006', code: 'EX-003', name: '日立 ZX240 挖掘机', type: 'excavator', siteId: 'SITE-002', hours: 1205, lastServiceHours: 500, faultCodes: ['E201'] },
  // 下列两单已有历史工单
  { id: 'M-007', code: 'RO-001', name: '柳工 CLG612 压路机', type: 'roller', siteId: 'SITE-002', hours: 302, lastServiceHours: 0, faultCodes: [] },
  { id: 'M-008', code: 'EX-004', name: '神钢 SK210 挖掘机', type: 'excavator', siteId: 'SITE-003', hours: 505, lastServiceHours: 500, faultCodes: [] }
];

function svgPlaceholder(label, color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><rect width="100%" height="100%" fill="${color}"/><text x="50%" y="48%" font-size="30" fill="#fff" text-anchor="middle" font-family="sans-serif">${label}</text><text x="50%" y="60%" font-size="18" fill="#e8eef5" text-anchor="middle" font-family="sans-serif">演示占位照片</text></svg>`;
}

function writeSvg(name, label, color) {
  fs.writeFileSync(path.join(UPLOAD_DIR, name), svgPlaceholder(label, color));
  return `/uploads/${name}`;
}

await resetDb({ sites, technicians, machines, workOrders: [], telemetry: [] });
const d = db();
const t = new Date().toISOString();

// 设备 M-006 已回传故障工况 -> 系统自动派单（1000h 保养 + 液压故障维修）
d.telemetry.push({ id: nextId('telemetry', 'TEL-'), machineId: 'M-006', code: 'EX-003', hours: 1205, faultCodes: ['E201'], siteId: 'SITE-002', receivedAt: t });
dispatchForMachine(d.machines.find((m) => m.id === 'M-006'));

// 一单待客户确认（压路机 300h 保养已完工上报）
writeSvg('demo-before.svg', '保养前：振动轮部位', '#8a94a6');
writeSvg('demo-after.svg', '保养后：更换润滑油', '#2f7d4f');
const pending = {
  id: nextId('workOrders', 'WO'),
  status: 'pending_confirm', priority: 'normal', kind: 'maintenance', triggerKey: 'maint-roller-300',
  title: '小保养：机油+机滤更换（300h 周期）',
  checklist: ['更换发动机机油及机滤', '清理空气滤芯'], checklistDone: ['更换发动机机油及机滤', '清理空气滤芯'],
  faultCodes: [], machineId: 'M-007', machineName: '柳工 CLG612 压路机', machineType: 'roller',
  siteId: 'SITE-002', siteName: '临港新城道路工地', location: sites[1].location, address: sites[1].address,
  customerId: 'C02', customerName: '临港市政公司',
  technicianId: 'T-004', technicianName: '孙晓峰', technicianPhone: '13800000004', distanceKm: 34.5, hours: 302,
  materials: [{ name: '柴机油 CI-4 15W40', spec: '18L', qty: 1, unit: '桶' }, { name: '机油滤芯', spec: 'JX0810', qty: 1, unit: '个' }],
  photos: [{ url: '/uploads/demo-before.svg', filename: 'before.svg' }, { url: '/uploads/demo-after.svg', filename: 'after.svg' }],
  downtimeMinutes: 95, notes: '机滤密封圈老化一并更换，热车试车油压正常。',
  events: [
    { at: t, type: 'created', text: '系统自动派单：孙晓峰（距工地 34.5 km）' },
    { at: t, type: 'report', text: '技师完工上报：停机 95 分钟，用料 2 项，照片 2 张' }
  ],
  createdAt: t, completedAt: t, updatedAt: t
};
d.workOrders.push(pending);

// 一单已确认恢复作业（历史）
const done = {
  ...structuredClone(pending),
  id: nextId('workOrders', 'WO'), status: 'confirmed', triggerKey: 'maint-excavator-500-done',
  title: '小保养：机油+机滤更换（500h 周期）', kind: 'maintenance',
  checklist: ['更换发动机机油及机滤', '检查履带张紧度', '润滑销轴'], checklistDone: ['更换发动机机油及机滤', '检查履带张紧度', '润滑销轴'],
  faultCodes: [], machineId: 'M-008', machineName: '神钢 SK210 挖掘机', machineType: 'excavator',
  siteId: 'SITE-003', siteName: '青浦产业园工地', location: sites[2].location, address: sites[2].address,
  customerId: 'C03', customerName: '青浦建工', technicianId: 'T-002', technicianName: '李卫民', technicianPhone: '13800000002',
  distanceKm: 17.2, hours: 500,
  materials: [{ name: '机油滤芯', spec: '通用型', qty: 1, unit: '个' }], photos: [], downtimeMinutes: 60, notes: '例行小保养。',
  confirmation: { resume: true, comment: '已试机，恢复作业', at: t, confirmer: '青浦建工-设备科' },
  events: [{ at: t, type: 'created', text: '系统自动派单：李卫民（距工地 17.2 km）' }, { at: t, type: 'confirm', text: '客户确认恢复作业' }],
  completedAt: t
};
d.workOrders.push(done);

await persist();
console.log('Seed done: %d sites, %d technicians, %d machines, %d work orders', d.sites.length, d.technicians.length, d.machines.length, d.workOrders.length);
