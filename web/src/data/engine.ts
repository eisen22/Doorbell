// The Doorbell engine: all attendance, streak and SMS logic in one place.
// It keeps the school's data in memory and saves every change through a Persistence:
//   demo mode  -> nothing is saved (data resets on reload)
//   cloud mode -> Firestore (see data/firebase)
import {
  addDays, decideScan, describeStreak, isSchoolDay, manilaTime, manilaToday, recentSchoolDays,
  renderTemplate, shouldAlertStreak, shouldAutoFinalize, streakInfo, to12h, toMinutes, fromMinutes,
} from '../domain/rules';
import type {
  AppNotification, AttendanceDay, AttendanceRecord, AttendanceStatus, AuditEntry, CalendarDay, DayConfirmation,
  Enrollment, Guardian, ISODate, RosterRow, SchoolSettings, SchoolYear, Section, SmsKind, SmsMessage, StreakInfo,
  Student, Teacher, UserAccount,
} from '../domain/types';
import type {
  AttentionRow, DemoAccount, Repository, ScanResult, SectionInput, Session, SetStatusInput, StudentInput, StudentRow,
  TeacherInput, TodayInfo,
} from './repository';

/* ---------- plug-in points ---------- */

export type Col =
  | 'meta' | 'users' | 'sections' | 'teachers' | 'students' | 'guardians' | 'enrollments'
  | 'attendance' | 'confirmations' | 'sms' | 'notifications' | 'audit';

export interface Persistence {
  put(col: Col, id: string, data: object): void;
  remove(col: Col, id: string): void;
}

