// 保养周期规则引擎 + 就近派单算法
export const MACHINE_TYPES = {
  excavator: { label: '挖掘机', unit: '台' },
  crane: { label: '吊车', unit: '台' },
  roller: { label: '压路机', unit: '台' }
};

// 按机型配置的保养周期（工作小时）
export const MAINTENANCE_RULES = {
  excavator: [
    { interval: 500, title: '小保养：机油+机滤更换', checklist: ['更换发动机机油及机滤', '检查履带张紧度', '润滑销轴'] },
    { interval: 1000, title: '液压系统保养：回油滤芯更换', checklist: ['更换液压油回油滤芯', '检查液压管路渗漏'] },
    { interval: 2000, title: '大保养：液压油+全车滤芯', checklist: ['更换液压油', '更换全部滤芯', '检查液压泵压力'] },
    { interval: 4000, title: '深度保养：齿轮油+回转支承', checklist: ['更换行走/回转齿轮油', '回转支承加注润滑脂'] }
  ],
  crane: [
    { interval: 500, title: '小保养：机油+机滤更换', checklist: ['更换发动机机油及机滤', '检查支腿油缸'] },
    { interval: 1200, title: '液压系统保养：滤芯更换', checklist: ['更换高压/回油滤芯', '检查变幅油缸'] },
    { interval: 2400, title: '大保养：液压油+变幅机构润滑', checklist: ['更换液压油', '变幅/卷扬机构润滑'] },
    { interval: 4800, title: '深度保养：减速机齿轮油', checklist: ['更换卷扬/回转减速机齿轮油', '钢丝绳探伤检查'] }
  ],
  roller: [
    { interval: 300, title: '小保养：机油+机滤更换', checklist: ['更换发动机机油及机滤', '清理空气滤芯'] },
    { interval: 900, title: '振动系统保养：振动轮润滑油', checklist: ['检查/更换振动轮润滑油', '检查减振块'] },
    { interval: 1800, title: '大保养：液压油+滤芯', checklist: ['更换液压油及滤芯', '检查振动马达'] }
  ]
};

// 故障码字典
export const FAULT_CODES = {
  E101: { label: '机油压力低', severity: 'critical' },
  E102: { label: '冷却液温度过高', severity: 'critical' },
  E201: { label: '液压油位低', severity: 'high' },
  E202: { label: '先导压力异常', severity: 'high' },
  E301: { label: '发动机转速异常', severity: 'high' },
  E401: { label: '振动马达过载', severity: 'high' },
  E501: { label: '力矩限制器报警', severity: 'critical' },
  E502: { label: '卷扬制动器故障', severity: 'critical' },
  E900: { label: 'CAN 总线通讯故障', severity: 'medium' }
};

const UNKNOWN_FAULT = { label: '未登记故障码', severity: 'high' };
export function describeFault(code) {
  return FAULT_CODES[code] || { ...UNKNOWN_FAULT, label: `未知故障码 ${code}` };
}

// 判断某台设备当前到期的保养项 + 故障维修需求
export function evaluateMachine(machine) {
  const findings = [];
  const rules = MAINTENANCE_RULES[machine.type] || [];
  const last = machine.lastServiceHours ?? 0;
  const hours = machine.hours ?? 0;

  for (const rule of rules) {
    const crossed = Math.floor(hours / rule.interval) > Math.floor(last / rule.interval);
    if (crossed) {
      findings.push({
        kind: 'maintenance',
        priority: rule.interval >= 2000 || machine.type === 'crane' && rule.interval >= 2400 ? 'high' : 'normal',
        triggerKey: `maint-${machine.type}-${rule.interval}`,
        title: `${rule.title}（${rule.interval}h 周期）`,
        ruleInterval: rule.interval,
        checklist: rule.checklist,
        dueHours: Math.ceil(hours / rule.interval) * rule.interval
      });
    }
  }

  const codes = (machine.faultCodes || []).filter(Boolean);
  if (codes.length) {
    const severity = codes.some((c) => (FAULT_CODES[c] || UNKNOWN_FAULT).severity === 'critical') ? 'critical' : 'high';
    findings.push({
      kind: 'repair',
      priority: severity === 'critical' ? 'urgent' : 'high',
      triggerKey: `repair-${[...codes].sort().join(',')}`,
      title: `故障维修：${codes.map((c) => `${c} ${describeFault(c).label}`).join('、')}`,
      faultCodes: codes,
      checklist: ['读取/清除故障码', '排查故障点', '试车验证']
    });
  }
  return findings;
}

const R_EARTH_KM = 6371;
export function distanceKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return R_EARTH_KM * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// 就近派单：机型技能匹配 -> 半径 -> 距离/在手工单/状态综合打分
export function findBestTechnician(technicians, site, machineType, activeCountByTech, { maxKm = 50 } = {}) {
  const candidates = technicians
    .filter((t) => t.active !== false)
    .filter((t) => (t.skills || []).includes(machineType))
    .map((t) => {
      const km = distanceKm(t.location, site.location);
      const load = activeCountByTech[t.id] || 0;
      const busyPenalty = t.status === 'busy' ? 15 : t.status === 'off' ? 40 : 0;
      return { tech: t, km, load, score: km + load * 8 + busyPenalty };
    })
    .filter((c) => c.km <= maxKm)
    .sort((a, b) => a.score - b.score);
  return candidates[0] || null;
}
