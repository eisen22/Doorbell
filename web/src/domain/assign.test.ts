import { describe, expect, it } from 'vitest';
import { autoAssign, type AssignStudent } from './assign';
import { countClassDays, dayKind, DEPED_SY_2026_2027 } from './calendar';
import { isSchoolDay } from './rules';

const kids = (n: number): AssignStudent[] => Array.from({ length: n }, (_, i) => ({
  id: `s${i}`, firstName: `F${i}`, lastName: String.fromCharCode(65 + (i % 26)) + i, birthdate: `2021-01-${String((i % 28) + 1).padStart(2, '0')}`, sex: i % 2 ? 'F' : 'M',
}));
const secs = [{ id: 'a', capacity: 10, current: 0 }, { id: 'b', capacity: 10, current: 0 }, { id: 'c', capacity: 10, current: 0 }];
const counts = (r: Record<string, string>) => ['a', 'b', 'c'].map((id) => Object.values(r).filter((x) => x === id).length);

describe('auto-assign', () => {
  it('balances class sizes within one', () => {
    const c = counts(autoAssign(kids(25), secs, 'balanced', false).assignments);
    expect(Math.max(...c) - Math.min(...c)).toBeLessThanOrEqual(1);
  });
  it('respects capacity and reports overflow', () => {
    const r = autoAssign(kids(33), secs, 'fill', false);
    expect(counts(r.assignments)).toEqual([10, 10, 10]);
    expect(r.unplaced).toHaveLength(3);
  });
  it('keeps siblings together', () => {
    const list = kids(12);
    list[3].siblingKey = 'g1'; list[9].siblingKey = 'g1';
    const r = autoAssign(list, secs, 'balanced', true);
    expect(r.assignments.s3).toBe(r.assignments.s9);
  });
  it('honors pinned students', () => {
    const list = kids(6);
    list[0].pinnedSectionId = 'c';
    expect(autoAssign(list, secs, 'fill', false).assignments.s0).toBe('c');
  });
});

describe('DepEd SY 2026-2027 calendar', () => {
  const year = { start: '2026-06-08', end: '2027-04-08' };
  const sched = { classDays: [1, 2, 3, 4, 5], startTime: '08:00', scanWindowMins: 30, lateCutoffMins: 15, autoFinalizeMins: 45 };
  it('classifies days', () => {
    expect(dayKind('2026-06-12', year, DEPED_SY_2026_2027)).toBe('holiday');
    expect(dayKind('2026-09-01', year, DEPED_SY_2026_2027)).toBe('holiday'); // Baguio Charter Day
    expect(dayKind('2026-12-22', year, DEPED_SY_2026_2027)).toBe('break');
    expect(dayKind('2026-10-28', year, DEPED_SY_2026_2027)).toBe('class');
    expect(dayKind('2026-10-31', year, DEPED_SY_2026_2027)).toBe('weekend');
    expect(dayKind('2026-05-15', year, DEPED_SY_2026_2027)).toBe('outside');
  });
  it('half days and events are still school days, breaks are not', () => {
    expect(isSchoolDay('2026-09-09', sched, DEPED_SY_2026_2027)).toBe(true);
    expect(isSchoolDay('2026-10-07', sched, DEPED_SY_2026_2027)).toBe(true);
    expect(isSchoolDay('2026-09-11', sched, DEPED_SY_2026_2027)).toBe(false);
  });
  it('has about 200 class days (DepEd: 201 nationwide, Baguio has one local holiday)', () => {
    const n = countClassDays(year, DEPED_SY_2026_2027);
    expect(n).toBeGreaterThanOrEqual(190);
    expect(n).toBeLessThanOrEqual(205);
  });
});
