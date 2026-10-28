import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { CalendarDays, TrendingUp, TrendingDown, ArrowUpRight, Lock } from 'lucide-react';
import { addDays, attendanceRate, autoFinalizeTime, emptyCounts, fromMinutes, isoWeekday, isSchoolDay, to12h, toMinutes } from '../domain/rules';
import type { AttendanceRecord, ISODate } from '../domain/types';
import { useLive } from '../lib/repo';
import { Avatar, Card, CountUp, Empty, Skeleton, StatusChip } from '../components/ui';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function Dashboard() {
  const { data } = useLive(async (r) => {
    const session = await r.getSession();
    const today = await r.getToday();
    const section = await r.getSection(session.sectionId!);
    const calendar = await r.getCalendar();
    const monday = addDays(today.date, -(isoWeekday(today.date) - 1));
    const records = await r.getAttendanceRange(section.id, addDays(monday, -7), addDays(monday, 6));
    const roster = await r.getRoster(section.id, today.date);
    const confirmation = await r.getConfirmation(section.id, today.date);
    const sms = (await r.listSms(500)).filter((m) => m.createdAt.slice(0, 10) === today.date || m.createdAt.startsWith(today.date));
    return { session, today, section, calendar, monday, records, roster, confirmation, sms };
  });
  const [selected, setSelected] = useState<ISODate | null>(null);
  const [filter, setFilter] = useState<'all' | 'present' | 'late'>('all');

  const view = useMemo(() => {
    if (!data) return null;
    const { records, monday, roster, today, section, calendar } = data;
    const byDate = new Map<ISODate, AttendanceRecord[]>();
    records.forEach((r) => byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]));
    const rateFor = (d: ISODate) => {
      const c = emptyCounts();
      (byDate.get(d) ?? []).forEach((r) => c[r.status]++);
      return attendanceRate(c);
    };
    const week = Array.from({ length: 5 }, (_, i) => addDays(monday, i));
    const bars = week.map((d) => ({
      date: d,
      label: DAYS[i(d)],
      school: isSchoolDay(d, section.schedule, calendar),
      future: d > today.date,
      rate: d === today.date ? Math.round(roster.filter((r) => r.record?.scannedAt).length / Math.max(1, roster.length) * 100) : rateFor(d),
    }));
    const past = bars.filter((b) => b.school && !b.future && b.date !== today.date);
    const thisWeek = past.length ? Math.round(past.reduce((s, b) => s + b.rate, 0) / past.length) : bars.find((b) => b.date === today.date)?.rate ?? 0;
    const lastWeekDays = week.map((d) => addDays(d, -7)).filter((d) => isSchoolDay(d, section.schedule, calendar));
    const lastWeek = lastWeekDays.length ? Math.round(lastWeekDays.reduce((s, d) => s + rateFor(d), 0) / lastWeekDays.length) : 0;

    const counts = emptyCounts();
    let waiting = 0;
    roster.forEach((r) => (r.record ? counts[r.record.status]++ : waiting++));
    const arrived = counts.present + counts.late;
    const attention = roster.filter((r) => r.streak >= 2).sort((a, b) => b.streak - a.streak);
    return { bars, thisWeek, delta: thisWeek - lastWeek, counts, waiting, arrived, attention };
  }, [data]);

  if (!data || !view) return <DashboardSkeleton />;
  const { session, today, section, roster, confirmation, sms, monday, records } = data;
  const day = selected ?? today.date;
  const strip = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const feedSource = day === today.date ? roster.map((r) => r.record).filter(Boolean) as AttendanceRecord[] : records.filter((r) => r.date === day);
  const nameOf = new Map(roster.map((r) => [r.student.id, r.student]));
  const feed = feedSource
    .filter((r) => r.scannedAt && (filter === 'all' || r.status === filter))
    .sort((a, b) => b.scannedAt!.localeCompare(a.scannedAt!));
  const pct = Math.round((view.arrived / Math.max(1, roster.length)) * 100);
  const failed = sms.filter((m) => m.status === 'failed').length;
  const hour = Number(today.time.slice(0, 2));
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">{greet}, Teacher {session.name.split(' ')[0]}</p>
          <h1>Dashboard</h1>
        </div>
        <p className="muted">{format(parseISO(today.date), 'EEEE, MMMM d, yyyy')}{today.simulated && <span className="demo-tag" title="Outside class hours the demo simulates a school morning">Demo clock {to12h(today.time)}</span>}</p>
      </div>

      <Card title="Today" action={<Link className="link" to="/attendance">Open attendance <ArrowUpRight size={15} /></Link>}>
        <div className="card-row">
          <article className="tile" style={{ background: section.color }}>
            <span className="date-chip"><CalendarDays size={14} /> {format(parseISO(today.date), 'EEE, MMM d')}</span>
            <h3>{section.name}</h3>
            <p>Class at {to12h(section.schedule.startTime)} · late after {to12h(fromMinutes(toMinutes(section.schedule.startTime) + section.schedule.lateCutoffMins))}</p>
            <Progress value={pct} label={`${view.arrived} of ${roster.length} arrived`} />
          </article>
          <article className="tile tile-lime">
            <span className="date-chip">{confirmation ? <><Lock size={13} /> Locked</> : `Confirm by ${to12h(autoFinalizeTime(section.schedule))}`}</span>
            <h3>{confirmation ? 'Attendance confirmed' : 'Waiting for confirmation'}</h3>
            <p>{confirmation ? `By ${confirmation.confirmedBy} at ${format(new Date(confirmation.confirmedAt), 'h:mm a')}` : `${view.waiting} not yet scanned. Unscanned children become absent when confirmed.`}</p>
            <Progress value={confirmation ? 100 : pct} label={confirmation ? 'Done' : 'Review'} />
          </article>
          <article className="tile tile-lavender">
            <span className="date-chip">Streak watch</span>
            <h3>{view.attention.length} need attention</h3>
            <p>Children late or absent 2 or more school days in a row. Parents are texted at 3.</p>
            <Progress value={Math.round((view.attention.length / Math.max(1, roster.length)) * 100)} label="of class" />
          </article>
          <article className="tile tile-sky">
            <span className="date-chip">Parent SMS</span>
            <h3>{sms.length} sent today</h3>
            <p>{failed ? `${failed} failed. Check the numbers on file.` : 'All delivered through the mock driver.'}</p>
            <Progress value={sms.length ? Math.round(((sms.length - failed) / sms.length) * 100) : 0} label="delivered" />
          </article>
        </div>
      </Card>

      <div className="grid-2">
        <Card title="Weekly attendance" action={<span className="icon-badge"><CalendarDays size={17} /></span>}>
          <div className="big-number">
            <strong><CountUp value={view.thisWeek} suffix="%" /></strong>
            <span>average this week</span>
            <span className={`delta ${view.delta >= 0 ? 'up' : 'down'}`}>
              {view.delta >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {view.delta >= 0 ? '+' : ''}{view.delta}%
            </span>
            <span className="muted small">vs last week</span>
          </div>
          <div className="bars" role="img" aria-label="Attendance rate per day this week">
            {[100, 75, 50, 25, 0].map((t) => <span key={t} className="gridline" style={{ bottom: `${t}%` }}><em>{t}%</em></span>)}
            {view.bars.map((b) => (
              <div key={b.date} className="bar-col">
                <div className={`bar ${b.date === today.date ? 'bar-today' : ''} ${!b.school || b.future ? 'bar-empty' : ''}`}
                  style={{ height: `${b.school && !b.future ? Math.max(4, b.rate) : 4}%` }} title={b.school ? `${b.rate}%` : 'No class'} />
                <span className={b.date === today.date ? 'bar-label today' : 'bar-label'}>{b.label}</span>
              </div>
            ))}
          </div>
          <div className="stats-row">
            <Stat label="Present" value={view.counts.present} />
            <Stat label="Late" value={view.counts.late} />
            <Stat label={confirmation ? 'Absent' : 'Not yet'} value={confirmation ? view.counts.absent : view.waiting} />
            <Stat label="Excused" value={view.counts.excused} />
          </div>
        </Card>

        <Card title="Arrivals" action={<Link className="link" to="/scanner">Scanner</Link>}>
          <div className="date-strip">
            {strip.map((d) => (
              <button key={d} className={`day ${d === day ? 'day-on' : ''}`} disabled={d > today.date} onClick={() => setSelected(d)}>
                <span>{DAYS[i(d)]}</span>
                <b>{d.slice(8)}</b>
              </button>
            ))}
          </div>
          <div className="chips" role="group" aria-label="Filter arrivals">
            {(['all', 'present', 'late'] as const).map((f) => (
              <button key={f} className={`fchip ${filter === f ? 'fchip-on' : ''}`} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f === 'present' ? 'On time' : 'Late'}
              </button>
            ))}
          </div>
          <ul className="feed">
            {feed.length === 0 && <li><Empty title="No scans for this day" hint="Arrivals appear here the moment a card is scanned." /></li>}
            {feed.slice(0, 8).map((r) => {
              const s = nameOf.get(r.studentId);
              if (!s) return null;
              return (
                <li key={r.id} className="feed-row">
                  <Avatar first={s.firstName} last={s.lastName} tone={section.color} />
                  <div className="feed-main">
                    <strong>{s.firstName} {s.lastName}</strong>
                    <StatusChip status={r.status} />
                  </div>
                  <time>{to12h(r.scannedAt!)}</time>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Card title="Attention needed" action={<Link className="link" to="/notifications">All alerts <ArrowUpRight size={15} /></Link>}>
        {view.attention.length === 0 ? <Empty title="Everyone is on track" hint="No child is on a late or absent streak." /> : (
          <ul className="attention">
            {view.attention.map((r) => (
              <li key={r.student.id}>
                <Avatar first={r.student.firstName} last={r.student.lastName} tone="#E4D6FA" />
                <div>
                  <strong>{r.student.firstName} {r.student.lastName}</strong>
                  <span className="muted small">{r.guardian ? `${r.guardian.relationship}: ${r.guardian.name}` : 'No guardian on file'}</span>
                </div>
                <span className={`streak ${r.streak >= 3 ? 'streak-hot' : ''}`}>{r.streak} days</span>
                <span className="muted small">{r.streak >= 3 ? 'Parent texted' : 'Text at 3'}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function i(d: ISODate) { return isoWeekday(d) - 1; }

function Progress({ value, label }: { value: number; label: string }) {
  return (
    <div className="progress" aria-label={`${label}: ${value}%`}>
      <div className="progress-track"><div className="progress-fill" style={{ width: `${value}%` }} /></div>
      <span>{value}%</span>
      <span className="sr-only">{label}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="stat"><span>{label}</span><strong><CountUp value={value} /></strong></div>;
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
