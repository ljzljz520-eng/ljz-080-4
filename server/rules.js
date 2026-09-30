// 业务规则：机型保养周期、故障码字典、距离计算、到期判定

export const MACHINE_TYPES = {
  excavator: { label: '挖掘机（挖机）', short: '挖机', color: '#ea580c' },
  crane: { label: '汽车起重机（吊车）', short: '吊车', color: '#2563eb' },
  roller: { label: '压路机', short: '压路机', color: '#0d9488' }
}

// 分级保养周期（按发动机/作业累计小时）
export const MAINT_RULES = {
  excavator: [
    { level: 'small', interval: 250, name: '一级保养', items: '更换机油、机油滤芯；检查履带张紧度、加注黄油' },
    { level: 'medium', interval: 500, name: '二级保养', items: '一级项目 + 燃油滤芯、空气滤芯、回转支承检查' },
    { level: 'major', interval: 1000, name: '三级大保养', items: '二级项目 + 更换液压油及全车滤芯、液压系统压力检测' }
  ],
  crane: [
    { level: 'small', interval: 200, name: '一级保养', items: '更换机油、机滤；检查支腿、钢丝绳润滑' },
    { level: 'medium', interval: 400, name: '二级保养', items: '一级项目 + 变幅/卷扬机构检查、燃油滤、空滤' },
    { level: 'major', interval: 800, name: '三级大保养', items: '二级项目 + 液压油更换、力矩限制器与制动器标定' }
  ],
  roller: [
    { level: 'small', interval: 200, name: '一级保养', items: '更换机油、机滤；振动轮加注润滑油、刮泥板检查' },
    { level: 'medium', interval: 400, name: '二级保养', items: '一级项目 + 燃油滤、空滤、振动频率复核' },
    { level: 'major', interval: 600, name: '三级大保养', items: '二级项目 + 液压油/振动马达检修、减震块探伤' }
  ]
}

// severity: critical 高危停机 / high 严重 / medium 一般 / low 提示
export const FAULT_CODES = {
  E101: { label: '发动机机油压力低', severity: 'critical', types: ['excavator', 'crane', 'roller'], advice: '立即停机检查机油量与机油泵，禁止继续作业' },
  E204: { label: '冷却液温度过高（开锅）', severity: 'high', types: ['excavator', 'crane', 'roller'], advice: '怠速降温后检查防冻液、节温器与水箱' },
  E305: { label: '液压油回油滤芯堵塞', severity: 'high', types: ['excavator', 'crane'], advice: '更换回油滤芯，检查液压油污染度' },
  C402: { label: '卷扬制动器磨损预警', severity: 'high', types: ['crane'], advice: '测量制动片厚度，必要时更换并排空气路' },
  R601: { label: '振动马达轴承温度异常', severity: 'high', types: ['roller'], advice: '检查润滑与轴承间隙，避免高频连续振动' },
  F700: { label: '燃油含水报警', severity: 'medium', types: ['excavator', 'crane', 'roller'], advice: '排放油水分离器积水，更换柴油滤芯' },
  W810: { label: '电瓶电压偏低', severity: 'medium', types: ['excavator', 'crane', 'roller'], advice: '检查发电机皮带与电瓶健康度' },
  E512: { label: '远程通讯模块离线', severity: 'low', types: ['excavator', 'crane', 'roller'], advice: '检查 GPS 终端供电与天线，复位模块' }
}

export const SEVERITY = {
  critical: { label: '高危', rank: 4, weight: 60, color: '#dc2626' },
  high: { label: '严重', rank: 3, weight: 35, color: '#ea580c' },
  medium: { label: '一般', rank: 2, weight: 15, color: '#ca8a04' },
  low: { label: '提示', rank: 1, weight: 5, color: '#64748b' }
}

export function haversineKm(a, b) {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const la1 = a.lat * Math.PI / 180, la2 = b.lat * Math.PI / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10
}

// 返回某设备当前到期保养：elapsed=当前小时-上次保养小时
export function evaluateMaintenance(machine) {
  const rules = MAINT_RULES[machine.type] || []
  const elapsed = Math.max(0, (machine.hours || 0) - (machine.lastMaintHours || 0))
  const due = rules.filter(r => elapsed >= r.interval)
  if (!due.length) return { elapsed, due: null, overdueHours: 0 }
  const current = due[due.length - 1] // 已到期的最高级别
  return { elapsed, due: current, overdueHours: elapsed - current.interval, dueList: due }
}
