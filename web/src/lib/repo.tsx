import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { manilaToday } from '../domain/rules';
import { DemoClock, Engine, noopPersistence } from '../data/engine';
import { buildDemoState, demoAuth } from '../data/mock/seed';
import { cloudConfigured, createCloudEngine } from '../data/firebase/cloud';
import type { Repository } from '../data/repository';

const RepoCtx = createContext<Repository | null>(null);
const DEMO_KEY = 'doorbell-demo-user';

/** Cloud mode when web/.env.local has the Firebase settings; otherwise demo mode with built-in data. */
function createRepository(): Repository {
  if (cloudConfigured()) return createCloudEngine();
  const clock = new DemoClock();
  let engine: Engine;
  const auth = demoAuth(() => engine);
  engine = new Engine('demo', buildDemoState(manilaToday(), clock), noopPersistence, {
    ...auth,
    async signIn(email, password) {
      const acc = await auth.signIn(email, password);
      try { sessionStorage.setItem(DEMO_KEY, acc.uid); } catch { /* storage blocked */ }
      setTimeout(() => engine.catchUp(), 0);
      return acc;
    },
    async signOut() { try { sessionStorage.removeItem(DEMO_KEY); } catch { /* ignore */ } },
  }, clock);
  // Stay signed in across page reloads in the same tab.
  try {
    const uid = sessionStorage.getItem(DEMO_KEY);
    const acc = uid ? engine.s.users.get(uid) : undefined;
    if (acc) engine.setSession(acc);
  } catch { /* ignore */ }
  return engine;
}

export function RepoProvider({ children }: { children: ReactNode }) {
  const [repo] = useState<Repository>(createRepository);
  return <RepoCtx.Provider value={repo}>{children}</RepoCtx.Provider>;
}

export function useRepo(): Repository {
  const r = useContext(RepoCtx);
  if (!r) throw new Error('RepoProvider missing');
  return r;
}

/** Loads data and reloads it whenever the repository reports a change. */
export function useLive<T>(load: (repo: Repository) => Promise<T>, deps: unknown[] = []) {
  const repo = useRepo();
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async () => {
    try {
      const value = await loadRef.current(repo);
      setData(value);
    } catch (e) {
      console.debug('useLive load skipped:', (e as Error).message);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, ...deps]);

  useEffect(() => {
    setLoading(true);
    reload();
    return repo.subscribe(() => { reload(); });
  }, [repo, reload]);

  return { data, loading, reload };
}

export function initials(first: string, last: string) {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

/** Readable text color (ink or white) for any background hex. */
export function textOn(hex: string): string {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#111111' : '#ffffff';
}
