import { Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { isValidEmail } from '../../utils/recipients';

interface Props {
  recipients: string[];
  /** Invalid entries detected in uploaded files (never added as recipients). */
  rejected: string[];
  onRemove: (email: string) => void;
  onRemoveInvalid: () => void;
  onClose: () => void;
}

/** Lets the user review every recipient before scheduling: search, remove, and see invalid entries. */
export function RecipientReviewModal({ recipients, rejected, onRemove, onRemoveInvalid, onClose }: Props) {
  const [filter, setFilter] = useState('');
  const invalidChips = recipients.filter((r) => !isValidEmail(r));
  const shown = useMemo(
    () => recipients.filter((r) => r.includes(filter.trim().toLowerCase())),
    [recipients, filter],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Review recipients"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-popover"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-ink">Review recipients</h2>
            <p className="text-xs text-ink-muted">
              {recipients.length - invalidChips.length} valid
              {invalidChips.length > 0 && ` · ${invalidChips.length} invalid`}
              {rejected.length > 0 && ` · ${rejected.length} rejected from file`}
            </p>
          </div>
          <button onClick={onClose} className="icon-btn" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 pt-3">
          <label className="flex items-center gap-2 rounded-full bg-field px-3 py-1.5">
            <Search className="h-3.5 w-3.5 text-ink-faint" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter recipients"
              className="w-full bg-transparent text-xs outline-none"
            />
          </label>
          {invalidChips.length > 0 && (
            <button onClick={onRemoveInvalid} className="mt-2 text-xs text-red-600 hover:underline">
              Remove {invalidChips.length} invalid address{invalidChips.length === 1 ? '' : 'es'}
            </button>
          )}
        </div>

        <ul className="mt-2 min-h-0 flex-1 overflow-y-auto px-5 pb-3">
          {shown.map((email) => {
            const valid = isValidEmail(email);
            return (
              <li key={email} className="flex items-center justify-between border-b border-line py-1.5 text-xs">
                <span className={valid ? 'text-ink' : 'text-red-600'}>
                  {email}
                  {!valid && ' (invalid)'}
                </span>
                <button onClick={() => onRemove(email)} className="text-ink-faint hover:text-red-600" aria-label={`Remove ${email}`}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
          {shown.length === 0 && <li className="py-6 text-center text-xs text-ink-muted">No recipients</li>}
        </ul>

        {rejected.length > 0 && (
          <details className="border-t border-line px-5 py-3 text-xs">
            <summary className="cursor-pointer text-ink-muted">Rejected entries from uploaded file ({rejected.length})</summary>
            <ul className="mt-2 max-h-32 overflow-y-auto text-red-600">
              {rejected.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
