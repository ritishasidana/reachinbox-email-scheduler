import { ArrowLeft, ChevronDown, ExternalLink, FileText, Star, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { StatusBadge } from '../components/StatusBadge';
import { Avatar, ErrorState, LoadingState } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getErrorMessage } from '../services/api';
import { emailService } from '../services/emailService';
import type { Attachment, EmailDetail } from '../types';
import { formatBytes, formatDetailDate, initialOf } from '../utils/format';

function AttachmentCard({ attachment }: { attachment: Attachment }) {
  const isImage = attachment.mimeType.startsWith('image/');
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noreferrer"
      className="block w-[158px] overflow-hidden rounded-lg border border-line bg-surface transition-shadow hover:shadow-popover"
    >
      <div className="flex h-[88px] items-center justify-center bg-field">
        {isImage ? (
          <img src={attachment.url} alt={attachment.filename} className="h-full w-full object-cover" />
        ) : (
          <FileText className="h-8 w-8 text-ink-faint" />
        )}
      </div>
      <div className="px-2 py-1.5">
        <p className="truncate text-[11px] text-ink">{attachment.filename}</p>
        <p className="text-[10px] text-ink-faint">{formatBytes(attachment.size)}</p>
      </div>
    </a>
  );
}

export function EmailDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState<EmailDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setEmail(await emailService.get(id));
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load this email'));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(email && ['SENT', 'FAILED'].includes(email.status) ? '/sent' : '/scheduled');
  };

  const toggleStar = async () => {
    if (!email) return;
    const next = !email.isStarred;
    setEmail({ ...email, isStarred: next });
    try {
      await emailService.star(email.id, next);
    } catch (err) {
      setEmail({ ...email, isStarred: !next });
      toast.error(getErrorMessage(err));
    }
  };

  const cancel = async () => {
    if (!email || !window.confirm(`Cancel the scheduled email to ${email.recipient}?`)) return;
    setBusy(true);
    try {
      await emailService.cancel(email.id);
      toast.success('Scheduled email cancelled');
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not cancel'));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!email) return <LoadingState label="Loading email…" />;

  const displayDate = email.sentAt ?? email.failedAt ?? email.deferredUntil ?? email.scheduledAt;
  const cancellable = email.status === 'SCHEDULED';

  return (
    <div className="min-h-full bg-white">
      <header className="flex items-center gap-3 px-4 py-4 sm:px-6">
        <button onClick={goBack} className="icon-btn shrink-0" aria-label="Back">
          <ArrowLeft className="h-5 w-5 text-ink" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-lg text-ink sm:text-xl">{email.subject}</h1>
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={toggleStar} className="icon-btn" aria-label={email.isStarred ? 'Unstar' : 'Star'}>
            <Star className={`h-4 w-4 ${email.isStarred ? 'fill-yellow-400 text-yellow-400' : ''}`} strokeWidth={1.75} />
          </button>
          {email.previewUrl && (
            <a
              href={email.previewUrl}
              target="_blank"
              rel="noreferrer"
              className="icon-btn"
              title="Open the delivered message in Ethereal"
              aria-label="Open in Ethereal"
            >
              <ExternalLink className="h-4 w-4" strokeWidth={1.75} />
            </a>
          )}
          <button
            onClick={cancel}
            disabled={!cancellable || busy}
            className="icon-btn"
            title={cancellable ? 'Cancel scheduled email' : 'Only scheduled emails can be cancelled'}
            aria-label="Cancel scheduled email"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <span className="mx-2 hidden h-6 w-px bg-line sm:block" />
          {user && <Avatar name={user.name} src={user.avatarUrl} size={30} />}
        </div>
      </header>

      <article className="mx-auto max-w-[780px] px-4 pb-16 sm:px-6">
        <div className="mb-6 flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1EC75C] text-sm font-medium text-white">
            {initialOf(email.sender.name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-[13px] font-semibold text-ink">{email.sender.name}</span>
              <span className="truncate text-[11px] text-ink-muted">&lt;{email.sender.email}&gt;</span>
            </div>
            <button
              onClick={() => setShowDetails((s) => !s)}
              className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink"
              aria-expanded={showDetails}
            >
              to {email.recipient}
              <ChevronDown className={`h-3 w-3 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
            </button>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="text-[11px] text-ink-muted">{formatDetailDate(displayDate)}</span>
            <StatusBadge email={email} />
          </div>
        </div>

        {showDetails && (
          <dl className="mb-6 grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 rounded-lg bg-surface p-3 text-[11px]">
            <dt className="text-ink-faint">Status</dt>
            <dd className="text-ink">{email.status}</dd>
            <dt className="text-ink-faint">Scheduled for</dt>
            <dd className="text-ink">{new Date(email.scheduledAt).toLocaleString()}</dd>
            {email.deferredUntil && (
              <>
                <dt className="text-ink-faint">Rescheduled to</dt>
                <dd className="text-ink">{new Date(email.deferredUntil).toLocaleString()} (hourly limit)</dd>
              </>
            )}
            {email.sentAt && (
              <>
                <dt className="text-ink-faint">Sent at</dt>
                <dd className="text-ink">{new Date(email.sentAt).toLocaleString()}</dd>
              </>
            )}
            <dt className="text-ink-faint">Attempts</dt>
            <dd className="text-ink">{email.attempts}</dd>
            <dt className="text-ink-faint">Message-ID</dt>
            <dd className="break-all font-mono text-ink">{email.messageId}</dd>
            {email.lastError && (
              <>
                <dt className="text-ink-faint">Last error</dt>
                <dd className="text-red-600">{email.lastError}</dd>
              </>
            )}
          </dl>
        )}

        {/* bodyHtml is sanitized server-side with an allow-list before it is stored. */}
        <div className="rich-content pl-0 sm:pl-12" dangerouslySetInnerHTML={{ __html: email.bodyHtml }} />

        {email.attachments.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-3 sm:pl-12">
            {email.attachments.map((a) => (
              <AttachmentCard key={a.id} attachment={a} />
            ))}
          </div>
        )}
      </article>
    </div>
  );
}
