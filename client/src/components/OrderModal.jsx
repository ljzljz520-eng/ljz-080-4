import { StatusBadge, PriorityBadge, TypeBadge } from './Badge';
import { fmtTime, fmtMinutes, TYPE_LABELS } from '../lib/format';

export default function OrderModal({ order, onClose, children, wide }) {
  if (!order) return null;
  const photoUrl = (u) => (u?.startsWith('data:') ? u : u);
  return (
    <div className="modal-mask" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`}>
        <div className="modal-head">
          <TypeBadge type={order.machineType} />
          <h3>{order.id} · {order.title}</h3>
          <PriorityBadge priority={order.priority} />
          <StatusBadge status={order.status} />
          <button className="icon-btn" onClick={onClose} aria-label="关闭">✕</button>
        </div>
        <div className="modal-body">
          <dl className="kv">
            <dt>设备</dt><dd>{order.machineName}（{TYPE_LABELS[order.machineType]}）</dd>
            <dt>工地</dt><dd>{order.siteName} · {order.address}</dd>
            <dt>客户</dt><dd>{order.customerName}</dd>
            <dt>技师</dt><dd>{order.technicianName} {order.technicianPhone && <span className="muted small">{order.technicianPhone}</span>} · 距工地 {order.distanceKm} km</dd>
            <dt>表显小时</dt><dd className="mono">{order.hours} h</dd>
            {order.faultCodes?.length > 0 && <><dt>故障码</dt><dd className="mono">{order.faultCodes.join('、')}</dd></>}
            {order.completedAt && <><dt>停机时长</dt><dd>{fmtMinutes(order.downtimeMinutes)}</dd></>}
          </dl>

          {order.checklist?.length > 0 && (
            <>
              <h4 className="section-title">📋 保养/检修项目</h4>
              <ul className="checklist">
                {order.checklist.map((c, i) => {
                  const done = order.checklistDone?.includes(c);
                  return (
                    <li key={i}>
                      <input type="checkbox" checked={!!done} readOnly />
                      <span style={{ textDecoration: done ? 'none' : 'none', color: done ? 'var(--ink)' : 'var(--ink-2)' }}>
                        {c}{done && ' ✓'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {order.materials?.length > 0 && (
            <>
              <h4 className="section-title">🧰 用料清单</h4>
              <table>
                <thead><tr><th>物料</th><th>规格</th><th>数量</th><th>单位</th></tr></thead>
                <tbody>
                  {order.materials.map((m, i) => (
                    <tr key={i}><td>{m.name}</td><td className="muted">{m.spec}</td><td className="mono">{m.qty}</td><td>{m.unit}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {order.photos?.length > 0 && (
            <>
              <h4 className="section-title">📷 现场照片（{order.photos.length}）</h4>
              <div className="photo-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
                {order.photos.map((p, i) => (
                  <a key={i} className="photo-item" href={photoUrl(p.url)} target="_blank" rel="noreferrer">
                    <img src={photoUrl(p.url)} alt={p.filename || '现场照片'} />
                  </a>
                ))}
              </div>
            </>
          )}

          {order.notes && (
            <>
              <h4 className="section-title">📝 技师说明</h4>
              <p style={{ margin: 0, background: '#f7fafd', padding: '10px 12px', borderRadius: 8 }}>{order.notes}</p>
            </>
          )}

          {order.confirmation && (
            <>
              <h4 className="section-title">✅ 客户确认</h4>
              <p style={{ margin: 0 }}>
                <Badge tone={order.confirmation.resume ? 'green' : 'red'}>{order.confirmation.resume ? '已确认恢复作业' : '未恢复，要求返工'}</Badge>
                <span className="muted small" style={{ marginLeft: 8 }}>
                  {order.confirmation.confirmer} · {fmtTime(order.confirmation.at)}
                </span>
                {order.confirmation.comment && <span style={{ marginLeft: 8 }}>“{order.confirmation.comment}”</span>}
              </p>
            </>
          )}

          <h4 className="section-title">🕒 流转记录</h4>
          <ul className="timeline">
            {[...order.events].reverse().map((e, i) => (
              <li key={i}>
                <div className="t-time">{fmtTime(e.at)}</div>
                <div className="t-text">{e.text}</div>
              </li>
            ))}
          </ul>
        </div>
        {children && <div className="modal-foot">{children}</div>}
      </div>
    </div>
  );
}
