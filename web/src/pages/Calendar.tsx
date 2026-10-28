import { format, parseISO } from 'date-fns';
import { DAY_KIND_META, dayKind, eachDate, type DayKind } from '../domain/calendar';
import { useLive } from '../lib/repo';
import { Card, Skeleton } from '../components/ui';
import { CalendarLegend, YearCalendar } from '../components/YearCalendar';

/** Teacher view: the whole school year, read-only. */
export function CalendarPage() {
  const { data } = useLive(async (r) => ({ year: await r.getSchoolYear(), calendar: await r.getCalendar(), today: await r.getToday() }));
  if (!data) return <div className="page"><Skeleton h={500} /></div>;
  const { year, calendar, today } = data;

  const counts: Partial<Record<DayKind, number>> = {};
  let held = 0;
  let total = 0;
  for (const d of eachDate(year.start, year.end)) {
    const k = dayKind(d, year, calendar);
    counts[k] = (counts[k] ?? 0) + 1;
    if (DAY_KIND_META[k].isClass) { total++; if (d <= today.date) held++; }
  }
  const upcoming = calendar.filter((c) => c.date > today.date && c.type !== 'event').slice(0, 8);
  const events = calendar.filter((c) => c.date >= today.date && c.type === 'event').slice(0, 6);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">{year.name} · {format(parseISO(year.start), 'MMM d, yyyy')} to {format(parseISO(year.end), 'MMM d, yyyy')}</p>
          <h1>School Calendar</h1>
        </div>
        <div className="cal-stats">
          <div title="Days learners are in school. DepEd's 201 also counts wellness-break and INSET days."><strong>{total}</strong><span>days in school</span></div>
          <div><strong>{held}</strong><span>done</span></div>
          <div><strong>{total - held}</strong><span>to go</span></div>
        </div>
      </div>
      <Card>
        <CalendarLegend counts={counts} />
        <YearCalendar year={year} calendar={calendar} today={today.date} />
      </Card>
      <div className="grid-2">
        <Card title="Coming up: no class or changed schedule">
          <ul className="cal-list">
            {upcoming.map((c) => (
              <li key={c.date}><span className={`swatch k-${c.type} ${c.scope === 'local' ? 'is-local' : ''}`} /><time>{format(parseISO(c.date), 'EEE, MMM d')}</time><span>{c.label}</span></li>
            ))}
          </ul>
        </Card>
        <Card title="School events (classes continue)">
          <ul className="cal-list">
            {events.map((c) => (
              <li key={c.date}><span className="swatch k-event" /><time>{format(parseISO(c.date), 'EEE, MMM d')}</time><span>{c.label}</span></li>
            ))}
          </ul>
        </Card>
      </div>
      <p className="muted small">Based on DepEd Order No. 009, s. 2026 (three-term calendar) plus Baguio Charter Day (RA 6710). Your school admin can change any day, for example to declare a suspension.</p>
    </div>
  );
}
