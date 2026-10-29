// Cloud mode: Firebase Authentication + Firestore behind the same Engine the demo uses.
// Configure with web/.env.local (see CLOUD_SETUP.md). Without it, the app runs in demo mode.
import { getApps, initializeApp, type FirebaseOptions } from 'firebase/app';
import {
  createUserWithEmailAndPassword, getAuth, onAuthStateChanged, sendPasswordResetEmail,
  signInWithEmailAndPassword, signOut as fbSignOut,
} from 'firebase/auth';
import {
  collection, doc, getDoc, initializeFirestore, limit, onSnapshot, orderBy, query, where, writeBatch,
  type DocumentData, type Query, type Unsubscribe,
} from 'firebase/firestore';
import type { UserAccount } from '../../domain/types';
import { Engine, emptyState, realClock, type AuthAdapter, type Col, type Persistence } from '../engine';
import { schoolYear as defaultYear, settings as defaultSettings } from '../mock/seed';

const env = import.meta.env;
export const firebaseConfig: FirebaseOptions = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const cloudConfigured = () => Boolean(firebaseConfig.apiKey && firebaseConfig.projectId) && env.VITE_DOORBELL_MODE !== 'demo';

const blankState = () => emptyState({ settings: structuredClone(defaultSettings), schoolYear: { ...defaultYear } });

