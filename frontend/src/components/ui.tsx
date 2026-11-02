import { AlertCircle, Inbox, Loader2, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { initialOf } from '../utils/format';

export function Logo({ className = '' }: { className?: string }) {
  return <span className={`font-logo text-[28px] leading-none tracking-tight text-black ${className}`}>ONB</span>;
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return <Loader2 className={`animate-spin text-brand ${className}`} aria-label="Loading" />;
}

export function Avatar({ name, src, size = 32 }: { name: string; src?: string | null; size?: number }) {
  const style = { width: size, height: size };
  if (src) {
    return (
      <img src={src} alt={name} style={style} referrerPolicy="no-referrer" className="shrink-0 rounded-full object-cover" />
    );
  }
  return (
    <span
      style={style}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand text-sm font-medium text-white"
    >
      {initialOf(name)}
    </span>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-sm text-ink-muted">
      <Spinner className="h-6 w-6" />
      {label}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-24 text-center">
      <Inbox className="h-10 w-10 text-ink-faint" strokeWidth={1.5} />
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center" role="alert">
      <AlertCircle className="h-10 w-10 text-red-400" strokeWidth={1.5} />
      <p className="max-w-md text-sm text-ink">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-outline">
          <RotateCw className="h-3.5 w-3.5" /> Try again
        </button>
      )}
    </div>
  );
}

export function GoogleIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
