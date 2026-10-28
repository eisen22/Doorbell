import { describe, expect, it } from 'vitest';
import {
  classifyScan, computeStreak, decideScan, isSchoolDay, normalizePhMobile, recentSchoolDays,
  renderTemplate, shouldAlertStreak, smsSegments, to12h, isoWeekday,
} from './rules';
import type { CalendarDay, SectionSchedule } from './types';

const sched: SectionSchedule = {
  classDays: [1, 2, 3, 4, 5], startTime: '08:00', scanWindowMins: 30, lateCutoffMins: 15, autoFinalizeMins: 45,
};
const cal: CalendarDay[] = [
  { date: '2026-11-02', type: 'holiday', label: "All Souls' Day" }, // Monday
  { date: '2026-11-07', type: 'makeup', label: 'Make-up class' }, // Saturday
];

describe('dates and school days', () => {
  it('computes ISO weekday', () => {
    expect(isoWeekday('2026-10-26')).toBe(1); // Monday
    expect(isoWeekday('2026-11-01')).toBe(7); // Sunday
  });
  it('skips weekends and holidays, honors make-up days', () => {
    expect(isSchoolDay('2026-10-31', sched, cal)).toBe(false); // Saturday
    expect(isSchoolDay('2026-11-02', sched, cal)).toBe(false); // holiday
    expect(isSchoolDay('2026-11-07', sched, cal)).toBe(true); // make-up Saturday
  });
  it('walks back over non-school days', () => {
    expect(recentSchoolDays('2026-11-03', 3, sched, cal)).toEqual(['2026-11-03', '2026-10-30', '2026-10-29']);
  });
});

describe('scans', () => {
  it('classifies on time and late', () => {
    expect(classifyScan('07:42', sched)).toBe('present');
    expect(classifyScan('08:15', sched)).toBe('present');
    expect(classifyScan('08:16', sched)).toBe('late');
    expect(classifyScan('07:00', sched)).toBe('too_early');
  });
  it('debounces repeats and flags duplicates', () => {
    expect(decideScan({ time: '07:50', schedule: sched, secondsSinceLastSameCode: 3 })).toEqual({ kind: 'ignore' });
    expect(decideScan({ time: '09:00', schedule: sched, existingScanAt: '07:42' }))
      .toEqual({ kind: 'duplicate', firstScanAt: '07:42' });
    expect(decideScan({ time: '08:20', schedule: sched })).toEqual({ kind: 'record', status: 'late' });
  });
  it('formats 12-hour time', () => {
    expect(to12h('07:42')).toBe('7:42 AM');
    expect(to12h('12:05')).toBe('12:05 PM');
    expect(to12h('00:10')).toBe('12:10 AM');
  });
});

describe('streaks', () => {
  it('counts late and absent across a holiday and weekend', () => {
    const s = { '2026-10-29': 'absent', '2026-10-30': 'late', '2026-11-03': 'absent' } as const;
    expect(computeStreak('2026-11-03', s, sched, cal)).toBe(3);
  });
  it('excused days neither count nor break', () => {
    const s = { '2026-10-27': 'absent', '2026-10-28': 'excused', '2026-10-29': 'absent', '2026-10-30': 'absent' } as const;
    expect(computeStreak('2026-10-30', s, sched, cal)).toBe(3);
  });
  it('present breaks the streak', () => {
    const s = { '2026-10-28': 'absent', '2026-10-29': 'present', '2026-10-30': 'absent' } as const;
    expect(computeStreak('2026-10-30', s, sched, cal)).toBe(1);
  });
  it('missing records stop the count (late enrollees)', () => {
    const s = { '2026-10-30': 'absent' } as const;
    expect(computeStreak('2026-10-30', s, sched, cal)).toBe(1);
  });
  it('alerts once per streak', () => {
    expect(shouldAlertStreak(2)).toBe(false);
    expect(shouldAlertStreak(3)).toBe(true);
    expect(shouldAlertStreak(4)).toBe(false);
  });
});

describe('sms helpers', () => {
  it('normalizes PH mobile numbers', () => {
    expect(normalizePhMobile('0917 123 4567')).toBe('+639171234567');
    expect(normalizePhMobile('+639171234567')).toBe('+639171234567');
    expect(normalizePhMobile('639171234567')).toBe('+639171234567');
    expect(normalizePhMobile('12345')).toBeNull();
  });
  it('renders templates and counts segments', () => {
    const msg = renderTemplate('Doorbell: {child} arrived at {time}. - {school}', {
      child: 'Juan', time: '7:42 AM', school: 'Sunnyside Kinder',
    });
    expect(msg).toBe('Doorbell: Juan arrived at 7:42 AM. - Sunnyside Kinder');
    expect(smsSegments(msg)).toBe(1);
    expect(smsSegments('Curly \u2019quote')).toBe(1); // unicode -> 67 chars per segment
    expect(smsSegments('x'.repeat(161))).toBe(2);
  });
});
