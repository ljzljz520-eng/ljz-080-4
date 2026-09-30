import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { MachineType, Site } from '../types'
import { useToast } from '../lib/ui'

interface LogItem { at: number; ok: boolean; text: string }

const SAMPLE = {
  excavator: { faultCodes: ['E204'], hoursUp: 40 },
  crane: { faultCodes: ['W810'], hoursUp: 30 },
  roller: { faultCodes: [], hoursUp: 20 }
}

export default function Sync() {
  const [sites, setSites] = useState<Site[]>([])
  const [form, setForm] = useState({
    code: 'EX-SH-001', brand: '三一 SY215C', type: 'excavator' as MachineType,
    siteId: 'site-01', hours: 5263, lastMaintHours: 5000,
    lat: 31.221, lng: 121.519, faultCodesText: 'E305,F700', online: true
  })
  const [busy, setBusy] = useState(false)
  const [logs, setLogs] = useState<LogItem[]>([])
  const [lastResp, setLastResp] = useState<any>(null)
  const toast = useToast()

  useEffect(() => { api.sites().then(setSites).catch(() => {}) }, [])

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))
  const payload = {
    code: form.code, brand: form.brand, type: form.type, siteId: form.siteId,
    hours: Number(form.hours), lastMaintHours: Number(form.lastMaintHours),
    lat: Number(form.lat), lng: Number(form.lng),
    faultCodes: form.faultCodesText.split(/[,，\s]+/).filter(Boolean),
    online: form.online
  }

  const submit = async () => {
    setBusy(true)
    try {
      const r = await api.telemetry(payload) as any
      setLastResp(r)
      setLogs(l => [{ at: Date.now(), ok: true, text: `${payload.code} 同步成功 → ${r.dispatch.dispatched ? `已派单给「${r.dispatch.technician}」` : `未派单：${r.dispatch.reason}`}` }, ...l].slice(0, 8))
      toast.show('遥测同步成功', 'ok')
    } catch (e) {
      setLogs(l => [{ at: Date.now(), ok: false, text: `${payload.code} 同步失败：${(e as Error).message}` }, ...l].slice(0, 8))
      toast.show('同步失败：' + (e as Error).message, 'err')
    }
    setBusy(false)
  }

  const simulateBatch = async () => {
    setBusy(true)
    const types: MachineType[] = ['excavator', 'crane', 'roller']
    for (const type of types) {
      const site = sites.find(s => s.id === (type === 'roller' ? 'site-04' : type === 'crane' ? 'site-02' : 'site-01'))
      const body = {
        code: type === 'excavator' ? 'EX-SH-001' : type === 'crane' ? 'CR-SH-014' : 'RL-SZ-007',
        type, siteId: site?.id, hours: (type === 'excavator' ? 5263 : type === 'crane' ? 4820 : 2405),
        lastMaintHours: type === 'excavator' ? 5000 : type === 'crane' ? 4000 : 2000,
        lat: (site?.lat || 31.2) + Math.random() * 0.01 - .005,
        lng: (site?.lng || 121.5) + Math.random() * 0.01 - .005,
        faultCodes: SAMPLE[type].faultCodes, online: true
      }
      try {
        const r = await api.telemetry(body) as any
        setLogs(l => [{ at: Date.now(), ok: true, text: `${body.code}：${r.dispatch.dispatched ? '触发派单' : r.dispatch.reason}` }, ...l].slice(0, 8))
      } catch (e) {
        setLogs(l => [{ at: Date.now(), ok: false, text: `${body.code}：${(e as Error).message}` }, ...l].slice(0, 8))
      }
    }
    toast.show('批量遥测推送完成', 'ok')
    setBusy(false)
  }

  return (
    <div className="container">
      <h1 className="page-title">租赁公司 · 设备遥测同步</h1>
      <div className="page-sub">设备终端回传小时数、故障码与所在工地；系统 upsert 后立即评估保养周期并自动派单</div>

      <div className="grid cols-2 mt16">
        <div className="card">
          <h3>📡 单台设备同步（POST /api/telemetry）</h3>
          <div className="grid cols-2">
            <label className="field"><span>设备编号（已存在则更新）</span><input value={form.code} onChange={e => set('code', e.target.value)} /></label>
            <label className="field"><span>品牌型号</span><input value={form.brand} onChange={e => set('brand', e.target.value)} /></label>
          </div>
          <div className="grid cols-2">
            <label className="field"><span>机型</span>
              <select value={form.type} onChange={e => set('type', e.target.value)}>
                <option value="excavator">挖掘机（挖机）</option><option value="crane">汽车起重机（吊车）</option><option value="roller">压路机</option>
              </select>
            </label>
            <label className="field"><span>所在工地</span>
              <select value={form.siteId} onChange={e => set('siteId', e.target.value)}>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>
          <div className="grid cols-2">
            <label className="field"><span>累计小时数 h</span><input type="number" value={form.hours} onChange={e => set('hours', e.target.value)} /></label>
            <label className="field"><span>上次保养小时 h</span><input type="number" value={form.lastMaintHours} onChange={e => set('lastMaintHours', e.target.value)} /></label>
          </div>
          <div className="grid cols-2">
            <label className="field"><span>纬度 lat</span><input type="number" step="0.001" value={form.lat} onChange={e => set('lat', e.target.value)} /></label>
            <label className="field"><span>经度 lng</span><input type="number" step="0.001" value={form.lng} onChange={e => set('lng', e.target.value)} /></label>
          </div>
          <label className="field"><span>故障码（逗号分隔，如 E305,F700）</span><input value={form.faultCodesText} onChange={e => set('faultCodesText', e.target.value)} /></label>
          <label className="field" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={form.online} onChange={e => set('online', e.target.checked)} style={{ width: 'auto' }} /> 设备在线（终端通讯正常）
          </label>
          <button className="btn btn-primary btn-block" disabled={busy} onClick={submit}>同步并触发自动派单</button>
        </div>

        <div>
          <div className="card">
            <h3>🧾 请求载荷预览</h3>
            <pre className="mono" style={{ background: '#0f172a', color: '#a7f3d0', padding: 14, borderRadius: 8, fontSize: 12, overflowX: 'auto' }}>{JSON.stringify(payload, null, 2)}</pre>
            <button className="btn btn-ghost btn-block mt12" disabled={busy} onClick={simulateBatch}>▶ 模拟三机型批量回传</button>
          </div>
          <div className="card mt12">
            <h3>📜 同步日志</h3>
            {logs.length === 0 ? <div className="muted">暂无记录</div> : logs.map((l, i) => (
              <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
                <span style={{ color: l.ok ? 'var(--ok)' : 'var(--critical)' }}>{l.ok ? '✅' : '❌'}</span> {l.text}
                <div className="muted" style={{ fontSize: 11.5 }}>{new Date(l.at).toLocaleTimeString()}</div>
              </div>
            ))}
            {lastResp && (
              <details className="mt12"><summary className="muted" style={{ cursor: 'pointer' }}>查看最近响应</summary>
                <pre className="mono" style={{ fontSize: 12, overflowX: 'auto' }}>{JSON.stringify(lastResp, null, 2)}</pre>
              </details>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
