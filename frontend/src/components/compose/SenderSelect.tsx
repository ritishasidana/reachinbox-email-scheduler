import { Check, ChevronDown, Loader2, Plus } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useClickOutside } from '../../hooks/useClickOutside';
import type { Sender } from '../../types';

interface Props {
  senders: Sender[];
  value: string;
  loading: boolean;
  creating: boolean;
  onChange: (id: string) => void;
  onCreate: () => void;
}

/** "From" pill dropdown listing the user's senders (with their limits) plus "Add Ethereal sender". */
export function SenderSelect({ senders, value, loading, creating, onChange, onCreate }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);
  const selected = senders.find((s) => s.id === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex max-w-full items-center gap-1.5 rounded-md bg-field px-2.5 py-1.5 text-[13px] text-ink"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-faint" />
        ) : (
          <span className="truncate">{selected?.email ?? 'Select a sender'}</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-30 mt-1 w-[min(320px,calc(100vw-2rem))] rounded-lg border border-line bg-white py-1 shadow-popover"
        >
          {senders.map((s) => (
            <button
              key={s.id}
              type="button"
              role="option"
              aria-selected={s.id === value}
              disabled={!s.isActive}
              onClick={() => {
                onChange(s.id);
                setOpen(false);
              }}
              className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-field disabled:opacity-50"
            >
              <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${s.id === value ? 'text-brand' : 'text-transparent'}`} />
              <span className="min-w-0">
                <span className="block truncate text-[13px] text-ink">{s.email}</span>
                <span className="block text-[11px] text-ink-muted">
                  {s.name} · {s.hourlyLimit}/hour · {(s.minDelayMs / 1000).toFixed(1)}s spacing
                  {typeof s.usedThisHour === 'number' && ` · ${s.usedThisHour} used this hour`}
                </span>
              </span>
            </button>
          ))}
          {senders.length === 0 && !loading && (
            <p className="px-3 py-2 text-xs text-ink-muted">No senders yet. Create one to start sending.</p>
          )}
          <div className="my-1 border-t border-line" />
          <button
            type="button"
            onClick={onCreate}
            disabled={creating}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-brand hover:bg-brand-light disabled:opacity-60"
          >
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add Ethereal sender
          </button>
        </div>
      )}
    </div>
  );
}
