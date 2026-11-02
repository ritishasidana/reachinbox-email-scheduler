import { X } from 'lucide-react';
import { useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { isValidEmail, splitCandidates } from '../../utils/recipients';

interface Props {
  recipients: string[];
  onAdd: (emails: string[]) => void;
  onRemove: (email: string) => void;
  onShowAll: () => void;
  /** Number of chips shown before collapsing into "+N" (Figma shows 3). */
  visibleCount?: number;
}

/** "To" field: green chips for each address (red when invalid), "+N" overflow chip, free typing/paste. */
export function RecipientInput({ recipients, onAdd, onRemove, onShowAll, visibleCount = 3 }: Props) {
  const [draft, setDraft] = useState('');

  const commit = (text: string) => {
    const emails = splitCandidates(text);
    if (emails.length > 0) onAdd(emails);
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (['Enter', ',', ';', ' ', 'Tab'].includes(e.key) && draft.trim()) {
      e.preventDefault();
      commit(draft);
    } else if (e.key === 'Backspace' && !draft && recipients.length > 0) {
      onRemove(recipients[recipients.length - 1]!);
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (/[\s,;]/.test(text.trim())) {
      e.preventDefault();
      commit(text);
    }
  };

  const visible = recipients.slice(0, visibleCount);
  const hidden = recipients.length - visible.length;

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 py-1">
      {visible.map((email) => {
        const valid = isValidEmail(email);
        return (
          <span
            key={email}
            title={valid ? email : `${email} is not a valid email address`}
            className={`inline-flex max-w-[220px] items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
              valid ? 'border-brand-border bg-brand-light text-ink' : 'border-red-300 bg-red-50 text-red-700'
            }`}
          >
            <span className="truncate">{email}</span>
            <button
              type="button"
              onClick={() => onRemove(email)}
              aria-label={`Remove ${email}`}
              className="text-ink-faint hover:text-ink"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        );
      })}
      {hidden > 0 && (
        <button
          type="button"
          onClick={onShowAll}
          className="rounded-full border border-brand-border bg-brand-light px-2 py-0.5 text-[11px] font-medium text-ink hover:bg-[#d6eedd]"
        >
          +{hidden}
        </button>
      )}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={() => draft.trim() && commit(draft)}
        placeholder={recipients.length === 0 ? 'recipient@example.com' : ''}
        aria-label="Add recipient"
        className="min-w-[160px] flex-1 bg-transparent py-1 text-[13px] outline-none placeholder:text-ink-faint"
      />
    </div>
  );
}
