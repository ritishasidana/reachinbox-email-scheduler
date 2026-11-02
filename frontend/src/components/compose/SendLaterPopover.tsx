import { CalendarDays } from 'lucide-react';
import { forwardRef, useMemo, useState } from 'react';
import { formatPickerLabel, toLocalInputValue } from '../../utils/format';

interface Props {
  initial: Date | null;
  submitting: boolean;
  onCancel: () => void;
  onDone: (when: Date) => void;
}

function tomorrowAt(hours: number | null): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  if (hours !== null) d.setHours(hours, 0, 0, 0);
  else d.setSeconds(0, 0);
  return d;
}

/** "Send Later" popover from the Figma design: date-time picker, quick presets, Cancel / Done. */
export const SendLaterPopover = forwardRef<HTMLDivElement, Props>(function SendLaterPopover(
  { initial, submitting, onCancel, onDone },
  ref,
) {
  const presets = useMemo(
    () => [
      { label: 'Tomorrow', date: tomorrowAt(null) },
      { label: 'Tomorrow, 10:00 AM', date: tomorrowAt(10) },
      { label: 'Tomorrow, 11:00 AM', date: tomorrowAt(11) },
      { label: 'Tomorrow, 3:00 PM', date: tomorrowAt(15) },
    ],
    [],
  );
  const [value, setValue] = useState(initial ? toLocalInputValue(initial) : '');
  const [error, setError] = useState<string | null>(null);

  const selected = value ? new Date(value) : null;

  const confirm = () => {
    if (!selected || Number.isNaN(selected.getTime())) {
      setError('Pick a date and time');
      return;
    }
    if (selected.getTime() < Date.now() - 30_000) {
      setError('That time is in the past');
      return;
    }
    onDone(selected);
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Send later"
      className="absolute right-0 top-full z-30 mt-2 w-[min(240px,calc(100vw-2rem))] rounded-lg border border-line bg-white p-3 shadow-popover"
    >
      <p className="mb-3 text-[13px] font-medium text-ink">Send Later</p>
      <label className="flex items-center gap-2 border-b border-line pb-2">
        <input
          type="datetime-local"
          value={value}
          min={toLocalInputValue(new Date())}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          aria-label="Pick date & time"
          className={`min-w-0 flex-1 bg-transparent text-[11px] outline-none ${value ? 'text-ink' : 'text-ink-faint'}`}
        />
        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
      </label>
      {selected && !Number.isNaN(selected.getTime()) && (
        <p className="mt-1 text-[10px] text-ink-muted">Starts {formatPickerLabel(selected)}</p>
      )}

      <ul className="mt-3 space-y-0.5">
        {presets.map((p) => {
          const active = value === toLocalInputValue(p.date);
          return (
            <li key={p.label}>
              <button
                type="button"
                onClick={() => {
                  setValue(toLocalInputValue(p.date));
                  setError(null);
                }}
                className={`w-full rounded px-1 py-1.5 text-left text-[11px] ${
                  active ? 'bg-brand-light font-medium text-ink' : 'text-ink hover:bg-field'
                }`}
              >
                {p.label}
              </button>
            </li>
          );
        })}
      </ul>

      {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}

      <div className="mt-6 flex items-center justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-2 text-[12px] text-ink hover:underline">
          Cancel
        </button>
        <button type="button" onClick={confirm} disabled={submitting} className="btn-outline px-5 py-1 text-[12px]">
          {submitting ? 'Scheduling…' : 'Done'}
        </button>
      </div>
    </div>
  );
});
