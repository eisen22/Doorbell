// Demo data: fake but realistic Filipino names. Never put real children's data here.
// Used by demo mode in the browser AND by the cloud seed script (cloud/seed.ts).
import { DEPED_SY_2026_2027 } from '../../domain/calendar';
import { addDays, decideScan, fromMinutes, isSchoolDay, toMinutes } from '../../domain/rules';
import type {
  AttendanceStatus, Enrollment, Guardian, ISODate, SchoolSettings, SchoolYear, Section, SectionSchedule, Student, Teacher, UserAccount,
} from '../../domain/types';
import { Engine, emptyState, noopPersistence, type AuthAdapter, type Clock, type EngineState } from '../engine';

export function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEMO_PASSWORD = 'Doorbell2026!';

const schedule: SectionSchedule = {
  classDays: [1, 2, 3, 4, 5], startTime: '08:00', endTime: '11:30', scanWindowMins: 30, lateCutoffMins: 15, autoFinalizeMins: 45,
};

export const schoolYear: SchoolYear = { id: 'sy-2026', name: 'SY 2026-2027', start: '2026-06-08', end: '2027-04-08', isActive: true };

export const settings: SchoolSettings = {
  schoolName: 'Sunnyside Kinder',
  contactNumber: '0917 555 0123',
  arrivalSmsEnabled: true,
  streakDays: 3,
  templates: {
    en: {
      arrival: 'Doorbell: {child} arrived at school at {time}. - {school}',
      late: 'Doorbell: {child} arrived late at {time}. - {school}',
      streak: '{school}: {child} has been {streak}. We hope all is well. Please call {contact}.',
    },
    fil: {
      arrival: 'Doorbell: Nakarating na si {child} sa paaralan ng {time}. - {school}',
      late: 'Doorbell: Nahuli si {child} ng dating, {time}. - {school}',
      streak: '{school}: Si {child} ay {streak}. Sana ay maayos siya. Pakitawagan ang {contact}.',
    },
  },
};

export const teachers: Teacher[] = [
  { id: 't-maria', name: 'Maria Santos', email: 'maria.santos@sunnyside.edu.ph', active: true, uid: 'u-maria' },
  { id: 't-jose', name: 'Jose Ramirez', email: 'jose.ramirez@sunnyside.edu.ph', active: true, uid: 'u-jose' },
  { id: 't-ana', name: 'Ana Villanueva', email: 'ana.villanueva@sunnyside.edu.ph', active: true, uid: 'u-ana' },
  { id: 't-liza', name: 'Liza Aquino', email: 'liza.aquino@sunnyside.edu.ph', active: true, uid: 'u-liza' },
];

export const users: UserAccount[] = [
  { uid: 'u-admin', email: 'admin@sunnyside.edu.ph', name: 'Rosario Dizon', role: 'admin' },
  ...teachers.map((t): UserAccount => ({ uid: t.uid!, email: t.email, name: t.name, role: 'teacher', teacherId: t.id })),
];

export const sections: Section[] = [
  { id: 'sec-apple', schoolYearId: 'sy-2026', name: 'Kindergarten I - Apple', gradeLevel: 'K', color: '#FFD9A8', schedule, capacity: 25, teacherId: 't-maria', archived: false },
  { id: 'sec-mango', schoolYearId: 'sy-2026', name: 'Kindergarten I - Mango', gradeLevel: 'K', color: '#D8F5A2', schedule, capacity: 25, teacherId: 't-jose', archived: false },
  { id: 'sec-banana', schoolYearId: 'sy-2026', name: 'Kindergarten II - Banana', gradeLevel: 'K', color: '#E4D6FA', schedule: { ...schedule, startTime: '12:30', endTime: '16:00' }, capacity: 25, teacherId: 't-ana', archived: false },
  // Maria handles two classes: Apple in the morning and Cherry in the afternoon.
  { id: 'sec-cherry', schoolYearId: 'sy-2026', name: 'Kindergarten II - Cherry', gradeLevel: 'K', color: '#FBD3E0', schedule: { ...schedule, startTime: '12:30', endTime: '16:00' }, capacity: 25, teacherId: 't-maria', archived: false },
];

const FIRST_M = ['Juan', 'Miguel', 'Gabriel', 'Rafael', 'Joshua', 'Paolo', 'Andres', 'Carlo', 'Enzo', 'Lucas', 'Nathan', 'Ethan', 'Marco', 'Adrian', 'Daniel'];
const FIRST_F = ['Maria', 'Andrea', 'Sofia', 'Bea', 'Althea', 'Princess', 'Angel', 'Jasmine', 'Faith', 'Danica', 'Kyla', 'Bianca', 'Erika', 'Trisha', 'Ysabel'];
const LAST = ['Dela Cruz', 'Santos', 'Reyes', 'Garcia', 'Mendoza', 'Bautista', 'Torres', 'Flores', 'Villanueva', 'Ramos', 'Aquino', 'Castillo', 'Navarro', 'Domingo', 'Lim', 'Tan', 'Cruz', 'Manalo', 'Pascual', 'Soriano'];
const MIDDLE = ['Lopez', 'Rivera', 'Gomez', 'Morales', 'Ocampo', 'Salazar'];

