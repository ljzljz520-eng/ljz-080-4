// 自动派单引擎：技能匹配 + 就近优先 + 负载/严重度加权
import { haversineKm, evaluateMaintenance, FAULT_CODES, SEVERITY } from './rules.js'

function worstFault(codes = []) {
  let worst = null
  for (const c of codes) {
    const f = FAULT_CODES[c]
    if (f && (!worst || SEVERITY[f.severity].rank > SEVERITY[worst.severity].rank)) worst = { code: c, ...f }
  }
  return worst
}

// 评估设备是否需要生成工单
export function assessMachine(machine) {
  const m = evaluateMaintenance(machine)
  const fault = worstFault(machine.faultCodes)
  const reasons = []
  let type = null, level = null, title = ''

  if (fault) {
    type = 'fault'
    title = fault.label
    reasons.push({ kind: 'fault', text: `故障码 ${fault.code} · ${fault.label}（${SEVERITY[fault.severity].label}）` })
  }
  if (m.due) {
    if (!type) type = 'maintenance'
    level = m.due.level
    if (!title) title = `${m.due.name}（${m.due.interval}h 周期）`
    reasons.push({
      kind: 'maintenance',
      text: `${m.due.name}到期：距上次保养 ${m.elapsed}h，周期 ${m.due.interval}h${m.overdueHours > 0 ? `，已超期 ${m.overdueHours}h` : ''}`
    })
  }
  if (!type) return null
  return {
    type, level, title,
    reason: { codes: machine.faultCodes, overdueHours: m.overdueHours, elapsed: m.elapsed, details: reasons },
    fault, maintenance: m.due
  }
}

// 候选技师打分：距离 50 + 技能契合 25 + 在线负载 15 + 严重度加急 10
export function rankTechnicians(machine, technicians, opts = {}) {
  const origin = { lat: machine.lat, lng: machine.lng }
  const list = technicians
    .filter(t => t.skills.includes(machine.type))
    .map(t => {
      const distanceKm = haversineKm(origin, { lat: t.lat, lng: t.lng })
      const distanceScore = Math.max(0, 50 - distanceKm * 1.1) // 每公里扣 1.1 分
      const onlineScore = t.online ? 15 : 0
      const loadScore = Math.max(0, 10 - (t.completedToday || 0) * 2)
      const urgentBonus = opts.critical && t.online ? 10 : 0
      const allSkills = t.skills.length >= 3 ? 5 : 0
      const score = Math.round(distanceScore + onlineScore + loadScore + urgentBonus + 5 + allSkills)
      const tags = []
      if (distanceKm <= 10) tags.push('距离最近')
      else tags.push(`${distanceKm}km`)
      tags.push(t.online ? '在线' : '离线')
      if ((t.completedToday || 0) === 0) tags.push('当前空闲')
      return {
        technicianId: t.id, name: t.name, phone: t.phone,
        distanceKm, score, online: t.online,
        reason: `机型匹配 · ${tags.join(' · ')}`
      }
    })
    .sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm)
  return list
}

// 选出派单对象：优先在线，不足时扩展到离线候选
export function chooseTechnician(candidates) {
  return candidates.find(c => c.online) || candidates[0] || null
}
