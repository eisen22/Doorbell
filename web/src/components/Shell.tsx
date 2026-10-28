import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutGrid, ClipboardCheck, Users, ScanLine, FileSpreadsheet, Bell, Settings as SettingsIcon,
  Search, MessageSquareText, Menu, ChevronDown, CalendarDays, Shapes, GraduationCap, QrCode, ScrollText, ArrowLeftRight,
} from 'lucide-react';
import { Logo } from './ui';
import { SmsSimulator } from './SmsSimulator';
import { useLive, useRepo } from '../lib/repo';

interface NavItem { to: string; label: string; Icon: typeof LayoutGrid; end?: boolean; badge?: boolean }

const TEACHER_NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', Icon: LayoutGrid, end: true },
  { to: '/attendance', label: 'Attendance', Icon: ClipboardCheck },
  { to: '/students', label: 'My Students', Icon: Users },
  { to: '/calendar', label: 'Calendar', Icon: CalendarDays },
  { to: '/scanner', label: 'Scanner', Icon: ScanLine },
  { to: '/reports', label: 'Reports', Icon: FileSpreadsheet },
  { to: '/notifications', label: 'Notifications', Icon: Bell, badge: true },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
];

const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Overview', Icon: LayoutGrid, end: true },
  { to: '/admin/calendar', label: 'School Calendar', Icon: CalendarDays },
  { to: '/admin/sections', label: 'Sections', Icon: Shapes },
  { to: '/admin/teachers', label: 'Teachers', Icon: GraduationCap },
  { to: '/admin/students', label: 'Students', Icon: Users },
  { to: '/admin/cards', label: 'ID Cards', Icon: QrCode },
  { to: '/admin/settings', label: 'Settings & SMS', Icon: SettingsIcon },
  { to: '/admin/audit', label: 'Audit Log', Icon: ScrollText },
];

export function Shell() {
  const repo = useRepo();
  const navigate = useNavigate();
  const location = useLocation();
  const [simOpen, setSimOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [q, setQ] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const { data: session } = useLive((r) => r.getSession());
  const { data: unread } = useLive(async (r) => (await r.listNotifications()).filter((n) => !n.read).length);
  const isAdmin = session?.role === 'admin';
  const nav = isAdmin ? ADMIN_NAV : TEACHER_NAV;

  // Keep each role inside its own portal.
  useEffect(() => {
    if (!session) return;
    const inAdmin = location.pathname.startsWith('/admin');
    if (isAdmin && !inAdmin) navigate('/admin', { replace: true });
    if (!isAdmin && inAdmin) navigate('/', { replace: true });
  }, [session, isAdmin, location.pathname, navigate]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const switchRole = async () => {
    setMenuOpen(false);
    const next = await repo.setRole(isAdmin ? 'teacher' : 'admin');
    navigate(next.role === 'admin' ? '/admin' : '/');
  };

  return (
    <div className="canvas">
      <div className="frame">
        <aside className={`sidebar ${navOpen ? 'sidebar-open' : ''}`}>
          <div className="brand"><Logo /><span>Doorbell</span></div>
          {isAdmin && <span className="portal-tag">Admin portal</span>}
          <nav aria-label="Main">
            {nav.map(({ to, label, Icon, end, badge }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setNavOpen(false)}>
                <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
                <span>{label}</span>
                {badge && !!unread && <span className="nav-badge" aria-label={`${unread} unread`}>{unread}</span>}
              </NavLink>
            ))}
          </nav>
          <footer className="sidebar-foot">© 2026 Doorbell<br />{isAdmin ? 'School admin' : 'Teacher portal'}</footer>
        </aside>

        <div className="main">
          <header className="topbar">
            <button className="icon-btn only-mobile" onClick={() => setNavOpen((v) => !v)} aria-label="Menu"><Menu size={20} /></button>
            <form className="search" onSubmit={(e) => { e.preventDefault(); navigate(`${isAdmin ? '/admin/students' : '/students'}?q=${encodeURIComponent(q)}`); }}>
              <Search size={17} aria-hidden="true" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search students" aria-label="Search students" />
              <kbd>Enter</kbd>
            </form>
            <div className="topbar-right">
              <button className="pill-btn" onClick={() => setSimOpen(true)}>
                <MessageSquareText size={17} aria-hidden="true" /><span className="hide-sm">SMS Simulator</span>
              </button>
              {!isAdmin && (
                <button className="icon-btn bell" onClick={() => navigate('/notifications')} aria-label="Notifications">
                  <Bell size={19} />
                  {!!unread && <span className="dot-badge">{unread}</span>}
                </button>
              )}
              <div className="user-menu" ref={menuRef}>
                <button className="user-chip" onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen}>
                  <span className="avatar avatar-sm" aria-hidden="true">{session?.name.split(' ').map((p) => p[0]).join('').slice(0, 2)}</span>
                  <span className="hide-sm">{session?.name ?? '…'}</span>
                  <ChevronDown size={16} aria-hidden="true" />
                </button>
                {menuOpen && (
                  <div className="menu" role="menu">
                    <p className="menu-note">Signed in as {isAdmin ? 'School admin' : 'Teacher'}</p>
                    <button role="menuitem" onClick={switchRole}><ArrowLeftRight size={16} /> Switch to {isAdmin ? 'teacher' : 'admin'} view (demo)</button>
                  </div>
                )}
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
