// Fills the Firebase project with the demo school: sign-in accounts + a school year of data
// from June 8, 2026 up to today. Safe to run again: it replaces the previous demo data.
//
//   cd cloud
//   npm install
//   $env:SEED_PASSWORD="choose-a-strong-password"; npm run seed
//
// Needs cloud/serviceAccount.json (Firebase console > Project settings > Service accounts).
import { readFileSync, existsSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { buildDemoState } from '../web/src/data/mock/seed';
import { realClock } from '../web/src/data/engine';
import { manilaToday } from '../web/src/domain/rules';

const keyPath = new URL('./serviceAccount.json', import.meta.url);
if (!existsSync(keyPath)) {
  console.error('Missing cloud/serviceAccount.json. Download it from Firebase console > Project settings > Service accounts.');
  process.exit(1);
}
const password = process.env.SEED_PASSWORD ?? '';
if (password.length < 10) {
  console.error('Set SEED_PASSWORD (10+ characters) for the staff accounts, e.g.\n  $env:SEED_PASSWORD="Sunnyside-2026-xyz"; npm run seed');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth();
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

const today = manilaToday();
console.log(`Building demo school from June 8, 2026 to ${today}...`);
const state = buildDemoState(today, realClock);

// 1. Sign-in accounts. Map the demo ids (u-admin, u-maria...) to real Firebase user ids.
const uidMap = new Map<string, string>();
for (const u of state.users.values()) {
  let realUid: string;
  try {
    const existing = await auth.getUserByEmail(u.email);
    await auth.updateUser(existing.uid, { password, displayName: u.name, disabled: false });
    realUid = existing.uid;
  } catch {
    realUid = (await auth.createUser({ email: u.email, password, displayName: u.name })).uid;
  }
  uidMap.set(u.uid, realUid);
  console.log(`  account ${u.role.padEnd(7)} ${u.email}`);
}
for (const t of state.teachers.values()) if (t.uid) t.uid = uidMap.get(t.uid) ?? t.uid;

// 2. Clear old demo data, then write everything.
const collections = ['meta', 'users', 'sections', 'teachers', 'students', 'guardians', 'enrollments', 'attendance', 'confirmations', 'sms', 'notifications', 'audit'];
for (const c of collections) await db.recursiveDelete(db.collection(c));

const writer = db.bulkWriter();
let count = 0;
const put = (col: string, id: string, data: object) => { count++; void writer.set(db.collection(col).doc(id), JSON.parse(JSON.stringify(data))); };

put('meta', 'school', state.meta);
put('meta', 'calendar', { days: [...state.calendar.values()].sort((a, b) => a.date.localeCompare(b.date)) });
for (const u of state.users.values()) { const id = uidMap.get(u.uid)!; put('users', id, { ...u, uid: id }); }
const maps = { sections: state.sections, teachers: state.teachers, students: state.students, guardians: state.guardians, enrollments: state.enrollments, attendance: state.attendance, confirmations: state.confirmations, sms: state.sms, notifications: state.notifications } as const;
for (const [col, map] of Object.entries(maps)) for (const [id, data] of (map as Map<string, object>)) put(col, id, data);
put('audit', `seed-${Date.now()}`, { id: `seed-${Date.now()}`, at: new Date().toISOString(), actor: 'Seed script', action: 'seed', target: 'demo school', detail: `data up to ${today}` });

await writer.close();
console.log(`\nDone: ${count} documents written, ${state.users.size} accounts ready.`);
console.log('Sign in with the emails above and your SEED_PASSWORD. Admin: admin@sunnyside.edu.ph');
