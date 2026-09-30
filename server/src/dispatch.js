// 派单服务：评估到期保养 -> 防重复 -> 就近派单 -> 生成工单
import { db, nextId, persist } from './db.js';
import { evaluateMachine, findBestTechnician } from './engine.js';

function activeCounts() {
  const map = {};
  for (const wo of db().workOrders) {
    if (['dispatched', 'enroute', 'onsite', 'in_progress'].includes(wo.status)) {
      map[wo.technicianId] = (map[wo.technicianId] || 0) + 1;
    }
  }
  return map;
}

// 同一设备、同一触发项（某个周期档 / 同一组故障码）存在未关闭工单时不重复派单
function alreadyOpen(machineId, triggerKey) {
  return db().workOrders.some(
    (wo) =>
      wo.machineId === machineId &&
      wo.triggerKey === triggerKey &&
      !['done', 'confirmed', 'cancelled'].includes(wo.status)
  );
}

export function dispatchForMachine(machine, { maxKm = 50 } = {}) {
  const d = db();
  const site = d.sites.find((s) => s.id === machine.siteId);
  if (!site) return { machineId: machine.id, skipped: '工地不存在' };

  const findings = evaluateMachine(machine);
  if (!findings.length) return { machineId: machine.id, created: 0, reason: '暂无到期项目' };

  const created = [];
  const noTech = [];
  const counts = activeCounts();

  for (const f of findings) {
    if (alreadyOpen(machine.id, f.triggerKey)) continue;

    const best = findBestTechnician(d.technicians, site, machine.type, counts, { maxKm });
    if (!best) {
      noTech.push(f.title);
      continue;
    }

    const now = new Date().toISOString();
    const wo = {
      id: nextId('workOrders', 'WO'),
      status: 'dispatched',
      priority: f.priority,
      kind: f.kind,
      triggerKey: f.triggerKey,
      title: f.title,
      checklist: f.checklist,
      faultCodes: f.faultCodes || [],
      machineId: machine.id,
      machineName: machine.name,
      machineType: machine.type,
      siteId: site.id,
      siteName: site.name,
      location: site.location,
      address: site.address,
      customerId: site.customerId,
      customerName: site.customerName,
      technicianId: best.tech.id,
      technicianName: best.tech.name,
      technicianPhone: best.tech.phone,
      distanceKm: Number(best.km.toFixed(1)),
      hours: machine.hours,
      materials: [],
      photos: [],
      downtimeMinutes: 0,
      notes: '',
      checklistDone: [],
      events: [
        { at: now, type: 'created', text: `系统自动派单：${best.tech.name}（距工地 ${best.km.toFixed(1)} km）` }
      ],
      createdAt: now,
      updatedAt: now
    };
    d.workOrders.push(wo);
    counts[best.tech.id] = (counts[best.tech.id] || 0) + 1;
    created.push({ id: wo.id, title: wo.title, technician: wo.technicianName });
  }

  persist();
  return { machineId: machine.id, machineName: machine.name, created, noAvailableTech: noTech };
}

export function runDispatchAll(options = {}) {
  const results = [];
  for (const m of db().machines) results.push(dispatchForMachine(m, options));
  return results;
}
