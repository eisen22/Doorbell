// Pure attendance and SMS rules. No React, no Firebase: shared by web, worker and scanner.
import type { AttendanceStatus, CalendarDay, ISODate, SectionSchedule } from './types';

/* ---------- dates (string based, timezone safe) ---------- */

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function fromMinutes(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** '07:42' -> '7:42 AM' */
export function to12h(hhmm: string): string {
  const mins = toMinutes(hhmm);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function parseDate(d: ISODate): Date {
  const [y, mo, da] = d.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, da));
}

export function formatDate(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  const x = parseDate(d);
  x.setUTCDate(x.getUTCDate() + n);
  return formatDate(x);
}

/** 1 = Monday ... 7 = Sunday */
export function isoWeekday(d: ISODate): number {
  const w = parseDate(d).getUTCDay();
  return w === 0 ? 7 : w;
}

/** Today's school date in Asia/Manila, regardless of the device time zone. */
export function manilaToday(now: Date = new Date()): ISODate {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now);
}

export function manilaTime(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now);
}

/* ---------- school days ---------- */

export function isSchoolDay(date: ISODate, schedule: SectionSchedule, calendar: CalendarDay[]): boolean {
  const entry = calendar.find((c) => c.date === date);
  if (entry?.type === 'makeup') return true;
  if (entry && (entry.type === 'holiday' || entry.type === 'suspension' || entry.type === 'break')) return false;
  // halfday and event are still class days
  return schedule.classDays.includes(isoWeekday(date));
}

/** The last `count` school days ending at (and including) `date`, newest first. */
export function recentSchoolDays(
  date: ISODate, count: number, schedule: SectionSchedule, calendar: CalendarDay[], maxLookback = 60,
): ISODate[] {
  const out: ISODate[] = [];
  let d = date;
  for (let i = 0; i < maxLookback && out.length < count; i++) {
    if (isSchoolDay(d, schedule, calendar)) out.push(d);
    d = addDays(d, -1);
  }
  return out;
}

/* ---------- scans ---------- */

export type ScanClass = 'present' | 'late' | 'too_early';

export function classifyScan(time: string, schedule: SectionSchedule): ScanClass {
  const t = toMinutes(time);
  const start = toMinutes(schedule.startTime);
  if (t < start - schedule.scanWindowMins) return 'too_early';
  return t <= start + schedule.lateCutoffMins ? 'present' : 'late';
}

export function autoFinalizeTime(schedule: SectionSchedule): string {
  return fromMinutes(toMinutes(schedule.startTime) + schedule.autoFinalizeMins);
}

export function shouldAutoFinalize(nowTime: string, schedule: SectionSchedule): boolean {
  return toMinutes(nowTime) >= toMinutes(schedule.startTime) + schedule.autoFinalizeMins;
}

export type ScanDecision =
  | { kind: 'ignore' } // repeat within debounce window
  | { kind: 'duplicate'; firstScanAt: string } // already scanned today
  | { kind: 'record'; status: 'present' | 'late' };

export function decideScan(args: {
  time: string;
  schedule: SectionSchedule;
  existingScanAt?: string;
  secondsSinceLastSameCode?: number;
  debounceSeconds?: number;
}): ScanDecision {
  const debounce = args.debounceSeconds ?? 10;
  if (args.secondsSinceLastSameCode !== undefined && args.secondsSinceLastSameCode < debounce) {
    return { kind: 'ignore' };
  }
  if (args.existingScanAt) return { kind: 'duplicate', firstScanAt: args.existingScanAt };
  const c = classifyScan(args.time, args.schedule);
  return { kind: 'record', status: c === 'late' ? 'late' : 'present' };
}

/* ---------- streaks ---------- */

/**
 * Consecutive late/absent school days ending at `date`.
 * Excused days are skipped (neither count nor break). Present breaks.
 * A day with no record (not enrolled yet / not finalized) stops the count.
 */
export function computeStreak(
  date: ISODate,
  statusByDate: Record<ISODate, AttendanceStatus | undefined>,
  schedule: SectionSchedule,
  calendar: CalendarDay[],
  lookback = 30,
): number {
  const days = recentSchoolDays(date, lookback, schedule, calendar, lookback * 3);
  let streak = 0;
  for (const d of days) {
    const s = statusByDate[d];
    if (s === undefined) break;
    if (s === 'excused') continue;
    if (s === 'present') break;
    streak++;
  }
  return streak;
}

/** Alert exactly when the streak reaches the threshold, so each streak alerts once. */
export function shouldAlertStreak(streak: number, threshold = 3): boolean {
  return streak === threshold;
}

/* ---------- SMS ---------- */

export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);
}

const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

export function isGsmPlain(text: string): boolean {
  return [...text].every((ch) => GSM_BASIC.includes(ch));
}

export function smsSegments(text: string): number {
  if (!isGsmPlain(text)) return Math.ceil(text.length / 67) || 1;
  return text.length <= 160 ? 1 : Math.ceil(text.length / 153);
}

/** Accepts 09XXXXXXXXX, 9XXXXXXXXX, 639XXXXXXXXX, +639XXXXXXXXX. Returns +639XXXXXXXXX or null. */
export function normalizePhMobile(input: string): string | null {
  const digits = input.replace(/[\s\-()]/g, '');
  const m = digits.match(/^(?:\+?63|0)?(9\d{9})$/);
  return m ? `+63${m[1]}` : null;
}

export function displayPhMobile(normalized: string): string {
  const local = normalized.replace(/^\+63/, '0');
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

/* ---------- reports ---------- */

export function attendanceRate(counts: Record<AttendanceStatus, number>): number {
  const counted = counts.present + counts.late + counts.absent;
  if (counted === 0) return 0;
  return Math.round(((counts.present + counts.late) / counted) * 100);
}

export function emptyCounts(): Record<AttendanceStatus, number> {
  return { present: 0, late: 0, absent: 0, excused: 0 };
}
