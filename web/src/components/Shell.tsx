import { useEffect, useRef, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutGrid, ClipboardCheck, Users, ScanLine, FileSpreadsheet, Bell, Settings as SettingsIcon,
  Search, Menu, ChevronDown, CalendarDays, Shapes, GraduationCap, QrCode, ScrollText, LogOut, MessageSquareText, UserX,
} from 'lucide-react';
import { Logo, Skeleton } from './ui';
import { useLive, useRepo } from '../lib/repo';

interface NavItem { to: string; label: string; Icon: typeof LayoutGrid; end?: boolean; badge?: 'alerts' | 'watch' }

const TEACHER_NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', Icon: LayoutGrid, end: true },
  { to: '/attendance', label: 'Attendance', Icon: ClipboardCheck },
  { to: '/students', label: 'My Students', Icon: Users },
  { to: '/calendar', label: 'Calendar', Icon: CalendarDays },
  { to: '/scanner', label: 'Scanner', Icon: ScanLine },
  { to: '/reports', label: 'Reports', Icon: FileSpreadsheet },
  { to: '/notifications', label: 'Alerts', Icon: Bell, badge: 'alerts' },
  { to: '/sms', label: 'SMS Messages', Icon: MessageSquareText },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
];

const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Overview', Icon: LayoutGrid, end: true },
  { to: '/admin/absences', label: 'Absence Watch', Icon: UserX, badge: 'watch' },
  { to: '/admin/calendar', label: 'School Calendar', Icon: CalendarDays },
  { to: '/admin/sections', label: 'Sections', Icon: Shapes },
  { to: '/admin/teachers', label: 'Teachers', Icon: GraduationCap },
  { to: '/admin/students', label: 'Students', Icon: Users },
  { to: '/admin/cards', label: 'ID Cards', Icon: QrCode },
  { to: '/admin/sms', label: 'SMS Messages', Icon: MessageSquareText },
  { to: '/admin/settings', label: 'Settings', Icon: SettingsIcon },
  { to: '/admin/audit', label: 'Audit Log', Icon: ScrollText },
];

export function Shell() {
  const repo = useRepo();
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [q, setQ] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const { data: session, loading } = useLive((r) => r.getSession());
  const { data: counts } = useLive(async (r) => {
    const s = await r.getSession();
    if (!s) return { alerts: 0, watch: 0 };
    const alerts = (await r.listNotifications()).filter((n) => !n.read).length;
    const watch = s.role === 'admin' ? (await r.listAttention(3)).length : 0;
    return { alerts, watch };
  });
  const isAdmin = session?.role === 'admin';
  const nav = isAdmin ? ADMIN_NAV : TEACHER_NAV;

  useEffect(() => {
    const close = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (loading && !session) return <div className="canvas"><div className="frame boot"><Skeleton h={40} w={200} /></div></div>;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  // Keep each role inside its own portal.
  const inAdmin = location.pathname.startsWith('/admin');
  if (isAdmin && !inAdmin) return <Navigate to="/admin" replace />;
  if (!isAdmin && inAdmin) return <Navigate to="/" replace />;

  const needsSection = !isAdmin && !session.sectionId && !['/calendar', '/settings', '/sms'].includes(location.pathname);

  return (
    <div className="canvas">
      <div className="frame">
        <aside className={`sidebar ${navOpen ? 'sidebar-open' : ''}`}>
          <div className="brand"><Logo /><span>Doorbell</span></div>
          {isAdmin && <span className="portal-tag">Admin portal</span>}
          <nav aria-label="Main">
            {nav.map(({ to, label, Icon, end, badge }) => {
              const n = badge ? counts?.[badge] ?? 0 : 0;
              return (
                <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setNavOpen(false)}>
                  <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
                  <span>{label}</span>
                  {n > 0 && <span className={`nav-badge ${badge === 'watch' ? 'nav-badge-red' : ''}`} aria-label={`${n}`}>{n}</span>}
                </NavLink>
              );
            })}
          </nav>
          <footer className="sidebar-foot">© 2026 Doorbell<br />{repo.mode === 'demo' ? 'Demo mode (sample data)' : 'Connected to the cloud'}</footer>
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
              {!isAdmin && (
                <button className="icon-btn bell" onClick={() => navigate('/notifications')} aria-label="Alerts">
                  <Bell size={19} />
                  {!!counts?.alerts && <span className="dot-badge">{counts.alerts}</span>}
                </button>
              )}
              <div className="user-menu" ref={menuRef}>
                <button className="user-chip" onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen}>
                  <span className="avatar avatar-sm" aria-hidden="true">{session.name.split(' ').map((p) => p[0]).join('').slice(0, 2)}</span>
                  <span className="hide-sm">{session.name}</span>
                  <ChevronDown size={16} aria-hidden="true" />
                </button>
                {menuOpen && (
                  <div className="menu" role="menu">
                    <p className="menu-note">{session.email}<br />{isAdmin ? 'School admin' : 'Teacher'}</p>
                    <button role="menuitem" onClick={async () => { setMenuOpen(false); await repo.signOut(); navigate('/login'); }}><LogOut size={16} /> Sign out</button>
                  </div>
                )}
              </div>
            </div>
          </header>
          <main className="content">
            {needsSection ? (
              <div className="page"><div className="card"><h2 className="card-title">No section assigned yet</h2><p className="muted">Ask the school admin to assign you to a section. You can still view the calendar and settings.</p></div></div>
            ) : <Outlet />}
          </main>
        </div>
      </div>
    </div>
  );
}
