// THE CONTRACT. The UI only talks to this interface.
// Adapters: mock (now) and firestore (Cloud step). Change this file only on purpose.
import type {
  AppNotification, AttendanceRecord, AttendanceStatus, AuditEntry, CalendarDay, DayConfirmation,
  ISODate, Role, RosterRow, SchoolSettings, SchoolYear, Section, SmsMessage, Student,
} from '../domain/types';

export interface Session {
  userId: string;
  name: string;
  role: Role;
  sectionId: string | null; // teacher's own section
}

export type ScanResult =
  | { kind: 'recorded'; student: Student; status: 'present' | 'late'; time: string }
  | { kind: 'duplicate'; student: Student; firstScanAt: string }
  | { kind: 'ignore' }
  | { kind: 'unknown' }
  | { kind: 'revoked'; student: Student }
  | { kind: 'wrong_section'; student: Student }
  | { kind: 'not_school_day' }
  | { kind: 'locked' };

export interface SetStatusInput {
  sectionId: string;
  date: ISODate;
  studentId: string;
  status: AttendanceStatus;
  note?: string; // excused note
  reason?: string; // required after the day is confirmed
}

export interface Repository {
  getSession(): Promise<Session>;
  getToday(): Promise<{ date: ISODate; time: string; simulated?: boolean }>;
  getSettings(): Promise<SchoolSettings>;
  updateSettings(patch: Partial<SchoolSettings>): Promise<SchoolSettings>;
  getSchoolYear(): Promise<SchoolYear>;
  listSections(): Promise<Section[]>;
  getSection(id: string): Promise<Section>;
  getCalendar(): Promise<CalendarDay[]>;

  getRoster(sectionId: string, date: ISODate): Promise<RosterRow[]>;
  getAttendanceRange(sectionId: string, from: ISODate, to: ISODate): Promise<AttendanceRecord[]>;
  getConfirmation(sectionId: string, date: ISODate): Promise<DayConfirmation | null>;

  recordScan(input: { qrToken: string; sectionId?: string }): Promise<ScanResult>;
  setStatus(input: SetStatusInput): Promise<void>;
  confirmDay(sectionId: string, date: ISODate): Promise<DayConfirmation>;

  listNotifications(): Promise<AppNotification[]>;
  markNotificationsRead(): Promise<void>;
  listSms(limit?: number): Promise<SmsMessage[]>;
  resendSms(id: string): Promise<void>;
  listAudit(limit?: number): Promise<AuditEntry[]>;
  logAudit(action: string, target: string, detail?: string): Promise<void>;

  /** Demo helper: scan a random student who has not arrived yet. */
  simulateScan(sectionId: string): Promise<ScanResult>;

  /** Called whenever data changes, so screens refresh live. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
}
