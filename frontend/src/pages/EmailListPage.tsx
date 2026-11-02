import { RotateCw, Search, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmailRow } from '../components/EmailRow';
import { FilterMenu } from '../components/FilterMenu';
import { EmptyState, ErrorState, LoadingState, Spinner } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { useCounts } from '../hooks/useCounts';
import { useDebounce } from '../hooks/useDebounce';
import { useEmailList, type ListFilters } from '../hooks/useEmailList';
import { getErrorMessage } from '../services/api';
import { emailService } from '../services/emailService';
import type { EmailListItem, EmailView } from '../types';

const DEFAULT_FILTERS: ListFilters = { status: 'all', starred: false, senderId: '' };

export function EmailListPage({ view }: { view: EmailView }) {
  const toast = useToast();
  const { refreshCounts } = useCounts();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<ListFilters>(DEFAULT_FILTERS);
  const query = useDebounce(search, 300);
  const { items, total, loading, loadingMore, error, searchSource, reload, loadMore, patchItem } = useEmailList(
    view,
    query,
    filters,
  );
  const [refreshing, setRefreshing] = useState(false);

  // Reset UI state when switching between Scheduled and Sent.
  useEffect(() => {
    setSearch('');
    setFilters(DEFAULT_FILTERS);
  }, [view]);

  // Scheduled emails change state on their own (sent by workers) — keep the view fresh.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void reload({ silent: true });
    }, 15_000);
    return () => clearInterval(t);
  }, [reload]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([reload({ silent: true }), refreshCounts()]);
    setRefreshing(false);
  };

  const onToggleStar = useCallback(
    async (email: EmailListItem) => {
      patchItem(email.id, { isStarred: !email.isStarred });
      try {
        await emailService.star(email.id, !email.isStarred);
      } catch (err) {
        patchItem(email.id, { isStarred: email.isStarred });
        toast.error(getErrorMessage(err, 'Could not update star'));
      }
    },
    [patchItem, toast],
  );

  const filtersActive = filters.starred || filters.status !== 'all' || Boolean(filters.senderId);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-4 pb-2 pt-4 md:pr-6">
        <label className="flex h-9 max-w-[504px] flex-1 items-center gap-2 rounded-full bg-field px-3.5">
          <Search className="h-4 w-4 shrink-0 text-ink-faint" strokeWidth={1.75} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            aria-label={`Search ${view} emails`}
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-ink-faint"
          />
          {search && (
            <button onClick={() => setSearch('')} aria-label="Clear search" className="text-ink-faint hover:text-ink">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </label>
        <FilterMenu view={view} value={filters} onChange={setFilters} />
        <button className="icon-btn" onClick={onRefresh} aria-label="Refresh" disabled={refreshing}>
          <RotateCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} strokeWidth={1.75} />
        </button>
      </div>

      {query && !loading && !error && (
        <p className="px-4 pb-1 text-[11px] text-ink-faint md:pr-6">
          {total} result{total === 1 ? '' : 's'} for “{query}”
          {searchSource === 'database' && ' · search index unavailable, showing database results'}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 md:pr-6">
        {loading ? (
          <LoadingState label={`Loading ${view} emails…`} />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void reload()} />
        ) : items.length === 0 ? (
          query || filtersActive ? (
            <EmptyState title="No matching emails" description="Try a different search term or clear the filters." />
          ) : view === 'scheduled' ? (
            <EmptyState
              title="No scheduled emails"
              description="Emails you schedule will appear here until they are sent."
              action={
                <Link to="/compose" className="btn-outline">
                  Compose
                </Link>
              }
            />
          ) : (
            <EmptyState title="No sent emails yet" description="Delivered and failed emails will show up here." />
          )
        ) : (
          <>
            <ul>
              {items.map((email) => (
                <EmailRow key={email.id} email={email} onToggleStar={onToggleStar} />
              ))}
            </ul>
            {!query && items.length < total && (
              <div className="flex justify-center py-4">
                <button className="btn-outline" onClick={() => void loadMore()} disabled={loadingMore}>
                  {loadingMore && <Spinner className="h-3.5 w-3.5" />} Load more ({total - items.length} remaining)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
