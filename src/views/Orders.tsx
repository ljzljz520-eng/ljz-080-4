import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import type { Order, OrderStatus } from '../types'
import { Badge, Empty, navigate, Spinner, STATUS_LABEL, TYPE_COLOR, TYPE_LABEL, fmtTime, useToast } from '../lib/ui'

const FILTERS: { v: OrderStatus | ''; l: string }[] = [
  { v: '', l: '全部' }, { v: 'assigned', l: '待接单' }, { v: 'enroute', l: '进行中' },
  { v: 'completed', l: '待确认' }, { v: 'confirmed', l: '已完成' }, { v: 'rework', l: '返工' }
]

export default function Orders() {
  const [list, setList] = useState<Order[] | null>(null)
  const [stale, setStale] = useState(false)
  const [filter, setFilter] = useState<OrderStatus | ''>('')
  const toast = useToast()
  useEffect(() => { api.orders().then(({ data, stale }) => { setList(data); setStale(stale) }).catch(() => toast.show('加载失败', 'err')) }, [])

  const rows = useMemo(() => (list || []).filter(o => {
    if (!filter) return true
    if (filter === 'enroute') return ['accepted', 'enroute', 'arrived'].includes(o.status)
    return o.status === filter
  }), [list, filter])

  if (!list) return <div className="container"><Spinner /></div>
  return (
    <div className="container">
      <h1 className="page-title">派单工单</h1>
      <div className="page-sub">从设备同步到恢复作业的全流程跟踪 {stale && '· 📴 离线缓存'}</div>
      <div className="row gap6 mt12" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        {FILTERS.map(f => <button key={f.v} className={`btn btn-sm ${filter === f.v ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(f.v)}>{f.l}</button>)}
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>工单号</th><th>设备 / 工地</th><th>类型</th><th>事项</th><th>技师</th><th>状态</th><th>创建</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7}><Empty text="暂无工单" /></td></tr>}
            {rows.map(o => (
              <tr key={o.id} className="clickable" onClick={() => navigate(`/orders/${o.id}`)}>
                <td className="mono">{o.code}</td>
                <td>
                  <span className="badge solid" style={{ background: TYPE_COLOR[o.machine?.type || 'excavator'], marginRight: 6 }}>{TYPE_LABEL[o.machine?.type || 'excavator']}</span>
                  <b>{o.machine?.code}</b>
                  <div className="muted" style={{ fontSize: 12 }}>{o.site?.name}</div>
                </td>
                <td>{o.type === 'fault' ? '🚨 故障抢修' : '🗓️ 周期保养'}{o.level && <span className="badge ghost" style={{ marginLeft: 6 }}>{o.level === 'small' ? '一级' : o.level === 'medium' ? '二级' : '大保养'}</span>}</td>
                <td style={{ maxWidth: 220 }}>{o.title}</td>
                <td>{o.technician?.name || '—'}</td>
                <td><Badge status={o.status} /></td>
                <td>{fmtTime(o.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