export function createCloudEngine(): Engine {
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = initializeFirestore(app, { ignoreUndefinedProperties: true });

  /* ---- writes: collected for a moment, then sent as one batch ---- */
  const pending = new Map<string, { col: Col; id: string; data: object | null }>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = async () => {
    timer = null;
    const ops = [...pending.values()];
    pending.clear();
    for (let i = 0; i < ops.length; i += 450) {
      const batch = writeBatch(db);
      for (const op of ops.slice(i, i + 450)) {
        const ref = doc(db, op.col, op.id);
        if (op.data === null) batch.delete(ref); else batch.set(ref, JSON.parse(JSON.stringify(op.data)));
      }
      try { await batch.commit(); } catch (e) { console.error('Save failed', e); alert(`Could not save to the cloud: ${(e as Error).message}`); }
    }
  };
  const schedule = () => { if (!timer) timer = setTimeout(flush, 60); };
  const persistence: Persistence = {
    put: (col, id, data) => { pending.set(`${col}/${id}`, { col, id, data }); schedule(); },
    remove: (col, id) => { pending.set(`${col}/${id}`, { col, id, data: null }); schedule(); },
  };
  window.addEventListener('beforeunload', () => { if (pending.size) void flush(); });

  /* ---- sign-in ---- */
  let signInWaiter: ((acc: UserAccount) => void) | null = null;
  let signInFailer: ((e: Error) => void) | null = null;

  const authAdapter: AuthAdapter = {
    async signIn(email, password) {
      const done = new Promise<UserAccount>((res, rej) => { signInWaiter = res; signInFailer = rej; });
      try { await signInWithEmailAndPassword(auth, email, password); }
      catch (e) {
        const code = (e as { code?: string }).code ?? '';
        throw new Error(code.includes('invalid') || code.includes('wrong-password') || code.includes('user-not-found')
          ? 'Wrong email or password.' : code.includes('too-many') ? 'Too many tries. Wait a minute and try again.' : (e as Error).message);
      }
      return done;
    },
    async signOut() { await fbSignOut(auth); },
    async sendPasswordReset(email) { await sendPasswordResetEmail(auth, email); },
    async createTeacherAccount(email) {
      // A second Firebase app creates the user without signing the admin out.
      const second = getApps().find((a) => a.name === 'account-maker') ?? initializeApp(firebaseConfig, 'account-maker');
      const secondAuth = getAuth(second);
      const temp = `Db-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}!`;
      const cred = await createUserWithEmailAndPassword(secondAuth, email, temp);
      await fbSignOut(secondAuth);
      return { uid: cred.user.uid, tempPassword: temp };
    },
    demoAccounts: () => [],
  };

  const engine = new Engine('cloud', blankState(), persistence, authAdapter, realClock);

  /* ---- reads: live listeners for the signed-in user's data ---- */
  let unsubs: Unsubscribe[] = [];
  let tick: ReturnType<typeof setInterval> | null = null;
  let watchClasses: (() => void) | null = null;
  const stop = () => {
    unsubs.forEach((u) => u()); unsubs = [];
    classUnsubs.forEach((u) => u()); classUnsubs = []; classKey = '';
    watchClasses?.(); watchClasses = null;
    if (tick) clearInterval(tick); tick = null;
  };

  const listen = (col: Col, q: Query<DocumentData>) => new Promise<void>((resolve, reject) => {
    let first = true;
    unsubs.push(onSnapshot(q, (snap) => {
      for (const ch of snap.docChanges()) engine.applyRemote(col, ch.doc.id, ch.type === 'removed' ? null : ch.doc.data());
      if (first) { first = false; resolve(); }
    }, (err) => { console.error(`Listen ${col} failed`, err); reject(err); }));
  });

  const hydrate = async (account: UserAccount) => {
    engine.s = blankState();
    const all = (col: Col) => listen(col, query(collection(db, col)));
    await Promise.all(['meta', 'sections', 'teachers', 'students', 'guardians', 'enrollments'].map((c) => all(c as Col)));
    if (account.role === 'admin') {
      await Promise.all([
        all('users'), all('attendance'), all('confirmations'),
        listen('sms', query(collection(db, 'sms'), orderBy('createdAt', 'desc'), limit(400))),
        listen('notifications', query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(300))),
        listen('audit', query(collection(db, 'audit'), orderBy('at', 'desc'), limit(300))),
      ]);
    } else {
      await listenToClasses(account);
    }
  };

  /* A teacher reads only their own classes. If the admin adds or removes a class, the listeners follow. */
  let classUnsubs: Unsubscribe[] = [];
  let classKey = '';
  const listenToClasses = async (account: UserAccount) => {
    const ids = engine.classesOf(account.teacherId).map((c) => c.id).slice(0, 29);
    const key = ids.join(',');
    if (key === classKey && classUnsubs.length) return;
    classUnsubs.forEach((u) => u());
    classUnsubs = [];
    classKey = key;
    const before = unsubs.length;
    const inMine = [...ids, 'all'];
    const jobs = [listen('notifications', query(collection(db, 'notifications'), where('sectionId', 'in', inMine), orderBy('createdAt', 'desc'), limit(200)))];
    if (ids.length) {
      const mine = (col: Col) => query(collection(db, col), where('sectionId', 'in', ids));
      jobs.push(
        listen('attendance', mine('attendance')), listen('confirmations', mine('confirmations')),
        listen('sms', query(collection(db, 'sms'), where('sectionId', 'in', ids), orderBy('createdAt', 'desc'), limit(300))),
      );
    }
    // listen() registers its unsubscribe in unsubs; move this group's handles to classUnsubs.
    classUnsubs = unsubs.splice(before);
    await Promise.all(jobs);
  };

  let resolveFirst: () => void = () => {};
  engine.ready = new Promise<void>((r) => { resolveFirst = r; });

  onAuthStateChanged(auth, async (user) => {
    stop();
    if (!user) {
      engine.s = blankState();
      engine.setSession(null);
      resolveFirst();
      return;
    }
    const load = (async () => {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (!snap.exists()) {
        await fbSignOut(auth);
        signInFailer?.(new Error('This account is not set up in Doorbell yet. Ask the school admin.'));
        return;
      }
      const account = { ...(snap.data() as UserAccount), uid: user.uid };
      const teacher = account.teacherId ? (await getDoc(doc(db, 'teachers', account.teacherId))).data() : undefined;
      if (teacher && teacher.active === false) {
        await fbSignOut(auth);
        signInFailer?.(new Error('This account is deactivated. Ask the school admin.'));
        return;
      }
      await hydrate(account);
      engine.setSession(account);
      if (account.role === 'teacher') {
        watchClasses = engine.subscribe(() => {
          const key = engine.classesOf(account.teacherId).map((c) => c.id).join(',');
          if (key !== classKey) { engine.refreshSession(); void listenToClasses(account); }
        });
      }
      engine.catchUp();
      tick = setInterval(() => engine.catchUp(), 60_000);
      signInWaiter?.(account);
    })();
    engine.ready = load.catch((e) => { signInFailer?.(e as Error); });
    await engine.ready;
    signInWaiter = null; signInFailer = null;
    resolveFirst();
  });

  return engine;
}
