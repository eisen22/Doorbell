import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutGrid, ClipboardCheck, Users, ScanLine, FileSpreadsheet, Bell, Settings as SettingsIcon,
  Search, MessageSquareText, Menu, ChevronDown,
} from 'lucide-react';
import { Logo } from './ui';
import { SmsSimulator } from './SmsSimulator';
import { useLive } from '../lib/repo';

const NAV = [
  { to: '/', label: 'Dashboard', Icon: LayoutGrid, end: true },
  { to: '/attendance', label: 'Attendance', Icon: ClipboardCheck },
  { to: '/students', label: 'My Students', Icon: Users },
  { to: '/scanner', label: 'Scanner', Icon: ScanLine },
  { to: '/reports', label: 'Reports', Icon: FileSpreadsheet },
  { to: '/notifications', label: 'Notifications', Icon: Bell, badge: true },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
];

export function Shell() {
  const navigate = useNavigate();
  const [simOpen, setSimOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [q, setQ] = useState('');
  const { data: session } = useLive((r) => r.getSession());
  const { data: unread } = useLive(async (r) => (await r.listNotifications()).filter((n) => !n.read).length);

  return (
    <div className="canvas">
      <div className="frame">
        <aside className={`sidebar ${navOpen ? 'sidebar-open' : ''}`}>
          <div className="brand"><Logo /><span>Safe Arrival</span></div>
          <nav aria-label="Main">
            {NAV.map(({ to, label, Icon, end, badge }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setNavOpen(false)}>
                <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
                <span>{label}</span>
                {badge && !!unread && <span className="nav-badge" aria-label={`${unread} unread`}>{unread}</span>}
              </NavLink>
            ))}
          </nav>
          <footer className="sidebar-foot">© 2026 Safe Arrival<br />Teacher portal</footer>
        </aside>

        <div className="main">
          <header className="topbar">
            <button className="icon-btn only-mobile" onClick={() => setNavOpen((v) => !v)} aria-label="Menu"><Menu size={20} /></button>
            <form className="search" onSubmit={(e) => { e.preventDefault(); navigate(`/students?q=${encodeURIComponent(q)}`); }}>
              <Search size={17} aria-hidden="true" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search students" aria-label="Search students" />
              <kbd>Enter</kbd>
            </form>
            <div className="topbar-right">
              <button className="pill-btn" onClick={() => setSimOpen(true)}>
                <MessageSquareText size={17} aria-hidden="true" /><span className="hide-sm">SMS Simulator</span>
              </button>
              <button className="icon-btn bell" onClick={() => navigate('/notifications')} aria-label="Notifications">
                <Bell size={19} />
                {!!unread && <span className="dot-badge">{unread}</span>}
              </button>
              <div className="user-chip">
                <span className="avatar avatar-sm" aria-hidden="true">{session?.name.split(' ').map((p) => p[0]).join('').slice(0, 2)}</span>
                <span className="hide-sm">{session?.name ?? '…'}</span>
                <ChevronDown size={16} aria-hidden="true" />
              </div>
            </div>
          </header>
          <main className="content"><Outlet /></main>
        </div>
      </div>
      <SmsSimulator open={simOpen} onClose={() => setSimOpen(false)} />
    </div>
  );
}
