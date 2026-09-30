import { useState } from 'react';
import { useApi } from '../lib/useApi';
import { post } from '../lib/api';
import { toast } from '../lib/toast';
import { TypeBadge } from '../components/Badge';
import { TYPE_LABELS } from '../lib/format';

const EMPTY = { code: '', name: '', type: 'excavator', hours: '', lastServiceHours: '', siteCode: '', faultCodes: '' };

export default function SyncPage() {
  const machines = useApi('/api/machines');
  const sites = useApi('/api/sites');
  const meta = useApi('/api/meta');
  const [form, setForm] = useState(EMPTY);
  const [batch, setBatch] = useState('');
  const [result, setResult] = useState(null);
  const [sending, setSending] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const pickMachine = (code) => {
    const m = machines.data.find((x) => x.code === code);
    if (!m) return;
    setForm({
      code: m.code, name: m.name, type: m.type, hours: m.hours,
      lastServiceHours: m.lastServiceHours || '', siteCode: sites.data.find((s) => s.id === m.siteId)?.name || '',
      faultCodes: (m.faultCodes || []).join(',')
    });
  };

  const submit = async (records) => {
    setSending(true);
    try {
      const r = await post('/api/telemetry', { records });
      const created = r.results.flatMap((x) => x.dispatch?.created || []);
      const noTech = r.results.flatMap((x) => x.dispatch?.noAvailableTech || []);
      setResult(r.results);
      toast(`同步成功，自动派单 ${created.length} 项${noTech.length ? '，' + noTech.length + ' 项暂无可用技师' : ''}`, created.length ? 'ok' : 'info');
      machines.reload();
      setForm(EMPTY);
      setBatch('');
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setSending(false);
    }
  };

  const submitOne = () => {
    if (!form.code || form.hours === '') return toast('请填写设备编码与当前小时数', 'err');
    const rec = {
      code: form.code.trim(),
      name: form.name || undefined,
      type: form.type,
      hours: Number(form.hours),
      lastServiceHours: form.lastServiceHours === '' ? undefined : Number(form.lastServiceHours),
      siteCode: form.siteCode || undefined,
      faultCodes: form.faultCodes ? form.faultCodes.split(/[,，\s]+/).filter(Boolean) : []
    };
    submit([rec]);
  };

  const submitBatch = () => {
    try {
      const data = JSON.parse(batch);
      const records = Array.isArray(data) ? data : data.records;
      if (!Array.isArray(records)) throw new Error('需为数组或含 records 数组');
      submit(records);
    } catch (e) {
      toast('JSON 解析失败：' + e.message, 'err');
    }
  };

  const fillDemo = () => {
    setBatch(JSON.stringify({
      records: [
        { code: 'CR-002', hours: 2402, faultCodes: [] },
        { code: 'RO-002', hours: 903, faultCodes: [] },
        { code: 'EX-002', hours: 1001, faultCodes: ['E202'] },
        { code: 'EX-001', hours: 520, faultCodes: [] }
      ]
    }, null, 2));
  };

  return (
    <>
      <h1>租赁公司工况同步</h1>
      <p className="page-desc">租赁方定时回传挖机 / 吊车 / 压路机的工作小时数、故障码与所在工地；系统收到后立即按保养周期评估并自动派单。接口：<code className="mono">POST /api/telemetry</code></p>

      <div className="grid cols-2">
        <div className="card">
          <h2 className="section-title" style={{ marginTop: 0 }}>📡 单台回传</h2>
          <div className="field">
            <label>选择在管设备（自动带出当前工况）</label>
            <select className="input" value={form.code} onChange={(e) => pickMachine(e.target.value)}>
              <option value="">— 手动输入或选择设备 —</option>
              {(machines.data || []).map((m) => <option key={m.id} value={m.code}>{m.code} · {m.name}</option>)}
            </select>
          </div>
          <div className="row">
            <div className="field"><label>设备编码 *</label><input className="input mono" value={form.code} onChange={set('code')} placeholder="如 EX-001" /></div>
            <div className="field"><label>机型（新设备建档用）</label>
              <select className="input" value={form.type} onChange={set('type')}>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="row">
            <div className="field"><label>当前小时数 h *</label><input type="number" className="input mono" value={form.hours} onChange={set('hours')} /></div>
            <div className="field"><label>上次保养小时 h</label><input type="number" className="input mono" value={form.lastServiceHours} onChange={set('lastServiceHours')} /></div>
          </div>
          <div className="row">
            <div className="field">
              <label>所在工地</label>
              <select className="input" value={form.siteCode} onChange={set('siteCode')}>
                <option value="">— 未变更 / 不在工地 —</option>
                {(sites.data || []).map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>故障码（逗号分隔，空表示清除）</label>
              <input className="input mono" value={form.faultCodes} onChange={set('faultCodes')} placeholder="如 E201,E101" />
            </div>
          </div>
          <button className="btn block" onClick={submitOne} disabled={sending}>{sending ? '同步中…' : '同步工况并自动派单'}</button>
        </div>

        <div className="card">
          <h2 className="section-title" style={{ marginTop: 0 }}>📦 批量回传（JSON）</h2>
          <textarea className="input mono" style={{ minHeight: 210, fontSize: 12 }} value={batch} onChange={(e) => setBatch(e.target.value)}
            placeholder={'{\n  "records": [\n    { "code": "EX-001", "hours": 520, "faultCodes": [] }\n  ]\n}'} />
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn" onClick={submitBatch} disabled={sending || !batch}>批量同步</button>
            <button className="btn subtle" onClick={fillDemo}>填入演示数据</button>
          </div>
        </div>
      </div>

      {result && (
        <>
          <h2 className="section-title">✅ 同步结果</h2>
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead><tr><th>设备编码</th><th>小时数</th><th>故障码</th><th>系统动作</th></tr></thead>
              <tbody>
                {result.map((r, i) => (
                  <tr key={i}>
                    <td className="mono">{r.code || '—'}{r.skipped && <span className="badge red" style={{ marginLeft: 8 }}>{r.skipped}</span>}</td>
                    <td className="mono">{r.hours ?? '—'}</td>
                    <td className="mono">{(r.faultCodes || []).join('、') || <span className="muted">无</span>}</td>
                    <td>
                      {(r.dispatch?.created || []).map((c, j) => (
                        <div key={j} className="small"><span className="badge green">已派单 {c.id}</span> {c.title} → <b>{c.technician}</b></div>
                      ))}
                      {(r.dispatch?.noAvailableTech || []).map((t2, j) => <div key={j} className="small"><span className="badge red">50km 内无匹配技师</span> {t2}</div>)}
                      {r.dispatch?.reason && <span className="muted small">{r.dispatch.reason}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2 className="section-title">🏗️ 设备台账（最新工况）</h2>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>编码</th><th>设备</th><th>机型</th><th>所在工地</th><th>小时数</th><th>上次保养</th><th>故障码</th></tr></thead>
          <tbody>
            {(machines.data || []).map((m) => {
              const site = sites.data?.find((s) => s.id === m.siteId);
              return (
                <tr key={m.id}>
                  <td className="mono">{m.code}</td>
                  <td>{m.name}</td>
                  <td><TypeBadge type={m.type} /> <span className="muted small">{TYPE_LABELS[m.type]}</span></td>
                  <td className="small">{site?.name || <span className="muted">未上工地</span>}</td>
                  <td className="mono"><b>{m.hours}</b> h</td>
                  <td className="mono small muted">{m.lastServiceHours || 0} h</td>
                  <td>{(m.faultCodes || []).length ? <span className="badge red">{m.faultCodes.join('、')}</span> : <span className="muted small">正常</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <details className="card" style={{ marginTop: 16 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>📖 故障码字典与保养周期规则</summary>
        <div className="grid cols-2" style={{ marginTop: 14 }}>
          <div>
            <h4 style={{ margin: '8px 0' }}>故障码</h4>
            <table>
              <tbody>
                {Object.entries(meta.data?.faultCodes || {}).map(([code, f]) => (
                  <tr key={code}><td className="mono">{code}</td><td>{f.label}</td>
                    <td><span className={`badge ${f.severity === 'critical' ? 'red' : f.severity === 'high' ? 'amber' : 'gray'}`}>{f.severity}</span></td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h4 style={{ margin: '8px 0' }}>保养周期（工作小时）</h4>
            {Object.entries(meta.data?.rules || {}).map(([type, rules]) => (
              <div key={type} style={{ marginBottom: 10 }}>
                <b>{TYPE_LABELS[type]}</b>
                <div className="small muted">{rules.map((r) => r.interval + 'h').join(' / ')}</div>
              </div>
            ))}
          </div>
        </div>
      </details>
    </>
  );
}
