import { useEffect, useState } from 'react'
import { api, outbox, type OutboxItem } from '../../lib/api'
import type { Order, Technician } from '../../types'
import { Badge, Empty, Link, navigate, Spinner, fmtTime, useOnline, useToast } from '../../lib/ui'

const TECH_KEY = 'field-tech-id'

export default function FieldHome() {
  const [techs, setTechs] = useState<Technician[]>([])
  const [techId, setTechId] = useState(localStorage.getItem(TECH_KEY) || 't-03')
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [stale, setStale] = useState(false)
  const [queue, setQueue] = useState<OutboxItem[]>([])
  const online = useOnline()
  const toast = useToast()

  const load = () => {
    api.orders(`?technicianId=${techId}`).then(({ data, stale }) => { setOrders(data); setStale(stale) }).catch(() => setOrders([]))
    outbox.list().then(setQueue)
  }
  useEffect(() => { api.technicians().then(setTechs); load() }, [techId])
  useEffect(() => {
    const t = setInterval(() => outbox.list().then(setQueue), 3000)
    return () => clearInterval(t)
  }, [])

  const switchTech = (id: string) => { localStorage.setItem(TECH_KEY, id); setTechId(id) }
  const flush = async () => {
    if (!online) return toast.show('仍处于离线状态，恢复网络后自动补传', 'err')
    const n = await outbox.flush()
    setQueue(await outbox.list()); load()
    toast.show(n ? `已补传 ${n} 条记录` : '没有待发记录', n ? 'ok' : 'info')
  }

  const active = (orders || []).filter(o => !['confirmed'].includes(o.status))
  const done = (orders || []).filter(o => ['completed', 'confirmed'].includes(o.status))
  const me = techs.find(t => t.id === techId)

  return (
    <div className="container mobile-wrap">
      <h1 className="page-title">📱 技师外勤</h1>
      <div className="page-sub">
        {stale ? '📴 离线模式 · 显示缓存工单，可继续填报' : '接单、到场打卡、完工填报一站完成'}
      </div>

      <div className="field-card">
        <div className="row spread wrap">
          <label className="field" style={{ margin: 0, flex: 1, minWidth: 200 }}>
            <span>当前登录技师（演示切换）</span>
            <select value={techId} onChange={e => switchTech(e.target.value)}>
              {techs.map(t => <option key={t.id} value={t.id}>{t.name} {t.online ? '🟢' : '⚪'} · {t.phone}</option>)}
            </select>
          </label>
          <span className={`net-pill ${online ? '' : 'offline'}`} style={{ marginTop: 16 }}>{online ? '在线' : '离线'}</span>
        </div>
        {queue.length > 0 && (
          <div className="field-card mt12" style={{ background: '#fffbeb', borderColor: '#fde68a', margin: '8px 0 0' }}>
            <b>📤 发件箱：{queue.length} 条待补传</b>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>离线提交的完工报告已保存在本机，联网后自动发送</div>
            <button className="btn btn-primary btn-sm mt8" onClick={flush}>立即尝试补传</button>
          </div>
        )}
      </div>

      {orders === null ? <Spinner /> : (
        <>
          <h3 style={{ margin: '18px 0 10px' }}>🚧 我的任务（{active.length}）</h3>
          {active.length === 0 && <div className="card"><Empty icon="🎉" text="暂无待处理任务" /></div>}
          {active.map(o => {
            const queued = queue.some(q => q.orderId === o.id)
            return (
              <div className="field-card" key={o.id} onClick={() => navigate(`/field/orders/${o.id}`)} style={{ cursor: 'pointer' }}>
                <div className="row spread">
                  <span className="mono muted" style={{ fontSize: 12 }}>{o.code}</span>
                  <Badge status={o.status} />
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{o.title}</div>
                <div className="sub2" style={{ fontSize: 13 }}>📍 {o.site?.name}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>{o.machine?.code} · 派单于 {fmtTime(o.assignedAt)}</div>
                {queued && <div className="badge sev-medium mt8">📤 完工报告待补传</div>}
              </div>
            )
          })}

          {done.length > 0 && <>
            <h3 style={{ margin: '18px 0 10px' }}>✅ 已完工（{done.length}）</h3>
            {done.map(o => (
              <div className="field-card" key={o.id} onClick={() => navigate(`/field/orders/${o.id}`)} style={{ cursor: 'pointer', opacity: .85 }}>
                <div className="row spread"><b>{o.machine?.code}</b><Badge status={o.status} /></div>
                <div className="muted" style={{ fontSize: 12.5 }}>{o.title} · {o.site?.name}</div>
              </div>
            ))}
          </>}
        </>
      )}
    </div>
  )
}
