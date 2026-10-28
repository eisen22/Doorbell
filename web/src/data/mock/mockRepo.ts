// In-memory adapter. Behaves like the real backend (rules, SMS outbox, alerts) so the UI
// can be built and demoed before the cloud exists. Data resets on page reload.
import {
  addDays, computeStreak, decideScan, isSchoolDay, manilaTime, manilaToday, recentSchoolDays,
  renderTemplate, shouldAlertStreak, to12h, toMinutes, fromMinutes,
} from '../../domain/rules';
import type {
  AppNotification, AttendanceRecord, AttendanceStatus, AuditEntry, CalendarDay, DayConfirmation, Enrollment,
  Guardian, ISODate, RosterRow, SchoolSettings, Section, SmsKind, SmsMessage, Student,
} from '../../domain/types';
import type { Repository, ScanResult, Session, SetStatusInput } from '../repository';
import * as seed from './seed';

const key = (sectionId: string, date: ISODate, studentId: string) => `${sectionId}|${date}|${studentId}`;
const dayKey = (sectionId: string, date: ISODate) => `${sectionId}|${date}`;
let idCounter = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

/**
 * Demo clock. Outside class hours the real time would make every scan "late",
 * so the mock simulates a morning that advances 1-3 minutes per scan.
 */
class DemoClock {
  private simulated = toMinutes('08:06');
  now(): string {
    const real = manilaTime();
    const m = toMinutes(real);
    if (m >= toMinutes('06:30') && m <= toMinutes('09:30')) return real;
    this.simulated += 1 + Math.floor(Math.random() * 3);
    return fromMinutes(this.simulated);
  }
  /** Current time without advancing the simulated clock. */
  peek(): string {
    return this.isSimulated() ? fromMinutes(this.simulated) : manilaTime();
  }
  isSimulated(): boolean {
    const m = toMinutes(manilaTime());
    return !(m >= toMinutes('06:30') && m <= toMinutes('09:30'));
  }
}

export class MockRepository implements Repository {
  private settings: SchoolSettings = structuredClone(seed.settings);
  private sections: Section[] = structuredClone(seed.sections);
  private calendar: CalendarDay[] = structuredClone(seed.calendar);
  private students: Student[];
  private guardians: Guardian[];
  private enrollments: Enrollment[];
  private attendance = new Map<string, AttendanceRecord>();
  private confirmations = new Map<string, DayConfirmation>();
  private sms: SmsMessage[] = [];
  private notifications: AppNotification[] = [];
  private audit: AuditEntry[] = [];
  private lastScanAt = new Map<string, number>();
  private listeners = new Set<() => void>();
  private clock = new DemoClock();
  private today: ISODate;
  private session: Session = { userId: 't-maria', name: 'Maria Santos', role: 'teacher', sectionId: 'sec-apple' };

  constructor() {
    const people = seed.seedPeople();
    this.students = people.students;
    this.guardians = people.guardians;
    this.enrollments = people.enrollments;
    // Use the most recent school day so the demo always has a class day.
    this.today = recentSchoolDays(manilaToday(), 1, seed.schedule, this.calendar)[0];
    this.seedHistory();
  }

  /* ---------- seeding ---------- */

