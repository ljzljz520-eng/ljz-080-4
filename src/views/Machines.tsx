import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Machine, MachineType, Order, Technician } from '../types'
import { Badge, Empty, Link, navigate, Spinner, STATUS_LABEL, TYPE_COLOR, TYPE_LABEL, ago, fmtTime, useToast } from '../lib/ui'

const TYPE_FILTERS: { v: MachineType | ''; l: string }[] = [
  { v: '', l: '全部机型' }, { v: 'excavator', l: '挖机' }, { v: 'crane', l: '吊车' }, { v: 'roller', l: '压路机' }
]

export default function Machines({ selectedId }: { selectedId?: string }) {
  const [list, setList] = useState<Machine[] | null>(null)
  const [stale, setStale] = useState(false)
  const [filter, setFilter] = useState<MachineType | ''>('')
  const toast = useToast()

  const load = () => { void api.machines().then(({ data, stale }) => { setList(data); setStale(stale) }).catch(() => toast.show('加载失败', 'err')) }
  useEffect(load, [])

  if (!list) return <div className="container"><Spinner /></div>
  if (selectedId) return <MachineDetail id={selectedId} onBack={() => navigate('/machines')} changed={load} />

  const rows = list.filter(m => !filter || m.type === filter)
  return (
    <div className="container">
      <h1 className="page-title">设备台账</h1>
      <div className="page-sub">租赁公司同步的挖机 / 吊车 / 压路机遥测数据 {stale && '· 📴 离线缓存'}</div>
      <div className="row gap6 mt12" style={{ marginBottom: 14 }}>
        {TYPE_FILTERS.map(f => (
          <button key={f.v} className={`btn btn-sm ${filter === f.v ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(f.v)}>{f.l}</button>
        ))}
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr>
            <th>设备</th><th>机型</th><th>所在工地</th><th>小时表</th><th>故障码</th><th>保养状态</th><th>在网</th><th></th>
          </tr></thead>
          <tbody>
            {rows.map(m => {
              const a = m.assessment
              return (
                <tr key={m.id} className="clickable" onClick={() => navigate(`/machines/${m.id}`)}>
                  <td><b>{m.code}</b><div className="muted" style={{ fontSize: 12 }}>{m.brand}</div></td>
                  <td><span className="badge solid" style={{ background: TYPE_COLOR[m.type] }}>{TYPE_LABEL[m.type]}</span></td>
                  <td>{m.site?.name || '—'}<div className="muted" style={{ fontSize: 12 }}>{m.site?.address}</div></td>
                  <td className="mono">{m.hours.toLocaleString()} h</td>
                  <td>
                    {m.faultCodes.length === 0 ? <span className="muted">无</span> :
                      <div className="row gap6 wrap">{m.faultCodes.map(c => {
                        const sev = a?.fault && a.fault.code === c ? a.fault.severity : 'low'
                        return <span key={c} className={`badge sev-${sev}`}>{c}</span>
                      })}</div>}
                  </td>
                  <td>
                    {m.activeOrderId ? <Badge status="enroute" /> :
                      a ? <span className={`badge sev-${a.fault?.severity || 'high'}`}>{a.title}</span>
                        : <span className="badge st-confirmed">正常</span>}
                  </td>
                  <td>{m.online ? '🟢 在线' : '⚪ 离线'}<div className="muted" style={{ fontSize: 11.5 }}>{ago(m.updatedAt)}</div></td>
                  <td><button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); navigate(`/machines/${m.id}`) }}>详情</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MachineDetail({ id, onBack, changed }: { id: string; onBack: () => void; changed: () => void }) {
  const [m, setM] = useState<(Machine & {
    maintenance?: { elapsed: number; overdueHours: number; due: { level: string; name: string; interval: number } | null; dueList: any[] }
    orders?: Order[]
  }) | null>(null)
  const [techs, setTechs] = useState<Technician[]>([])
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  useEffect(() => {
    fetch(`/api/machines/${id}`).then(r => r.json()).then(setM).catch(() => toast.show('加载失败', 'err'))
    api.technicians().then(setTechs).catch(() => {})
  }, [id])

  if (!m) return <div className="container"><Spinner /></div>
  const a = m.assessment
  const matched = techs.filter(t => t.skills.includes(m.type))

  const dispatchNow = async () => {
    setBusy(true)
    try {
      const r = await fetch('/api/dispatch/scan', { method: 'POST' }).then(r => r.json())
      toast.show(`扫描完成，新派 ${r.dispatched} 单`, r.dispatched ? 'ok' : 'info')
      const fresh = await fetch(`/api/machines/${id}`).then(r => r.json()); setM(fresh); changed()
    } catch { toast.show('操作失败', 'err') }
    setBusy(false)
  }

  return (
    <div className="container">
      <button className="btn btn-ghost btn-sm" onClick={onBack}>← 返回设备列表</button>
      <div className="card mt12">
        <div className="row spread wrap">
          <div>
            <div className="row gap6">
              <span className="badge solid" style={{ background: TYPE_COLOR[m.type] }}>{TYPE_LABEL[m.type]}</span>
              <h2 style={{ fontSize: 19 }}>{m.code}</h2>
              {m.online ? <span className="badge st-confirmed">在线</span> : <span className="badge ghost">离线</span>}
            </div>
            <div className="sub2 mt8">{m.brand} · 小时表 <b className="mono">{m.hours.toLocaleString()}h</b> · 上次保养 {m.lastMaintHours.toLocaleString()}h</div>
            <div className="muted mt8">📍 {m.site?.name} · {m.site?.address}（{m.lat}, {m.lng}）· 联系人 {m.site?.contact} {m.site?.phone}</div>
          </div>
          <div className="row gap6">
            {a && !m.activeOrderId && <button className="btn-primary" disabled={busy} onClick={dispatchNow}>⚡ 立即派单</button>}
            {m.activeOrderId && <Link to={`/orders/${m.activeOrderId}`} className="btn btn-primary">查看进行中工单</Link>}
          </div>
        </div>
      </div>

      <div className="grid cols-2 mt16">
        <div className="card">
          <h3>🗓️ 保养周期进度</h3>
          {m.maintenance && <MaintProgress elapsed={m.maintenance.elapsed} rules={m.maintenance.due ? [m.maintenance.due] : []} type={m.type} machine={m} />}
        </div>
        <div className="card">
          <h3>⚠️ 故障码与派单原因</h3>
          {m.faultCodes.length === 0 && <div className="muted">无活跃故障码</div>}
          {a?.reason?.details?.map((d: any, i: number) => (
            <div key={i} className="field-card" style={{ marginBottom: 8, padding: 10 }}>
              <b>{d.kind === 'fault' ? '🚨 故障' : '🗓️ 周期保养'}</b>
              <div className="sub2" style={{ fontSize: 13 }}>{d.text}</div>
            </div>
          ))}
          {!a && <Empty icon="✅" text="设备状态正常，无到期保养与故障" />}
        </div>
      </div>

      {a && (
        <div className="card mt16">
          <h3>🧭 附近可派技师（按综合评分）</h3>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>技师</th><th>技能机型</th><th>状态</th><th>今日完工</th></tr></thead>
              <tbody>
                {matched.map(t => (
                  <tr key={t.id}>
                    <td><b>{t.name}</b><div className="muted" style={{ fontSize: 12 }}>{t.phone}</div></td>
                    <td>{t.skills.map(s => <span key={s} className="badge ghost" style={{ marginRight: 4 }}>{TYPE_LABEL[s]}</span>)}</td>
                    <td>{t.online ? '🟢 在线' : '⚪ 离线'}{t.activeOrder && <div className="muted" style={{ fontSize: 12 }}>有在途工单</div>}</td>
                    <td>{t.completedToday} 单</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="muted mt8" style={{ fontSize: 12.5 }}>派单评分 = 距离（每公里 -1.1） + 在线 +15 + 空闲负载 + 高危加急 +10 + 全能机型 +5</div>
        </div>
      )}

      <div className="card mt16">
        <h3>📋 历史工单</h3>
        {m.orders?.length === 0 ? <Empty text="暂无工单" /> : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>工单号</th><th>事项</th><th>状态</th><th>技师</th><th>创建</th></tr></thead>
            <tbody>
              {m.orders?.map((o: Order) => (
                <tr key={o.id} className="clickable" onClick={() => navigate(`/orders/${o.id}`)}>
                  <td className="mono">{o.code}</td><td>{o.title}</td>
                  <td><span className={`badge solid st-${o.status}`}>{STATUS_LABEL[o.status as keyof typeof STATUS_LABEL]}</span></td>
                  <td>{o.technician?.name || '—'}</td><td>{fmtTime(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  )
}

function MaintProgress({ elapsed, type, machine }: { elapsed: number; rules: any[]; type: MachineType; machine: any }) {
  // 从后端 meta 取规则较繁琐，这里用设备评估数据直接显示下一周期
  const intervals = type === 'excavator' ? [250, 500, 1000] : type === 'crane' ? [200, 400, 800] : [200, 400, 600]
  const next = intervals.find(i => elapsed < i) || intervals[intervals.length - 1]
  const pct = Math.min(100, Math.round((elapsed / next) * 100))
  return (
    <>
      <dl className="kv">
        <dt>累计运行</dt><dd className="mono">{machine.hours.toLocaleString()} h</dd>
        <dt>距上次保养</dt><dd className="mono">{elapsed} h</dd>
        <dt>下一周期</dt><dd>{machine.maintenance?.due ? <span className="badge sev-high">已到期：{machine.maintenance.due.name}</span> : <span>{next} h（{machine.maintenance?.dueList?.length ? '' : ''}）</span>}</dd>
      </dl>
      <div className="mt12">
        <div className="row spread muted" style={{ fontSize: 12.5, marginBottom: 4 }}><span>距下次保养</span><span>{pct}%</span></div>
        <div className="progress-bar"><i style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--critical)' : pct > 80 ? 'var(--high)' : 'var(--primary)' }} /></div>
        <div className="muted mt8" style={{ fontSize: 12 }}>{machine.maintenance?.due ? `已超期 ${machine.maintenance.overdueHours}h，请尽快保养` : `还需运行 ${next - elapsed}h`}</div>
      </div>
    </>
  )
}
