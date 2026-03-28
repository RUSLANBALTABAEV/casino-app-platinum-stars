import Link from 'next/link';
import React from 'react';

import AdminTabbedNav from '@/components/admin/AdminTabbedNav';
import AdminMobileHeader from '@/components/admin/AdminMobileHeader';
import ThemeToggle from '@/components/admin/ThemeToggle';
import { logoutAdmin } from './actions';

export default function AdminLayout({
  children
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="admin-shell">
      <div className="admin-layout">
        {/* Desktop Sidebar */}
        <aside className="admin-sidebar">
          <div className="admin-brand">
            <span className="admin-brand__eyebrow">Control</span>
            <span className="admin-brand__title">Astrobot</span>
            <span className="admin-brand__subtitle">Admin Console</span>
          </div>
          <AdminTabbedNav displayMode="desktop" />
          <div className="admin-sidebar__footer">
            <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-3">
              <ThemeToggle />
            </div>
            <form action={logoutAdmin}>
              <button
                className="w-full rounded-2xl border border-red-300/30 bg-red-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-red-200 transition active:scale-95"
                type="submit"
              >
                Выход
              </button>
            </form>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="admin-body">
          {/* Mobile Header with Burger Menu */}
          <AdminMobileHeader />

          {/* Desktop Header */}
          <header className="admin-topbar hidden lg:flex">
            <div className="admin-topbar__title">
              <span>Astrobot Control</span>
              <span>Управление платформой</span>
            </div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-platinum/60">
              <Link className="hover:text-white" href="/admin">
                Обзор
              </Link>
              <span>•</span>
              <span>Админка</span>
            </div>
          </header>

          {/* Page Content */}
          <main className="admin-main">
            <div className="admin-page">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
