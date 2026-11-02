import { useCallback, useEffect, useRef, useState } from 'react';
import { getErrorMessage } from '../services/api';
import { emailService, type ListEndpoint } from '../services/emailService';
import type { EmailListItem, EmailView } from '../types';

export interface ListFilters {
  /** For the Sent view: all, only delivered, only failed. */
  status: 'all' | 'failed';
  starred: boolean;
  senderId: string;
}

const PAGE_SIZE = 25;

/**
 * Loads a paginated email list, or Elasticsearch search results when `query` is non-empty.
 * Stale responses (from an older query/filter) are ignored via a request counter.
 */
export function useEmailList(view: EmailView, query: string, filters: ListFilters) {
  const [items, setItems] = useState<EmailListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchSource, setSearchSource] = useState<'elasticsearch' | 'database' | null>(null);
  const requestId = useRef(0);

  const endpoint: ListEndpoint = view === 'sent' && filters.status === 'failed' ? 'failed' : view;

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      const id = ++requestId.current;
      if (!opts.silent) setLoading(true);
      setError(null);
      try {
        if (query.trim()) {
          const res = await emailService.search(query.trim(), view);
          if (id !== requestId.current) return;
          let results = res.items;
          if (filters.starred) results = results.filter((e) => e.isStarred);
          if (filters.senderId) results = results.filter((e) => e.sender.id === filters.senderId);
          if (filters.status === 'failed') results = results.filter((e) => e.status === 'FAILED');
          setItems(results);
          setTotal(results.length);
          setSearchSource(res.source);
        } else {
          const res = await emailService.list(endpoint, {
            page: 1,
            pageSize: PAGE_SIZE,
            starred: filters.starred,
            senderId: filters.senderId || undefined,
          });
          if (id !== requestId.current) return;
          setItems(res.items);
          setTotal(res.total);
          setSearchSource(null);
        }
        setPage(1);
      } catch (err) {
        if (id !== requestId.current) return;
        setError(getErrorMessage(err, 'Could not load emails'));
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [endpoint, filters.senderId, filters.starred, filters.status, query, view],
  );

  const loadMore = useCallback(async () => {
    if (query.trim() || items.length >= total) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const res = await emailService.list(endpoint, {
        page: next,
        pageSize: PAGE_SIZE,
        starred: filters.starred,
        senderId: filters.senderId || undefined,
      });
      setItems((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        return [...prev, ...res.items.filter((e) => !seen.has(e.id))];
      });
      setTotal(res.total);
      setPage(next);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load more emails'));
    } finally {
      setLoadingMore(false);
    }
  }, [endpoint, filters.senderId, filters.starred, items.length, page, query, total]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Optimistic local update (e.g. star toggle) without refetching. */
  const patchItem = useCallback((id: string, patch: Partial<EmailListItem>) => {
    setItems((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  return { items, total, loading, loadingMore, error, searchSource, reload: load, loadMore, patchItem };
}
