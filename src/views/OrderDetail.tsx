import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Order } from '../types'
import { Badge, Empty, Link, navigate, Spinner, TYPE_COLOR, TYPE_LABEL, fmtDateTime, useToast } from '../lib/ui'

export default function OrderDetail({ id }: { id: string }) {
  const [o, setO] = useState<Order | null>(null)
  const toast = useToast()
  const load = () => { api.order(id).then(setO).catch(() => toast.show('加载失败', 'err')) }
  useEffect(load, [id])

  if (!o) return <div className="container"><Spinner /></div>
  const m = o.machine
  const reassign = async () => {
    if (!confirm('确定改派给下一位最优技师吗？')) return
    try { const r = await api.reassign(o.id) as Order; setO(r); toast.show(`已改派给 ${r.technician?.name}`, 'ok') }
    catch (e) { toast.show((e as Error).message, 'err') }
  }

  return (
    <div className="container">
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/orders')}>← 返回工单列表</button>
      <div className="card mt12">
        <div className="row spread wrap">
          <div>
            <div className="mono muted">{o.code}</div>
            <h2 style={{ fontSize: 19, marginTop: 2 }}>{o.title}</h2>
            <div className="row gap6 wrap mt8">
              <Badge status={o.status} />
              <span className="badge ghost">{o.type === 'fault' ? '🚨 故障抢修' : '🗓️ 周期保养'}</span>
              <span className="badge solid" style={{ background: TYPE_COLOR[m?.type || 'excavator'] }}>{TYPE_LABEL[m?.type || 'excavator']}</span>
            </div>
          </div>
          <div className="row gap6 wrap">
            {['assigned', 'accepted', 'enroute', 'arrived', 'rework'].includes(o.status) &&
              <button className="btn btn-danger btn-sm" onClick={reassign}>↪ 改派技师</button>}
            {o.status === 'completed' && <Link to={`/client/${o.id}`} className="btn btn-success btn-sm">客户确认页</Link>}
            <Link to={`/field/orders/${o.id}`} className="btn btn-ghost btn-sm">📱 技师端视图</Link>
          </div>
        </div>
        <div className="hr"></div>
        <div className="grid cols-2">
          <dl className="kv">
            <dt>设备</dt><dd><b>{m?.code}</b> · {m?.brand} · {m?.hours.toLocaleString()}h</dd>
            <dt>工地</dt><dd>{o.site?.name} · {o.site?.address}<br /><span className="muted">{o.site?.contact} {o.site?.phone}</span></dd>
            <dt>派单技师</dt><dd>{o.technician?.name}（{o.technician?.phone}）</dd>
          </dl>
          <dl className="kv">
            <dt>故障码</dt><dd>{o.reason.codes.length ? o.reason.codes.join('、') : '无'}</dd>
            <dt>超期时长</dt><dd>{o.reason.overdueHours > 0 ? `${o.reason.overdueHours} 小时` : '无'}</dd>
            <dt>创建时间</dt><dd>{fmtDateTime(o.createdAt)}</dd>
          </dl>
        </div>
      </div>

      <div className="grid cols-2 mt16">
        <div className="card">
          <h3>🧭 派单候选排序</h3>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>#</th><th>技师</th><th>距离</th><th>评分</th><th>说明</th></tr></thead>
              <tbody>
                {o.candidates.map((c, i) => (
                  <tr key={c.technicianId} style={c.technicianId === o.technicianId ? { background: '#eff6ff' } : {}}>
                    <td>{i + 1}{c.technicianId === o.technicianId && ' 👈'}</td>
                    <td><b>{c.name}</b>{!c.online && <span className="muted">（离线）</span>}</td>
                    <td>{c.distanceKm} km</td>
                    <td><b>{c.score}</b></td>
                    <td className="muted" style={{ fontSize: 12.5 }}>{c.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h3>🕒 工单时间线</h3>
          <div className="timeline">
            {o.timeline.map((t, i) => (
              <div className="tl-item done" key={i}>
                <div>{t.label}</div>
                <div className="tl-t">{fmtDateTime(t.t)}</div>
              </div>
            ))}
            {o.status === 'completed' && <div className="tl-item"><div>等待客户确认恢复作业</div></div>}
          </div>
        </div>
      </div>

      {o.report && (
        <div className="card mt16">
          <h3>🧰 技师完工报告</h3>
          <div className="grid cols-2">
            <dl className="kv">
              <dt>诊断说明</dt><dd>{o.report.diagnosis}</dd>
              <dt>作业内容</dt><dd>{o.report.workDone || '—'}</dd>
              <dt>停机时长</dt><dd><b style={{ color: o.report.downtimeMin >= 240 ? 'var(--critical)' : undefined }}>{o.report.downtimeMin} 分钟</b>{o.report.downtimeMin >= 60 ? `（${(o.report.downtimeMin / 60).toFixed(1)} 小时）` : ''}</dd>
              <dt>设备恢复</dt><dd>{o.report.recovered ? '✅ 可恢复作业' : '⚠️ 仍需观察'}</dd>
            </dl>
            <div>
              <div className="sub2" style={{ fontWeight: 600, marginBottom: 6 }}>用料清单</div>
              {o.report.parts.length === 0 ? <div className="muted">未更换配件</div> : (
                <table className="tbl">
                  <thead><tr><th>物料</th><th>规格</th><th>数量</th></tr></thead>
                  <tbody>{o.report.parts.map((p, i) => <tr key={i}><td>{p.name}</td><td className="muted">{p.spec}</td><td>{p.qty} {p.unit}</td></tr>)}</tbody>
                </table>
              )}
            </div>
          </div>
          {o.report.photos.length > 0 && (
            <div className="mt16">
              <div className="sub2" style={{ fontWeight: 600, marginBottom: 8 }}>现场照片（{o.report.photos.length}）</div>
              <div className="photo-grid">
                {o.report.photos.map((p, i) => (
                  <a key={i} className="photo-thumb" href={p.url} target="_blank" rel="noreferrer">
                    <img src={p.url} alt={p.caption || '现场照片'} loading="lazy" />
                  </a>
                ))}
              </div>
            </div>
          )}
          {o.confirmation && (
            <>
              <div className="hr"></div>
              <div className={`field-card`} style={{ background: o.confirmation.recovered ? '#f0fdf4' : '#fef2f2', margin: 0 }}>
                <b>{o.confirmation.recovered ? '✅ 客户已确认恢复作业' : '🔁 客户要求返工'}</b>
                <div className="sub2 mt8">确认人：{o.confirmation.contactName || '未署名'} · {fmtDateTime(o.confirmation.confirmedAt)}</div>
                {o.confirmation.note && <div className="mt8">备注：{o.confirmation.note}</div>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
