// THE CONTRACT. Every page talks to this interface only.
// One implementation (Engine) runs in two modes: demo (in memory) and cloud (Firebase).
import type {
  AppNotification, AttendanceRecord, AttendanceStatus, AuditEntry, CalendarDay, DayConfirmation, Enrollment,
  Guardian, ISODate, Lang, Role, RosterRow, SchoolSettings, SchoolYear, Section, SmsMessage, StreakInfo, Student, Teacher,
} from '../domain/types';

export interface Session {
  uid: string;
  name: string;
  email: string;
  role: Role;
  teacherId?: string;
  sectionIds: string[]; // every class this teacher handles, earliest start first
  sectionId: string | null; // the class in session now (or next/last today); null when none assigned
}

export interface DemoAccount { email: string; password: string; label: string }

export type ScanResult =
  | { kind: 'recorded'; student: Student; status: 'present' | 'late'; time: string }
  | { kind: 'duplicate'; student: Student; firstScanAt: string }
  | { kind: 'ignore' }
  | { kind: 'unknown' }
  | { kind: 'revoked'; student: Student }
  | { kind: 'wrong_section'; student: Student }
  | { kind: 'not_school_day' };

export interface TeacherInput {
  id?: string;
  name: string;
  email: string;
  mobile?: string;
}

export interface SectionInput {
  id?: string;
  name: string;
  color: string;
  capacity: number;
  teacherId: string | null;
  schedule: Section['schedule'];
}

export interface StudentInput {
  id?: string;
  lrn?: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  birthdate: ISODate;
  sex: 'M' | 'F';
  guardianName: string;
  guardianMobile: string; // normalized +639XXXXXXXXX
  relationship: string;
  smsConsent: boolean;
  preferredLanguage: Lang;
  sectionId?: string | null;
}

export interface StudentRow {
  student: Student;
  guardian?: Guardian;
  enrollment?: Enrollment;
  section?: Section;
}

export interface AttentionRow {
  student: Student;
  guardian?: Guardian;
  section: Section;
  streak: StreakInfo;
  smsSent: boolean;
}

export interface SetStatusInput {
  sectionId: string;
  date: ISODate;
  studentId: string;
  status: AttendanceStatus;
  note?: string; // excused note
  reason?: string; // required after the day is confirmed
}

export interface TodayInfo {
  date: ISODate; // school day shown on dashboards (today, or the last school day)
  actualDate: ISODate; // today's real date in Manila
  time: string; // 'HH:mm'
  simulated: boolean; // demo clock in use
  isSchoolDay: boolean; // whether actualDate is a class day
}

export interface Repository {
  readonly mode: 'demo' | 'cloud';

  /* auth */
  getSession(): Promise<Session | null>;
  signIn(email: string, password: string): Promise<Session>;
  signOut(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  demoAccounts(): DemoAccount[];

  /* shared */
  getToday(): Promise<TodayInfo>;
  getSettings(): Promise<SchoolSettings>;
  updateSettings(patch: Partial<SchoolSettings>): Promise<SchoolSettings>;
  getSchoolYear(): Promise<SchoolYear>;
  updateSchoolYear(patch: Partial<Pick<SchoolYear, 'name' | 'start' | 'end'>>): Promise<void>;
  listSections(): Promise<Section[]>;
  getSection(id: string): Promise<Section>;
  getCalendar(): Promise<CalendarDay[]>;

  /* teacher */
  getRoster(sectionId: string, date: ISODate): Promise<RosterRow[]>;
  getAttendanceRange(sectionId: string, from: ISODate, to: ISODate): Promise<AttendanceRecord[]>;
  getConfirmation(sectionId: string, date: ISODate): Promise<DayConfirmation | null>;
  recordScan(input: { qrToken: string; sectionId?: string }): Promise<ScanResult>;
  setStatus(input: SetStatusInput): Promise<void>;
  confirmDay(sectionId: string, date: ISODate): Promise<DayConfirmation>;
  simulateScan(sectionId: string): Promise<ScanResult>;

  listNotifications(): Promise<AppNotification[]>;
  markNotificationsRead(ids?: string[]): Promise<void>;
  listSms(limit?: number): Promise<SmsMessage[]>;
  resendSms(id: string): Promise<void>;
  listAttention(minDays?: number): Promise<AttentionRow[]>;

  /* admin */
  listAudit(limit?: number): Promise<AuditEntry[]>;
  logAudit(action: string, target: string, detail?: string): Promise<void>;
  saveCalendarDays(days: CalendarDay[]): Promise<void>;
  removeCalendarDays(dates: ISODate[]): Promise<void>;
  resetCalendar(days: CalendarDay[]): Promise<void>;
  declareSuspension(date: ISODate, label: string): Promise<void>;
  listTeachers(): Promise<Teacher[]>;
  saveTeacher(input: TeacherInput): Promise<{ teacher: Teacher; tempPassword?: string }>;
  setTeacherActive(id: string, active: boolean): Promise<void>;
  saveSection(input: SectionInput): Promise<Section>;
  archiveSection(id: string, archived: boolean): Promise<void>;
  listStudentRows(): Promise<StudentRow[]>;
  saveStudent(input: StudentInput): Promise<Student>;
  importStudents(inputs: StudentInput[]): Promise<{ created: number; linkedSiblings: number }>;
  assignStudents(assignments: Record<string, string | null>, label: string): Promise<void>;
  undoLastAssign(): Promise<string | null>;
  setEnrollmentStatus(studentId: string, status: Enrollment['status'], date: ISODate): Promise<void>;
  reissueQr(studentId: string): Promise<Student>;
  sendTestSms(to: string): Promise<SmsMessage>;

  /** Called whenever data changes, so screens refresh live. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
}
