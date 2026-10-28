import { describe, expect, it } from 'vitest';
import { MockRepository } from './mockRepo';

describe('mock repository flows', () => {
  it('records a scan once, flags duplicates and texts the parent', async () => {
    const repo = new MockRepository();
    const { date } = await repo.getToday();
    const roster = await repo.getRoster('sec-apple', date);
    const waiting = roster.find((r) => !r.record && r.guardian?.smsConsent && r.guardian.numberStatus !== 'failed')!;
    const before = (await repo.listSms()).length;

    const first = await repo.recordScan({ qrToken: waiting.student.qrToken, sectionId: 'sec-apple' });
    expect(first.kind).toBe('recorded');
    expect((await repo.listSms()).length).toBe(before + 1);

    const repeat = await repo.recordScan({ qrToken: waiting.student.qrToken, sectionId: 'sec-apple' });
    expect(repeat.kind).toBe('ignore'); // within 10 seconds

    expect((await repo.recordScan({ qrToken: 'SA-NOPE', sectionId: 'sec-apple' })).kind).toBe('unknown');
    const other = (await repo.getRoster('sec-mango', date))[0].student;
    expect((await repo.recordScan({ qrToken: other.qrToken, sectionId: 'sec-apple' })).kind).toBe('wrong_section');
  });

  it('confirming marks unscanned children absent and locks edits', async () => {
    const repo = new MockRepository();
    const { date } = await repo.getToday();
    await repo.confirmDay('sec-apple', date);
    const roster = await repo.getRoster('sec-apple', date);
    expect(roster.every((r) => r.record)).toBe(true);
    const absent = roster.find((r) => r.record?.status === 'absent')!;
    await expect(repo.setStatus({ sectionId: 'sec-apple', date, studentId: absent.student.id, status: 'present' }))
      .rejects.toThrow(/reason/i);
    await repo.setStatus({ sectionId: 'sec-apple', date, studentId: absent.student.id, status: 'excused', reason: 'Parent called' });
    const after = await repo.getRoster('sec-apple', date);
    expect(after.find((r) => r.student.id === absent.student.id)!.record!.status).toBe('excused');
    expect((await repo.listAudit()).some((a) => a.action === 'attendance.edit')).toBe(true);
  });

  it('seeded history produced a 3-day streak alert and SMS', async () => {
    const repo = new MockRepository();
    const notes = await repo.listNotifications();
    expect(notes.some((n) => n.kind === 'streak')).toBe(true);
    expect((await repo.listSms(1000)).some((m) => m.kind === 'streak')).toBe(true);
  });
});
