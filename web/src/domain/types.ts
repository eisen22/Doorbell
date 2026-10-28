// Shared data model. The web app, the cloud seed script and the scanner all use these types.
// Dates are school-local strings: ISODate = 'YYYY-MM-DD' (Asia/Manila), times = 'HH:mm'.

export type ISODate = string;
export type Role = 'admin' | 'teacher';
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused';
export type Lang = 'en' | 'fil';

export interface SectionSchedule {
  classDays: number[]; // 1 = Monday ... 7 = Sunday
  startTime: string; // 'HH:mm' class starts
  endTime: string; // 'HH:mm' end of classes (dismissal)
  scanWindowMins: number; // scanning opens this many minutes before start
  lateCutoffMins: number; // scans after start + this are late
  autoFinalizeMins: number; // day auto-finalizes at start + this
}

export interface SchoolYear {
  id: string;
  name: string; // 'SY 2026-2027'
  start: ISODate; // first day of classes
  end: ISODate; // last day of classes
  isActive: boolean;
}

export interface Section {
  id: string;
  schoolYearId: string;
  name: string; // 'Kindergarten I - Apple'
  gradeLevel: 'K' | '1' | '2' | '3' | '4' | '5' | '6';
  color: string; // hex
  schedule: SectionSchedule;
  capacity: number;
  teacherId: string | null;
  archived: boolean;
}

export interface Teacher {
  id: string;
  name: string;
  email: string;
  active?: boolean;
  mobile?: string;
  uid?: string; // sign-in account id
}

/** Sign-in account (Firebase Auth user + its role). */
export interface UserAccount {
  uid: string;
  email: string;
  name: string;
  role: Role;
  teacherId?: string;
}

export interface Student {
  id: string;
  lrn?: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  birthdate: ISODate;
  sex: 'M' | 'F';
  qrToken: string; // random, never personal data
  qrStatus: 'active' | 'revoked';
}

export interface Guardian {
  id: string;
  name: string;
  mobile: string; // normalized +639XXXXXXXXX
  relationship: string;
  smsConsent: boolean;
  preferredLanguage: Lang;
  numberStatus: 'unverified' | 'verified' | 'failed';
  studentIds: string[];
}

export interface Enrollment {
  id: string;
  studentId: string;
  sectionId: string;
  schoolYearId: string;
  status: 'active' | 'moved' | 'transferred' | 'dropped'; // moved = changed section
  startDate: ISODate; // first day in this section
  endDate?: ISODate; // last day + 1 when transferred, dropped or moved
}

export interface AttendanceRecord {
  date: ISODate;
  studentId: string;
  sectionId: string;
  status: AttendanceStatus;
  scannedAt?: string; // 'HH:mm' when scanned
  source: 'scanner' | 'manual' | 'auto';
  excusedNote?: string;
  editedReason?: string;
}

/** One document per section per day. */
export interface AttendanceDay {
  id: string; // `${sectionId}_${date}`
  sectionId: string;
  date: ISODate;
  records: Record<string, AttendanceRecord>; // by studentId
}

export interface DayConfirmation {
  id: string; // `${sectionId}_${date}`
  sectionId: string;
  date: ISODate;
  confirmedBy: string;
  confirmedAt: string; // ISO timestamp
  auto: boolean;
}

/**
 * Calendar entries override the normal weekday rule.
 * No class: holiday, suspension, break.  Class day: halfday, event, exam, makeup.
 */
export type CalendarDayType = 'holiday' | 'suspension' | 'break' | 'halfday' | 'event' | 'exam' | 'makeup';

export interface CalendarDay {
  date: ISODate;
  type: CalendarDayType;
  label: string;
  scope?: 'national' | 'local'; // for holidays
}

/** A run of consecutive late/absent school days. */
export interface StreakInfo {
  count: number;
  absent: number;
  late: number;
  dates: ISODate[]; // newest first
}

export type SmsKind = 'arrival' | 'late' | 'streak' | 'welcome' | 'test';

export interface SmsMessage {
  id: string;
  studentId?: string;
  guardianId?: string;
  sectionId?: string;
  to: string;
  body: string;
  kind: SmsKind;
  status: 'pending' | 'sent' | 'failed';
  createdAt: string; // ISO timestamp
  attempts: number;
}

export interface AppNotification {
  id: string;
  kind: 'streak' | 'sms_failed';
  studentId?: string;
  sectionId?: string;
  streak?: StreakInfo;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

export interface SmsTemplates {
  arrival: string;
  late: string;
  streak: string; // {streak} becomes e.g. "absent for 3 school days in a row"
}

export interface SchoolSettings {
  schoolName: string;
  contactNumber: string;
  arrivalSmsEnabled: boolean;
  streakDays: number;
  templates: Record<Lang, SmsTemplates>;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  detail?: string;
}

/** A student as shown on a teacher's daily list. */
export interface RosterRow {
  student: Student;
  guardian?: Guardian;
  record?: AttendanceRecord;
  streak: StreakInfo;
}
