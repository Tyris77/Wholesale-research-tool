import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { getHealth } from '../api/client';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/calculator', label: 'Calculator' },
  { to: '/markets', label: 'Markets' },
  { to: '/properties', label: 'Properties' },
  { to: '/sellers', label: 'Sellers' },
  { to: '/buyers', label: 'Buyers' },
  { to: '/deals', label: 'Deals' },
  { to: '/insights', label: 'Insights' },
  { to: '/follow-ups', label: 'Follow-ups' },
  { to: '/campaigns', label: 'Campaigns' },
  { to: '/ai', label: 'AI Analyzer' },
  { to: '/research', label: 'Advanced Research' },
];

export function AppLayout() {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    getHealth()
      .then(() => active && setOnline(true))
      .catch(() => active && setOnline(false));
    return () => { active = false; };
  }, []);

  const dotClass = online === null ? '' : online ? 'online' : 'offline';
  const statusLabel = online === null ? 'Checking…' : online ? 'API online' : 'API offline';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">WI Lab</div>
        <nav className="sidebar-nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className={`status-dot ${dotClass}`} />
          <span>{statusLabel}</span>
        </div>
      </aside>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
