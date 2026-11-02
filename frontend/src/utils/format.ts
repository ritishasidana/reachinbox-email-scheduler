/** "Tue 9:15:12 AM" — the scheduled-badge format from the Figma design (adds the date when > 6 days away). */
export function formatScheduleBadge(iso: string): string {
  const d = new Date(iso);
  const days = Math.abs(d.getTime() - Date.now()) / 86_400_000;
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  if (days > 6) return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${time}`;
  return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
}

/** "Nov 3, 10:23 AM" — the email detail header format. */
export function formatDetailDate(iso: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Value for <input type="datetime-local"> in the user's local timezone. */
export function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatPickerLabel(d: Date): string {
  return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export const initialOf = (s: string): string => (s.trim()[0] ?? '?').toUpperCase();

export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
