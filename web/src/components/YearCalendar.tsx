import { format, parseISO } from 'date-fns';
import { DAY_KIND_META, dayKind, type DayKind } from '../domain/calendar';
import { addDays, isoWeekday } from '../domain/rules';
import type { CalendarDay, ISODate, SchoolYear } from '../domain/types';

export const LEGEND: DayKind[] = ['class', 'event', 'halfday', 'holiday', 'suspension', 'break', 'makeup'];

interface Props {
  year: Pick<SchoolYear, 'start' | 'end'>;
  calendar: CalendarDay[];
  today?: ISODate;
  selection?: { from: ISODate; to: ISODate } | null;
  onDayClick?: (date: ISODate) => void;
}

/** Twelve-month view of the school year, color-coded by day type. */
export function YearCalendar({ year, calendar, today, selection, onDayClick }: Props) {
  const months: ISODate[] = [];
  for (let m = `${year.start.slice(0, 7)}-01`; m <= year.end; ) {
    months.push(m);
    const [y, mo] = m.split('-').map(Number);
    m = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, '0')}-01`;
  }
  const byDate = new Map(calendar.map((c) => [c.date, c]));

  return (
    <div className="year-grid">
      {months.map((first) => {
        const lead = isoWeekday(first) % 7; // Sunday-first grid
        const days: ISODate[] = [];
        for (let d = first; d.slice(0, 7) === first.slice(0, 7); d = addDays(d, 1)) days.push(d);
        return (
          <section key={first} className="month">
            <h3>{format(parseISO(first), 'MMMM yyyy')}</h3>
            <div className="month-grid" role="grid" aria-label={format(parseISO(first), 'MMMM yyyy')}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => <span key={i} className="wd" aria-hidden="true">{w}</span>)}
              {Array.from({ length: lead }, (_, i) => <span key={`pad${i}`} />)}
              {days.map((d) => {
                const kind = dayKind(d, year, calendar);
                const entry = byDate.get(d);
                const selected = selection && d >= selection.from && d <= selection.to;
                const label = `${format(parseISO(d), 'EEE, MMM d')}: ${DAY_KIND_META[kind].label}${entry ? ` - ${entry.label}` : ''}`;
                const cls = `cal-day k-${kind} ${d === today ? 'is-today' : ''} ${selected ? 'is-selected' : ''} ${entry?.scope === 'local' ? 'is-local' : ''}`;
                return onDayClick
                  ? <button key={d} className={cls} title={label} aria-label={label} onClick={() => onDayClick(d)}>{Number(d.slice(8))}</button>
                  : <span key={d} className={cls} title={label} aria-label={label} role="gridcell">{Number(d.slice(8))}</span>;
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function CalendarLegend({ counts }: { counts?: Partial<Record<DayKind, number>> }) {
  return (
    <ul className="legend">
      {LEGEND.map((k) => (
        <li key={k}><span className={`swatch k-${k}`} aria-hidden="true" />{DAY_KIND_META[k].label}{counts?.[k] !== undefined && <b>{counts[k]}</b>}</li>
      ))}
      <li><span className="swatch k-holiday is-local" aria-hidden="true" />Local holiday (Baguio)</li>
    </ul>
  );
}
