import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { MachineType, OrderStatus, Severity } from '../types'

export const TYPE_LABEL: Record<MachineType, string> = { excavator: '挖机', crane: '吊车', roller: '压路机' }
export const TYPE_COLOR: Record<MachineType, string> = { excavator: '#ea580c', crane: '#2563eb', roller: '#0d9488' }

export const STATUS_LABEL: Record<OrderStatus, string> = {
  assigned: '待接单', accepted: '已接单', enroute: '前往中', arrived: '已到场',
  completed: '待客户确认', confirmed: '已恢复作业', rework: '返工中'
}

export const SEV_LABEL: Record<Severity, string> = { critical: '高危', high: '严重', medium: '一般', low: '提示' }

export function fmtTime(t?: number | null): string {
  if (!t) return '—'
  const d = new Date(t), p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function fmtDateTime(t?: number | null): string {
  if (!t) return '—'
  const d = new Date(t), p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function ago(t: number): string {
  const s = Math.floor((Date.now() - t) / 1000)
  if (s < 60) return `${s}秒前`
  if (s < 3600) return `${Math.floor(s / 60)}分钟前`
  if (s < 86400) return `${Math.floor(s / 3600)}小时前`
  return `${Math.floor(s / 86400)}天前`
}

export function Badge({ status }: { status: OrderStatus }) {
  return <span className={`badge solid st-${status}`}>{STATUS_LABEL[status]}</span>
}

// ---- Toast ----
interface ToastCtx { show: (msg: string, kind?: 'info' | 'err' | 'ok') => void }
const Ctx = createContext<ToastCtx>({ show: () => {} })
export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; kind: string } | null>(null)
  const show = useCallback((text: string, kind: 'info' | 'err' | 'ok' = 'info') => {
    setMsg({ text, kind })
    setTimeout(() => setMsg(null), 3200)
  }, [])
  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {msg && <div className={`toast ${msg.kind === 'info' ? '' : msg.kind}`}>{msg.text}</div>}
    </Ctx.Provider>
  )
}

// ---- 网络状态 ----
export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}

// ---- hash 路由 ----
export function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash || '#/')
  useEffect(() => {
    const f = () => { setHash(window.location.hash || '#/'); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  return hash.replace(/^#/, '') || '/'
}
export function navigate(to: string) { window.location.hash = to }

export function Link({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  return <a href={`#${to}`} className={className}>{children}</a>
}

export function Empty({ icon = '📭', text }: { icon?: string; text: string }) {
  return <div className="empty"><div className="big">{icon}</div><div>{text}</div></div>
}

export function Spinner() {
  return <div className="empty"><div className="big">⏳</div><div>加载中…</div></div>
}
