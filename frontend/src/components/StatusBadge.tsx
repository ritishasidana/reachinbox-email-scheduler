import { Clock } from 'lucide-react';
import type { EmailListItem } from '../types';
import { formatScheduleBadge } from '../utils/format';

/** Orange time badge for scheduled emails, grey "Sent" or red "Failed" badge otherwise (per Figma). */
export function StatusBadge({ email }: { email: Pick<EmailListItem, 'status' | 'scheduledAt' | 'deferredUntil' | 'lastError'> }) {
  if (email.status === 'SCHEDULED' || email.status === 'SENDING') {
    const at = email.deferredUntil ?? email.scheduledAt;
    return (
      <span
        title={email.deferredUntil ? 'Rescheduled by the hourly rate limit' : 'Scheduled'}
        className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-scheduled-border bg-scheduled-bg px-2 py-0.5 text-[11px] font-medium text-scheduled-text"
      >
        <Clock className="h-3 w-3" strokeWidth={2.25} />
        {email.status === 'SENDING' ? 'Sending…' : formatScheduleBadge(at)}
      </span>
    );
  }
  if (email.status === 'FAILED') {
    return (
      <span
        title={email.lastError ?? 'Failed'}
        className="inline-flex shrink-0 items-center rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600"
      >
        Failed
      </span>
    );
  }
  if (email.status === 'CANCELLED') {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full bg-field px-2 py-0.5 text-[11px] font-medium text-ink-faint">
        Cancelled
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-[#EEEEEE] px-2 py-0.5 text-[11px] font-medium text-ink-muted">
      Sent
    </span>
  );
}
