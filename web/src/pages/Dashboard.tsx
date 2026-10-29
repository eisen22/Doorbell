import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { CalendarDays, ArrowUpRight, Lock, ChevronRight, BookOpenCheck, CalendarClock, Check } from 'lucide-react';
import { addDays, attendanceRate, autoFinalizeTime, describeStreak, emptyCounts, fromMinutes, isoWeekday, isSchoolDay, to12h, toMinutes } from '../domain/rules';
import { classPhase, shortClassName } from '../domain/classes';
import type { AttendanceRecord, AttendanceStatus, ISODate } from '../domain/types';
import { useLive, useRepo, textOn } from '../lib/repo';
import { loadMyClasses, useClassParam } from '../lib/classes';
import { Avatar, Card, CountUp, Empty, Skeleton, StatusChip, StreakChip } from '../components/ui';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const wd = (d: ISODate) => isoWeekday(d) - 1;
const PHASE = { now: 'In session now', next: 'Later today', done: 'Done for today', off: 'No class today' } as const;

export function Dashboard() {
  const repo = useRepo();
  const [classId, setClass] = useClassParam();
  const { data } = useLive(async (r) => {
    const { session, today, classes, current, section } = await loadMyClasses(r, classId);
    const calendar = await r.getCalendar();
    const settings = await r.getSettings();
    const monday = addDays(today.date, -wd(today.date));
    const perClass = await Promise.all(classes.map(async (c) => ({
      section: c, roster: await r.getRoster(c.id, today.date), confirmation: await r.getConfirmation(c.id, today.date),
    })));
    const records = await r.getAttendanceRange(section.id, monday, addDays(monday, 6));
    const sms = (await r.listSms(500)).filter((m) => m.createdAt.startsWith(today.date));
    const notes = await r.listNotifications();
    const attention = await r.listAttention(2);
    return { session, today, classes, current, section, calendar, settings, monday, perClass, records, sms, notes, attention };
  }, [classId]);
  const [selected, setSelected] = useState<ISODate | null>(null);
  const [filter, setFilter] = useState<'all' | 'present' | 'late'>('all');

  const week = useMemo(() => {
    if (!data) return null;
    const { records, monday, perClass, section, calendar, today } = data;
    const focus = perClass.find((p) => p.section.id === section.id)!;
    const days = Array.from({ length: 5 }, (_, i) => addDays(monday, i)).map((d) => {
      const c = emptyCounts();
      const recs = d === today.date ? focus.roster.map((r) => r.record).filter(Boolean) as AttendanceRecord[] : records.filter((r) => r.date === d);
      recs.forEach((r) => c[r.status]++);
      return { date: d, label: DAYS[wd(d)], school: isSchoolDay(d, section.schedule, calendar), future: d > today.date, counts: c, entry: calendar.find((x) => x.date === d) };
    });
    const total = emptyCounts();
    days.forEach((d) => { if (d.school && !d.future) (Object.keys(total) as AttendanceStatus[]).forEach((k) => { total[k] += d.counts[k]; }); });
    return { days, total, rate: attendanceRate(total) };
  }, [data]);

  if (!data || !week) return <DashboardSkeleton />;
  const { session, today, classes, section, perClass, calendar, settings, sms, notes, attention, records, monday } = data;
  const focus = perClass.find((p) => p.section.id === section.id)!;
  const day = selected ?? today.date;
  const strip = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const feedSource = day === today.date ? focus.roster.map((r) => r.record).filter(Boolean) as AttendanceRecord[] : records.filter((r) => r.date === day);
  const nameOf = new Map(focus.roster.map((r) => [r.student.id, r.student]));
  const feed = feedSource.filter((r) => r.scannedAt && (filter === 'all' || r.status === filter)).sort((a, b) => b.scannedAt!.localeCompare(a.scannedAt!));
  const failed = sms.filter((m) => m.status === 'failed').length;
  const unreadStreaks = notes.filter((n) => !n.read && n.kind === 'streak').length;
  const calendarNotes = notes.filter((n) => n.kind === 'calendar' && !n.read).slice(0, 3);
  const hour = Number(today.time.slice(0, 2));
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const todayEntry = calendar.find((c) => c.date === today.date);
  const focusPhase = classPhase(section, today.time, today.actualDate);
  const multi = classes.length > 1;

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

      {calendarNotes.map((n) => (
        <div key={n.id} className="cal-notice" role="status">
          <CalendarClock size={20} aria-hidden="true" />
          <div><strong>{n.title}</strong><span>{n.body}</span></div>
          <Link className="btn btn-sm" to="/calendar">View calendar</Link>
          <button className="btn btn-sm btn-ink" onClick={() => repo.markNotificationsRead([n.id])}><Check size={15} /> Got it</button>
        </div>
      ))}
      {todayEntry && (todayEntry.type === 'exam' || todayEntry.type === 'event' || todayEntry.type === 'halfday') && (
        <Link to="/calendar" className={`day-banner k-${todayEntry.type}`}><BookOpenCheck size={18} /> Today: {todayEntry.label}<ChevronRight size={16} /></Link>
      )}

      <Card title={multi ? 'My classes today' : 'My class today'}>
        <div className="card-row">
          {perClass.map(({ section: c, roster, confirmation }) => {
            const s = c.schedule;
            const arrived = roster.filter((r) => r.record?.scannedAt).length;
            const pct = Math.round((arrived / Math.max(1, roster.length)) * 100);
            const phase = classPhase(c, today.time, today.actualDate);
            const on = c.id === section.id;
            return (
              <div key={c.id} className={`tile class-tile ${on ? 'class-on' : ''}`} style={{ background: c.color, color: textOn(c.color) }}>
                <button className="class-tile-main" onClick={() => setClass(c.id)} aria-pressed={on} title={multi ? 'Show this class on the dashboard' : undefined}>
                  <span className="date-chip">{phase === 'now' && <span className="live-dot" aria-hidden="true" />}{PHASE[phase]}</span>
                  <h3>{c.name}</h3>
                  <p>{to12h(s.startTime)} to {to12h(s.endTime)} · late after {to12h(fromMinutes(toMinutes(s.startTime) + s.lateCutoffMins))}</p>
                  <Progress value={pct} label={`${arrived} of ${roster.length} arrived`} />
                  <p className="class-tile-foot">
                    <span>{arrived} of {roster.length} arrived</span>
                    <span>{confirmation ? <><Lock size={12} /> Confirmed</> : `Confirm by ${to12h(autoFinalizeTime(s))}`}</span>
                  </p>
                </button>
                <Link to={`/attendance?class=${c.id}`} className="class-tile-link">Take attendance <ArrowUpRight size={14} /></Link>
              </div>
            );
          })}
          <Link to="/sms" className="tile tile-link tile-sky">
            <span className="date-chip">Parent SMS</span>
            <h3>{sms.length} sent today</h3>
            <p>{failed ? `${failed} failed. Check the numbers on file.` : 'Every text delivered.'}</p>
            <Progress value={sms.length ? Math.round(((sms.length - failed) / sms.length) * 100) : 0} label="delivered" />
          </Link>
        </div>
      </Card>

      <Card title={<>Attention needed {attention.length > 0 && <span className="count-pill">{attention.length}</span>}{unreadStreaks > 0 && <span className="new-pill">{unreadStreaks} new</span>}</>}
        action={<Link className="link" to="/notifications?tab=streak">All alerts <ArrowUpRight size={15} /></Link>} className="attention-card">
        {attention.length === 0 ? <Empty title="Everyone is on track" hint="No child is absent or late two school days in a row." /> : (
          <ul className="attention">
            {attention.map((r) => (
              <li key={r.student.id}>
                <Link to={`/students?class=${r.section.id}&q=${encodeURIComponent(`${r.student.firstName} ${r.student.lastName}`)}`} className="attention-link">
                  <Avatar first={r.student.firstName} last={r.student.lastName} tone={r.section.color} />
                  <div>
                    <strong>{r.student.firstName} {r.student.lastName}</strong>
                    <span className="muted small">{describeStreak(r.streak)}{multi ? ` · ${shortClassName(r.section.name)}` : ''}</span>
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

      <div className="grid-2">
        <Card title={<>Arrivals <span className="card-sub">{shortClassName(section.name)} · {to12h(section.schedule.startTime)} to {to12h(section.schedule.endTime)}{focusPhase === 'now' ? ' · now' : ''}</span></>}>
          {multi && (
            <div className="chips tight" role="group" aria-label="Choose a class">
              {classes.map((c) => (
                <button key={c.id} className={`fchip sm ${c.id === section.id ? 'fchip-on' : ''}`} onClick={() => setClass(c.id)}>
                  <span className="sec-dot sm" style={{ background: c.color }} />{shortClassName(c.name)} · {to12h(c.schedule.startTime)}
                </button>
              ))}
            </div>
          )}
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
            <Link className="link push" to={`/attendance?class=${section.id}&date=${day}`}>Full list <ArrowUpRight size={14} /></Link>
          </div>
          <ul className="feed">
            {feed.length === 0 && <li><Empty title="No scans for this day" hint="Arrivals appear here the moment a card is scanned." /></li>}
            {feed.slice(0, 8).map((r) => {
              const st = nameOf.get(r.studentId);
              if (!st) return null;
              return (
                <li key={r.studentId}>
                  <Link to={`/students?class=${section.id}&q=${encodeURIComponent(`${st.firstName} ${st.lastName}`)}`} className="feed-row">
                    <Avatar first={st.firstName} last={st.lastName} tone={section.color} />
                    <div className="feed-main"><strong>{st.firstName} {st.lastName}</strong><StatusChip status={r.status} /></div>
                    <time>{to12h(r.scannedAt!)}</time>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title={<>Weekly attendance <span className="card-sub">{shortClassName(section.name)}</span></>}
          action={<Link to={`/attendance?class=${section.id}`} className="icon-badge" aria-label="Open attendance" title="Open attendance"><CalendarDays size={17} /></Link>}>
          <div className="big-number">
            <strong><CountUp value={week.rate} suffix="%" /></strong>
            <span>attendance this week</span>
          </div>
          <table className="week-table">
            <thead>
              <tr><th scope="col">Day</th><th scope="col" title="Present">P</th><th scope="col" title="Late">L</th><th scope="col" title="Absent">A</th><th scope="col" title="Excused">E</th></tr>
            </thead>
            <tbody>
              {week.days.map((d) => (
                <tr key={d.date} className={d.date === today.date ? 'is-today' : ''}>
                  <th scope="row"><b>{d.label}</b> <span className="muted">{format(parseISO(d.date), 'MMM d')}</span></th>
                  {!d.school ? <td colSpan={4} className="week-off">{d.entry?.label ?? 'No class'}</td>
                    : d.future ? <td colSpan={4} className="week-off">Upcoming{d.entry ? ` · ${d.entry.label}` : ''}</td>
                    : (['present', 'late', 'absent', 'excused'] as const).map((k) => (
                      <td key={k}><span className={`n-pill n-${k} ${d.counts[k] === 0 ? 'zero' : ''}`}>{d.counts[k]}</span></td>
                    ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><th scope="row">Week</th>
                {(['present', 'late', 'absent', 'excused'] as const).map((k) => <td key={k}><strong>{week.total[k]}</strong></td>)}
              </tr>
            </tfoot>
          </table>
          <p className="muted small week-key">P present · L late · A absent · E excused{!focus.confirmation && today.date === today.actualDate ? ' · today\'s absences count after attendance is confirmed' : ''}</p>
        </Card>
      </div>
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

function DashboardSkeleton() {
  return (
    <div className="page">
      <Skeleton h={44} w={260} />
      <div className="card"><div className="card-row">{[0, 1, 2].map((k) => <Skeleton key={k} h={170} w={250} />)}</div></div>
      <div className="card"><Skeleton h={160} /></div>
      <div className="grid-2"><div className="card"><Skeleton h={260} /></div><div className="card"><Skeleton h={260} /></div></div>
    </div>
  );
}
