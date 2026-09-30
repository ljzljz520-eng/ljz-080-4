import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Order } from '../types'
import { Badge, Empty, navigate, Spinner, TYPE_COLOR, TYPE_LABEL, fmtDateTime, useToast } from '../lib/ui'

export default function ClientConfirm({ orderId }: { orderId?: string }) {
  if (orderId) return <ConfirmForm id={orderId} />
  return <Picker />
}

function Picker() {
  const [list, setList] = useState<Order[] | null>(null)
  const toast = useToast()
  useEffect(() => {
    api.orders().then(({ data }) => setList(data.filter(o => ['completed', 'rework', 'confirmed'].includes(o.status))))
      .catch(() => toast.show('加载失败', 'err'))
  }, [])
  if (list === null) return <div className="container mobile-wrap"><Spinner /></div>

  return (
    <div className="container mobile-wrap">
      <h1 className="page-title">✅ 客户确认</h1>
      <div className="page-sub">确认维修保养结果与设备是否可恢复作业</div>
      {list.length === 0 && <div className="card"><Empty icon="📋" text="暂无可确认的工单" /></div>}
      {list.map(o => (
        <div className="field-card" key={o.id} onClick={() => navigate(`/client/${o.id}`)} style={{ cursor: 'pointer' }}>
          <div className="row spread">
            <span className="mono muted" style={{ fontSize: 12 }}>{o.code}</span>
            <Badge status={o.status} />
          </div>
          <div style={{ fontWeight: 600, marginTop: 4 }}>
            <span className="badge solid" style={{ background: TYPE_COLOR[o.machine?.type || 'excavator'], marginRight: 6 }}>{TYPE_LABEL[o.machine?.type || 'excavator']}</span>
            {o.machine?.code}
          </div>
          <div className="sub2" style={{ fontSize: 13 }}>{o.title} · {o.site?.name}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>技师 {o.technician?.name} · 完工 {fmtDateTime(o.report?.completedAt)}</div>
        </div>
      ))}
    </div>
  )
}

function ConfirmForm({ id }: { id: string }) {
  const [o, setO] = useState<Order | null>(null)
  const [contactName, setContactName] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  useEffect(() => { api.order(id).then((x: Order) => setO(x)).catch(() => toast.show('工单加载失败', 'err')) }, [id])

  const confirm = async (recovered: boolean) => {
    if (!recovered && !note.trim()) return toast.show('要求返工请填写原因', 'err')
    setBusy(true)
    try {
      const r = await api.confirm(id, { recovered, contactName, note }) as Order
      setO(r); toast.show(recovered ? '已确认恢复作业，感谢配合！' : '已通知技师返工', recovered ? 'ok' : 'info')
    } catch (e) { toast.show((e as Error).message, 'err') }
    setBusy(false)
  }

  if (!o) return <div className="container mobile-wrap"><Spinner /></div>
  if (!o.report) return <div className="container mobile-wrap"><Empty icon="⏳" text="技师尚未提交完工报告" /></div>
  const r = o.report
  const done = o.status === 'confirmed' || o.status === 'rework'

  return (
    <div className="container mobile-wrap">
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/client')}>← 待确认列表</button>

      <div className="field-card mt12" style={{ background: 'linear-gradient(135deg,#0f172a,#1e3a8a)', color: '#fff' }}>
        <div className="mono" style={{ opacity: .7, fontSize: 12 }}>{o.code}</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{o.machine?.code} 保养维修确认单</div>
        <div style={{ opacity: .85, fontSize: 13, marginTop: 4 }}>{o.site?.name} · {o.title}</div>
      </div>

      {done && (
        <div className="field-card" style={{ background: o.status === 'confirmed' ? '#f0fdf4' : '#fef2f2' }}>
          <b style={{ fontSize: 15 }}>{o.status === 'confirmed' ? '🎉 您已确认设备恢复作业' : '🔁 已发起返工'}</b>
          <div className="sub2 mt8">确认人：{o.confirmation?.contactName || '未署名'} · {fmtDateTime(o.confirmation?.confirmedAt)}</div>
          {o.confirmation?.note && <div className="mt8">备注：{o.confirmation.note}</div>}
        </div>
      )}

      <div className="field-card">
        <h3>👷 施工信息</h3>
        <dl className="kv">
          <dt>上门技师</dt><dd>{o.technician?.name} {o.technician?.phone}</dd>
          <dt>到场时间</dt><dd>{fmtDateTime(o.arrivedAt)}</dd>
          <dt>完工时间</dt><dd>{fmtDateTime(r.completedAt)}</dd>
          <dt>设备停机</dt><dd><b style={{ fontSize: 16, color: r.downtimeMin >= 240 ? 'var(--critical)' : 'var(--ink)' }}>{r.downtimeMin}</b> 分钟
            {r.downtimeMin >= 60 && <span className="muted">（{(r.downtimeMin / 60).toFixed(1)} 小时）</span>}</dd>
          <dt>恢复作业</dt><dd>{r.recovered ? '✅ 技师判定可恢复' : '⚠️ 需继续观察'}</dd>
        </dl>
      </div>

      <div className="field-card">
        <h3>🔍 诊断说明</h3>
        <div className="sub2">{r.diagnosis}</div>
        {r.workDone && <><div className="hr"></div><h3>🛠️ 作业内容</h3><div className="sub2">{r.workDone}</div></>}
      </div>

      <div className="field-card">
        <h3>🧰 更换用料（{r.parts.length}）</h3>
        {r.parts.length === 0 ? <div className="muted">本次未发生配件更换</div> : (
          <table className="tbl">
            <thead><tr><th>物料</th><th>规格</th><th>数量</th></tr></thead>
            <tbody>{r.parts.map((p, i) => <tr key={i}><td>{p.name}</td><td className="muted">{p.spec}</td><td>{p.qty} {p.unit}</td></tr>)}</tbody>
          </table>
        )}
      </div>

      <div className="field-card">
        <h3>📷 现场照片（{r.photos.length}）</h3>
        {r.photos.length === 0 ? <div className="muted">技师未上传照片</div> : (
          <div className="photo-grid">
            {r.photos.map((p, i) => (
              <a className="photo-thumb" key={i} href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt="现场" loading="lazy" /></a>
            ))}
          </div>
        )}
      </div>

      {!done && (
        <div className="field-card">
          <h3>✍️ 客户确认</h3>
          <label className="field"><span>您的称呼 / 职务</span>
            <input placeholder="如：王工长" value={contactName} onChange={e => setContactName(e.target.value)} />
          </label>
          <label className="field"><span>备注（可选；要求返工时必填）</span>
            <textarea rows={2} placeholder="设备运行情况确认意见…" value={note} onChange={e => setNote(e.target.value)} />
          </label>
          <div className="grid cols-2">
            <button className="btn btn-success" disabled={busy} onClick={() => confirm(true)}>✅ 确认恢复作业</button>
            <button className="btn btn-danger" style={{ borderWidth: 1 }} disabled={busy} onClick={() => confirm(false)}>🔁 有问题，要求返工</button>
          </div>
          <div className="muted mt8" style={{ fontSize: 12 }}>确认后工单关闭；点返工将退回技师重新上门处理</div>
        </div>
      )}
    </div>
  )
}
