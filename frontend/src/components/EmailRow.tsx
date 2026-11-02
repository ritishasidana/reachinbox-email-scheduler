import { Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { EmailListItem } from '../types';
import { StatusBadge } from './StatusBadge';

interface Props {
  email: EmailListItem;
  onToggleStar: (email: EmailListItem) => void;
}

/** One row of the Scheduled / Sent list: "To: …" · badge · subject – preview · star. */
export function EmailRow({ email, onToggleStar }: Props) {
  return (
    <li className="group relative border-b border-line hover:bg-surface">
      <Link
        to={`/emails/${email.id}`}
        className="flex flex-col gap-1 px-4 py-3 pr-12 md:flex-row md:items-center md:gap-4 md:py-[18px]"
      >
        <span className="truncate text-[13px] font-semibold text-ink md:w-40 md:shrink-0">
          To: {email.recipient}
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <StatusBadge email={email} />
          <span className="min-w-0 truncate text-[13px]">
            <span className="font-semibold text-ink">{email.subject}</span>
            {email.preview && <span className="text-ink-faint"> - {email.preview}</span>}
          </span>
        </span>
      </Link>
      <button
        type="button"
        onClick={() => onToggleStar(email)}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1.5 text-ink-faint hover:text-yellow-500"
        aria-label={email.isStarred ? 'Unstar' : 'Star'}
        aria-pressed={email.isStarred}
      >
        <Star className={`h-4 w-4 ${email.isStarred ? 'fill-yellow-400 text-yellow-400' : ''}`} strokeWidth={1.75} />
      </button>
    </li>
  );
}
