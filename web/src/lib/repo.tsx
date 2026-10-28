import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { MockRepository } from '../data/mock/mockRepo';
import type { Repository } from '../data/repository';

const RepoCtx = createContext<Repository | null>(null);

/** Swap MockRepository for the Firestore adapter in the Cloud step. Nothing else changes. */
export function RepoProvider({ children }: { children: ReactNode }) {
  const [repo] = useState<Repository>(() => new MockRepository());
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
      // Usually a page for the other role while the portal is switching; the shell redirects.
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
