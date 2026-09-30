import { useEffect, useRef, useState } from 'react'
import { api, outbox, type OutboxItem } from '../../lib/api'
import { compressImage } from '../../lib/photo'
import { saveDraft, loadDraft, clearDraft, emptyDraft, type CompleteDraft } from '../../lib/draft'
import type { Order, PartCatalogItem } from '../../types'
import { Badge, Link, Spinner, TYPE_COLOR, TYPE_LABEL, fmtDateTime, useOnline, useToast } from '../../lib/ui'

const STEPS = [
  { key: 'assigned', label: '派单' }, { key: 'accepted', label: '接单' },
  { key: 'enroute', label: '出发' }, { key: 'arrived', label: '到场' },
  { key: 'completed', label: '完工' }, { key: 'confirmed', label: '确认' }
]
const STEP_IDX: Record<string, number> = { assigned: 0, accepted: 1, rework: 1, enroute: 2, arrived: 3, completed: 4, confirmed: 5 }

export default function FieldOrder({ id }: { id: string }) {
  const [o, setO] = useState<Order | null>(null)
  const [stale, setStale] = useState(false)
  const [partsCatalog, setPartsCatalog] = useState<PartCatalogItem[]>([])
  const [draft, setDraft] = useState<CompleteDraft>(emptyDraft())
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [queue, setQueue] = useState<OutboxItem[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const online = useOnline()
  const toast = useToast()

  const load = async () => {
    const { data, stale } = await api.orderCached(id)
    setO(data); setStale(stale)
    setQueue(await outbox.list())
  }
  useEffect(() => {
    load().catch(() => toast.show('工单加载失败', 'err'))
    api.parts().then(setPartsCatalog).catch(() => setPartsCatalog([]))
    loadDraft(id).then(d => {
      if (d) { setDraft(d); setSavedAt(d.savedAt) }
      setDraftLoaded(true)
    })
    const t = setInterval(() => load().catch(() => {}), online ? 15000 : 30000)
    return () => clearInterval(t)
  }, [id])

  const update = (patch: Partial<CompleteDraft>) => setDraft(d => ({ ...d, ...patch }))

  const persist = async (d: CompleteDraft = draft) => {
    await saveDraft(id, d); setSavedAt(Date.now())
  }
  useEffect(() => {
    if (!draftLoaded || !o || ['completed', 'confirmed'].includes(o.status)) return
    const t = setTimeout(() => persist(draft), 800)
    return () => clearTimeout(t)
  }, [draft, draftLoaded])

  const doAction = async (action: 'accept' | 'enroute' | 'arrive') => {
    setBusy(true)
    try {
      const r = await api.act(id, action) as Order
      setO(r); toast.show(action === 'accept' ? '已接单' : action === 'enroute' ? '已出发，注意安全' : '到场打卡成功', 'ok')
    } catch {
      await outbox.add({ orderId: id, kind: 'action', action, body: {} })
      setQueue(await outbox.list())
      toast.show('当前离线，操作已存入发件箱，联网自动补传', 'err')
    }
    setBusy(false); setQueue(await outbox.list())
  }

  const addPhotos = async (files: FileList | null) => {
    if (!files) return
    setBusy(true)
    try {
      const arr = await Promise.all(Array.from(files).map(async f => ({
        dataUrl: await compressImage(f), caption: ''
      })))
      update({ photos: [...draft.photos, ...arr] })
      toast.show(`已添加 ${arr.length} 张照片`, 'ok')
    } catch { toast.show('照片处理失败', 'err') }
    setBusy(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const addPart = () => update({ parts: [...draft.parts, { name: '', spec: '', qty: 1, unit: '个' }] })
  const setPart = (i: number, p: Partial<{ name: string; spec: string; qty: number; unit: string }>) => {
    const next = draft.parts.map((x, idx) => idx === i ? { ...x, ...p } : x)
    update({ parts: next })
  }
  const removePart = (i: number) => update({ parts: draft.parts.filter((_, idx) => idx !== i) })
  const pickPart = (i: number, name: string) => {
    const c = partsCatalog.find(p => p.name === name)
    setPart(i, { name, spec: c?.spec || '', unit: c?.unit || '' })
  }

  const submitComplete = async () => {
    if (!draft.diagnosis.trim()) return toast.show('请填写诊断说明', 'err')
    if (!draft.workDone.trim() && draft.parts.filter(p => p.name && p.qty > 0).length === 0)
      return toast.show('请至少填写作业内容或一条用料', 'err')
    if (draft.photos.length === 0) {
      if (!confirm('还没有现场照片，确认直接提交吗？')) return
    }
    setBusy(true)
    const body = {
      diagnosis: draft.diagnosis, workDone: draft.workDone,
      parts: draft.parts.filter(p => p.name && p.qty > 0),
      downtimeMin: Number(draft.downtimeMin) || 0,
      recovered: draft.recovered,
      photos: draft.photos.map(p => ({ dataUrl: p.dataUrl, caption: p.caption, takenAt: Date.now() }))
    }
    try {
      const r = await api.complete(id, body) as Order
      await clearDraft(id)
      setO(r); toast.show('完工报告已提交，等待客户确认', 'ok')
    } catch {
      await outbox.add({ orderId: id, kind: 'complete', body })
      setQueue(await outbox.list())
      toast.show('离线已保存到发件箱，恢复网络将自动补传', 'err')
    }
    setBusy(false); setQueue(await outbox.list())
  }

  if (!o) return <div className="container mobile-wrap"><Spinner /></div>
  const queuedComplete = queue.some(q => q.orderId === id && q.kind === 'complete')
  const queuedActions = queue.filter(q => q.orderId === id && q.kind === 'action')
  const showForm = ['arrived', 'rework'].includes(o.status) || queuedComplete
  const idx = STEP_IDX[o.status] ?? 0
  const m = o.machine

  return (
    <div className="container mobile-wrap">
      <Link to="/field" className="btn btn-ghost btn-sm">← 我的任务</Link>

      <div className="field-card mt12">
        <div className="row spread">
          <span className="mono muted" style={{ fontSize: 12 }}>{o.code}</span>
          <Badge status={o.status} />
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, marginTop: 6 }}>{o.title}</div>
        <div className="row gap6 wrap mt8">
          <span className="badge solid" style={{ background: TYPE_COLOR[m?.type || 'excavator'] }}>{TYPE_LABEL[m?.type || 'excavator']}</span>
          <span className="sub2">{m?.code} · {m?.brand}</span>
        </div>
        <div className="hr"></div>
        <dl className="kv">
          <dt>工地</dt><dd>{o.site?.name}<br /><span className="muted">{o.site?.address} · {o.site?.contact} {o.site?.phone}</span></dd>
          {o.reason.codes.length > 0 && <><dt>故障码</dt><dd>{o.reason.codes.join('、')}（参考维修建议见工单详情）</dd></>}
          {o.reason.overdueHours > 0 && <><dt>保养超期</dt><dd>{o.reason.overdueHours} 小时</dd></>}
        </dl>
      </div>

      <div className="stepper">
        {STEPS.map((s, i) => (
          <div key={s.key} className={`step ${i === idx ? 'active' : i < idx ? 'done' : ''}`}>{s.label}</div>
        ))}
      </div>

      {stale && <div className="field-card" style={{ background: '#fffbeb', borderColor: '#fde68a' }}>
        📴 当前展示的是缓存工单。可照常操作与填报，所有提交先存本机。
      </div>}

      {queuedActions.length > 0 && (
        <div className="field-card" style={{ background: '#fffbeb', borderColor: '#fde68a' }}>
          ⏳ 发件箱待补传动作：{queuedActions.map(q => q.action === 'accept' ? '接单' : q.action === 'enroute' ? '出发' : '到场').join('、')}
        </div>
      )}
      {queuedComplete && (
        <div className="field-card" style={{ background: '#ecfdf5', borderColor: '#a7f3d0' }}>
          ✅ 完工报告已存入发件箱（{draft.photos.length} 张照片），恢复网络后自动提交，提交成功前不要清理浏览器数据。
        </div>
      )}

      {/* 状态动作 */}
      {!queuedComplete && (
        <div className="field-card">
          {o.status === 'assigned' && <button className="btn btn-primary btn-block" disabled={busy} onClick={() => doAction('accept')}>✅ 接受任务</button>}
          {(o.status === 'accepted' || o.status === 'rework') && <button className="btn btn-primary btn-block" disabled={busy || o.status === 'rework'} onClick={() => doAction('enroute')}>🚚 出发前往工地</button>}
          {o.status === 'enroute' && <button className="btn btn-primary btn-block" disabled={busy} onClick={() => doAction('arrive')}>📍 到达工地打卡</button>}
          {o.status === 'arrived' && <div className="badge st-arrived" style={{ fontSize: 13.5, padding: '8px 14px' }}>已到场，请开始检修并填写完工报告 👇</div>}
          {o.status === 'completed' && <div className="empty" style={{ padding: 20 }}><div className="big">⏳</div>完工报告已提交，等待客户确认恢复作业</div>}
          {o.status === 'confirmed' && <div className="empty" style={{ padding: 20 }}><div className="big">🎉</div>客户已确认恢复作业，工单关闭</div>}
        </div>
      )}

      {/* 完工报告表单 */}
      {showForm && (
        <div className="field-card">
          <h3>🧰 完工报告{queuedComplete ? '（待补传）' : ''}</h3>

          <label className="field"><span>故障/保养诊断说明 *</span>
            <textarea rows={3} placeholder="如：回油滤芯污染严重导致压差报警，已更换并排气试机正常" value={draft.diagnosis}
              onChange={e => update({ diagnosis: e.target.value })} />
          </label>
          <label className="field"><span>施工作业内容</span>
            <textarea rows={2} placeholder="如：更换回油滤芯、检查液压油位、试车 30 分钟" value={draft.workDone}
              onChange={e => update({ workDone: e.target.value })} />
          </label>

          <div className="row spread"><span style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink-2)' }}>用料 / 配件</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addPart}>+ 添加用料</button>
          </div>
          <div className="mt8">
            {draft.parts.map((p, i) => (
              <div className="part-row" key={i}>
                <select value={p.name} onChange={e => pickPart(i, e.target.value)}>
                  <option value="">选择物料…</option>
                  {partsCatalog.map(c => <option key={c.id} value={c.name}>{c.name}（{c.spec}）</option>)}
                </select>
                <input type="number" min={0} step="0.5" value={p.qty} onChange={e => setPart(i, { qty: Number(e.target.value) })} />
                <input value={p.unit} onChange={e => setPart(i, { unit: e.target.value })} placeholder="单位" />
                <button type="button" className="btn btn-danger btn-sm" onClick={() => removePart(i)}>删</button>
              </div>
            ))}
            {draft.parts.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>暂未添加用料</div>}
          </div>

          <div className="grid cols-2 mt12">
            <label className="field" style={{ marginBottom: 0 }}><span>停机时长（分钟）</span>
              <input type="number" min={0} value={draft.downtimeMin} onChange={e => update({ downtimeMin: Number(e.target.value) })} />
            </label>
            <label className="field" style={{ marginBottom: 0, display: 'flex', alignItems: 'flex-end' }}>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 500 }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={draft.recovered} onChange={e => update({ recovered: e.target.checked })} />
                设备可恢复作业
              </span>
            </label>
          </div>
          {draft.downtimeMin >= 240 && <div className="muted mt8" style={{ color: 'var(--critical)', fontSize: 12.5 }}>⚠️ 停机超过 4 小时，请在诊断中说明原因</div>}

          <div className="mt16">
            <div className="row spread">
              <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink-2)' }}>现场照片（{draft.photos.length}）</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>📷 拍照 / 相册</button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple hidden
              onChange={e => addPhotos(e.target.files)} />
            <div className="photo-grid mt8">
              {draft.photos.map((ph, i) => (
                <div className="photo-thumb" key={i}>
                  <img src={ph.dataUrl} alt="待上传" />
                  <button type="button" className="del" onClick={() => update({ photos: draft.photos.filter((_, idx) => idx !== i) })}>×</button>
                </div>
              ))}
              {draft.photos.length === 0 && (
                <div className="photo-add" onClick={() => fileRef.current?.click()} style={{ gridColumn: '1 / -1' }}>
                  <span style={{ fontSize: 22 }}>📷</span><span>拍摄设备铭牌 / 故障部位 / 维修后照片</span>
                </div>
              )}
            </div>
          </div>

          <div className="row spread mt12" style={{ fontSize: 12.5 }}>
            <span className="muted">{savedAt ? `草稿已自动保存 ${new Date(savedAt).toLocaleTimeString()}` : '输入即自动保存到本机'}</span>
            <span className={online ? 'muted' : ''} style={{ color: online ? undefined : 'var(--high)' }}>{online ? '联网提交' : '📴 将离线入发件箱'}</span>
          </div>

          <div className="bottom-actions">
            <button className="btn btn-success btn-block" disabled={busy || queuedComplete} onClick={submitComplete}>
              {queuedComplete ? '✅ 已存入发件箱，等待联网补传' : busy ? '处理中…' : '提交完工报告'}
            </button>
          </div>
        </div>
      )}

      {/* 已完工的报告（含离线提交成功后的回显） */}
      {o.report && (
        <div className="field-card">
          <h3>📄 已提交报告</h3>
          <dl className="kv">
            <dt>诊断</dt><dd>{o.report.diagnosis}</dd>
            <dt>停机</dt><dd>{o.report.downtimeMin} 分钟</dd>
            <dt>恢复</dt><dd>{o.report.recovered ? '✅ 可恢复作业' : '继续观察'}</dd>
          </dl>
          {o.report.photos.length > 0 && (
            <div className="photo-grid mt8">
              {o.report.photos.map((p, i) => <div className="photo-thumb" key={i}><img src={p.url} loading="lazy" alt="" /></div>)}
            </div>
          )}
          {o.confirmation && <div className="mt12 sub2">{o.confirmation.recovered ? '客户已确认恢复作业 🎉' : `客户要求返工：${o.confirmation.note}`}</div>}
        </div>
      )}

      <div className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 18 }}>
        工单号 {o.code} · 创建于 {fmtDateTime(o.createdAt)}
      </div>
    </div>
  )
}
