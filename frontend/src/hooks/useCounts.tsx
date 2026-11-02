import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { emailService } from '../services/emailService';
import type { EmailCounts } from '../types';

interface CountsState {
  counts: EmailCounts | null;
  refreshCounts: () => Promise<void>;
}

const CountsContext = createContext<CountsState | null>(null);

/** Sidebar counts (Scheduled / Sent), shared so list pages can refresh them after changes. */
export function CountsProvider({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<EmailCounts | null>(null);
  const refreshCounts = useCallback(async () => {
    try {
      setCounts(await emailService.counts());
    } catch {
      /* counts are non-critical; the list views surface errors */
    }
  }, []);

  useEffect(() => {
    void refreshCounts();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void refreshCounts();
    }, 15_000);
    return () => clearInterval(t);
  }, [refreshCounts]);

  const value = useMemo(() => ({ counts, refreshCounts }), [counts, refreshCounts]);
  return <CountsContext.Provider value={value}>{children}</CountsContext.Provider>;
}

export function useCounts(): CountsState {
  const ctx = useContext(CountsContext);
  if (!ctx) throw new Error('useCounts must be used inside <CountsProvider>');
  return ctx;
}