function people() {
  const r = rng(2026);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const students: Student[] = [];
  const guardians: Guardian[] = [];
  const enrollments: Enrollment[] = [];
  const usedNames = new Set<string>();
  let n = 0;
  const newStudent = (prefix: string): Student => {
    n++;
    let first = ''; let last = ''; let sex: 'M' | 'F' = 'M';
    do { sex = r() < 0.5 ? 'M' : 'F'; first = sex === 'M' ? pick(FIRST_M) : pick(FIRST_F); last = pick(LAST); } while (usedNames.has(`${first} ${last}`));
    usedNames.add(`${first} ${last}`);
    const token = Array.from({ length: 10 }, () => '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[Math.floor(r() * 32)]).join('');
    return {
      id: `stu-${String(n).padStart(3, '0')}`, firstName: first, middleName: pick(MIDDLE), lastName: last,
      birthdate: `2021-0${1 + Math.floor(r() * 9)}-${String(10 + Math.floor(r() * 18))}`, sex, qrToken: `${prefix}${token}`, qrStatus: 'active',
    };
  };
  for (const sec of sections) {
    for (let i = 0; i < 20; i++) {
      const s = newStudent('DB-');
      students.push(s);
      enrollments.push({ id: `enr-${s.id}`, studentId: s.id, sectionId: sec.id, schoolYearId: 'sy-2026', status: 'active', startDate: schoolYear.start });
      if (n % 7 === 0 && guardians.length) { guardians[guardians.length - 1].studentIds.push(s.id); continue; } // siblings
      guardians.push({
        id: `g-${s.id}`, name: `${r() < 0.6 ? pick(FIRST_F) : pick(FIRST_M)} ${s.lastName}`,
        mobile: `+639${String(170000000 + Math.floor(r() * 9999999)).slice(0, 9)}`,
        relationship: r() < 0.6 ? 'Mother' : r() < 0.8 ? 'Father' : 'Grandmother',
        smsConsent: r() > 0.08, preferredLanguage: r() < 0.35 ? 'fil' : 'en',
        numberStatus: n === 9 ? 'failed' : r() < 0.85 ? 'verified' : 'unverified', studentIds: [s.id],
      });
    }
  }
  // Newly enrolled children not yet placed in a section (for the auto-assign demo).
  for (let i = 0; i < 9; i++) {
    const s = newStudent('DB-N');
    students.push(s);
    guardians.push({ id: `g-${s.id}`, name: `${pick(FIRST_F)} ${s.lastName}`, mobile: `+639${String(180000000 + Math.floor(r() * 9999999)).slice(0, 9)}`, relationship: 'Mother', smsConsent: true, preferredLanguage: 'en', numberStatus: 'unverified', studentIds: [s.id] });
  }
  return { students, guardians, enrollments };
}

/** Demo sign-in: the accounts above, all with DEMO_PASSWORD. */
export function demoAuth(engine: () => Engine): AuthAdapter {
  const passwords = new Map(users.map((u) => [u.email.toLowerCase(), DEMO_PASSWORD]));
  return {
    async signIn(email, password) {
      const account = [...engine().s.users.values()].find((u) => u.email.toLowerCase() === email.toLowerCase());
      if (!account || passwords.get(email.toLowerCase()) !== password) throw new Error('Wrong email or password.');
      const t = account.teacherId ? engine().s.teachers.get(account.teacherId) : undefined;
      if (t && t.active === false) throw new Error('This account is deactivated. Ask the school admin.');
      return account;
    },
    async signOut() {},
    async sendPasswordReset() { throw new Error('Password reset emails work once the cloud is connected.'); },
    async createTeacherAccount(email) {
      const temp = `Temp-${Math.random().toString(36).slice(2, 8)}`;
      passwords.set(email.toLowerCase(), temp);
      return { uid: `u-${Math.random().toString(36).slice(2, 10)}`, tempPassword: temp };
    },
    demoAccounts: () => [
      { email: 'admin@sunnyside.edu.ph', password: DEMO_PASSWORD, label: 'School admin (Rosario Dizon)' },
      { email: 'maria.santos@sunnyside.edu.ph', password: DEMO_PASSWORD, label: 'Teacher, Apple (AM) and Cherry (PM)' },
      { email: 'jose.ramirez@sunnyside.edu.ph', password: DEMO_PASSWORD, label: 'Teacher, Kinder I - Mango' },
    ],
  };
}

/**
 * Builds a whole school year of history from the first day of classes (June 8, 2026) up to today:
 * attendance, confirmations, streak alerts and SMS, using the real engine rules.
 */
export function buildDemoState(today: ISODate, clock: Clock): EngineState {
  const state = emptyState({ settings: structuredClone(settings), schoolYear: { ...schoolYear } }, DEPED_SY_2026_2027);
  state.calendar.set('2026-07-23', { date: '2026-07-23', type: 'suspension', label: 'Class suspension: heavy rain (example)' });
  users.forEach((u) => state.users.set(u.uid, { ...u }));
  teachers.forEach((t) => state.teachers.set(t.id, { ...t }));
  sections.forEach((s) => state.sections.set(s.id, structuredClone(s)));
  const p = people();
  p.students.forEach((s) => state.students.set(s.id, s));
  p.guardians.forEach((g) => state.guardians.set(g.id, g));
  p.enrollments.forEach((e) => state.enrollments.set(e.id, e));

  const auth: AuthAdapter = { signIn: async () => { throw new Error(); }, signOut: async () => {}, sendPasswordReset: async () => {}, createTeacherAccount: async () => ({ uid: '', tempPassword: '' }), demoAccounts: () => [] };
  const engine = new Engine('demo', state, noopPersistence, auth, clock);
  const r = rng(77);
  const yesterday = addDays(today, -1);

  for (const sec of state.sections.values()) {
    const days: ISODate[] = [];
    for (let d = schoolYear.start; d <= yesterday && d <= schoolYear.end; d = addDays(d, 1)) if (isSchoolDay(d, sec.schedule, state.calendar)) days.push(d);
    const roster = engine.rosterOn(sec.id, schoolYear.start);
    const last = days.length - 1;
    days.forEach((date, idx) => {
      const id = `${sec.id}_${date}`;
      const day = { id, sectionId: sec.id, date, records: {} as Record<string, import('../../domain/types').AttendanceRecord> };
      roster.forEach((stu, i) => {
        const x = r();
        let status: AttendanceStatus = x < 0.86 ? 'present' : x < 0.93 ? 'late' : x < 0.97 ? 'absent' : 'excused';
        // Stories for the demo (Apple section), ending yesterday:
        if (sec.id === 'sec-apple') {
          const fromEnd = last - idx; // 0 = yesterday
          if (fromEnd <= 3) {
            if (i === 2) status = fromEnd === 3 ? 'present' : 'absent'; // absent 3 days in a row
            if (i === 5) status = fromEnd === 3 ? 'present' : 'late'; // late 3 days in a row
            if (i === 8) status = fromEnd === 3 ? 'present' : fromEnd === 1 ? 'late' : 'absent'; // absent 2 + late 1
            if (i === 11) status = fromEnd >= 2 ? 'present' : 'absent'; // absent 2 days (watch list)
          }
        }
        const start = toMinutes(sec.schedule.startTime);
        const time = status === 'present' ? fromMinutes(start - 28 + Math.floor(r() * 40))
          : status === 'late' ? fromMinutes(start + sec.schedule.lateCutoffMins + 1 + Math.floor(r() * 30)) : undefined;
        if (status === 'absent') return; // finalize marks the absence
        day.records[stu.id] = { date, studentId: stu.id, sectionId: sec.id, status, scannedAt: time, source: time ? 'scanner' : 'manual', excusedNote: status === 'excused' ? 'Parent called: check-up' : undefined };
      });
      state.attendance.set(id, day);
      const conf = `${date}T${fromMinutes(toMinutes(sec.schedule.startTime) + 20 + Math.floor(r() * 25))}:00+08:00`;
      engine.finalize(sec.id, date, r() < 0.8 ? (state.teachers.get(sec.teacherId ?? '')?.name ?? 'Auto-confirm') : 'Auto-confirm', false, conf);
    });

    // Today: about 60% of each morning class has arrived (only if today is a class day).
    if (today <= schoolYear.end && isSchoolDay(today, sec.schedule, state.calendar) && toMinutes(sec.schedule.startTime) < toMinutes('12:00')) {
      let mins = toMinutes(sec.schedule.startTime) - 29;
      const id = `${sec.id}_${today}`;
      const day = { id, sectionId: sec.id, date: today, records: {} as Record<string, import('../../domain/types').AttendanceRecord> };
      roster.forEach((stu, i) => {
        if (i === 2 || i === 8 || i % 5 === 4 || i >= 16) return;
        mins += 1 + Math.floor(r() * 3);
        const time = fromMinutes(mins + (i === 5 ? 45 : 0));
        const decision = decideScan({ time, schedule: sec.schedule });
        if (decision.kind !== 'record') return;
        day.records[stu.id] = { date: today, studentId: stu.id, sectionId: sec.id, status: decision.status, scannedAt: time, source: 'scanner' };
      });
      state.attendance.set(id, day);
    }
  }

  // Arrival texts for today, as the scanner would have sent them.
  for (const day of state.attendance.values()) {
    if (day.date !== today) continue;
    for (const rec of Object.values(day.records)) {
      const stu = state.students.get(rec.studentId)!;
      engine.queueSms(stu, rec.status === 'late' ? 'late' : 'arrival', { time: rec.scannedAt, date: today, sectionId: day.sectionId, createdAt: `${today}T${rec.scannedAt}:00+08:00` });
    }
  }
  // Older alerts are already read.
  for (const n of state.notifications.values()) if (n.createdAt < addDays(today, -1)) n.read = true;
  return state;
}
