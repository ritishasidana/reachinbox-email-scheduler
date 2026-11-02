import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { Logo } from '../components/ui';
import { CountsProvider } from '../hooks/useCounts';

/** Sidebar + main pane. On small screens the sidebar becomes an off-canvas drawer. */
export function DashboardLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <CountsProvider>
      <div className="flex h-full">
        <div className="hidden md:block">
          <Sidebar />
        </div>

        {drawerOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerOpen(false)} />
            <div className="relative h-full w-[220px] shadow-popover">
              <Sidebar onNavigate={() => setDrawerOpen(false)} />
              <button
                className="icon-btn absolute right-2 top-3"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3 md:hidden">
            <button className="icon-btn" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <Logo className="text-2xl" />
          </div>
          <Outlet />
        </main>
      </div>
    </CountsProvider>
  );
}
