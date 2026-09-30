import { useEffect, useState } from 'react'
import { ToastProvider, useHashRoute, useOnline, Link } from './lib/ui'
import { outbox } from './lib/api'
import Dashboard from './views/Dashboard'
import Machines from './views/Machines'
import Technicians from './views/Technicians'
import Orders from './views/Orders'
import OrderDetail from './views/OrderDetail'
import FieldHome from './views/field/FieldHome'
import FieldOrder from './views/field/FieldOrder'
import ClientConfirm from './views/ClientConfirm'
import Sync from './views/Sync'

const NAV = [
  { to: '/', label: '调度台', match: (p: string) => p === '/' },
  { to: '/machines', label: '设备', match: (p: string) => p.startsWith('/machines') },
  { to: '/orders', label: '工单', match: (p: string) => p.startsWith('/orders') },
  { to: '/technicians', label: '技师', match: (p: string) => p.startsWith('/technicians') },
  { to: '/field', label: '技师外勤', match: (p: string) => p.startsWith('/field') },
  { to: '/client', label: '客户确认', match: (p: string) => p.startsWith('/client') },
  { to: '/sync', label: '租赁同步', match: (p: string) => p.startsWith('/sync') }
]

function Shell() {
  const path = useHashRoute()
  const online = useOnline()
  const [pending, setPending] = useState(0)

  const refreshPending = () => outbox.list().then(l => setPending(l.length)).catch(() => {})
  useEffect(() => {
    refreshPending()
    const t = setInterval(refreshPending, 4000)
    const onOnline = () => { refreshPending(); outbox.flush().then(refreshPending) }
    window.addEventListener('online', onOnline)
    return () => { clearInterval(t); window.removeEventListener('online', onOnline) }
  }, [])

  const page = (() => {
    if (path === '/' || path === '') return <Dashboard />
    if (path === '/machines') return <Machines />
    if (path.startsWith('/machines/')) return <Machines selectedId={path.split('/')[2]} />
    if (path === '/technicians') return <Technicians />
    if (path === '/orders') return <Orders />
    if (path.startsWith('/orders/')) return <OrderDetail id={path.split('/')[2]} />
    if (path === '/field') return <FieldHome />
    if (path.startsWith('/field/orders/')) return <FieldOrder id={path.split('/')[3]} />
    if (path.startsWith('/client')) {
      const id = path.startsWith('/client/') ? path.split('/')[2] : undefined
      return <ClientConfirm orderId={id} />
    }
    if (path === '/sync') return <Sync />
    return <Dashboard />
  })()

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">🏗️ 工擎云护<small>工程机械保养派单系统</small></div>
        <nav>
          {NAV.map(n => (
            <Link key={n.to} to={n.to} className={n.match(path) ? 'active' : ''}>{n.label}</Link>
          ))}
        </nav>
        <span className={`net-pill ${online ? '' : 'offline'}`}>
          {online ? '🟢 在线' : '📴 离线'}
          {pending > 0 && ` · 待发 ${pending}`}
        </span>
      </header>
      {!online && (
        <div className="offline-banner">
          📴 当前处于离线模式：可查看已缓存数据并继续填报，提交内容将存入发件箱，恢复网络后自动补传{pending > 0 ? `（${pending} 条待发）` : ''}
        </div>
      )}
      {page}
    </div>
  )
}

export default function App() {
  return <ToastProvider><Shell /></ToastProvider>
}
