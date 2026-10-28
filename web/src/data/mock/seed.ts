// Fake but realistic Filipino demo data. Never put real children's data here.
import { DEPED_SY_2026_2027 } from '../../domain/calendar';
import type {
  CalendarDay, Enrollment, Guardian, SchoolSettings, SchoolYear, Section, SectionSchedule, Student, Teacher,
} from '../../domain/types';

export function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const schedule: SectionSchedule = {
  classDays: [1, 2, 3, 4, 5], startTime: '08:00', scanWindowMins: 30, lateCutoffMins: 15, autoFinalizeMins: 45,
};

export const schoolYear: SchoolYear = {
  id: 'sy-2026', name: 'SY 2026-2027', start: '2026-06-08', end: '2027-04-08', isActive: true,
};

export const teachers: Teacher[] = [
  { id: 't-maria', name: 'Maria Santos', email: 'maria.santos@sunnyside.edu.ph', role: 'teacher', active: true },
  { id: 't-jose', name: 'Jose Ramirez', email: 'jose.ramirez@sunnyside.edu.ph', role: 'teacher', active: true },
  { id: 't-ana', name: 'Ana Villanueva', email: 'ana.villanueva@sunnyside.edu.ph', role: 'teacher', active: true },
  { id: 't-liza', name: 'Liza Aquino', email: 'liza.aquino@sunnyside.edu.ph', role: 'teacher', active: true },
];

export const admin = { userId: 'a-rosario', name: 'Rosario Dizon', role: 'admin' as const, sectionId: null };

export const sections: Section[] = [
  { id: 'sec-apple', schoolYearId: 'sy-2026', name: 'Kindergarten I - Apple', gradeLevel: 'K', color: '#FFD9A8', schedule, capacity: 25, teacherId: 't-maria', archived: false },
  { id: 'sec-mango', schoolYearId: 'sy-2026', name: 'Kindergarten I - Mango', gradeLevel: 'K', color: '#D8F5A2', schedule: { ...schedule, startTime: '08:00' }, capacity: 25, teacherId: 't-jose', archived: false },
  { id: 'sec-banana', schoolYearId: 'sy-2026', name: 'Kindergarten II - Banana', gradeLevel: 'K', color: '#E4D6FA', schedule: { ...schedule, startTime: '13:00' }, capacity: 25, teacherId: 't-ana', archived: false },
];

export const calendar: CalendarDay[] = [
  ...DEPED_SY_2026_2027,
  { date: '2026-07-23', type: 'suspension' as const, label: 'Class suspension: heavy rain (demo entry)' },
].sort((a, b) => a.date.localeCompare(b.date));

export const settings: SchoolSettings = {
  schoolName: 'Sunnyside Kinder',
  contactNumber: '0917 555 0123',
  arrivalSmsEnabled: true,
  streakDays: 3,
  templates: {
    en: {
      arrival: 'Doorbell: {child} arrived at school at {time}. - {school}',
      late: 'Doorbell: {child} arrived late at {time}. - {school}',
      streak: '{school}: {child} has been late or absent for 3 school days in a row. We hope all is well. Please call {contact}.',
    },
    fil: {
      arrival: 'Doorbell: Nakarating na si {child} sa paaralan ng {time}. - {school}',
      late: 'Doorbell: Nahuli si {child} ng dating, {time}. - {school}',
      streak: '{school}: Si {child} ay late o absent na ng 3 araw na magkakasunod. Sana ay maayos siya. Pakitawagan ang {contact}.',
    },
  },
};

