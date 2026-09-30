import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Order, Technician } from '../types'
import { Empty, Link, Spinner, TYPE_COLOR, TYPE_LABEL, useToast } from '../lib/ui'

export default function Technicians() {
  const [techs, setTechs] = useState<Technician[] | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const toast = useToast()
  const load = () => { void Promise.all([api.technicians(), api.orders()]).then(([t, o]) => {
    setTechs(t); setOrders(o.data || o)
  }).catch(() => toast.show('加载失败', 'err')) }
  useEffect(load, [])

  if (!techs) return <div className="container"><Spinner /></div>

  const toggle = async (t: Technician) => {
    try { await api.setTechLocation(t.id, { online: !t.online }); load() }
    catch { toast.show('状态更新失败', 'err') }
  }

  return (
    <div className="container">
      <h1 className="page-title">外勤技师</h1>
      <div className="page-sub">系统按机型技能与实时位置就近派单</div>
      <div className="grid cols-3 mt16">
        {techs.map(t => {
          const active = orders.find(o => o.technicianId === t.id && !['completed', 'confirmed'].includes(o.status))
          return (
            <div className="card" key={t.id}>
              <div className="row spread">
                <div className="row gap6">
                  <div style={{ fontSize: 26 }}>{t.online ? '👷' : '💤'}</div>
                  <div><b style={{ fontSize: 15 }}>{t.name}</b><div className="muted" style={{ fontSize: 12.5 }}>{t.phone}</div></div>
                </div>
                <button className={`btn btn-sm ${t.online ? 'btn-success' : 'btn-ghost'}`} onClick={() => toggle(t)}>
                  {t.online ? '🟢 在线值班' : '⚪ 离线休息'}
                </button>
              </div>
              <div className="hr"></div>
              <div className="row gap6 wrap">
                {t.skills.map(s => <span key={s} className="badge solid" style={{ background: TYPE_COLOR[s] }}>{TYPE_LABEL[s]}</span>)}
              </div>
              <div className="row spread mt12" style={{ fontSize: 13 }}>
                <span className="muted">位置 {t.lat.toFixed(3)}, {t.lng.toFixed(3)}</span>
                <span>今日完工 <b>{t.completedToday}</b></span>
              </div>
              {active && (
                <div className="field-card mt12" style={{ marginBottom: 0, padding: 10, background: '#eff6ff' }}>
                  <div className="muted" style={{ fontSize: 12 }}>当前工单</div>
                  <Link to={`/orders/${active.id}`}><b>{active.machine?.code || active.id}</b> · {active.title}</Link>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {techs.length === 0 && <Empty text="暂无技师" />}
    </div>
  )
}
