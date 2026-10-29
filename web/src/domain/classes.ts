// Which of a teacher's classes matters right now. Pure functions, shared by the engine and pages.
import { isoWeekday, toMinutes } from './rules';
import type { ISODate, Section } from './types';

export const sortByStart = (list: Section[]) =>
  [...list].sort((a, b) => a.schedule.startTime.localeCompare(b.schedule.startTime) || a.name.localeCompare(b.name));

export type ClassPhase = 'now' | 'next' | 'done' | 'off';

/** Where a class stands at this time of day: in session (from scanning open to dismissal), later today, or over. */
export function classPhase(section: Section, time: string, date?: ISODate): ClassPhase {
  if (date && !section.schedule.classDays.includes(isoWeekday(date))) return 'off';
  const m = toMinutes(time);
  const open = toMinutes(section.schedule.startTime) - section.schedule.scanWindowMins;
  const end = toMinutes(section.schedule.endTime);
  if (m < open) return 'next';
  if (m <= end) return 'now';
  return 'done';
}

/**
 * The class to show first: the one in session now; otherwise the next one today;
 * otherwise the one that ended most recently.
 */
export function classNow(classes: Section[], time: string, date?: ISODate): Section | undefined {
  if (!classes.length) return undefined;
  const sorted = sortByStart(classes);
  const today = date ? sorted.filter((c) => classPhase(c, time, date) !== 'off') : sorted;
  const pool = today.length ? today : sorted;
  return pool.find((c) => classPhase(c, time) === 'now')
    ?? pool.find((c) => classPhase(c, time) === 'next')
    ?? [...pool].reverse().find((c) => classPhase(c, time) === 'done')
    ?? pool[0];
}

/** Short name for chips: "Kindergarten I - Apple" -> "Apple". */
export const shortClassName = (name: string) => name.split(' - ').slice(-1)[0] || name;