  private seedHistory() {
    const r = seed.rng(77);
    const pastDays = recentSchoolDays(addDays(this.today, -1), 25, seed.schedule, this.calendar).reverse();
    for (const sec of this.sections) {
      const roster = this.activeStudents(sec.id);
      for (const date of pastDays) {
        roster.forEach((stu, i) => {
          let status: AttendanceStatus;
          const x = r();
          status = x < 0.84 ? 'present' : x < 0.92 ? 'late' : x < 0.97 ? 'absent' : 'excused';
          // Engineered stories for the demo, in the Apple section:
          const idx = pastDays.indexOf(date);
          if (sec.id === 'sec-apple' && i === 2 && idx >= pastDays.length - 3) status = 'absent';
          if (sec.id === 'sec-apple' && i === 5 && idx >= pastDays.length - 2) status = idx === pastDays.length - 1 ? 'absent' : 'late';
          if (sec.id === 'sec-apple' && (i === 2 || i === 5) && idx === pastDays.length - 4) status = 'present';
          const time = status === 'present' ? fromMinutes(toMinutes('07:32') + Math.floor(r() * 40))
            : status === 'late' ? fromMinutes(toMinutes('08:16') + Math.floor(r() * 30)) : undefined;
          this.attendance.set(key(sec.id, date, stu.id), {
            id: uid('att'), date, studentId: stu.id, sectionId: sec.id, status,
            scannedAt: time, source: time ? 'scanner' : 'manual',
            excusedNote: status === 'excused' ? 'Medical check-up (parent called)' : undefined,
          });
        });
        this.finalize(sec.id, date, sec.teacherId ?? 'system', false, `${date}T08:${String(20 + Math.floor(r() * 20))}:00+08:00`);
      }
      // Today: about 60% of the class has arrived.
      const todayRoster = this.activeStudents(sec.id).filter((_, i) => i !== 2 && i % 5 !== 4 && i < 16);
      let mins = toMinutes('07:31');
      for (const stu of todayRoster) {
        mins += 1 + Math.floor(r() * 3);
        const time = fromMinutes(mins + (r() < 0.1 ? 40 : 0));
        const decision = decideScan({ time, schedule: sec.schedule });
        if (decision.kind !== 'record') continue;
        this.attendance.set(key(sec.id, this.today, stu.id), {
          id: uid('att'), date: this.today, studentId: stu.id, sectionId: sec.id, status: decision.status,
          scannedAt: time, source: 'scanner',
        });
        if (sec.id === 'sec-apple') this.queueSms(stu, decision.status === 'late' ? 'late' : 'arrival', time, `${this.today}T${time}:00+08:00`);
      }
    }
    this.notifications.forEach((n) => { if (n.createdAt < `${addDays(this.today, -2)}`) n.read = true; });
  }

  /* ---------- helpers ---------- */

  /** School-local timestamp for the demo day, e.g. 2026-10-28T07:42:00+08:00 */
  private nowIso(): string { return `${this.today}T${this.clock.peek()}:00+08:00`; }

  private emit() { this.listeners.forEach((l) => l()); }

  private activeStudents(sectionId: string): Student[] {
    const ids = new Set(this.enrollments.filter((e) => e.sectionId === sectionId && e.status === 'active').map((e) => e.studentId));
    return this.students.filter((s) => ids.has(s.id)).sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  }

  private sectionOf(studentId: string): Section | undefined {
    const e = this.enrollments.find((x) => x.studentId === studentId && x.status === 'active');
    return e ? this.sections.find((s) => s.id === e.sectionId) : undefined;
  }

  private guardianOf(studentId: string): Guardian | undefined {
    return this.guardians.find((g) => g.studentIds.includes(studentId));
  }

  private statusMap(sectionId: string, studentId: string): Record<ISODate, AttendanceStatus> {
    const out: Record<ISODate, AttendanceStatus> = {};
    this.attendance.forEach((rec) => {
      if (rec.sectionId === sectionId && rec.studentId === studentId) out[rec.date] = rec.status;
    });
    return out;
  }

  private streakFor(sectionId: string, studentId: string, date: ISODate): number {
    const sec = this.sections.find((s) => s.id === sectionId)!;
    return computeStreak(date, this.statusMap(sectionId, studentId), sec.schedule, this.calendar);
  }

  private queueSms(student: Student, kind: SmsKind, time: string, createdAt = this.nowIso()) {
    const g = this.guardianOf(student.id);
    if (!g || !g.smsConsent) return;
    if ((kind === 'arrival' || kind === 'late') && !this.settings.arrivalSmsEnabled) return;
    const tpl = this.settings.templates[g.preferredLanguage];
    const body = renderTemplate(kind === 'streak' ? tpl.streak : kind === 'late' ? tpl.late : tpl.arrival, {
      child: student.firstName, time: to12h(time), school: this.settings.schoolName, contact: this.settings.contactNumber,
    });
    const failed = g.numberStatus === 'failed';
    this.sms.unshift({
      id: uid('sms'), studentId: student.id, guardianId: g.id, to: g.mobile, body, kind,
      status: failed ? 'failed' : 'sent', createdAt, attempts: 1,
    });
    if (failed) {
      this.notifications.unshift({
        id: uid('ntf'), kind: 'sms_failed', studentId: student.id, createdAt, read: false,
        title: `SMS to ${student.firstName}'s guardian failed`,
        body: `The number on file for ${g.name} could not be reached. Please update it.`,
      });
    }
  }

