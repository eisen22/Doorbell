import { describe, expect, it } from 'vitest';
import { Engine, noopPersistence, type Clock, type Persistence } from './engine';
import { buildDemoState, demoAuth, DEMO_PASSWORD } from './mock/seed';

// A fixed "today" so the tests do not depend on the real date: Thursday, Oct 29, 2026, 7:50 AM.
const clock: Clock = { today: () => '2026-10-29', scanTime: () => '07:50', peek: () => '07:50', simulated: () => false };

function make(persistence: Persistence = noopPersistence) {
  let engine!: Engine;
  engine = new Engine('demo', buildDemoState('2026-10-29', clock), persistence, demoAuth(() => engine), clock);
  return engine;
}

describe('engine with demo data', () => {
  it('signs in by role and rejects wrong passwords', async () => {
    const e = make();
    await expect(e.signIn('maria.santos@sunnyside.edu.ph', 'nope')).rejects.toThrow(/wrong/i);
    const t = await e.signIn('maria.santos@sunnyside.edu.ph', DEMO_PASSWORD);
    expect(t.role).toBe('teacher');
    expect(t.sectionId).toBe('sec-apple');
    const a = await e.signIn('admin@sunnyside.edu.ph', DEMO_PASSWORD);
    expect(a.role).toBe('admin');
  });

  it('has history from June 8 with confirmed days and specific streak alerts', async () => {
    const e = make();
    await e.signIn('admin@sunnyside.edu.ph', DEMO_PASSWORD);
    expect(await e.getConfirmation('sec-apple', '2026-06-08')).not.toBeNull();
    expect(await e.getConfirmation('sec-apple', '2026-06-12')).toBeNull(); // Independence Day
    const titles = (await e.listNotifications()).filter((n) => n.createdAt.startsWith('2026-10-28')).map((n) => n.title);
    expect(titles.some((t) => t.includes('absent for 3 school days in a row'))).toBe(true);
    expect(titles.some((t) => t.includes('late for 3 school days in a row'))).toBe(true);
    expect(titles.some((t) => t.includes('absent 2 days and late 1 day'))).toBe(true);
    expect(titles.every((t) => !t.includes('late or absent'))).toBe(true);
    const sms = (await e.listSms(2000)).filter((m) => m.kind === 'streak' && m.createdAt.startsWith('2026-10-28'));
    expect(sms.length).toBeGreaterThan(0);
    expect(sms.every((m) => !m.body.includes('{streak}'))).toBe(true);
  });

  it('records a scan once, texts the parent, and saves through persistence', async () => {
    const writes: string[] = [];
    const e = make({ put: (col, id) => writes.push(`${col}/${id}`), remove: () => {} });
    await e.signIn('maria.santos@sunnyside.edu.ph', DEMO_PASSWORD);
    const roster = await e.getRoster('sec-apple', '2026-10-29');
    const waiting = roster.find((r) => !r.record && r.guardian?.smsConsent && r.guardian.numberStatus !== 'failed')!;
    const res = await e.recordScan({ qrToken: waiting.student.qrToken, sectionId: 'sec-apple' });
    expect(res.kind).toBe('recorded');
    expect(writes).toContain('attendance/sec-apple_2026-10-29');
    expect(writes).toContain(`sms/arr_${waiting.student.id}_2026-10-29`);
    expect((await e.recordScan({ qrToken: waiting.student.qrToken, sectionId: 'sec-apple' })).kind).toBe('ignore');
  });

  it('teachers only see their own section alerts; confirm locks the day', async () => {
    const e = make();
    await e.signIn('jose.ramirez@sunnyside.edu.ph', DEMO_PASSWORD);
    expect((await e.listNotifications()).every((n) => n.sectionId === 'sec-mango' || n.sectionId === 'all')).toBe(true);
    await e.confirmDay('sec-mango', '2026-10-29');
    const row = (await e.getRoster('sec-mango', '2026-10-29')).find((r) => r.record?.status === 'absent')!;
    await expect(e.setStatus({ sectionId: 'sec-mango', date: '2026-10-29', studentId: row.student.id, status: 'present' })).rejects.toThrow(/reason/i);
  });

  it('admin absence watch lists 3-day streaks across sections', async () => {
    const e = make();
    await e.signIn('admin@sunnyside.edu.ph', DEMO_PASSWORD);
    const rows = await e.listAttention(3);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.every((r) => r.streak.count >= 3)).toBe(true);
  });

  it('a teacher can handle a morning and an afternoon class', async () => {
    const e = make();
    const t = await e.signIn('maria.santos@sunnyside.edu.ph', DEMO_PASSWORD);
    expect(t.sectionIds).toEqual(['sec-apple', 'sec-cherry']);
    expect(t.sectionId).toBe('sec-apple'); // 7:50 AM: the morning class
    await e.signIn('admin@sunnyside.edu.ph', DEMO_PASSWORD);
    const cherry = await e.getSection('sec-cherry');
    // Overlapping times are refused; a different time slot is fine.
    await expect(e.saveSection({ ...cherry, schedule: { ...cherry.schedule, startTime: '10:00' } })).rejects.toThrow(/same time/);
  });

  it('calendar changes by the admin alert every teacher', async () => {
    const e = make();
    await e.signIn('admin@sunnyside.edu.ph', DEMO_PASSWORD);
    await e.declareSuspension('2026-10-30', 'Class suspension: typhoon');
    await e.signIn('jose.ramirez@sunnyside.edu.ph', DEMO_PASSWORD);
    const note = (await e.listNotifications()).find((n) => n.kind === 'calendar');
    expect(note?.title).toMatch(/Classes suspended/);
    expect(note?.read).toBe(false);
    await e.markNotificationsRead([note!.id]);
    expect((await e.listNotifications()).find((n) => n.id === note!.id)?.read).toBe(true);
  });
});
