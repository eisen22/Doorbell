// Shared data model. The web app, the worker and the scanner all use these types.
// Dates are school-local strings: ISODate = 'YYYY-MM-DD' (Asia/Manila), times = 'HH:mm'.

export type ISODate = string;
export type Role = 'admin' | 'teacher' | 'substitute' | 'staff';
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused';
export type Lang = 'en' | 'fil';

export interface SectionSchedule {
  classDays: number[]; // 1 = Monday ... 7 = Sunday
  startTime: string; // 'HH:mm'
  scanWindowMins: number; // scanning opens this many minutes before start
  lateCutoffMins: number; // scans after start + this are late
  autoFinalizeMins: number; // day auto-finalizes at start + this
}

export interface SchoolYear {
  id: string;
  name: string; // 'SY 2026-2027'
  start: ISODate;
  end: ISODate;
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
  role: Role;
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
  status: 'active' | 'transferred' | 'dropped';
  effectiveDate: ISODate; // enrolled on, or left on
}

export interface AttendanceRecord {
  id: string;
  date: ISODate;
  studentId: string;
  sectionId: string;
  status: AttendanceStatus;
  scannedAt?: string; // 'HH:mm' server time, when scanned
  source: 'scanner' | 'manual' | 'auto';
  excusedNote?: string;
  editedReason?: string;
}

export interface DayConfirmation {
  sectionId: string;
  date: ISODate;
  confirmedBy: string;
  confirmedAt: string; // ISO timestamp
  auto: boolean;
}

export interface CalendarDay {
  date: ISODate;
  type: 'holiday' | 'suspension' | 'makeup';
  label: string;
}

export type SmsKind = 'arrival' | 'late' | 'streak' | 'welcome' | 'test';

export interface SmsMessage {
  id: string;
  studentId?: string;
  guardianId?: string;
  to: string;
  body: string;
  kind: SmsKind;
  status: 'pending' | 'sent' | 'failed';
  createdAt: string; // ISO timestamp
  attempts: number;
}

export interface AppNotification {
  id: string;
  kind: 'streak' | 'sms_failed' | 'number_update';
  studentId?: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

export interface SmsTemplates {
  arrival: string;
  late: string;
  streak: string;
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
  streak: number;
}
