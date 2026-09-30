import { NavLink, Outlet, useLocation } from 'react-router-dom';
import OfflineBar from './OfflineBar';
import { useOnline } from '../lib/useOnline';

const NAV = [
  { to: '/', icon: '🗺️', label: '调度看板', end: true },
  { to: '/sync', icon: '📡', label: '工况同步' },
  { to: '/orders', icon: '📋', label: '工单管理' },
  { to: '/tech', icon: '👷', label: '技师外勤（离线）' },
  { to: '/customer', icon: '🤝', label: '客户确认' }
];

export default function AppShell() {
  const online = useOnline();
  const loc = useLocation();
  return (
    <>
      <OfflineBar />
      <div className="app-shell">
        <aside className="sidebar">
          <div className="logo">
            <span className="mark">🚜</span>
            <div>铁甲云养<small>FLEETCARE DISPATCH</small></div>
          </div>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <span className="ico">{n.icon}</span>{n.label}
            </NavLink>
          ))}
          <div className="foot">
            <span className="sync-dot" style={{ color: online ? '#8fb98f' : '#e0928a' }}>
              <i className="d" style={{ width: 8, height: 8, borderRadius: '50%', background: online ? '#2f7d4f' : '#c0392b', display: 'inline-block' }} />
              {online ? '服务器在线' : '离线模式'}
            </span>
            <div style={{ marginTop: 8 }}>演示版 · JSON 持久化</div>
          </div>
        </aside>
        <div className="main">
          <main className="content" key={loc.pathname}>
            <Outlet />
          </main>
        </div>
      </div>
      <nav className="mobile-nav">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span>{n.icon}</span>{n.label.replace('（离线）', '')}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
