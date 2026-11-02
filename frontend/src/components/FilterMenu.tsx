import { Filter } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useClickOutside } from '../hooks/useClickOutside';
import type { ListFilters } from '../hooks/useEmailList';
import { senderService } from '../services/senderService';
import type { EmailView, Sender } from '../types';

interface Props {
  view: EmailView;
  value: ListFilters;
  onChange: (next: ListFilters) => void;
}

export function FilterMenu({ view, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [senders, setSenders] = useState<Sender[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);

  useEffect(() => {
    if (open && senders.length === 0) senderService.list().then(setSenders).catch(() => undefined);
  }, [open, senders.length]);

  const active = value.starred || value.status !== 'all' || Boolean(value.senderId);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className={`icon-btn ${active ? 'text-brand' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label="Filter"
        aria-expanded={open}
      >
        <Filter className="h-4 w-4" strokeWidth={1.75} />
        {active && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-brand" />}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-56 rounded-xl border border-line bg-white p-3 text-sm shadow-popover">
          {view === 'sent' && (
            <fieldset className="mb-3">
              <legend className="mb-1 text-[11px] font-medium uppercase text-ink-faint">Status</legend>
              {(['all', 'failed'] as const).map((s) => (
                <label key={s} className="flex cursor-pointer items-center gap-2 py-1">
                  <input
                    type="radio"
                    name="status"
                    className="accent-brand"
                    checked={value.status === s}
                    onChange={() => onChange({ ...value, status: s })}
                  />
                  {s === 'all' ? 'Sent & failed' : 'Failed only'}
                </label>
              ))}
            </fieldset>
          )}
          <label className="mb-3 flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="accent-brand"
              checked={value.starred}
              onChange={(e) => onChange({ ...value, starred: e.target.checked })}
            />
            Starred only
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase text-ink-faint">Sender</span>
            <select
              value={value.senderId}
              onChange={(e) => onChange({ ...value, senderId: e.target.value })}
              className="w-full rounded-lg bg-field px-2 py-1.5 text-sm outline-none"
            >
              <option value="">All senders</option>
              {senders.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.email}
                </option>
              ))}
            </select>
          </label>
          {active && (
            <button
              className="mt-3 text-xs text-brand hover:underline"
              onClick={() => onChange({ status: 'all', starred: false, senderId: '' })}
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