export interface AuthAdapter {
  signIn(email: string, password: string): Promise<UserAccount>;
  signOut(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  /** Creates a sign-in account for a new teacher; returns the temporary password to hand over. */
  createTeacherAccount(email: string, name: string, teacherId: string): Promise<{ uid: string; tempPassword: string }>;
  demoAccounts(): DemoAccount[];
}

export interface Clock {
  /** Real date in Manila. */
  today(): ISODate;
  /** Time for a scan (the demo clock may advance it). */
  scanTime(): string;
  /** Current time without side effects. */
  peek(): string;
  simulated(): boolean;
}

export const realClock: Clock = {
  today: () => manilaToday(),
  scanTime: () => manilaTime(),
  peek: () => manilaTime(),
  simulated: () => false,
};

/** Outside 6:30-9:30 AM the demo simulates a school morning, so scans are not all "late". */
export class DemoClock implements Clock {
  private sim = toMinutes('08:06');
  private inHours() { const m = toMinutes(manilaTime()); return m >= toMinutes('06:30') && m <= toMinutes('09:30'); }
  today() { return manilaToday(); }
  scanTime() { if (this.inHours()) return manilaTime(); this.sim += 1 + Math.floor(Math.random() * 3); return fromMinutes(this.sim); }
  peek() { return this.inHours() ? manilaTime() : fromMinutes(this.sim); }
  simulated() { return !this.inHours(); }
}

export const noopPersistence: Persistence = { put() {}, remove() {} };

/* ---------- state ---------- */

export interface SchoolMeta { settings: SchoolSettings; schoolYear: SchoolYear }

export interface EngineState {
  meta: SchoolMeta;
  calendar: Map<ISODate, CalendarDay>;
  users: Map<string, UserAccount>;
  sections: Map<string, Section>;
  teachers: Map<string, Teacher>;
  students: Map<string, Student>;
  guardians: Map<string, Guardian>;
  enrollments: Map<string, Enrollment>;
  attendance: Map<string, AttendanceDay>;
  confirmations: Map<string, DayConfirmation>;
  sms: Map<string, SmsMessage>;
  notifications: Map<string, AppNotification>;
  audit: Map<string, AuditEntry>;
}

export function emptyState(meta: SchoolMeta, calendar: CalendarDay[] = []): EngineState {
  return {
    meta, calendar: new Map(calendar.map((c) => [c.date, c])), users: new Map(), sections: new Map(), teachers: new Map(),
    students: new Map(), guardians: new Map(), enrollments: new Map(), attendance: new Map(), confirmations: new Map(),
    sms: new Map(), notifications: new Map(), audit: new Map(),
  };
}

const dayId = (sectionId: string, date: ISODate) => `${sectionId}_${date}`;
let counter = 0;
export const uid = (p: string) => `${p}-${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const byName = (a: Student, b: Student) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);

export class Engine implements Repository {
  readonly mode: 'demo' | 'cloud';
  s: EngineState;
  private session: Session | null = null;
  private listeners = new Set<() => void>();
  private lastScanAt = new Map<string, number>();
  private lastAssign: { label: string; before: Enrollment[] } | null = null;
  private emitTimer: ReturnType<typeof setTimeout> | null = null;
  /** Resolves when data for the signed-in user has loaded. */
  ready: Promise<void> = Promise.resolve();

  constructor(
    mode: 'demo' | 'cloud',
    state: EngineState,
    private persistence: Persistence,
    private auth: AuthAdapter,
    private clock: Clock,
  ) {
    this.mode = mode;
    this.s = state;
  }

  /* ---------- plumbing ---------- */

  emit() {
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => { this.emitTimer = null; this.listeners.forEach((l) => l()); }, 0);
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private put(col: Col, id: string, data: object) { this.persistence.put(col, id, data); }

  /** Cloud mode: apply a document that changed in Firestore. */
  applyRemote(col: Col, id: string, data: unknown | null) {
    const s = this.s;
    if (col === 'meta') {
      if (id === 'school' && data) s.meta = data as SchoolMeta;
      if (id === 'calendar' && data) s.calendar = new Map(((data as { days: CalendarDay[] }).days ?? []).map((c) => [c.date, c]));
    } else {
      const map = s[col] as Map<string, unknown>;
      if (data === null) map.delete(id); else map.set(id, data);
    }
    this.emit();
  }

  setSession(account: UserAccount | null) {
    if (!account) { this.session = null; this.emit(); return; }
    const section = account.teacherId
      ? [...this.s.sections.values()].find((x) => x.teacherId === account.teacherId && !x.archived)
      : undefined;
    this.session = { uid: account.uid, name: account.name, email: account.email, role: account.role, teacherId: account.teacherId, sectionId: section?.id ?? null };
    this.emit();
  }

  /** Re-derive the teacher's section after section data changes. */
  refreshSession() {
    if (!this.session) return;
    const acc = this.s.users.get(this.session.uid) ?? { ...this.session } as unknown as UserAccount;
    this.setSession({ ...acc, uid: this.session.uid, name: this.session.name, email: this.session.email, role: this.session.role, teacherId: this.session.teacherId });
  }

  private nowIso(date = this.clock.today()) { return `${date}T${this.clock.peek()}:00+08:00`; }
  private actor() { return this.session?.name ?? 'System'; }
  private get settings() { return this.s.meta.settings; }
  private get year() { return this.s.meta.schoolYear; }
  private writableSections(): Section[] {
    const all = [...this.s.sections.values()].filter((x) => !x.archived);
    if (!this.session) return [];
    return this.session.role === 'admin' ? all : all.filter((x) => x.id === this.session!.sectionId);
  }
  private visibleSectionIds(): Set<string> | null {
    if (!this.session || this.session.role === 'admin') return null; // null = all
    return new Set(this.session.sectionId ? [this.session.sectionId] : []);
  }

  /* ---------- people ---------- */

  rosterOn(sectionId: string, date: ISODate): Student[] {
    const ids = new Set<string>();
    for (const e of this.s.enrollments.values()) {
      if (e.sectionId !== sectionId || e.startDate > date) continue;
      if (e.endDate && e.endDate <= date) continue;
      ids.add(e.studentId);
    }
    return [...ids].map((id) => this.s.students.get(id)).filter((x): x is Student => !!x && !x.id.includes('-old-')).sort(byName);
  }

  private activeEnrollment(studentId: string) {
    return [...this.s.enrollments.values()].find((e) => e.studentId === studentId && e.status === 'active');
  }

  guardianOf(studentId: string): Guardian | undefined {
    for (const g of this.s.guardians.values()) if (g.studentIds.includes(studentId)) return g;
    return undefined;
  }

  private statusMap(sectionId: string, studentId: string): Record<ISODate, AttendanceStatus> {
    const out: Record<ISODate, AttendanceStatus> = {};
    for (const day of this.s.attendance.values()) {
      if (day.sectionId !== sectionId) continue;
      const r = day.records[studentId];
      if (r) out[day.date] = r.status;
    }
    return out;
  }

  streakFor(section: Section, studentId: string, date: ISODate): StreakInfo {
    return streakInfo(date, this.statusMap(section.id, studentId), section.schedule, this.s.calendar);
  }

  private record(sectionId: string, date: ISODate, studentId: string): AttendanceRecord | undefined {
    return this.s.attendance.get(dayId(sectionId, date))?.records[studentId];
  }

  private writeRecord(rec: AttendanceRecord) {
    const id = dayId(rec.sectionId, rec.date);
    const day = this.s.attendance.get(id) ?? { id, sectionId: rec.sectionId, date: rec.date, records: {} };
    day.records[rec.studentId] = rec;
    this.s.attendance.set(id, day);
    this.put('attendance', id, day);
  }

  /* ---------- SMS and alerts ---------- */

  queueSms(student: Student, kind: SmsKind, opts: { time?: string; streak?: StreakInfo; date: ISODate; sectionId: string; createdAt?: string }) {
    const g = this.guardianOf(student.id);
    if (!g || !g.smsConsent) return null;
    if ((kind === 'arrival' || kind === 'late') && !this.settings.arrivalSmsEnabled) return null;
    const tpl = this.settings.templates[g.preferredLanguage] ?? this.settings.templates.en;
    const body = renderTemplate(kind === 'streak' ? tpl.streak : kind === 'late' ? tpl.late : tpl.arrival, {
      child: student.firstName, time: opts.time ? to12h(opts.time) : '', school: this.settings.schoolName,
      contact: this.settings.contactNumber, streak: opts.streak ? describeStreak(opts.streak, g.preferredLanguage) : '',
    });
    // Deterministic ids: two devices processing the same event write the same document once.
    const id = kind === 'streak' ? `stk_${student.id}_${opts.date}` : `arr_${student.id}_${opts.date}`;
    const failed = g.numberStatus === 'failed';
    const msg: SmsMessage = {
      id, studentId: student.id, guardianId: g.id, sectionId: opts.sectionId, to: g.mobile, body, kind,
      status: failed ? 'failed' : 'sent', createdAt: opts.createdAt ?? this.nowIso(opts.date), attempts: 1,
    };
    this.s.sms.set(id, msg);
    this.put('sms', id, msg);
    if (failed) {
      const n: AppNotification = {
        id: `smsf_${id}`, kind: 'sms_failed', studentId: student.id, sectionId: opts.sectionId, createdAt: msg.createdAt, read: false,
        title: `Text to ${student.firstName} ${student.lastName}'s guardian did not go through`,
        body: `${g.name}'s number could not be reached. Ask the office to update it, or call the family.`,
      };
      this.s.notifications.set(n.id, n);
      this.put('notifications', n.id, n);
    }
    return msg;
  }

  private checkStreak(section: Section, stu: Student, date: ISODate, at: string) {
    const info = this.streakFor(section, stu.id, date);
    if (!shouldAlertStreak(info.count, this.settings.streakDays)) return;
    const sms = this.queueSms(stu, 'streak', { streak: info, date, sectionId: section.id, createdAt: at });
    const g = this.guardianOf(stu.id);
    const dates = [...info.dates].reverse().map((d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })).join(', ');
    const n: AppNotification = {
      id: `stk_${stu.id}_${date}`, kind: 'streak', studentId: stu.id, sectionId: section.id, streak: info, createdAt: at, read: false,
      title: `${stu.firstName} ${stu.lastName} was ${describeStreak(info)}`,
      body: `${dates}. ${sms ? `${g?.name ?? 'The guardian'} was sent an SMS.` : 'No SMS sent (no consent on file). Please call the family.'}`,
    };
    this.s.notifications.set(n.id, n);
    this.put('notifications', n.id, n);
  }

  /** Marks unscanned children absent, locks the day, then applies the streak rule. Idempotent. */
  finalize(sectionId: string, date: ISODate, by: string, auto: boolean, at = this.nowIso(date)): DayConfirmation {
    const existing = this.s.confirmations.get(dayId(sectionId, date));
    if (existing) return existing;
    const section = this.s.sections.get(sectionId)!;
    const roster = this.rosterOn(sectionId, date);
    const id = dayId(sectionId, date);
    const day = this.s.attendance.get(id) ?? { id, sectionId, date, records: {} };
    for (const stu of roster) {
      if (!day.records[stu.id]) day.records[stu.id] = { date, studentId: stu.id, sectionId, status: 'absent', source: 'auto' };
    }
    this.s.attendance.set(id, day);
    this.put('attendance', id, day);
    const conf: DayConfirmation = { id, sectionId, date, confirmedBy: by, confirmedAt: at, auto };
    this.s.confirmations.set(id, conf);
    this.put('confirmations', id, conf);
    for (const stu of roster) this.checkStreak(section, stu, date, at);
    return conf;
  }

  /** Auto-confirms past school days nobody confirmed, and today after the auto-confirm time. */
  catchUp() {
    const today = this.clock.today();
    const end = today < this.year.end ? today : this.year.end;
    for (const sec of this.writableSections()) {
      for (let d = this.year.start; d <= end; d = addDays(d, 1)) {
        if (!isSchoolDay(d, sec.schedule, this.s.calendar) || this.s.confirmations.has(dayId(sec.id, d))) continue;
        if (d < today || (d === today && shouldAutoFinalize(this.clock.peek(), sec.schedule))) {
          this.finalize(sec.id, d, 'Auto-confirm', true);
        }
      }
    }
    this.emit();
  }

  /* ---------- auth ---------- */

  async getSession() { await this.ready; return this.session; }
  async signIn(email: string, password: string) {
    const account = await this.auth.signIn(email.trim(), password);
    this.setSession(account);
    return this.session!;
  }
  async signOut() { await this.auth.signOut(); this.setSession(null); }
  async sendPasswordReset(email: string) { await this.auth.sendPasswordReset(email.trim()); }
  demoAccounts() { return this.auth.demoAccounts(); }

  /* ---------- shared reads ---------- */

  async getToday(): Promise<TodayInfo> {
    await this.ready;
    const actual = this.clock.today();
    const sec = this.session?.sectionId ? this.s.sections.get(this.session.sectionId) : [...this.s.sections.values()][0];
    const schedule = sec?.schedule ?? { classDays: [1, 2, 3, 4, 5], startTime: '08:00', endTime: '11:30', scanWindowMins: 30, lateCutoffMins: 15, autoFinalizeMins: 45 };
    const clamp = actual > this.year.end ? this.year.end : actual;
    const shown = recentSchoolDays(clamp, 1, schedule, this.s.calendar, 120)[0] ?? clamp;
    return { date: shown, actualDate: actual, time: this.clock.peek(), simulated: this.clock.simulated(), isSchoolDay: isSchoolDay(actual, schedule, this.s.calendar) && actual >= this.year.start && actual <= this.year.end };
  }
  async getSettings() { await this.ready; return this.settings; }
  async getSchoolYear() { await this.ready; return this.year; }
  async listSections() { await this.ready; return [...this.s.sections.values()].sort((a, b) => a.name.localeCompare(b.name)); }
  async getSection(id: string) {
    await this.ready;
    const s = this.s.sections.get(id);
    if (!s) throw new Error('Section not found');
    return s;
  }
  async getCalendar() { await this.ready; return [...this.s.calendar.values()].sort((a, b) => a.date.localeCompare(b.date)); }

  /* ---------- teacher ---------- */

  async getRoster(sectionId: string, date: ISODate): Promise<RosterRow[]> {
    const sec = await this.getSection(sectionId);
    const prev = recentSchoolDays(addDays(date, -1), 1, sec.schedule, this.s.calendar)[0];
    return this.rosterOn(sectionId, date).map((student) => {
      const record = this.record(sectionId, date, student.id);
      return {
        student, guardian: this.guardianOf(student.id), record,
        // Not scanned yet today: show the streak as of the previous school day.
        streak: record || !prev ? this.streakFor(sec, student.id, date) : this.streakFor(sec, student.id, prev),
      };
    });
  }

  async getAttendanceRange(sectionId: string, from: ISODate, to: ISODate) {
    await this.ready;
    const out: AttendanceRecord[] = [];
    for (const day of this.s.attendance.values()) {
      if (day.sectionId === sectionId && day.date >= from && day.date <= to) out.push(...Object.values(day.records));
    }
    return out;
  }

  async getConfirmation(sectionId: string, date: ISODate) { await this.ready; return this.s.confirmations.get(dayId(sectionId, date)) ?? null; }

  async recordScan({ qrToken, sectionId }: { qrToken: string; sectionId?: string }): Promise<ScanResult> {
    await this.ready;
    const token = qrToken.trim();
    const student = [...this.s.students.values()].find((s) => s.qrToken === token);
    if (!student) return { kind: 'unknown' };
    if (student.qrStatus === 'revoked') return { kind: 'revoked', student };
    const enr = this.activeEnrollment(student.id);
    const sec = enr ? this.s.sections.get(enr.sectionId) : undefined;
    if (!sec || (sectionId && sec.id !== sectionId)) return { kind: 'wrong_section', student };
    const today = this.clock.today();
    if (!isSchoolDay(today, sec.schedule, this.s.calendar) || today < this.year.start || today > this.year.end) return { kind: 'not_school_day' };

    const last = this.lastScanAt.get(token);
    const nowMs = Date.now();
    this.lastScanAt.set(token, nowMs);
    const existing = this.record(sec.id, today, student.id);
    const time = this.clock.scanTime();
    const decision = decideScan({ time, schedule: sec.schedule, existingScanAt: existing?.scannedAt, secondsSinceLastSameCode: last ? (nowMs - last) / 1000 : undefined });
    if (decision.kind === 'ignore') return { kind: 'ignore' };
    if (decision.kind === 'duplicate') return { kind: 'duplicate', student, firstScanAt: decision.firstScanAt };

    const locked = this.s.confirmations.has(dayId(sec.id, today));
    const status = locked ? 'late' : decision.status;
    this.writeRecord({ date: today, studentId: student.id, sectionId: sec.id, status, scannedAt: time, source: 'scanner', editedReason: locked ? 'Arrived after attendance was confirmed' : undefined });
    if (locked) await this.logAudit('attendance.scan_after_lock', `${student.firstName} ${student.lastName}`, `absent -> late at ${time}`);
    this.queueSms(student, status === 'late' ? 'late' : 'arrival', { time, date: today, sectionId: sec.id });
    this.emit();
    return { kind: 'recorded', student, status, time };
  }

  async setStatus(input: SetStatusInput) {
    await this.ready;
    const locked = this.s.confirmations.has(dayId(input.sectionId, input.date));
    if (locked && !input.reason?.trim()) throw new Error('This day is confirmed. Give a reason for the change.');
    const prev = this.record(input.sectionId, input.date, input.studentId);
    this.writeRecord({
      date: input.date, studentId: input.studentId, sectionId: input.sectionId, status: input.status,
      scannedAt: prev?.scannedAt, source: 'manual',
      excusedNote: input.status === 'excused' ? input.note : undefined, editedReason: input.reason,
    });
    const stu = this.s.students.get(input.studentId);
    await this.logAudit('attendance.edit', stu ? `${stu.firstName} ${stu.lastName}` : input.studentId, `${input.date}: ${prev?.status ?? 'none'} -> ${input.status}${input.reason ? ` (${input.reason})` : ''}`);
    if (locked && stu && (input.status === 'absent' || input.status === 'late')) {
      this.checkStreak(this.s.sections.get(input.sectionId)!, stu, input.date, this.nowIso());
    }
    this.emit();
  }

  async confirmDay(sectionId: string, date: ISODate) {
    await this.ready;
    const conf = this.finalize(sectionId, date, this.actor(), false);
    await this.logAudit('attendance.confirm', this.s.sections.get(sectionId)?.name ?? sectionId, date);
    this.emit();
    return conf;
  }

  async simulateScan(sectionId: string) {
    const today = this.clock.today();
    const waiting = this.rosterOn(sectionId, today).filter((s) => !this.record(sectionId, today, s.id)?.scannedAt);
    if (!waiting.length) return { kind: 'ignore' } as ScanResult;
    return this.recordScan({ qrToken: waiting[Math.floor(Math.random() * waiting.length)].qrToken, sectionId });
  }

  async listNotifications() {
    await this.ready;
    const vis = this.visibleSectionIds();
    return [...this.s.notifications.values()]
      .filter((n) => !vis || (n.sectionId && vis.has(n.sectionId)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async markNotificationsRead() {
    for (const n of await this.listNotifications()) {
      if (n.read) continue;
      n.read = true;
      this.put('notifications', n.id, n);
    }
    this.emit();
  }

  async listSms(limit = 300) {
    await this.ready;
    const vis = this.visibleSectionIds();
    return [...this.s.sms.values()]
      .filter((m) => !vis || !m.sectionId || vis.has(m.sectionId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }

  async resendSms(id: string) {
    const m = this.s.sms.get(id);
    if (!m) return;
    const g = m.guardianId ? this.s.guardians.get(m.guardianId) : undefined;
    m.attempts += 1;
    m.status = g?.numberStatus === 'failed' ? 'failed' : 'sent';
    this.put('sms', id, m);
    await this.logAudit('sms.resend', m.to, m.status);
    this.emit();
  }

  async listAttention(minDays = 2): Promise<AttentionRow[]> {
    const today = await this.getToday();
    const vis = this.visibleSectionIds();
    const out: AttentionRow[] = [];
    for (const section of this.s.sections.values()) {
      if (section.archived || (vis && !vis.has(section.id))) continue;
      for (const row of await this.getRoster(section.id, today.date)) {
        if (row.streak.count < minDays) continue;
        const oldest = row.streak.dates[row.streak.dates.length - 1];
        const smsSent = [...this.s.sms.values()].some((m) => m.kind === 'streak' && m.studentId === row.student.id && m.createdAt.slice(0, 10) >= oldest);
        out.push({ student: row.student, guardian: row.guardian, section, streak: row.streak, smsSent });
      }
    }
    return out.sort((a, b) => b.streak.count - a.streak.count || byName(a.student, b.student));
  }

  /* ---------- admin ---------- */

  async listAudit(limit = 300) { await this.ready; return [...this.s.audit.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit); }
  async logAudit(action: string, target: string, detail?: string) {
    const e: AuditEntry = { id: uid('aud'), at: new Date().toISOString(), actor: this.actor(), action, target, detail };
    this.s.audit.set(e.id, e);
    this.put('audit', e.id, e);
  }

  private saveMeta() { this.put('meta', 'school', this.s.meta); }
  private saveCalendar() { this.put('meta', 'calendar', { days: [...this.s.calendar.values()].sort((a, b) => a.date.localeCompare(b.date)) }); }

  async updateSettings(patch: Partial<SchoolSettings>) {
    this.s.meta = { ...this.s.meta, settings: { ...this.settings, ...patch } };
    this.saveMeta();
    await this.logAudit('settings.update', 'settings', Object.keys(patch).join(', '));
    this.emit();
    return this.settings;
  }

  async updateSchoolYear(patch: Partial<Pick<SchoolYear, 'name' | 'start' | 'end'>>) {
    this.s.meta = { ...this.s.meta, schoolYear: { ...this.year, ...patch } };
    this.saveMeta();
    await this.logAudit('schoolyear.update', this.year.name, `${this.year.start} to ${this.year.end}`);
    this.emit();
  }

  async saveCalendarDays(days: CalendarDay[]) {
    days.forEach((d) => this.s.calendar.set(d.date, d));
    this.saveCalendar();
    await this.logAudit('calendar.update', days.length === 1 ? days[0].date : `${days[0]?.date} to ${days[days.length - 1]?.date}`, `${days[0]?.type}: ${days[0]?.label}`);
    this.emit();
  }
  async removeCalendarDays(dates: ISODate[]) {
    dates.forEach((d) => this.s.calendar.delete(d));
    this.saveCalendar();
    await this.logAudit('calendar.clear', dates.length === 1 ? dates[0] : `${dates.length} days`);
    this.emit();
  }
  async resetCalendar(days: CalendarDay[]) {
    this.s.calendar = new Map(days.map((d) => [d.date, d]));
    this.saveCalendar();
    await this.logAudit('calendar.reset', 'DepEd SY 2026-2027 template');
    this.emit();
  }
  async declareSuspension(date: ISODate, label: string) {
    await this.saveCalendarDays([{ date, type: 'suspension', label }]);
  }

  async listTeachers() { await this.ready; return [...this.s.teachers.values()].sort((a, b) => a.name.localeCompare(b.name)); }

  async saveTeacher(input: TeacherInput) {
    const dupe = [...this.s.teachers.values()].find((t) => t.email.toLowerCase() === input.email.toLowerCase() && t.id !== input.id);
    if (dupe) throw new Error('Another teacher already uses this email.');
    const existing = input.id ? this.s.teachers.get(input.id) : undefined;
    if (existing) {
      Object.assign(existing, { name: input.name, mobile: input.mobile });
      this.put('teachers', existing.id, existing);
      await this.logAudit('teacher.update', existing.name);
      this.emit();
      return { teacher: existing };
    }
    const teacher: Teacher = { id: uid('t'), name: input.name, email: input.email, mobile: input.mobile, active: true };
    const { uid: accountUid, tempPassword } = await this.auth.createTeacherAccount(input.email, input.name, teacher.id);
    teacher.uid = accountUid;
    const account: UserAccount = { uid: accountUid, email: input.email, name: input.name, role: 'teacher', teacherId: teacher.id };
    this.s.users.set(accountUid, account);
    this.put('users', accountUid, account);
    this.s.teachers.set(teacher.id, teacher);
    this.put('teachers', teacher.id, teacher);
    await this.logAudit('teacher.create', teacher.name, 'sign-in account created');
    this.emit();
    return { teacher, tempPassword };
  }

  async setTeacherActive(id: string, active: boolean) {
    const t = this.s.teachers.get(id);
    if (!t) return;
    t.active = active;
    this.put('teachers', id, t);
    if (!active) {
      for (const s of this.s.sections.values()) if (s.teacherId === id) { s.teacherId = null; this.put('sections', s.id, s); }
    }
    await this.logAudit(active ? 'teacher.activate' : 'teacher.deactivate', t.name);
    this.emit();
  }

  async saveSection(input: SectionInput) {
    if (input.teacherId) {
      const clash = [...this.s.sections.values()].find((s) => s.teacherId === input.teacherId && s.id !== input.id && !s.archived);
      if (clash) throw new Error(`That teacher already handles ${clash.name}. One teacher, one section.`);
    }
    const existing = input.id ? this.s.sections.get(input.id) : undefined;
    const section: Section = existing
      ? { ...existing, name: input.name, color: input.color, capacity: input.capacity, teacherId: input.teacherId, schedule: input.schedule }
      : { id: uid('sec'), schoolYearId: this.year.id, gradeLevel: 'K', archived: false, ...input };
    this.s.sections.set(section.id, section);
    this.put('sections', section.id, section);
    await this.logAudit(existing ? 'section.update' : 'section.create', section.name);
    this.refreshSession();
    this.emit();
    return section;
  }

  async archiveSection(id: string, archived: boolean) {
    const s = this.s.sections.get(id);
    if (!s) return;
    const enrolled = [...this.s.enrollments.values()].filter((e) => e.sectionId === id && e.status === 'active').length;
    if (archived && enrolled > 0) throw new Error(`Move the ${enrolled} students out of ${s.name} first.`);
    s.archived = archived;
    this.put('sections', id, s);
    await this.logAudit(archived ? 'section.archive' : 'section.restore', s.name);
    this.emit();
  }

  async listStudentRows(): Promise<StudentRow[]> {
    await this.ready;
    return [...this.s.students.values()].filter((s) => !s.id.includes('-old-')).map((student) => {
      const all = [...this.s.enrollments.values()].filter((e) => e.studentId === student.id && e.status !== 'moved');
      const enrollment = all.find((e) => e.status === 'active') ?? all.sort((a, b) => (b.endDate ?? '').localeCompare(a.endDate ?? ''))[0];
      return { student, guardian: this.guardianOf(student.id), enrollment, section: enrollment ? this.s.sections.get(enrollment.sectionId) : undefined };
    }).sort((a, b) => byName(a.student, b.student));
  }

  private newToken() {
    const bytes = new Uint8Array(10);
    crypto.getRandomValues(bytes);
    return `DB-${Array.from(bytes, (b) => '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[b % 32]).join('')}`;
  }

  private placeStudent(studentId: string, sectionId: string | null) {
    const today = this.clock.today();
    const current = this.activeEnrollment(studentId);
    if (current?.sectionId === sectionId) return;
    if (current) {
      // Keep history: close the old enrollment instead of deleting it.
      if (current.startDate >= today) { this.s.enrollments.delete(current.id); this.persistence.remove('enrollments', current.id); }
      else { current.status = 'moved'; current.endDate = today; this.put('enrollments', current.id, current); }
    }
    if (sectionId) {
      const start = today < this.year.start ? this.year.start : today;
      const e: Enrollment = { id: uid('enr'), studentId, sectionId, schoolYearId: this.year.id, status: 'active', startDate: start };
      this.s.enrollments.set(e.id, e);
      this.put('enrollments', e.id, e);
    }
  }

  private upsertStudent(input: StudentInput): { student: Student; sibling: boolean } {
    let student = input.id ? this.s.students.get(input.id) : undefined;
    const fields = { lrn: input.lrn, firstName: input.firstName, middleName: input.middleName, lastName: input.lastName, birthdate: input.birthdate, sex: input.sex };
    if (student) Object.assign(student, fields);
    else {
      student = { id: uid('stu'), ...fields, qrToken: this.newToken(), qrStatus: 'active' };
      this.s.students.set(student.id, student);
    }
    this.put('students', student.id, student);
    let sibling = false;
    let g = [...this.s.guardians.values()].find((x) => x.mobile === input.guardianMobile);
    if (!g) {
      for (const other of this.s.guardians.values()) {
        if (other.studentIds.includes(student.id)) { other.studentIds = other.studentIds.filter((id) => id !== student!.id); this.put('guardians', other.id, other); }
      }
      g = { id: uid('g'), name: input.guardianName, mobile: input.guardianMobile, relationship: input.relationship, smsConsent: input.smsConsent, preferredLanguage: input.preferredLanguage, numberStatus: 'unverified', studentIds: [] };
      this.s.guardians.set(g.id, g);
    }
    if (!g.studentIds.includes(student.id)) { g.studentIds.push(student.id); sibling = g.studentIds.length > 1; }
    Object.assign(g, { name: input.guardianName, relationship: input.relationship, smsConsent: input.smsConsent, preferredLanguage: input.preferredLanguage });
    this.put('guardians', g.id, g);
    if (input.sectionId !== undefined) this.placeStudent(student.id, input.sectionId);
    return { student, sibling };
  }

  async saveStudent(input: StudentInput) {
    await this.ready;
    const { student } = this.upsertStudent(input);
    await this.logAudit(input.id ? 'student.update' : 'student.create', `${student.firstName} ${student.lastName}`);
    this.emit();
    return student;
  }

  async importStudents(inputs: StudentInput[]) {
    await this.ready;
    let linkedSiblings = 0;
    for (const input of inputs) if (this.upsertStudent(input).sibling) linkedSiblings++;
    await this.logAudit('student.import', `${inputs.length} students`, `${linkedSiblings} linked to an existing guardian`);
    this.emit();
    return { created: inputs.length, linkedSiblings };
  }

  async assignStudents(assignments: Record<string, string | null>, label: string) {
    await this.ready;
    this.lastAssign = { label, before: structuredClone([...this.s.enrollments.values()]) };
    Object.entries(assignments).forEach(([studentId, sectionId]) => this.placeStudent(studentId, sectionId));
    await this.logAudit('student.assign', label, `${Object.keys(assignments).length} students`);
    this.emit();
  }

  async undoLastAssign() {
    if (!this.lastAssign) return null;
    const { label, before } = this.lastAssign;
    const keep = new Set(before.map((e) => e.id));
    for (const id of [...this.s.enrollments.keys()]) if (!keep.has(id)) { this.s.enrollments.delete(id); this.persistence.remove('enrollments', id); }
    for (const e of before) { this.s.enrollments.set(e.id, e); this.put('enrollments', e.id, e); }
    this.lastAssign = null;
    await this.logAudit('student.assign_undo', label);
    this.emit();
    return label;
  }

  async setEnrollmentStatus(studentId: string, status: Enrollment['status'], date: ISODate) {
    const e = this.activeEnrollment(studentId);
    if (!e) throw new Error('Student is not in a section.');
    e.status = status;
    e.endDate = date;
    this.put('enrollments', e.id, e);
    const stu = this.s.students.get(studentId);
    await this.logAudit(`student.${status}`, stu ? `${stu.firstName} ${stu.lastName}` : studentId, `effective ${date}`);
    this.emit();
  }

  async reissueQr(studentId: string) {
    const s = this.s.students.get(studentId);
    if (!s) throw new Error('Student not found');
    // Keep a revoked copy of the old code so scanning the lost card shows "card revoked".
    const old: Student = { ...s, id: `${s.id}-old-${Date.now()}`, qrStatus: 'revoked' };
    this.s.students.set(old.id, old);
    this.put('students', old.id, old);
    s.qrToken = this.newToken();
    s.qrStatus = 'active';
    this.put('students', s.id, s);
    await this.logAudit('student.qr_reissue', `${s.firstName} ${s.lastName}`);
    this.emit();
    return s;
  }

  async sendTestSms(to: string) {
    const msg: SmsMessage = {
      id: uid('sms'), to, body: `Doorbell test message from ${this.settings.schoolName}. If you got this, SMS works.`,
      kind: 'test', status: 'sent', createdAt: this.nowIso(), attempts: 1,
    };
    this.s.sms.set(msg.id, msg);
    this.put('sms', msg.id, msg);
    await this.logAudit('sms.test', to);
    this.emit();
    return msg;
  }
}
