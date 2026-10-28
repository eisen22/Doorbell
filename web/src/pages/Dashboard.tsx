import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { CalendarDays, TrendingUp, TrendingDown, ArrowUpRight, Lock, ChevronRight, BookOpenCheck } from 'lucide-react';
import { addDays, attendanceRate, autoFinalizeTime, describeStreak, emptyCounts, fromMinutes, isoWeekday, isSchoolDay, to12h, toMinutes } from '../domain/rules';
import type { AttendanceRecord, ISODate } from '../domain/types';
import { useLive } from '../lib/repo';
import { Avatar, Card, CountUp, Empty, Skeleton, StatusChip, StreakChip } from '../components/ui';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const wd = (d: ISODate) => isoWeekday(d) - 1;

export function Dashboard() {
  const navigate = useNavigate();
  const { data } = useLive(async (r) => {
    const session = (await r.getSession())!;
    const today = await r.getToday();
    const section = await r.getSection(session.sectionId!);
    const calendar = await r.getCalendar();
    const monday = addDays(today.date, -wd(today.date));
    const records = await r.getAttendanceRange(section.id, addDays(monday, -7), addDays(monday, 6));
    const roster = await r.getRoster(section.id, today.date);
    const confirmation = await r.getConfirmation(section.id, today.date);
    const sms = (await r.listSms(500)).filter((m) => m.createdAt.startsWith(today.date));
    const unread = (await r.listNotifications()).filter((n) => !n.read && n.kind === 'streak').length;
    const settings = await r.getSettings();
    return { session, today, section, calendar, monday, records, roster, confirmation, sms, unread, settings };
  });
  const [selected, setSelected] = useState<ISODate | null>(null);
  const [filter, setFilter] = useState<'all' | 'present' | 'late'>('all');

  const view = useMemo(() => {
    if (!data) return null;
    const { records, monday, roster, today, section, calendar } = data;
    const byDate = new Map<ISODate, AttendanceRecord[]>();
    records.forEach((r) => byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]));
    const rateFor = (d: ISODate) => { const c = emptyCounts(); (byDate.get(d) ?? []).forEach((r) => c[r.status]++); return attendanceRate(c); };
    const week = Array.from({ length: 5 }, (_, i) => addDays(monday, i));
    const todayRate = Math.round((roster.filter((r) => r.record?.scannedAt).length / Math.max(1, roster.length)) * 100);
    const bars = week.map((d) => ({
      date: d, label: DAYS[wd(d)], school: isSchoolDay(d, section.schedule, calendar), future: d > today.date,
      rate: d === today.date ? todayRate : rateFor(d), entry: calendar.find((c) => c.date === d),
    }));
    const past = bars.filter((b) => b.school && !b.future && b.date !== today.date);
    const thisWeek = past.length ? Math.round(past.reduce((s, b) => s + b.rate, 0) / past.length) : todayRate;
    const lastWeekDays = week.map((d) => addDays(d, -7)).filter((d) => isSchoolDay(d, section.schedule, calendar));
    const lastWeek = lastWeekDays.length ? Math.round(lastWeekDays.reduce((s, d) => s + rateFor(d), 0) / lastWeekDays.length) : 0;
    const counts = emptyCounts();
    let waiting = 0;
    roster.forEach((r) => (r.record ? counts[r.record.status]++ : waiting++));
    const attention = roster.filter((r) => r.streak.count >= 2).sort((a, b) => b.streak.count - a.streak.count);
    return { bars, thisWeek, delta: thisWeek - lastWeek, counts, waiting, arrived: counts.present + counts.late, attention };
  }, [data]);

  if (!data || !view) return <DashboardSkeleton />;
  const { session, today, section, roster, confirmation, sms, monday, records, calendar, unread, settings } = data;
  const day = selected ?? today.date;
  const strip = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const feedSource = day === today.date ? roster.map((r) => r.record).filter(Boolean) as AttendanceRecord[] : records.filter((r) => r.date === day);
  const nameOf = new Map(roster.map((r) => [r.student.id, r.student]));
  const feed = feedSource.filter((r) => r.scannedAt && (filter === 'all' || r.status === filter)).sort((a, b) => b.scannedAt!.localeCompare(a.scannedAt!));
  const pct = Math.round((view.arrived / Math.max(1, roster.length)) * 100);
  const failed = sms.filter((m) => m.status === 'failed').length;
  const hour = Number(today.time.slice(0, 2));
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const todayEntry = calendar.find((c) => c.date === today.date);
  const s = section.schedule;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">{greet}, Teacher {session.name.split(' ')[0]}</p>
          <h1>Dashboard</h1>
        </div>
        <p className="muted">
          {format(parseISO(today.date), 'EEEE, MMMM d, yyyy')}
          {today.date !== today.actualDate && <span className="demo-tag" title="Today has no class">Showing last class day</span>}
          {today.simulated && <span className="demo-tag" title="Outside class hours the demo simulates a school morning">Demo clock {to12h(today.time)}</span>}
        </p>
      </div>
      {todayEntry && (todayEntry.type === 'exam' || todayEntry.type === 'event' || todayEntry.type === 'halfday') && (
        <Link to="/calendar" className={`day-banner k-${todayEntry.type}`}><BookOpenCheck size={18} /> Today: {todayEntry.label}<ChevronRight size={16} /></Link>
      )}

      <Card title="Today" action={<Link className="link" to="/attendance">Open attendance <ArrowUpRight size={15} /></Link>}>
        <div className="card-row">
          <Link to="/attendance" className="tile tile-link" style={{ background: section.color }}>
            <span className="date-chip"><CalendarDays size={14} /> {format(parseISO(today.date), 'EEE, MMM d')}</span>
            <h3>{section.name}</h3>
            <p>{to12h(s.startTime)} to {to12h(s.endTime)} · late after {to12h(fromMinutes(toMinutes(s.startTime) + s.lateCutoffMins))}</p>
            <Progress value={pct} label={`${view.arrived} of ${roster.length} arrived`} />
          </Link>
          <Link to="/attendance" className="tile tile-link tile-lime">
            <span className="date-chip">{confirmation ? <><Lock size={13} /> Locked</> : `Confirm by ${to12h(autoFinalizeTime(s))}`}</span>
            <h3>{confirmation ? 'Attendance confirmed' : 'Waiting for confirmation'}</h3>
            <p>{confirmation ? `By ${confirmation.confirmedBy} at ${format(new Date(confirmation.confirmedAt), 'h:mm a')}` : `${view.waiting} not yet scanned. Unscanned children become absent when confirmed.`}</p>
            <Progress value={confirmation ? 100 : pct} label={confirmation ? 'Done' : 'Review'} />
          </Link>
          <Link to="/notifications?tab=streak" className="tile tile-link tile-lavender">
            <span className="date-chip">Streak watch{unread ? ` · ${unread} new` : ''}</span>
            <h3>{view.attention.length} need attention</h3>
            <p>Children absent or late 2 or more school days in a row. Parents are texted at {settings.streakDays}.</p>
            <Progress value={Math.round((view.attention.length / Math.max(1, roster.length)) * 100)} label="of class" />
          </Link>
          <Link to="/sms" className="tile tile-link tile-sky">
            <span className="date-chip">Parent SMS</span>
            <h3>{sms.length} sent today</h3>
            <p>{failed ? `${failed} failed. Check the numbers on file.` : 'Every text delivered.'}</p>
            <Progress value={sms.length ? Math.round(((sms.length - failed) / sms.length) * 100) : 0} label="delivered" />
          </Link>
        </div>
      </Card>

      <div className="grid-2">
        <Card title="Weekly attendance" action={<Link to="/calendar" className="icon-badge" aria-label="Open calendar"><CalendarDays size={17} /></Link>}>
          <div className="big-number">
            <strong><CountUp value={view.thisWeek} suffix="%" /></strong>
            <span>average this week</span>
            <span className={`delta ${view.delta >= 0 ? 'up' : 'down'}`}>{view.delta >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{view.delta >= 0 ? '+' : ''}{view.delta}%</span>
            <span className="muted small">vs last week</span>
          </div>
          <div className="bars" role="list" aria-label="Attendance rate per day this week">
            {[100, 75, 50, 25, 0].map((t) => <span key={t} className="gridline" style={{ bottom: `${t}%` }}><em>{t}%</em></span>)}
            {view.bars.map((b) => {
              const usable = b.school && !b.future;
              return (
                <button key={b.date} role="listitem" className="bar-col" disabled={!usable} onClick={() => navigate(`/attendance?date=${b.date}`)}
                  title={usable ? `${b.label}: ${b.rate}% · open attendance` : b.entry?.label ?? 'No class'}>
                  <div className={`bar ${b.date === today.date ? 'bar-today' : ''} ${!usable ? 'bar-empty' : ''} ${b.entry?.type === 'exam' ? 'bar-exam' : ''}`} style={{ height: `${usable ? Math.max(4, b.rate) : 4}%` }} />
                  <span className={b.date === today.date ? 'bar-label today' : 'bar-label'}>{b.label}</span>
                </button>
              );
            })}
          </div>
          <div className="stats-row">
            <Stat to="/attendance?status=present" label="Present" value={view.counts.present} />
            <Stat to="/attendance?status=late" label="Late" value={view.counts.late} />
            <Stat to={confirmation ? '/attendance?status=absent' : '/attendance?status=waiting'} label={confirmation ? 'Absent' : 'Not yet'} value={confirmation ? view.counts.absent : view.waiting} />
            <Stat to="/attendance?status=excused" label="Excused" value={view.counts.excused} />
          </div>
        </Card>

        <Card title="Arrivals" action={<Link className="link" to="/scanner">Scanner <ArrowUpRight size={15} /></Link>}>
          <div className="date-strip">
            {strip.map((d) => (
              <button key={d} className={`day ${d === day ? 'day-on' : ''}`} disabled={d > today.date} onClick={() => setSelected(d)}>
                <span>{DAYS[wd(d)]}</span><b>{d.slice(8)}</b>
              </button>
            ))}
          </div>
          <div className="chips" role="group" aria-label="Filter arrivals">
            {(['all', 'present', 'late'] as const).map((f) => (
              <button key={f} className={`fchip ${filter === f ? 'fchip-on' : ''}`} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : f === 'present' ? 'On time' : 'Late'}</button>
            ))}
            <Link className="link push" to={`/attendance?date=${day}`}>Full list <ArrowUpRight size={14} /></Link>
          </div>
          <ul className="feed">
            {feed.length === 0 && <li><Empty title="No scans for this day" hint="Arrivals appear here the moment a card is scanned." /></li>}
            {feed.slice(0, 8).map((r) => {
              const st = nameOf.get(r.studentId);
              if (!st) return null;
              return (
                <li key={r.studentId}>
                  <Link to={`/students?q=${encodeURIComponent(`${st.firstName} ${st.lastName}`)}`} className="feed-row">
                    <Avatar first={st.firstName} last={st.lastName} tone={section.color} />
                    <div className="feed-main"><strong>{st.firstName} {st.lastName}</strong><StatusChip status={r.status} /></div>
                    <time>{to12h(r.scannedAt!)}</time>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Card title="Attention needed" action={<Link className="link" to="/notifications?tab=streak">All alerts <ArrowUpRight size={15} /></Link>}>
        {view.attention.length === 0 ? <Empty title="Everyone is on track" hint="No child is absent or late two school days in a row." /> : (
          <ul className="attention">
            {view.attention.map((r) => (
              <li key={r.student.id}>
                <Link to={`/students?q=${encodeURIComponent(`${r.student.firstName} ${r.student.lastName}`)}`} className="attention-link">
                  <Avatar first={r.student.firstName} last={r.student.lastName} tone="#E4D6FA" />
                  <div>
                    <strong>{r.student.firstName} {r.student.lastName}</strong>
                    <span className="muted small">{describeStreak(r.streak)}</span>
                    <span className="muted small">{r.guardian ? `${r.guardian.relationship}: ${r.guardian.name}` : 'No guardian on file'}</span>
                  </div>
                  <StreakChip s={r.streak} threshold={settings.streakDays} />
                  <span className="muted small">{r.streak.count >= settings.streakDays ? (r.guardian?.smsConsent ? 'Parent texted' : 'Call parent (no SMS consent)') : `Text at ${settings.streakDays}`}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Progress({ value, label }: { value: number; label: string }) {
  return (
    <div className="progress" aria-label={`${label}: ${value}%`}>
      <div className="progress-track"><div className="progress-fill" style={{ width: `${value}%` }} /></div>
      <span>{value}%</span><span className="sr-only">{label}</span>
    </div>
  );
}

function Stat({ label, value, to }: { label: string; value: number; to: string }) {
  return <Link to={to} className="stat stat-link"><span>{label}</span><strong><CountUp value={value} /></strong></Link>;
}

function DashboardSkeleton() {
  return (
    <div className="page">
      <Skeleton h={44} w={260} />
      <div className="card"><div className="card-row">{[0, 1, 2, 3].map((k) => <Skeleton key={k} h={170} w={250} />)}</div></div>
      <div className="grid-2"><div className="card"><Skeleton h={260} /></div><div className="card"><Skeleton h={260} /></div></div>
    </div>
  );
}
