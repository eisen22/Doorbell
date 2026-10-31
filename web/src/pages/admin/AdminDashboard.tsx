import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ArrowUpRight, UserPlus, Users, Shapes, MessageSquareWarning, PhoneOff } from 'lucide-react';
import { useLive } from '../../lib/repo';
import { Card, CountUp, Skeleton } from '../../components/ui';

export function AdminDashboard() {
  const { data } = useLive(async (r) => {
    const today = await r.getToday();
    const sections = (await r.listSections()).filter((s) => !s.archived);
    const rows = await r.listStudentRows();
    const teachers = await r.listTeachers();
    const calendar = await r.getCalendar();
    const sms = await r.listSms(1000);
    const perSection = await Promise.all(sections.map(async (s) => {
      const roster = await r.getRoster(s.id, today.date);
      return { section: s, total: roster.length, arrived: roster.filter((x) => x.record?.scannedAt).length, confirmed: !!(await r.getConfirmation(s.id, today.date)) };
    }));
    return { today, sections, rows, teachers, calendar, sms, perSection, session: await r.getSession() };
  });
  if (!data) return <div className="page"><Skeleton h={400} /></div>;
  const { today, rows, teachers, calendar, sms, perSection, session } = data;
  const enrolled = rows.filter((r) => r.enrollment?.status === 'active').length;
  const unassigned = rows.filter((r) => !r.enrollment || r.enrollment.status !== 'active').filter((r) => !r.enrollment).length;
  const smsToday = sms.filter((m) => m.createdAt.startsWith(today.date));
  const failed = sms.filter((m) => m.status === 'failed');
  const fixNumbers = rows.filter((r) => r.guardian?.numberStatus === 'failed');
  const upcoming = calendar.filter((c) => c.date > today.date && c.type !== 'event').slice(0, 5);
  const noTeacher = data.sections.filter((s) => !s.teacherId);

  return (
    <div className="page">
      <div className="page-head">
        <div><p className="eyebrow">Good day, {session?.name.split(' ')[0] ?? ''}</p><h1>School overview</h1></div>
        <p className="muted">{format(parseISO(today.date), 'EEEE, MMMM d, yyyy')}</p>
      </div>
      <div className="kpis">
        <div className="kpi tile-lime"><Users size={20} /><strong><CountUp value={enrolled} /></strong><span>learners enrolled</span></div>
        <Link to="/admin/students?filter=unassigned" className="kpi tile-peach"><UserPlus size={20} /><strong><CountUp value={unassigned} /></strong><span>not yet in a section</span></Link>
        <div className="kpi tile-lavender"><Shapes size={20} /><strong><CountUp value={data.sections.length} /></strong><span>sections · {teachers.filter((t) => t.active !== false).length} teachers</span></div>
        <div className="kpi tile-sky"><MessageSquareWarning size={20} /><strong><CountUp value={smsToday.length} /></strong><span>SMS today · {failed.length} failed</span></div>
      </div>

      <div className="grid-2">
        <Card title="Today by section" action={<Link className="link" to="/admin/sections">Sections <ArrowUpRight size={15} /></Link>}>
          <ul className="sec-today">
            {perSection.map(({ section, total, arrived, confirmed }) => (
              <li key={section.id}>
                <span className="sec-dot" style={{ background: section.color }} />
                <div><strong>{section.name}</strong><span className="muted small">{confirmed ? 'Confirmed' : 'Not yet confirmed'}</span></div>
                <div className="mini-bar"><div style={{ width: `${total ? (arrived / total) * 100 : 0}%`, background: section.color }} /></div>
                <b>{arrived}/{total}</b>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Needs your attention">
          <ul className="todo">
            {unassigned > 0 && <li><UserPlus size={18} /><span>{unassigned} learners are not in a section.</span><Link className="link" to="/admin/students?filter=unassigned">Auto-assign</Link></li>}
            {noTeacher.map((s) => <li key={s.id}><Shapes size={18} /><span>{s.name} has no teacher.</span><Link className="link" to="/admin/sections">Assign</Link></li>)}
            {fixNumbers.map((r) => <li key={r.student.id}><PhoneOff size={18} /><span>SMS to {r.student.firstName} {r.student.lastName}'s guardian failed. Update the number.</span><Link className="link" to={`/admin/students?q=${encodeURIComponent(r.student.lastName)}`}>Open</Link></li>)}
            {unassigned === 0 && noTeacher.length === 0 && fixNumbers.length === 0 && <li><span>All clear.</span></li>}
          </ul>
        </Card>
      </div>

      <Card title="Coming up on the calendar" action={<Link className="link" to="/admin/calendar">Edit calendar <ArrowUpRight size={15} /></Link>}>
        <ul className="cal-list">
          {upcoming.map((c) => (
            <li key={c.date}><span className={`swatch k-${c.type} ${c.scope === 'local' ? 'is-local' : ''}`} /><time>{format(parseISO(c.date), 'EEE, MMM d')}</time><span>{c.label}</span></li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
