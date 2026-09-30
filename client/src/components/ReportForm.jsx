import { useRef, useState } from 'react';
import { fileToCompressedDataUrl, fmtMinutes } from '../lib/format';
import { enqueueOrSend } from '../lib/outbox';
import { toast } from '../lib/toast';

const UNITS = ['件', '个', '桶', '升', '瓶', '根', '套'];

export default function ReportForm({ order, online, onDone }) {
  const fileRef = useRef(null);
  const [materials, setMaterials] = useState(
    order.materials?.length ? order.materials.map((m) => ({ ...m })) : [{ name: '', spec: '', qty: 1, unit: '件' }]
  );
  const [photos, setPhotos] = useState(
    order.photos?.filter((p) => p.url?.startsWith('/uploads/')).map((p) => ({ fid: p.url, url: p.url, filename: p.filename })) || []
  );
  const [downtimeMinutes, setDowntime] = useState(order.downtimeMinutes || 0);
  const [notes, setNotes] = useState(order.notes || '');
  const [checklistDone, setChecklist] = useState(order.checklistDone || []);
  const [saving, setSaving] = useState(false);

  const setMat = (i, k, v) => setMaterials((xs) => xs.map((m, j) => (j === i ? { ...m, [k]: v } : m)));
  const addMat = () => setMaterials((xs) => [...xs, { name: '', spec: '', qty: 1, unit: '件' }]);
  const delMat = (i) => setMaterials((xs) => xs.filter((_, j) => j !== i));

  const onPickFiles = async (e) => {
    const files = [...(e.target.files || [])];
    for (const f of files) {
      try {
        const dataUrl = await fileToCompressedDataUrl(f);
        setPhotos((ps) => [...ps, { fid: 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), dataUrl, url: dataUrl, filename: f.name || 'photo.jpg', pending: true }]);
      } catch {
        toast('照片读取失败：' + f.name, 'err');
      }
    }
    e.target.value = '';
  };

  const toggleCheck = (c) => setChecklist((xs) => (xs.includes(c) ? xs.filter((x) => x !== c) : [...xs, c]));

  const submit = async () => {
    const mats = materials.filter((m) => m.name.trim());
    const localPhotos = photos.filter((p) => p.pending);
    if (!mats.length && !notes.trim() && !photos.length) return toast('请至少填写用料、照片或作业说明', 'err');
    if (downtimeMinutes < 0) return toast('停机时长不能为负', 'err');
    setSaving(true);
    try {
      const body = {
        materials: mats.map((m) => ({ name: m.name.trim(), spec: m.spec, qty: Number(m.qty) || 0, unit: m.unit })),
        photos: photos.map((p) => (p.pending ? { fid: p.fid, filename: p.filename, dataUrl: p.dataUrl } : { url: p.url, filename: p.filename })),
        downtimeMinutes: Number(downtimeMinutes) || 0,
        notes: notes.trim(),
        checklistDone
      };
      const { queued } = await enqueueOrSend(
        { path: `/api/work-orders/${order.id}/report`, body, label: `完工上报 ${order.id}` },
        { online }
      );
      if (queued) {
        toast('已存入离线发件箱，联网后自动上报', 'ok');
        onDone?.({ queued: true, localReport: body });
      } else {
        toast('完工上报成功，等待客户确认', 'ok');
        onDone?.({ queued: false });
      }
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {order.checklist?.length > 0 && (
        <div className="field">
          <label>完成项目核对</label>
          <ul className="checklist">
            {order.checklist.map((c, i) => (
              <li key={i}>
                <input type="checkbox" checked={checklistDone.includes(c)} onChange={() => toggleCheck(c)} id={`ck-${i}`} />
                <label htmlFor={`ck-${i}`} style={{ color: 'var(--ink)', margin: 0, fontWeight: 400 }}>{c}</label>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="field">
        <label>🧰 更换 / 耗用物料</label>
        {materials.map((m, i) => (
          <div className="mat-row" key={i}>
            <input className="input" placeholder="物料名称（如 机滤）" value={m.name} onChange={(e) => setMat(i, 'name', e.target.value)} />
            <input className="input" placeholder="规格" value={m.spec} onChange={(e) => setMat(i, 'spec', e.target.value)} />
            <input className="input mono" type="number" min="0" step="0.5" value={m.qty} onChange={(e) => setMat(i, 'qty', e.target.value)} />
            <select className="input" value={m.unit} onChange={(e) => setMat(i, 'unit', e.target.value)}>
              {UNITS.map((u) => <option key={u}>{u}</option>)}
            </select>
            <button className="icon-btn" onClick={() => delMat(i)} title="删除">🗑️</button>
          </div>
        ))}
        <button className="btn subtle sm" onClick={addMat}>＋ 添加物料</button>
      </div>

      <div className="field">
        <label>📷 现场照片（保养前/后、故障点、铭牌，支持离线暂存）</label>
        <div className="photo-grid">
          {photos.map((p) => (
            <div key={p.fid} className="photo-item">
              <img src={p.url} alt="现场照片" />
              {p.pending && <div className="pending-tag">待上传</div>}
              <button className="del" onClick={() => setPhotos((ps) => ps.filter((x) => x.fid !== p.fid))}>✕</button>
            </div>
          ))}
          <button type="button" className="photo-add" onClick={() => fileRef.current?.click()}>
            <span style={{ fontSize: 22 }}>📷</span>拍照/相册
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }} onChange={onPickFiles} />
      </div>

      <div className="row">
        <div className="field">
          <label>⏱️ 设备停机时长（分钟）</label>
          <input className="input mono" type="number" min="0" value={downtimeMinutes} onChange={(e) => setDowntime(e.target.value)} />
          <div className="small muted">约 {fmtMinutes(Number(downtimeMinutes) || 0)}</div>
        </div>
        <div className="field" style={{ flex: 2 }}>
          <label>📝 作业说明 / 故障处理情况</label>
          <textarea className="input" placeholder="例如：液压油位低为油管接头渗漏，已紧固并补加液压油…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      <button className="btn ok block" style={{ marginTop: 8, padding: '13px', fontSize: 15 }} onClick={submit} disabled={saving}>
        {saving ? '提交中…' : online ? '✅ 完工上报，提交客户确认' : '💾 离线保存（联网后自动上报）'}
      </button>
    </div>
  );
}
