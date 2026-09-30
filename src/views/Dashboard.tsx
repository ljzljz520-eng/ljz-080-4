import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Overview } from '../types'
import { Badge, Empty, Link, Spinner, TYPE_LABEL, TYPE_COLOR, useToast } from '../lib/ui'

export default function Dashboard() {
  const [data, setData] = useState<Overview | null>(null)
  const [stale, setStale] = useState(false)
  const [scanning, setScanning] = useState(false)
  const toast = useToast()

  const load = () => {
    api.overviewCached().then(({ data, stale }) => { setData(data); setStale(stale) })
      .catch(() => toast.show('数据加载失败', 'err'))
  }
  useEffect(load, [])

  const scan = async () => {
    setScanning(true)
    try {
      const r = await api.scanDispatch()
      toast.show(r.dispatched ? `已自动派出 ${r.dispatched} 张工单` : '暂无需要派单的设备', r.dispatched ? 'ok' : 'info')
      load()
    } catch { toast.show('派单扫描失败，请检查网络', 'err') }
    setScanning(false)
  }

  if (!data) return <div className="container"><Spinner /></div>
  const c = data.counts
  const stats = [
    { n: c.machines, l: '在网设备', i: '🚜' },
    { n: c.technicians, l: `在线技师 ${c.techOnline}`, i: '👷' },
    { n: c.activeOrders, l: '进行中工单', i: '🛠️' },
    { n: c.critical, l: '高危故障', i: '🚨' },
    { n: c.needDispatch, l: '待派单设备', i: '📡' },
    { n: c.pendingConfirm, l: '待客户确认', i: '✅' }
  ]

  return (
    <div className="container">
      <div className="row spread" style={{ flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title">调度台</h1>
          <div className="page-sub">{stale ? '📴 离线浏览（缓存数据）' : '设备遥测自动汇聚 · 按周期与故障智能派单'}</div>
        </div>
        <button className="btn-primary" onClick={scan} disabled={scanning || stale}>
          {scanning ? '派单中…' : '⚡ 立即扫描派单'}
        </button>
      </div>

      <div className="grid cols-3 mt16">
        {stats.map(s => (
          <div className="card stat" key={s.l}>
            <span className="ic">{s.i}</span>
            <div className="num">{s.n}</div>
            <div className="lbl">{s.l}</div>
          </div>
        ))}
      </div>

      <div className="grid cols-2 mt20">
        <div className="card">
          <h3>📡 待派单设备（保养到期 / 故障码）</h3>
          {data.needDispatch.length === 0 ? <Empty icon="✅" text="所有设备均已覆盖工单" /> :
            data.needDispatch.map(m => (
              <div key={m.id} className="row spread" style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                <div>
                  <div className="row gap6 wrap">
                    <span className="badge solid" style={{ background: TYPE_COLOR[m.type] }}>{TYPE_LABEL[m.type]}</span>
                    <b>{m.code}</b>
                    {m.faultSeverity && <span className={`badge sev-${m.faultSeverity}`}>{m.faultSeverity === 'critical' ? '高危' : m.faultSeverity === 'high' ? '严重' : '故障'}</span>}
                    {m.overdueHours > 0 && <span className="badge sev-high">超期 {m.overdueHours}h</span>}
                  </div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>{m.brand} · {m.siteName} · {m.title}</div>
                </div>
                <Link to={`/machines/${m.id}`} className="btn btn-ghost btn-sm">详情/派单</Link>
              </div>
            ))}
        </div>

        <div className="card">
          <h3>✅ 待客户确认恢复作业</h3>
          {data.pendingConfirm.length === 0 ? <Empty icon="📋" text="暂无待确认工单" /> :
            data.pendingConfirm.map(o => (
              <div key={o.id} className="row spread" style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                <div>
                  <div className="mono muted">{o.code}</div>
                  <div style={{ marginTop: 2 }}><b>{o.machineCode}</b> · {o.siteName}</div>
                  <div className="muted" style={{ fontSize: 12.5 }}>技师 {o.technicianName} · 完工待确认</div>
                </div>
                <Link to={`/client/${o.id}`} className="btn btn-success btn-sm">去确认</Link>
              </div>
            ))}
        </div>
      </div>

      <div className="card mt20">
        <h3>👷 当前空闲在线技师</h3>
        {data.idleTech.length === 0 ? <Empty text="暂无空闲技师" /> : (
          <div className="row wrap gap6">
            {data.idleTech.map(t => (
              <span key={t.id} className="badge ghost" style={{ padding: '6px 12px', fontSize: 13 }}>
                {t.name} · {t.skills.map(s => TYPE_LABEL[s]).join('/')}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
