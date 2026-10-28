// Health check for the Firebase project (no passwords involved):
//   cd cloud; npx tsx check.ts
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const sa = JSON.parse(readFileSync(new URL('./serviceAccount.json', import.meta.url), 'utf8'));
const app = initializeApp({ credential: cert(sa) });
const token = (await app.options.credential!.getAccessToken()).access_token;

const cfg = await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${sa.project_id}/config`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
console.log('Email/Password sign-in enabled:', cfg?.signIn?.email?.enabled === true);
console.log('Authorized domains:', (cfg?.authorizedDomains ?? []).join(', '));

const users = await getAuth().listUsers(20);
console.log('Accounts:', users.users.map((u) => u.email).join(', '));

const db = getFirestore();
for (const c of ['meta', 'users', 'sections', 'students', 'attendance', 'confirmations', 'sms', 'notifications']) {
  const n = (await db.collection(c).count().get()).data().count;
  console.log(`  ${c.padEnd(14)} ${n}`);
}
