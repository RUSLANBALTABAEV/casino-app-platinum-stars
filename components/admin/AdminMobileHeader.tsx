'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';

import { ADMIN_NAV_SECTIONS } from './AdminTabbedNav';

export default function AdminMobileHeader(): React.ReactElement {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = React.useState(false);

  // Close menu on route change
  React.useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Prevent body scroll when menu is open
  React.useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  return (
    <>
      {/* Mobile Header Bar */}
      <header className="admin-topbar lg:hidden">
        <div className="flex items-center gap-3">
          {/* Burger Menu Button */}
          <button
            aria-expanded={menuOpen}
            aria-label="Открыть меню"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/5 text-lg text-platinum transition active:scale-95"
            onClick={() => setMenuOpen(true)}
            type="button"
          >
            ☰
          </button>

          {/* Title */}
          <div className="admin-topbar__title">
            <span className="text-gold-400">Astrobot</span>
            <span>Админ-панель</span>
          </div>
        </div>
      </header>

      {/* Slide-out Menu Overlay */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm lg:hidden"
          onClick={() => setMenuOpen(false)}
        >
          {/* Menu Panel */}
          <div
            className="absolute left-0 top-0 flex h-full w-[85vw] max-w-[320px] animate-slide-in-left flex-col border-r border-white/10 bg-[#0a0e18] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Menu Header */}
            <header className="flex items-center justify-between border-b border-white/10 px-4 py-4 safe-area-top">
              <div>
                <p className="text-lg font-bold text-white">Astrobot</p>
                <p className="text-[10px] uppercase tracking-[0.15em] text-gold-400/70">
                  Control Panel
                </p>
              </div>
              <button
                aria-label="Закрыть меню"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 text-lg text-platinum/60 transition active:scale-95"
                onClick={() => setMenuOpen(false)}
                type="button"
              >
                ✕
              </button>
            </header>

            {/* Scrollable Navigation */}
            <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-4">
              <div className="space-y-4">
                {ADMIN_NAV_SECTIONS.map((section) => (
                  <div key={section.title} className="space-y-1.5">
                    <p className="flex items-center gap-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-platinum/40">
                      <span>{section.icon}</span>
                      <span>{section.title}</span>
                    </p>
                    <div className="space-y-1">
                      {section.items.map((item) => {
                        const baseHref = item.href.split('#')[0];
                        const isActive =
                          baseHref === '/admin' ? pathname === baseHref : pathname.startsWith(baseHref);
                        return (
                          <Link
                            key={item.href}
                            className={clsx(
                              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition active:scale-[0.98]',
                              isActive
                                ? 'border border-gold-400/30 bg-gold-400/15 text-gold-200'
                                : 'text-platinum/70 active:bg-white/5'
                            )}
                            href={item.href}
                            onClick={() => setMenuOpen(false)}
                          >
                            <span className="w-6 text-center text-base">{item.icon}</span>
                            <span className="font-medium">{item.label}</span>
                            {isActive && (
                              <span className="ml-auto text-xs text-gold-400">●</span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </nav>

            {/* Menu Footer with Logout */}
            <footer className="border-t border-white/10 px-4 py-4 safe-area-bottom">
              <form action="/api/auth/logout" method="POST">
                <button
                  className="w-full rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.15em] text-red-300 transition active:scale-95"
                  type="submit"
                >
                  Выход из системы
                </button>
              </form>
              <p className="mt-3 text-center text-[9px] uppercase tracking-[0.12em] text-platinum/25">
                Astrobot Admin v2.0
              </p>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