  /** Marks unscanned students absent, locks the day, then runs the streak rule. */
  private finalize(sectionId: string, date: ISODate, by: string, auto: boolean, at = this.nowIso()): DayConfirmation {
    for (const stu of this.activeStudents(sectionId)) {
      const k = key(sectionId, date, stu.id);
      if (!this.attendance.has(k)) {
        this.attendance.set(k, { id: uid('att'), date, studentId: stu.id, sectionId, status: 'absent', source: 'auto' });
      }
    }
    const conf: DayConfirmation = { sectionId, date, confirmedBy: by, confirmedAt: at, auto };
    this.confirmations.set(dayKey(sectionId, date), conf);
    for (const stu of this.activeStudents(sectionId)) this.checkStreak(sectionId, stu, date, at);
    return conf;
  }

  private checkStreak(sectionId: string, stu: Student, date: ISODate, at: string) {
    const streak = this.streakFor(sectionId, stu.id, date);
    if (!shouldAlertStreak(streak, this.settings.streakDays)) return;
    this.queueSms(stu, 'streak', '08:00', at);
    this.notifications.unshift({
      id: uid('ntf'), kind: 'streak', studentId: stu.id, createdAt: at, read: false,
      title: `${stu.firstName} ${stu.lastName}: ${streak} school days late or absent`,
      body: 'The guardian was notified by SMS. Consider a follow-up call.',
    });
  }

  /* ---------- Repository ---------- */

  async getSession() { return this.session; }
  async getToday() { return { date: this.today, time: this.clock.peek(), simulated: this.clock.isSimulated() }; }
  async getSettings() { return this.settings; }
  async updateSettings(patch: Partial<SchoolSettings>) {
    this.settings = { ...this.settings, ...patch };
    await this.logAudit('settings.update', 'settings', Object.keys(patch).join(', '));
    return this.settings;
  }
  async getSchoolYear() { return seed.schoolYear; }
  async listSections() { return this.sections; }
  async getSection(id: string) {
    const s = this.sections.find((x) => x.id === id);
    if (!s) throw new Error('Section not found');
    return s;
  }
  async getCalendar() { return this.calendar; }

  async getRoster(sectionId: string, date: ISODate): Promise<RosterRow[]> {
    const sec = await this.getSection(sectionId);
    // If today has no record yet (not scanned), show the streak as of the previous school day.
    const prevDay = recentSchoolDays(addDays(date, -1), 1, sec.schedule, this.calendar)[0];
    return this.activeStudents(sectionId).map((student) => {
      const record = this.attendance.get(key(sectionId, date, student.id));
      return {
        student,
        guardian: this.guardianOf(student.id),
        record,
        streak: record || !prevDay ? this.streakFor(sectionId, student.id, date) : this.streakFor(sectionId, student.id, prevDay),
      };
    });
  }

  async getAttendanceRange(sectionId: string, from: ISODate, to: ISODate) {
    return [...this.attendance.values()].filter((r) => r.sectionId === sectionId && r.date >= from && r.date <= to);
  }

  async getConfirmation(sectionId: string, date: ISODate) {
    return this.confirmations.get(dayKey(sectionId, date)) ?? null;
  }

