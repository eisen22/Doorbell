// Excel export with ExcelJS (loaded only when needed, to keep the app fast).
import type { Workbook } from 'exceljs';
import { addDays, attendanceRate, emptyCounts, isSchoolDay, to12h } from '../domain/rules';
import type { AttendanceRecord, CalendarDay, ISODate, SchoolSettings, Section, Student } from '../domain/types';

const CODE = { present: 'P', late: 'L', absent: 'A', excused: 'E' } as const;
const FILL = { P: 'FFE3F6EA', L: 'FFFFF1D6', A: 'FFFDECEA', E: 'FFECEEFD' } as const;

export interface ExportInput {
  settings: SchoolSettings;
  schoolYearName: string;
  section: Section;
  teacherName: string;
  students: Student[];
  records: AttendanceRecord[];
  calendar: CalendarDay[];
  from: ISODate;
  to: ISODate;
  sheets: { grid: boolean; summary: boolean; raw: boolean };
}

export async function exportAttendanceXlsx(input: ExportInput): Promise<string> {
  const mod = (await import('exceljs')) as unknown as { Workbook?: new () => Workbook; default?: { Workbook: new () => Workbook } };
  const WorkbookCtor = mod.Workbook ?? mod.default!.Workbook;
  const wb = new WorkbookCtor();
  wb.creator = 'Safe Arrival';
  wb.created = new Date();

  const days: ISODate[] = [];
  for (let d = input.from; d <= input.to; d = addDays(d, 1)) {
    if (isSchoolDay(d, input.section.schedule, input.calendar)) days.push(d);
  }
  const byKey = new Map(input.records.map((r) => [`${r.studentId}|${r.date}`, r]));
  const name = (s: Student) => `${s.lastName}, ${s.firstName}`;

  const header = (ws: ReturnType<Workbook['addWorksheet']>, title: string, cols: number) => {
    ws.addRow([input.settings.schoolName]).font = { bold: true, size: 14 };
    ws.addRow([`${title}  |  ${input.schoolYearName}  |  ${input.section.name}  |  Teacher: ${input.teacherName}`]);
    ws.addRow([`Period: ${input.from} to ${input.to}  |  Generated: ${new Date().toLocaleString('en-PH')}`]).font = { italic: true, color: { argb: 'FF6B7078' } };
    ws.addRow([]);
    ws.mergeCells(1, 1, 1, Math.max(cols, 4));
  };

  if (input.sheets.grid) {
    const ws = wb.addWorksheet('Daily Grid');
    const cols = 2 + days.length + 4;
    header(ws, 'Daily Attendance Grid', cols);
    const head = ws.addRow(['#', 'Student', ...days.map((d) => d.slice(5)), 'P', 'L', 'A', 'E']);
    head.font = { bold: true };
    head.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD8F5A2' } }; c.alignment = { horizontal: 'center' }; });
    input.students.forEach((s, i) => {
      const counts = emptyCounts();
      const codes = days.map((d) => {
        const r = byKey.get(`${s.id}|${d}`);
        if (!r) return '';
        counts[r.status]++;
        return CODE[r.status];
      });
      const row = ws.addRow([i + 1, name(s), ...codes, counts.present, counts.late, counts.absent, counts.excused]);
      codes.forEach((code, j) => {
        if (!code) return;
        const cell = row.getCell(3 + j);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[code] } };
        cell.alignment = { horizontal: 'center' };
      });
    });
    ws.getColumn(1).width = 5;
    ws.getColumn(2).width = 28;
    for (let c = 3; c <= cols; c++) ws.getColumn(c).width = 6.5;
    ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 5 }];
    ws.addRow([]);
    ws.addRow(['', 'Legend: P = Present, L = Late, A = Absent, E = Excused']).font = { italic: true };
  }

  if (input.sheets.summary) {
    const ws = wb.addWorksheet('Summary');
    header(ws, 'Attendance Summary', 8);
    ws.addRow(['#', 'Student', 'Present', 'Late', 'Absent', 'Excused', 'School days', 'Attendance rate']).font = { bold: true };
    input.students.forEach((s, i) => {
      const counts = emptyCounts();
      days.forEach((d) => { const r = byKey.get(`${s.id}|${d}`); if (r) counts[r.status]++; });
      ws.addRow([i + 1, name(s), counts.present, counts.late, counts.absent, counts.excused, days.length, attendanceRate(counts) / 100]);
    });
    ws.getColumn(8).numFmt = '0%';
    [5, 28, 10, 8, 9, 9, 12, 16].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    ws.views = [{ state: 'frozen', ySplit: 5 }];
  }

  if (input.sheets.raw) {
    const ws = wb.addWorksheet('Raw Log');
    header(ws, 'Raw Attendance Log', 7);
    ws.addRow(['Date', 'Student', 'Status', 'Time scanned', 'Source', 'Note', 'Edit reason']).font = { bold: true };
    const studentById = new Map(input.students.map((s) => [s.id, s]));
    [...input.records]
      .filter((r) => r.date >= input.from && r.date <= input.to && studentById.has(r.studentId))
      .sort((a, b) => a.date.localeCompare(b.date) || (a.scannedAt ?? '99').localeCompare(b.scannedAt ?? '99'))
      .forEach((r) => {
        ws.addRow([r.date, name(studentById.get(r.studentId)!), r.status, r.scannedAt ? to12h(r.scannedAt) : '', r.source, r.excusedNote ?? '', r.editedReason ?? '']);
      });
    [12, 28, 10, 13, 10, 32, 32].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    ws.views = [{ state: 'frozen', ySplit: 5 }];
  }

  const compact = input.section.name.replace(/Kindergarten/i, 'Kinder').replace(/[^A-Za-z0-9-]/g, '');
  const filename = `Attendance_${compact}_${input.from.slice(0, 7)}${input.from.slice(0, 7) !== input.to.slice(0, 7) ? `_to_${input.to.slice(0, 7)}` : ''}.xlsx`;
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return filename;
}
