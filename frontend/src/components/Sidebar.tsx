import { Clock, Send } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import { useCounts } from '../hooks/useCounts';
import { SlackCard } from './SlackCard';
import { Logo } from './ui';
import { UserMenu } from './UserMenu';

const navItems = [
  { to: '/scheduled', label: 'Scheduled', icon: Clock, countKey: 'scheduled' as const },
  { to: '/sent', label: 'Sent', icon: Send, countKey: 'sent' as const },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { counts } = useCounts();
  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col gap-3 bg-white px-3 py-4">
      <Logo className="px-2" />
      <UserMenu />
      <Link
        to="/compose"
        onClick={onNavigate}
        className="flex items-center justify-center rounded-full border border-brand py-1.5 text-[13px] font-medium text-brand hover:bg-brand-light"
      >
        Compose
      </Link>

      <nav className="mt-2">
        <p className="mb-1 px-3 text-[10px] font-medium uppercase tracking-wide text-ink-faint">Core</p>
        <ul className="space-y-0.5">
          {navItems.map(({ to, label, icon: Icon, countKey }) => (
            <li key={to}>
              <NavLink
                to={to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] ${
                    isActive ? 'bg-brand-light font-semibold text-ink' : 'text-ink hover:bg-field'
                  }`
                }
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} />
                <span className="flex-1">{label}</span>
                <span className="text-[11px] font-normal text-ink-muted">{counts ? counts[countKey] : '–'}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-auto">
        <SlackCard />
      </div>
    </aside>
  );
}