  async recordScan({ qrToken, sectionId }: { qrToken: string; sectionId?: string }): Promise<ScanResult> {
    const student = this.students.find((s) => s.qrToken === qrToken.trim());
    if (!student) return { kind: 'unknown' };
    if (student.qrStatus === 'revoked') return { kind: 'revoked', student };
    const sec = this.sectionOf(student.id);
    if (!sec || (sectionId && sec.id !== sectionId)) return { kind: 'wrong_section', student };
    if (!isSchoolDay(this.today, sec.schedule, this.calendar)) return { kind: 'not_school_day' };

    const last = this.lastScanAt.get(qrToken);
    const now = Date.now();
    this.lastScanAt.set(qrToken, now);
    const k = key(sec.id, this.today, student.id);
    const existing = this.attendance.get(k);
    const time = this.clock.now();
    const decision = decideScan({
      time, schedule: sec.schedule, existingScanAt: existing?.scannedAt,
      secondsSinceLastSameCode: last ? (now - last) / 1000 : undefined,
    });
    if (decision.kind === 'ignore') return { kind: 'ignore' };
    if (decision.kind === 'duplicate') return { kind: 'duplicate', student, firstScanAt: decision.firstScanAt };

    const locked = this.confirmations.has(dayKey(sec.id, this.today));
    const status = locked ? 'late' : decision.status;
    this.attendance.set(k, {
      id: existing?.id ?? uid('att'), date: this.today, studentId: student.id, sectionId: sec.id, status,
      scannedAt: time, source: 'scanner', editedReason: locked ? 'Arrived after attendance was confirmed' : undefined,
    });
    if (locked) await this.logAudit('attendance.scan_after_lock', student.id, `absent -> late at ${time}`);
    this.queueSms(student, status === 'late' ? 'late' : 'arrival', time);
    this.emit();
    return { kind: 'recorded', student, status, time };
  }

  async setStatus(input: SetStatusInput) {
    const locked = this.confirmations.has(dayKey(input.sectionId, input.date));
    if (locked && !input.reason?.trim()) throw new Error('This day is confirmed. Give a reason for the change.');
    const k = key(input.sectionId, input.date, input.studentId);
    const prev = this.attendance.get(k);
    this.attendance.set(k, {
      id: prev?.id ?? uid('att'), date: input.date, studentId: input.studentId, sectionId: input.sectionId,
      status: input.status, scannedAt: prev?.scannedAt, source: 'manual',
      excusedNote: input.status === 'excused' ? input.note : undefined,
      editedReason: input.reason,
    });
    await this.logAudit('attendance.edit', input.studentId, `${prev?.status ?? 'none'} -> ${input.status}${input.reason ? ` (${input.reason})` : ''}`);
    if (locked && (input.status === 'absent' || input.status === 'late')) {
      const stu = this.students.find((s) => s.id === input.studentId);
      if (stu) this.checkStreak(input.sectionId, stu, input.date, this.nowIso());
    }
    this.emit();
  }

  async confirmDay(sectionId: string, date: ISODate) {
    const existing = this.confirmations.get(dayKey(sectionId, date));
    if (existing) return existing;
    const conf = this.finalize(sectionId, date, this.session.name, false);
    await this.logAudit('attendance.confirm', sectionId, date);
    this.emit();
    return conf;
  }

  async listNotifications() { return this.notifications; }
  async markNotificationsRead() { this.notifications.forEach((n) => { n.read = true; }); this.emit(); }
  async listSms(limit = 200) { return this.sms.slice(0, limit); }

  async resendSms(id: string) {
    const m = this.sms.find((x) => x.id === id);
    if (!m) return;
    const g = this.guardians.find((x) => x.id === m.guardianId);
    m.attempts += 1;
    m.status = g?.numberStatus === 'failed' ? 'failed' : 'sent';
    await this.logAudit('sms.resend', id, m.status);
    this.emit();
  }

  async listAudit(limit = 100) { return this.audit.slice(0, limit); }
  async logAudit(action: string, target: string, detail?: string) {
    this.audit.unshift({ id: uid('aud'), at: this.nowIso(), actor: this.session.name, action, target, detail });
  }

  async simulateScan(sectionId: string) {
    const waiting = this.activeStudents(sectionId).filter((s) => !this.attendance.get(key(sectionId, this.today, s.id))?.scannedAt);
    if (waiting.length === 0) return { kind: 'ignore' } as ScanResult;
    const pick = waiting[Math.floor(Math.random() * waiting.length)];
    return this.recordScan({ qrToken: pick.qrToken, sectionId });
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
}
