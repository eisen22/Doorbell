// School calendar: day classification for the year view, and the DepEd SY 2026-2027 template.
// Source: DepEd Order No. 009, s. 2026 (Three-Term School Calendar), Annex B.
// Local: Baguio Charter Day, RA 6710 (September 1, special non-working holiday in Baguio City).
// Admins can edit everything after loading the template.
import { addDays, isoWeekday } from './rules';
import type { CalendarDay, CalendarDayType, ISODate, SchoolYear } from './types';

export type DayKind = 'class' | CalendarDayType | 'weekend' | 'outside';

export const DAY_KIND_META: Record<DayKind, { label: string; short: string; isClass: boolean }> = {
  class: { label: 'Class day', short: 'Class', isClass: true },
  halfday: { label: 'Half day', short: 'Half day', isClass: true },
  event: { label: 'Class day with school event', short: 'Event', isClass: true },
  makeup: { label: 'Make-up class', short: 'Make-up', isClass: true },
  holiday: { label: 'Holiday', short: 'Holiday', isClass: false },
  suspension: { label: 'Class suspension', short: 'Suspended', isClass: false },
  break: { label: 'Break (no classes)', short: 'Break', isClass: false },
  weekend: { label: 'Weekend', short: 'Weekend', isClass: false },
  outside: { label: 'Outside the school year', short: '', isClass: false },
};

/** What a date looks like on the year calendar. */
export function dayKind(date: ISODate, year: Pick<SchoolYear, 'start' | 'end'>, calendar: CalendarDay[], classDays = [1, 2, 3, 4, 5]): DayKind {
  const entry = calendar.find((c) => c.date === date);
  if (entry) return entry.type;
  if (date < year.start || date > year.end) return 'outside';
  return classDays.includes(isoWeekday(date)) ? 'class' : 'weekend';
}

export function eachDate(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function countClassDays(year: Pick<SchoolYear, 'start' | 'end'>, calendar: CalendarDay[]): number {
  return eachDate(year.start, year.end).filter((d) => DAY_KIND_META[dayKind(d, year, calendar)].isClass).length;
}

/* ---------- DepEd SY 2026-2027 template ---------- */

const H = (date: ISODate, label: string, scope: 'national' | 'local' = 'national'): CalendarDay => ({ date, type: 'holiday', label, scope });
const E = (date: ISODate, label: string): CalendarDay => ({ date, type: 'event', label });
const B = (date: ISODate, label: string): CalendarDay => ({ date, type: 'break', label });
const HD = (date: ISODate, label: string): CalendarDay => ({ date, type: 'halfday', label });
const range = (from: ISODate, to: ISODate, make: (d: ISODate) => CalendarDay) =>
  eachDate(from, to).filter((d) => isoWeekday(d) <= 5).map(make);

export const DEPED_SY_2026_2027: CalendarDay[] = ([
  // Term 1: June 8 - September 15, 2026
  ...range('2026-06-08', '2026-06-11', (d) => E(d, 'Opening Block: start of Term 1')),
  H('2026-06-12', 'Independence Day'),
  E('2026-06-23', "DepEd Founding Anniversary: flag raising"),
  E('2026-06-24', "DepEd Founding Anniversary"),
  E('2026-07-06', 'Term 1: first summative test'),
  E('2026-07-28', 'Term 1: second summative test'),
  H('2026-08-21', 'Ninoy Aquino Day'),
  E('2026-08-28', 'Term 1 examination'),
  H('2026-08-31', "National Heroes' Day"),
  H('2026-09-01', 'Baguio Charter Day (DepEd lists Term 1 exam)', 'local'),
  ...range('2026-09-02', '2026-09-08', (d) => E(d, 'End-of-Term Block: ARAL, grades, activities')),
  HD('2026-09-09', 'PTA meeting and report cards (example half day)'),
  ...range('2026-09-10', '2026-09-15', (d) => B(d, "Learners' wellness break")),
  // Term 2: September 16 - December 18, 2026
  E('2026-09-16', 'Start of Term 2'),
  E('2026-10-05', "World Teachers' Day"),
  E('2026-10-07', 'Term 2: first summative test'),
  E('2026-10-29', 'Term 2: second summative test'),
  H('2026-11-01', "All Saints' Day"),
  H('2026-11-02', "All Souls' Day"),
  E('2026-11-27', 'Araw ng Pagbasa'),
  H('2026-11-30', 'Bonifacio Day'),
  E('2026-12-03', 'Term 2 examination'),
  E('2026-12-04', 'Term 2 examination'),
  ...range('2026-12-07', '2026-12-14', (d) => E(d, 'End-of-Term Block: ARAL, grades, activities')),
  H('2026-12-08', 'Feast of the Immaculate Conception'),
  HD('2026-12-15', 'PTA meeting and progress reports (example half day)'),
  E('2026-12-16', 'Year-end activity'),
  B('2026-12-17', "INSET / learners' wellness break"),
  B('2026-12-18', "INSET / learners' wellness break, end of Term 2"),
  ...range('2026-12-19', '2026-12-31', (d) => B(d, 'Year-end break')),
  H('2026-12-24', 'Christmas Eve'),
  H('2026-12-25', 'Christmas Day'),
  H('2026-12-30', 'Rizal Day'),
  H('2026-12-31', 'Last day of the year'),
  H('2027-01-01', "New Year's Day"),
  // Term 3: January 4 - April 8, 2027
  E('2027-01-04', 'Start of Term 3'),
  E('2027-01-25', 'Term 3: first summative test'),
  H('2027-02-06', 'Chinese New Year'),
  E('2027-02-16', 'Term 3: second summative test'),
  E('2027-03-15', 'Term 3 examination (moving up)'),
  E('2027-03-16', 'Term 3 examination (moving up)'),
  E('2027-03-22', 'Term 3 examination'),
  E('2027-03-23', 'Term 3 examination'),
  E('2027-03-24', 'End-of-Term Block, academic awardees'),
  H('2027-03-25', 'Maundy Thursday'),
  H('2027-03-26', 'Good Friday'),
  H('2027-03-27', 'Black Saturday'),
  ...['2027-03-29', '2027-03-30', '2027-03-31', '2027-04-01'].map((d) => E(d, 'End-of-Term Block')),
  B('2027-04-02', 'INSET (no classes for learners)'),
  B('2027-04-05', 'INSET (no classes for learners)'),
  E('2027-04-06', 'End-of-school-year rites'),
  E('2027-04-07', 'End-of-school-year rites'),
  E('2027-04-08', 'PTA meeting, report cards, end of SY'),
  H('2027-04-09', 'Day of Valor'),
] as CalendarDay[]).reduce<CalendarDay[]>((acc, day) => {
  // Later entries win (e.g. a holiday inside a break range).
  const i = acc.findIndex((x) => x.date === day.date);
  if (i >= 0) acc[i] = day; else acc.push(day);
  return acc;
}, []).sort((a, b) => a.date.localeCompare(b.date));
