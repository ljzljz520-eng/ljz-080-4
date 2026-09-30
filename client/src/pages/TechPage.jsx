import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { get } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useOnline } from '../lib/useOnline';
import { StatusBadge, PriorityBadge } from '../components/Badge';
import ReportForm from '../components/ReportForm';
import { toast } from '../lib/toast';
import {
  enqueueOrSend, loadSnapshot, onOutboxChange, retryOutbox, saveSnapshot, snapKey
} from '../lib/outbox';
import { outboxAll } from '../lib/idb';
import { STATUS_LABELS, fmtTime } from '../lib/format';

const STEP_ORDER = ['dispatched', 'accepted', 'enroute', 'onsite', 'in_progress'];
const NEXT_ACTION = {
  dispatched: { to: 'accepted', label: '接单', icon: '✅' },
  accepted: { to: 'enroute', label: '出发', icon: '🚚' },
  enroute: { to: 'onsite', label: '已到场', icon: '📍' },
  onsite: { to: 'in_progress', label: '开始作业', icon: '🔧' }
};

export default function TechPage() {
  const browserOnline = useOnline();
  const [forceOffline, setForceOffline] = useState(() => localStorage.getItem('demoOffline') === '1');
  const online = browserOnline && !forceOffline;
  const [searchParams] = useSearchParams();
  const techs = useApi('/api/technicians');
  const [techId, setTechId] = useState(() => localStorage.getItem('techId') || '');
  const [orders, setOrders] = useState(null);
  const [fromCache, setFromCache] = useState(false);
  const [snapshotAt, setSnapshotAt] = useState(null);
  const [tab, setTab] = useState('active');
  const [reporting, setReporting] = useState(null);
  const [outboxItems, setOutboxItems] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => onOutboxChange(({ items }) => setOutboxItems(items)), []);

  const effectiveId = techId || techs.data?.[0]?.id || '';

  // 把待同步队列叠加到工单：离线接单推进状态、离线完工上报显示“待上报”
  const applyQueued = useCallback((list, items) => {
    const byId = {};
    for (const it of items) {
      const parts = it.path.split('/'); // /api/work-orders/WOxxx/transition|report
      const id = parts[3];
      if (!id || !byId[id]) byId[id] = [];
      byId[id].push(it);
    }
    return list.map((w) => {
      const ops = (byId[w.id] || []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      let next = { ...w };
      for (const it of ops) {
        if (it.path.endsWith('/transition')) next = { ...next, status: it.body.to };
        if (it.path.endsWith('/report')) next = { ...next, status: 'pending_confirm', ...stripReport(it.body), offlineReportAt: it.createdAt };
      }
      return next;
    });
  }, []);

  const loadOrders = useCallback(async () => {
    if (!effectiveId) return;
    const key = snapKey(effectiveId);
    let source = [];
    let cached = false;
    if (!online) {
      const snap = await loadSnapshot(key);
      source = snap.list || [];
      cached = true;
      setSnapshotAt(snap.savedAt);
    } else {
      try {
        source = await get(`/api/work-orders?technicianId=${effectiveId}`);
        await saveSnapshot(key, source);
        setSnapshotAt(new Date().toISOString());
      } catch (e) {
        const snap = await loadSnapshot(key);
        source = snap.list || [];
        cached = true;
        setSnapshotAt(snap.savedAt);
      }
    }
    setFromCache(cached);
    const queue = await outboxAll();
    setOrders(applyQueued(source, queue.filter((it) => it.path.startsWith('/api/work-orders/'))));
  }, [effectiveId, online, applyQueued]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // 队列变化（入队/同步完成）后重新合并
  useEffect(() => {
    loadOrders();
  }, [outboxItems.length, loadOrders]);

  // 支持 /tech?id=WOxxx 深链直达工单
  useEffect(() => {
    const id = searchParams.get('id');
    if (id && orders) {
      const w = orders.find((x) => x.id === id);
      if (w && !reporting) setReporting(w);
    }
  }, [orders, searchParams]); // eslint-disable-line

  const chooseTech = (id) => {
    setTechId(id);
    localStorage.setItem('techId', id);
  };

  const act = async (w, to) => {
    setBusy(true);
    try {
      const { queued } = await enqueueOrSend(
        { path: `/api/work-orders/${w.id}/transition`, body: { to }, label: `${STATUS_LABELS[to] || to} ${w.id}` },
        { online }
      );
      if (queued) {
        toast('操作已入离线队列', 'ok');
        setOrders((xs) => xs.map((x) => (x.id === w.id ? { ...x, status: to } : x)));
      } else {
        toast(STATUS_LABELS[to] || to, 'ok');
      }
      if (online) loadOrders();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const openReport = (w) => setReporting(w);

  const onReported = ({ queued: queuedReport, localReport }) => {
    if (queuedReport && localReport) {
      setOrders((xs) => xs.map((w) => (w.id === reporting.id ? { ...w, status: 'pending_confirm', ...stripReport(localReport), offlineReportAt: new Date().toISOString() } : w)));
    }
    setReporting(null);
    if (online) setTimeout(loadOrders, 400);
  };

  const tech = (techs.data || []).find((t) => t.id === effectiveId);
  const active = (orders || []).filter((w) => !['confirmed', 'cancelled', 'rejected'].includes(w.status));
  const closed = (orders || []).filter((w) => ['confirmed', 'cancelled', 'rejected'].includes(w.status));
  const showList = tab === 'active' ? active : closed;

  const toggleDemoOffline = () => {
    const v = !forceOffline;
    setForceOffline(v);
    localStorage.setItem('demoOffline', v ? '1' : '0');
    toast(v ? '已切换到模拟离线：现在可体验断网填报' : '已恢复联网', 'info');
  };

  return (
    <div className="mobile-frame" style={{ boxShadow: '0 0 40px rgba(15,30,48,.12)' }}>
      <div className="mobile-head">
        <div className="who">
          <div className="avatar">👷</div>
          <div style={{ flex: 1 }}>
            <h2>技师外勤</h2>
            <div className="sub">
              <select
                value={effectiveId}
                onChange={(e) => chooseTech(e.target.value)}
                style={{ background: 'rgba(255,255,255,.15)', color: '#fff', border: 'none', borderRadius: 6, padding: '2px 6px', fontSize: 12 }}
              >
                {(techs.data || []).map((t) => <option key={t.id} value={t.id} style={{ color: '#000' }}>{t.name} · {t.phone}</option>)}
              </select>
            </div>
          </div>
          <span className={`sync-dot ${online ? '' : 'offline'}`} style={{ color: '#fff' }}>
            <i className="d" style={{ width: 8, height: 8, borderRadius: '50%', background: online ? '#7be08a' : '#ff8a7a', display: 'inline-block' }} />
            {online ? '在线' : '离线'}
          </span>
        </div>
        <button
          onClick={toggleDemoOffline}
          style={{ marginTop: 10, width: '100%', border: '1px solid rgba(255,255,255,.35)', background: forceOffline ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.08)', color: '#fff', borderRadius: 8, padding: '6px', fontSize: 12, cursor: 'pointer' }}
        >
          {forceOffline ? '📵 模拟离线中（点击恢复联网）' : '📶 模拟断网体验离线填报（点击）'}
        </button>
      </div>

      {(!online || fromCache) && (
        <div style={{ margin: '12px 14px 0' }}>
          {!online && <div className="outbox-banner">📵 离线模式：工单来自本机缓存，可照常接单、填用料、拍照；数据先存手机，恢复联网自动上报。</div>}
          {online && fromCache && snapshotAt && <div className="outbox-banner" style={{ background: 'var(--brand-soft)', borderColor: '#bcd7f0', color: 'var(--brand-dark)' }}>🕒 正在展示本机缓存工单（快照 {fmtTime(snapshotAt)}）</div>}
        </div>
      )}

      {outboxItems.length > 0 && (
        <div style={{ margin: '12px 14px 0' }}>
          <div className="outbox-banner">
            <span style={{ fontSize: 18 }}>📤</span>
            <div style={{ flex: 1 }}>
              <b>{outboxItems.length} 条上报待同步</b>
              <div className="small">{outboxItems.map((i) => i.label).slice(0, 3).join('；')}{outboxItems.length > 3 ? ' 等' : ''}</div>
            </div>
            <button className="btn sm" disabled={!online} onClick={retryOutbox}>{online ? '立即同步' : '离线中'}</button>
          </div>
        </div>
      )}

      <div className="mobile-tabs" style={{ margin: '12px 14px 0', position: 'static' }}>
        <button className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>我的工单（{active.length}）</button>
        <button className={tab === 'closed' ? 'active' : ''} onClick={() => setTab('closed')}>已完成（{closed.length}）</button>
      </div>

      <div className="mobile-body">
        {orders === null && <div className="muted" style={{ textAlign: 'center', padding: 30 }}>加载工单中…</div>}
        {orders !== null && !showList.length && <div className="muted" style={{ textAlign: 'center', padding: 30 }}>{tab === 'active' ? '当前没有进行中的工单' : '暂无已完成工单'}</div>}
        {showList.map((w) => {
          const stepIdx = STEP_ORDER.indexOf(w.status);
          const next = NEXT_ACTION[w.status];
          const isUrgent = w.priority === 'urgent';
          return (
            <div key={w.id} className={`m-wo ${isUrgent ? 'urgent' : w.priority === 'high' ? 'high' : ''}`}>
              <div className="t1">
                <span className="name mono small" style={{ fontWeight: 700 }}>{w.id}</span>
                <PriorityBadge priority={w.priority} />
                <div style={{ flex: 1 }} />
                <StatusBadge status={w.status} />
              </div>
              <div style={{ fontWeight: 650 }}>{w.title}</div>
              <div className="info">
                <span>🚜 {w.machineName}（表显 {w.hours}h）</span>
                <span>🏗️ {w.siteName} · {w.address}</span>
                <span>🤝 {w.customerName} · 距你 {w.distanceKm} km{w.technicianPhone ? ` · ${w.technicianPhone}` : ''}</span>
                {w.faultCodes?.length > 0 && <span className="badge red" style={{ width: 'fit-content' }}>故障码：{w.faultCodes.join('、')}</span>}
                {w.offlineReportAt && <span className="badge amber" style={{ width: 'fit-content' }}>本机已填，待上报 · {fmtTime(w.offlineReportAt)}</span>}
              </div>
              {stepIdx >= 0 && (
                <div className="steps">
                  {STEP_ORDER.map((s, i) => <i key={s} className={i <= stepIdx ? 'on' : ''} />)}
                </div>
              )}
              <div className="m-actions">
                {next && <button className="btn ghost" disabled={busy} onClick={() => act(w, next.to)}>{next.icon} {next.label}</button>}
                {(w.status === 'in_progress' || w.status === 'onsite') && <button className="btn ok" onClick={() => openReport(w)}>📝 填写完工上报</button>}
                {w.status === 'pending_confirm' && (
                  <>
                    <button className="btn subtle" onClick={() => openReport(w)}>👀 查看上报</button>
                    <a className="btn ghost" href={`/customer/${w.id}`} target="_blank" rel="noreferrer">🤝 发客户确认</a>
                  </>
                )}
                {w.status === 'confirmed' && <button className="btn subtle" onClick={() => openReport(w)}>查看归档</button>}
                {w.status === 'rejected' && <button className="btn danger" onClick={() => openReport(w)}>客户要求返工 · 处理</button>}
              </div>
            </div>
          );
        })}
        <div className="small muted" style={{ textAlign: 'center', padding: '10px 0 24px' }}>
          {fromCache && !online ? '当前数据来自离线缓存' : online ? `数据${fromCache ? '缓存' : ''}已更新 · ${fmtTime(snapshotAt)}` : ''}
        </div>
      </div>

      {reporting && (
        <div className="modal-mask" onMouseDown={(e) => e.target === e.currentTarget && setReporting(null)}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-head">
              <h3>{reporting.id} · 完工上报</h3>
              <StatusBadge status={reporting.status} />
              <button className="icon-btn" onClick={() => setReporting(null)}>✕</button>
            </div>
            <div className="modal-body">
              <dl className="kv" style={{ marginBottom: 14 }}>
                <dt>任务</dt><dd>{reporting.title}</dd>
                <dt>设备</dt><dd>{reporting.machineName}（{reporting.hours}h）</dd>
                <dt>工地</dt><dd>{reporting.siteName}</dd>
              </dl>
              {['pending_confirm', 'confirmed', 'rejected'].includes(reporting.status) ? (
                <SubmittedView order={reporting} online={online} onReload={() => setReporting(null)} />
              ) : (
                <ReportForm order={reporting} online={online} onDone={onReported} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function stripReport(body) {
  return {
    materials: body.materials || [],
    photos: (body.photos || []).map((p) => ({ url: p.url || p.dataUrl, filename: p.filename, pending: !p.url })),
    downtimeMinutes: body.downtimeMinutes,
    notes: body.notes,
    checklistDone: body.checklistDone || []
  };
}

function SubmittedView({ order, online, onReload }) {
  const [saving, setSaving] = useState(false);
  const resubmit = async () => {
    setSaving(true);
    try {
      const body = {
        materials: order.materials,
        photos: order.photos.map((p) => (p.url?.startsWith('/uploads/') ? { url: p.url, filename: p.filename } : { dataUrl: p.url, filename: p.filename })),
        downtimeMinutes: order.downtimeMinutes,
        notes: order.notes,
        checklistDone: order.checklistDone
      };
      const { queued } = await enqueueOrSend({ path: `/api/work-orders/${order.id}/report`, body, label: `返工上报 ${order.id}` }, { online });
      toast(queued ? '已加入离线队列' : '已重新上报', 'ok');
      onReload();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {order.confirmation && (
        <div className={`outbox-banner`} style={{ background: order.confirmation.resume ? 'var(--ok-soft)' : 'var(--danger-soft)', borderColor: order.confirmation.resume ? '#9ecfb0' : '#eeb0ab', color: order.confirmation.resume ? 'var(--ok)' : 'var(--danger)', marginBottom: 12 }}>
          {order.confirmation.resume ? '✅ 客户已确认恢复作业' : '↩️ 客户认为未恢复，要求返工'}
          {order.confirmation.comment ? `：${order.confirmation.comment}` : ''}
        </div>
      )}
      {order.offlineReportAt && !online && (
        <div className="outbox-banner" style={{ marginBottom: 12 }}>此单已在本机填写完成，恢复联网后将自动上报。</div>
      )}
      <dl className="kv">
        <dt>停机时长</dt><dd>{order.downtimeMinutes} 分钟</dd>
        <dt>用料</dt><dd>{(order.materials || []).map((m) => `${m.name}×${m.qty}${m.unit}`).join('、') || '—'}</dd>
        <dt>照片</dt><dd>{order.photos?.length || 0} 张</dd>
      </dl>
      {order.photos?.length > 0 && (
        <div className="photo-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', margin: '10px 0' }}>
          {order.photos.map((p, i) => (
            <a key={i} className="photo-item" href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt="" /></a>
          ))}
        </div>
      )}
      <p style={{ background: '#f7fafd', padding: '10px 12px', borderRadius: 8 }}>{order.notes || '（无说明）'}</p>
      {order.status === 'rejected' && (
        <button className="btn danger block" disabled={saving} onClick={resubmit} style={{ marginTop: 12 }}>{saving ? '提交中…' : '↩️ 整改后重新上报'}</button>
      )}
    </div>
  );
}
