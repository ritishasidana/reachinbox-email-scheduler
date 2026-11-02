import { ChevronDown, ExternalLink, LogOut } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useClickOutside } from '../hooks/useClickOutside';
import { Avatar } from './ui';

/** Sidebar user card (avatar, name, email, chevron) with a dropdown for Bull Board and logout. */
export function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);

  if (!user) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-xl bg-field px-2.5 py-2.5 text-left hover:bg-[#ECEDED]"
      >
        <Avatar name={user.name} src={user.avatarUrl} size={34} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-ink">{user.name}</span>
          <span className="block truncate text-[10px] text-ink-muted">{user.email}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-line bg-white py-1 text-sm shadow-popover">
          <a
            href="/admin/queues"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-3 py-2 text-ink hover:bg-field"
          >
            <ExternalLink className="h-4 w-4 text-ink-muted" /> Queue dashboard
          </a>
          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate('/login', { replace: true });
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </div>
      )}
    </div>
  );
}
