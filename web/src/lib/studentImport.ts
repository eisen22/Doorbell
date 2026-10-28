// Excel/CSV student import: template download, parsing and validation (preview before saving).
import type { Workbook } from 'exceljs';
import { normalizePhMobile } from '../domain/rules';
import type { Section } from '../domain/types';
import type { StudentInput, StudentRow } from '../data/repository';

const COLUMNS = ['LRN', 'Last Name', 'First Name', 'Middle Name', 'Birthdate', 'Sex', 'Guardian Name', 'Guardian Mobile', 'Relationship', 'SMS Consent', 'Language', 'Section'];

async function newWorkbook(): Promise<Workbook> {
  const mod = (await import('exceljs')) as unknown as { Workbook?: new () => Workbook; default?: { Workbook: new () => Workbook } };
  const Ctor = mod.Workbook ?? mod.default!.Workbook;
  return new Ctor();
}

function download(buf: ArrayBuffer, filename: string) {
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function downloadTemplate(sections: Section[]) {
  const wb = await newWorkbook();
  const ws = wb.addWorksheet('Students');
  ws.addRow(COLUMNS).font = { bold: true };
  ws.getRow(1).eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD8F5A2' } }; });
  ws.addRow(['', 'Dela Cruz', 'Juan', 'Lopez', '2021-03-14', 'M', 'Ana Dela Cruz', '09171234567', 'Mother', 'Yes', 'English', sections[0]?.name ?? '']);
  ws.addRow(['', 'Dela Cruz', 'Maria', 'Lopez', '2021-03-14', 'F', 'Ana Dela Cruz', '09171234567', 'Mother', 'Yes', 'English', '']);
  [14, 16, 16, 14, 13, 6, 22, 16, 13, 12, 10, 26].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.getColumn(8).numFmt = '@'; // keep the leading 0 in mobile numbers
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const help = wb.addWorksheet('How to fill');
  [
    ['Column', 'What to type'],
    ['LRN', 'Optional. Learner Reference Number.'],
    ['Birthdate', 'YYYY-MM-DD, e.g. 2021-03-14'],
    ['Sex', 'M or F'],
    ['Guardian Mobile', '09XXXXXXXXX. Siblings can share the same number; they will be linked to one guardian.'],
    ['SMS Consent', 'Yes only if the guardian signed the consent form. No = no texts.'],
    ['Language', 'English or Filipino (for SMS). Blank = English.'],
    ['Section', `Optional. Leave blank to auto-assign later. Must match exactly: ${sections.map((s) => s.name).join(', ')}`],
  ].forEach((r, i) => { const row = help.addRow(r); if (i === 0) row.font = { bold: true }; });
  help.getColumn(1).width = 18; help.getColumn(2).width = 90;
  download(await wb.xlsx.writeBuffer() as ArrayBuffer, 'Doorbell_Student_Import_Template.xlsx');
}

export interface ParsedRow {
  line: number;
  name: string;
  input?: StudentInput;
  errors: string[];
  warnings: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object' && v && 'text' in v) return String((v as { text: unknown }).text);
  if (typeof v === 'object' && v && 'result' in v) return String((v as { result: unknown }).result);
  return String(v).trim();
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

export async function readRows(file: File): Promise<string[][]> {
  if (file.name.toLowerCase().endsWith('.csv')) return parseCsv(await file.text());
  const wb = await newWorkbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  const rows: string[][] = [];
  ws.eachRow((r) => {
    const vals = (r.values as unknown[]).slice(1).map(cellText);
    if (vals.some((v) => v)) rows.push(vals);
  });
  return rows;
}

export function validateRows(rows: string[][], sections: Section[], existing: StudentRow[]): ParsedRow[] {
  const [header, ...body] = rows;
  if (!header) return [];
  const idx = (name: string) => header.findIndex((h) => norm(h) === norm(name));
  const col = Object.fromEntries(COLUMNS.map((c) => [c, idx(c)])) as Record<string, number>;
  const seen = new Set<string>();

  return body.map((r, i) => {
    const get = (c: string) => (col[c] >= 0 ? (r[col[c]] ?? '').trim() : '');
    const errors: string[] = [];
    const warnings: string[] = [];
    const last = get('Last Name'); const first = get('First Name');
    if (!last || !first) errors.push('First and last name are required');
    let birth = get('Birthdate');
    const m = birth.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // MM/DD/YYYY from Excel
    if (m) birth = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) errors.push('Birthdate must be YYYY-MM-DD');
    const sexRaw = get('Sex').toUpperCase();
    const sex = sexRaw.startsWith('M') ? 'M' : sexRaw.startsWith('F') ? 'F' : null;
    if (!sex) errors.push('Sex must be M or F');
    const mobile = normalizePhMobile(get('Guardian Mobile'));
    if (!mobile) errors.push('Guardian mobile must look like 09171234567');
    if (!get('Guardian Name')) errors.push('Guardian name is required');
    const consent = /^y/i.test(get('SMS Consent'));
    if (!consent) warnings.push('No SMS consent: parent will not get texts');
    const secName = get('Section');
    const section = secName ? sections.find((s) => norm(s.name) === norm(secName) && !s.archived) : undefined;
    if (secName && !section) errors.push(`Unknown section "${secName}"`);
    const lrn = get('LRN') || undefined;
    const dupKey = lrn ?? `${norm(last)}|${norm(first)}|${birth}`;
    if (seen.has(dupKey)) errors.push('Duplicate row in this file');
    seen.add(dupKey);
    const dup = existing.find((x) => (lrn && x.student.lrn === lrn) || (norm(x.student.lastName) === norm(last) && norm(x.student.firstName) === norm(first) && x.student.birthdate === birth));
    if (dup) errors.push('Already registered');
    if (mobile && existing.some((x) => x.guardian?.mobile === mobile)) warnings.push('Shares a guardian number: will be linked as a sibling');

    return {
      line: i + 2,
      name: `${last}, ${first}`,
      errors,
      warnings,
      input: errors.length ? undefined : {
        lrn, lastName: last, firstName: first, middleName: get('Middle Name') || undefined, birthdate: birth, sex: sex!,
        guardianName: get('Guardian Name'), guardianMobile: mobile!, relationship: get('Relationship') || 'Guardian',
        smsConsent: consent, preferredLanguage: /^fil/i.test(get('Language')) ? 'fil' : 'en', sectionId: section?.id ?? null,
      },
    };
  });
}
