import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useApi } from '../lib/useApi';
import { post } from '../lib/api';
import { toast } from '../lib/toast';
import { StatusBadge, PriorityBadge, TypeBadge } from '../components/Badge';
import { fmtMinutes } from '../lib/format';

export default function CustomerPage() {
  const params = useParams();
  const orders = useApi('/api/work-orders?status=pending_confirm');
  const confirmed = useApi('/api/work-orders?status=confirmed');
  const rejected = useApi('/api/work-orders?status=rejected');
  const [customer, setCustomer] = useState('');
  const [detailId, setDetailId] = useState(params.id || null);
  const [comment, setComment] = useState('');
  const [confirmer, setConfirmer] = useState('');
  const [busy, setBusy] = useState(false);

  const pending = orders.data || [];
  const customers = useMemo(() => [...new Set(pending.map((w) => w.customerName))], [pending]);
  const list = customer ? pending.filter((w) => w.customerName === customer) : pending;
  const detail = pending.find((w) => w.id === detailId)
    || (confirmed.data || []).find((w) => w.id === detailId)
    || (rejected.data || []).find((w) => w.id === detailId);

  const decide = async (resume) => {
    setBusy(true);
    try {
      await post(`/api/work-orders/${detailId}/confirm`, { resume, comment, confirmer: confirmer || detail.customerName });
      toast(resume ? '已确认恢复作业，工单归档' : '已要求技师返工', resume ? 'ok' : 'err');
      setDetailId(null);
      setComment('');
      orders.reload();
      confirmed.reload();
      rejected.reload();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const history = [...(confirmed.data || []), ...(rejected.data || [])].sort((a, b) => (b.confirmation?.at || '').localeCompare(a.confirmation?.at || ''));

  return (
    <>
      <h1>客户确认 · 是否恢复作业</h1>
      <p className="page-desc">技师完工上报后，租赁客户核对用料、现场照片与停机时长，确认设备是否已恢复作业；未通过可直接退回返工。</p>

      <div className="filters">
        <button className={`chip ${!customer ? 'active' : ''}`} onClick={() => setCustomer('')}>全部客户</button>
        {customers.map((c) => (
          <button key={c} className={`chip ${customer === c ? 'active' : ''}`} onClick={() => setCustomer(c)}>{c}</button>
        ))}
        <div style={{ flex: 1 }} />
        <span className="badge amber dot">待确认 {pending.length}</span>
        <span className="badge green dot">已恢复 {(confirmed.data || []).length}</span>
        <span className="badge red dot">返工 {(rejected.data || []).length}</span>
      </div>

      <div className="grid cols-3">
        {list.map((w) => (
          <div key={w.id} className="card wo-card" onClick={() => setDetailId(w.id)}>
            <div className="wo-head">
              <span className="mono small muted">{w.id}</span>
              <TypeBadge type={w.machineType} />
              <div style={{ flex: 1 }} />
              <StatusBadge status={w.status} />
            </div>
            <div className="wo-title">{w.title}</div>
            <div className="wo-meta">
              <span>🚜 {w.machineName}</span>
              <span>🏗️ {w.siteName}</span>
            </div>
            <div className="wo-meta">
              <span>👷 {w.technicianName}</span>
              <span>⏱️ 停机 {fmtMinutes(w.downtimeMinutes)}</span>
              <span>📷 {w.photos?.length || 0} 张</span>
            </div>
            <div className="small muted">用料 {w.materials.length} 项 · 上报于 {w.completedAt ? new Date(w.completedAt).toLocaleString('zh-CN', { hour12: false }) : '—'}</div>
          </div>
        ))}
        {!list.length && <div className="card muted" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 30 }}>🎉 当前没有待确认的工单</div>}
      </div>

      <h2 className="section-title">📁 历史确认记录</h2>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>工单号</th><th>设备 / 工地</th><th>技师</th><th>客户意见</th><th>确认人</th><th>结果</th></tr></thead>
          <tbody>
            {history.slice(0, 10).map((w) => (
              <tr key={w.id}>
                <td className="mono">{w.id}</td>
                <td className="small">{w.machineName}<div className="muted">{w.siteName}</div></td>
                <td className="small">{w.technicianName}</td>
                <td className="small">{w.confirmation?.comment || '—'}</td>
                <td className="small">{w.confirmation?.confirmer}</td>
                <td><StatusBadge status={w.status} /></td>
              </tr>
            ))}
            {!history.length && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 20 }}>暂无历史</td></tr>}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="modal-mask" onMouseDown={(e) => e.target === e.currentTarget && setDetailId(null)}>
          <div className="modal wide">
            <div className="modal-head">
              <TypeBadge type={detail.machineType} />
              <h3>{detail.id} · {detail.machineName}</h3>
              <PriorityBadge priority={detail.priority} />
              <StatusBadge status={detail.status} />
              <button className="icon-btn" onClick={() => setDetailId(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="grid cols-2">
                <div>
                  <dl className="kv">
                    <dt>保养任务</dt><dd>{detail.title}</dd>
                    <dt>所在工地</dt><dd>{detail.siteName} · {detail.address}</dd>
                    <dt>负责技师</dt><dd>{detail.technicianName}（{detail.technicianPhone}）</dd>
                    <dt>设备停机</dt><dd><b style={{ fontSize: 16 }}>{fmtMinutes(detail.downtimeMinutes)}</b></dd>
                  </dl>
                  <h4 className="section-title">技师完成项目</h4>
                  <ul className="checklist">
                    {detail.checklist.map((c, i) => (
                      <li key={i}>
                        <input type="checkbox" checked={detail.checklistDone?.includes(c)} readOnly />
                        <span style={{ color: detail.checklistDone?.includes(c) ? 'var(--ink)' : 'var(--ink-2)' }}>{c}</span>
                      </li>
                    ))}
                  </ul>
                  <h4 className="section-title">用料清单</h4>
                  <table>
                    <thead><tr><th>物料</th><th>规格</th><th>数量</th></tr></thead>
                    <tbody>
                      {detail.materials.map((m, i) => <tr key={i}><td>{m.name}</td><td className="muted">{m.spec}</td><td className="mono">{m.qty} {m.unit}</td></tr>)}
                      {!detail.materials.length && <tr><td colSpan={3} className="muted">未登记用料</td></tr>}
                    </tbody>
                  </table>
                  <div className="field" style={{ marginTop: 14 }}>
                    <label>确认人（现场负责人）</label>
                    <input className="input" value={confirmer} onChange={(e) => setConfirmer(e.target.value)} placeholder={detail.customerName} />
                  </div>
                  <div className="field">
                    <label>确认意见（可选）</label>
                    <textarea className="input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="如：已现场试车，动作与压力正常" />
                  </div>
                </div>
                <div>
                  <h4 className="section-title" style={{ marginTop: 0 }}>现场照片（{detail.photos?.length || 0}）</h4>
                  <div className="photo-grid" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
                    {(detail.photos || []).map((p, i) => (
                      <a key={i} className="photo-item" href={p.url} target="_blank" rel="noreferrer">
                        <img src={p.url} alt={p.filename} />
                      </a>
                    ))}
                    {!detail.photos?.length && <div className="muted small">技师未上传照片</div>}
                  </div>
                  <h4 className="section-title">技师说明</h4>
                  <p style={{ background: '#f7fafd', padding: '10px 12px', borderRadius: 8 }}>{detail.notes || '（无）'}</p>
                  {detail.confirmation && (
                    <div className="card" style={{ background: detail.status === 'confirmed' ? 'var(--ok-soft)' : 'var(--danger-soft)', marginTop: 10 }}>
                      <b>{detail.status === 'confirmed' ? '✅ 已确认恢复作业' : '↩️ 已退回返工'}</b>
                      <div className="small muted">{detail.confirmation.confirmer} · {new Date(detail.confirmation.at).toLocaleString('zh-CN', { hour12: false })}</div>
                      {detail.confirmation.comment && <div style={{ marginTop: 6 }}>“{detail.confirmation.comment}”</div>}
                    </div>
                  )}
                </div>
              </div>
            </div>
            {detail.status === 'pending_confirm' && (
              <div className="modal-foot">
                <button className="btn danger" disabled={busy} onClick={() => decide(false)}>↩️ 未恢复，要求返工</button>
                <button className="btn ok" disabled={busy} onClick={() => decide(true)}>✅ 确认恢复作业</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
