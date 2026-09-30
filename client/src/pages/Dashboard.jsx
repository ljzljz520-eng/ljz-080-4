import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../lib/useApi';
import { post } from '../lib/api';
import { toast } from '../lib/toast';
import { StatusBadge, PriorityBadge, TypeBadge } from '../components/Badge';
import OrderModal from '../components/OrderModal';
import { TYPE_LABELS, STATUS_LABELS } from '../lib/format';

function Progress({ hours, last, interval }) {
  const since = hours - last;
  const pct = Math.min(100, Math.round((since / interval) * 100));
  const tone = pct >= 100 ? 'danger' : pct >= 85 ? 'warn' : '';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div className={`pill-progress ${tone}`} style={{ flex: 1 }}><i style={{ width: `${pct}%` }} /></div>
      <span className="small mono muted">{pct}%</span>
    </div>
  );
}

export default function Dashboard() {
  const nav = useNavigate();
  const dash = useApi('/api/dashboard');
  const orders = useApi('/api/work-orders');
  const machines = useApi('/api/machines');
  const techs = useApi('/api/technicians');
  const meta = useApi('/api/meta');
  const [selected, setSelected] = useState(null);
  const [scanning, setScanning] = useState(false);

  const scan = async () => {
    setScanning(true);
    try {
      const r = await post('/api/dispatch/run');
      toast(r.createdCount ? `扫描完成，新派 ${r.createdCount} 单` : '扫描完成，暂无新到期工单', r.createdCount ? 'ok' : 'info');
      dash.reload(); orders.reload(); machines.reload();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setScanning(false);
    }
  };

  const d = dash.data;
  const list = orders.data || [];
  const openList = list.filter((w) => !['confirmed', 'cancelled'].includes(w.status)).slice(0, 6);

  const loadByTech = {};
  list.forEach((w) => {
    if (['dispatched', 'accepted', 'enroute', 'onsite', 'in_progress'].includes(w.status)) loadByTech[w.technicianName] = (loadByTech[w.technicianName] || 0) + 1;
  });

  const dueMachines = (machines.data || [])
    .map((m) => {
      const rules = meta.data?.rules?.[m.type] || [];
      const nextRule = rules
        .map((r) => ({ r, pct: (m.hours - (m.lastServiceHours || 0)) / r.interval }))
        .filter((x) => x.pct <= 1.2)
        .sort((a, b) => b.pct - a.pct)[0];
      return { m, nextRule };
    })
    .filter((x) => x.nextRule)
    .sort((a, b) => b.nextRule.pct - a.nextRule.pct)
    .slice(0, 8);

  return (
    <>
      <div className="topbar" style={{ position: 'static', padding: '0 0 16px', borderBottom: 'none' }}>
        <div>
          <h1>调度看板</h1>
          <div className="page-desc" style={{ marginBottom: 0 }}>按机型保养周期自动评估，结合距离 / 技能 / 在手工单负荷派给最近技师</div>
        </div>
        <div className="spacer" />
        <button className="btn" onClick={scan} disabled={scanning}>
          {scanning ? '⏳ 扫描派单中…' : '🔄 全盘扫描到期工单'}
        </button>
        <button className="btn ghost" onClick={() => nav('/sync')}>📡 去同步工况</button>
      </div>

      <div className="grid cols-4">
        <div className="card stat"><h3>在管设备</h3><div className="num brand">{d?.counts.machines ?? '—'}</div><div className="sub">{d?.counts.sites ?? 0} 个工地 · 挖机/吊车/压路机</div></div>
        <div className="card stat"><h3>在岗技师</h3><div className="num">{d?.counts.technicians ?? '—'}</div><div className="sub">按距离与机型技能匹配</div></div>
        <div className="card stat"><h3>进行中工单</h3><div className="num warn">{d?.openOrders ?? '—'}</div><div className="sub">{d?.waitingConfirm ?? 0} 单等待客户确认</div></div>
        <div className="card stat"><h3>累计工单</h3><div className="num ok">{d?.counts.workOrders ?? '—'}</div><div className="sub">{d?.ordersByStatus?.confirmed || 0} 单已恢复作业</div></div>
      </div>

      <h2 className="section-title">⏳ 进行中的工单</h2>
      <div className="grid cols-2">
        {(openList.length ? openList : []).map((w) => (
          <div key={w.id} className="card wo-card" onClick={() => setSelected(w)}>
            <div className="wo-head">
              <span className="mono small muted">{w.id}</span>
              <TypeBadge type={w.machineType} />
              <PriorityBadge priority={w.priority} />
              <div style={{ flex: 1 }} />
              <StatusBadge status={w.status} />
            </div>
            <div className="wo-title">{w.title}</div>
            <div className="wo-meta">
              <span><i className="ico">🏗️</i> {w.siteName}</span>
              <span><i className="ico">👷</i> {w.technicianName}（{w.distanceKm}km）</span>
              <span><i className="ico">🕐</i> {w.hours}h</span>
              {w.faultCodes?.length > 0 && <span className="badge red">{w.faultCodes.join('/')}</span>}
            </div>
          </div>
        ))}
        {!openList.length && <div className="card muted">暂无进行中工单</div>}
      </div>

      <div className="grid cols-2" style={{ marginTop: 26 }}>
        <div>
          <h2 className="section-title">📊 设备保养周期进度（最接近到期的 8 台）</h2>
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead><tr><th>设备</th><th>机型</th><th>表显/上次保养</th><th style={{ minWidth: 130 }}>下一周期</th></tr></thead>
              <tbody>
                {dueMachines.map(({ m, nextRule }) => (
                  <tr key={m.id}>
                    <td>{m.name}<div className="small muted mono">{m.code}</div></td>
                    <td>{TYPE_LABELS[m.type]}</td>
                    <td className="mono small">{m.hours}h / {m.lastServiceHours || 0}h</td>
                    <td>
                      <Progress hours={m.hours} last={m.lastServiceHours || 0} interval={nextRule.r.interval} />
                      <div className="small muted" style={{ marginTop: 3 }}>{nextRule.r.interval}h 周期：{nextRule.r.title.slice(0, 12)}</div>
                    </td>
                  </tr>
                ))}
                {!dueMachines.length && <tr><td colSpan={4} className="muted">暂无数据</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h2 className="section-title">👷 技师派单负荷</h2>
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead><tr><th>技师</th><th>可修机型</th><th>在手工单</th></tr></thead>
              <tbody>
                {(techs.data || []).filter((t) => t.active !== false).map((t) => (
                  <tr key={t.id}>
                    <td>{t.name}<div className="small muted">{t.phone}</div></td>
                    <td className="small">{t.skills.map((s) => TYPE_LABELS[s]).join('、')}</td>
                    <td><BadgeLoad n={loadByTech[t.name] || 0} status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2 className="section-title">📦 工单状态分布</h2>
          <div className="card">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(d?.ordersByStatus || {}).map(([k, n]) => (
                <span key={k} className="badge blue" style={{ padding: '6px 12px' }}>{STATUS_LABELS[k] || k}：{n}</span>
              ))}
              {!Object.keys(d?.ordersByStatus || {}).length && <span className="muted small">暂无工单</span>}
            </div>
          </div>
        </div>
      </div>

      {selected && (
        <OrderModal order={selected} onClose={() => { setSelected(null); orders.reload(); dash.reload(); }} />
      )}
    </>
  );
}

function BadgeLoad({ n, status }) {
  return (
    <span className={`badge ${n >= 2 ? 'amber' : 'green'}`}>
      {n} 单{n >= 2 ? ' · 负荷较高' : ''}{status === 'busy' ? ' · 作业中' : ''}
    </span>
  );
}
