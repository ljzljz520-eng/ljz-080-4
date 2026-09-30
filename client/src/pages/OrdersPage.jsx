import { useMemo, useState } from 'react';
import { useApi } from '../lib/useApi';
import { StatusBadge, PriorityBadge, TypeBadge } from '../components/Badge';
import OrderModal from '../components/OrderModal';
import { STATUS_LABELS, fmtTime } from '../lib/format';

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'dispatched', label: '待接单' },
  { key: 'accepted', label: '已接单' },
  { key: 'enroute', label: '前往中' },
  { key: 'onsite', label: '已到场' },
  { key: 'in_progress', label: '作业中' },
  { key: 'pending_confirm', label: '待客户确认' },
  { key: 'confirmed', label: '已恢复' },
  { key: 'rejected', label: '返工' }
];

export default function OrdersPage() {
  const { data, loading, reload } = useApi('/api/work-orders');
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(null);

  const list = useMemo(() => {
    let xs = data || [];
    if (filter !== 'all') xs = xs.filter((w) => w.status === filter);
    if (q.trim()) {
      const k = q.trim().toLowerCase();
      xs = xs.filter((w) => [w.id, w.machineName, w.siteName, w.technicianName, w.title].some((s) => String(s).toLowerCase().includes(k)));
    }
    return xs;
  }, [data, filter, q]);

  return (
    <>
      <h1>工单管理</h1>
      <p className="page-desc">系统自动派单后的全流程跟踪：待接单 → 前往 → 到场 → 作业 → 完工上报 → 客户确认恢复作业</p>

      <div className="filters">
        {FILTERS.map((f) => (
          <button key={f.key} className={`chip ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
            {f.label}
            {f.key !== 'all' && <span className="muted"> · {(data || []).filter((w) => w.status === f.key).length}</span>}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <input className="input" style={{ width: 220 }} placeholder="搜索工单号 / 设备 / 工地 / 技师" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? <div className="muted" style={{ padding: 24 }}>加载中…</div> : (
          <table>
            <thead>
              <tr><th>工单号</th><th>类型</th><th>任务</th><th>设备 / 工地</th><th>技师</th><th>停机</th><th>创建时间</th><th>状态</th></tr>
            </thead>
            <tbody>
              {list.map((w) => (
                <tr key={w.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(w)}>
                  <td className="mono">{w.id}<div style={{ marginTop: 2 }}><PriorityBadge priority={w.priority} /></div></td>
                  <td><TypeBadge type={w.machineType} />{w.kind === 'repair' && <div className="small muted">故障维修</div>}</td>
                  <td style={{ maxWidth: 220 }}>{w.title}</td>
                  <td className="small">{w.machineName}<div className="muted">{w.siteName}</div></td>
                  <td className="small">{w.technicianName}<div className="muted">{w.distanceKm} km</div></td>
                  <td className="mono small">{w.downtimeMinutes ? `${w.downtimeMinutes} 分` : '—'}</td>
                  <td className="small muted">{fmtTime(w.createdAt)}</td>
                  <td><StatusBadge status={w.status} /></td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={8} className="muted" style={{ padding: 24, textAlign: 'center' }}>没有匹配的工单</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {selected && <OrderModal order={selected} onClose={() => { setSelected(null); reload(); }} />}
    </>
  );
}