const FIRST_M = ['Juan', 'Miguel', 'Gabriel', 'Rafael', 'Joshua', 'Paolo', 'Andres', 'Carlo', 'Enzo', 'Lucas', 'Nathan', 'Ethan', 'Marco', 'Adrian', 'Daniel'];
const FIRST_F = ['Maria', 'Andrea', 'Sofia', 'Bea', 'Althea', 'Princess', 'Angel', 'Jasmine', 'Faith', 'Danica', 'Kyla', 'Bianca', 'Erika', 'Trisha', 'Ysabel'];
const LAST = ['Dela Cruz', 'Santos', 'Reyes', 'Garcia', 'Mendoza', 'Bautista', 'Torres', 'Flores', 'Villanueva', 'Ramos', 'Aquino', 'Castillo', 'Navarro', 'Domingo', 'Lim', 'Tan', 'Cruz', 'Manalo', 'Pascual', 'Soriano'];
const MIDDLE = ['Lopez', 'Rivera', 'Gomez', 'Morales', 'Ocampo', 'Salazar'];

export interface SeedPeople {
  students: Student[];
  guardians: Guardian[];
  enrollments: Enrollment[];
}

export function seedPeople(): SeedPeople {
  const r = rng(2026);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const students: Student[] = [];
  const guardians: Guardian[] = [];
  const enrollments: Enrollment[] = [];
  let n = 0;

  for (const sec of sections) {
    for (let i = 0; i < 20; i++) {
      n++;
      const sex = r() < 0.5 ? 'M' : 'F';
      const lastName = pick(LAST);
      const id = `stu-${String(n).padStart(3, '0')}`;
      const token = Array.from({ length: 12 }, () => '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[Math.floor(r() * 32)]).join('');
      students.push({
        id, firstName: sex === 'M' ? pick(FIRST_M) : pick(FIRST_F), middleName: pick(MIDDLE), lastName,
        birthdate: `2021-0${1 + Math.floor(r() * 9)}-1${Math.floor(r() * 9)}`, sex, qrToken: `SA-${token}`, qrStatus: 'active',
      });
      enrollments.push({ id: `enr-${id}`, studentId: id, sectionId: sec.id, schoolYearId: 'sy-2026', status: 'active', effectiveDate: '2026-06-08' });

      // Every 7th child shares a guardian with the previous child (siblings).
      if (n % 7 === 0 && guardians.length > 0) {
        guardians[guardians.length - 1].studentIds.push(id);
        continue;
      }
      const mobile = `+639${String(170000000 + Math.floor(r() * 9999999)).slice(0, 9)}`;
      guardians.push({
        id: `g-${id}`,
        name: `${r() < 0.6 ? pick(FIRST_F) : pick(FIRST_M)} ${lastName}`,
        mobile,
        relationship: r() < 0.6 ? 'Mother' : r() < 0.8 ? 'Father' : 'Grandmother',
        smsConsent: r() > 0.08,
        preferredLanguage: r() < 0.35 ? 'fil' : 'en',
        numberStatus: n === 9 ? 'failed' : r() < 0.85 ? 'verified' : 'unverified',
        studentIds: [id],
      });
    }
  }
  // Newly enrolled children not yet placed in a section (for the auto-assign demo).
  for (let i = 0; i < 9; i++) {
    n++;
    const sex = r() < 0.5 ? 'M' : 'F';
    const lastName = pick(LAST);
    const id = `stu-${String(n).padStart(3, '0')}`;
    students.push({
      id, firstName: sex === 'M' ? pick(FIRST_M) : pick(FIRST_F), middleName: pick(MIDDLE), lastName,
      birthdate: `2021-0${1 + Math.floor(r() * 9)}-2${Math.floor(r() * 8)}`, sex, qrToken: `SA-NEW${String(n).padStart(6, '0')}`, qrStatus: 'active',
    });
    guardians.push({
      id: `g-${id}`, name: `${pick(FIRST_F)} ${lastName}`, mobile: `+639${String(180000000 + Math.floor(r() * 9999999)).slice(0, 9)}`,
      relationship: 'Mother', smsConsent: true, preferredLanguage: 'en', numberStatus: 'unverified', studentIds: [id],
    });
  }
  return { students, guardians, enrollments };
}
