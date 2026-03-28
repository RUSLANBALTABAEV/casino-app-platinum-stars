'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';

import { ADMIN_NAV_SECTIONS } from '@/components/admin/AdminNav';

export default function AdminMobileMenu(): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  return (
    <>
      <button
        aria-expanded={open}
        aria-label="Навигация администратора"
        className="rounded-full border border-white/30 bg-black/40 px-3 py-2 text-xl text-platinum/80 transition hover:border-white/60 hover:text-platinum"
        onClick={() => setOpen((prev) => !prev)}
        type="button"
      >
        ⋮
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        >
          <div
            className="absolute right-4 top-20 w-[85vw] max-w-sm space-y-5 rounded-3xl border border-white/20 bg-[#0b0f1c] p-6 shadow-[0_24px_60px_rgba(10,12,19,0.75)]"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-center justify-between">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-platinum/70">
                Разделы
              </p>
              <button
                aria-label="Закрыть меню"
                className="rounded-full border border-white/20 px-3 py-1 text-sm uppercase tracking-[0.12em] text-platinum/60 transition hover:border-white/50 hover:text-platinum"
                onClick={() => setOpen(false)}
                type="button"
              >
                Закрыть
              </button>
            </header>
            <nav className="space-y-5">
              {ADMIN_NAV_SECTIONS.map((section) => (
                <div key={section.title} className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-platinum/40">
                    {section.title}
                  </p>
                  <div className="space-y-1">
                    {section.items.map((item) => {
                      const isActive =
                        item.href === '/admin'
                          ? pathname === item.href
                          : pathname.startsWith(item.href);
                      return (
                        <Link
                          key={item.href}
                          className={clsx(
                            'flex flex-col rounded-2xl px-4 py-3 text-sm transition',
                            isActive
                              ? 'bg-white/10 text-platinum shadow-[0_10px_24px_rgba(10,12,19,0.35)]'
                              : 'text-platinum/70 hover:bg-white/5 hover:text-platinum'
                          )}
                          href={item.href}
                          onClick={() => setOpen(false)}
                        >
                          <span className="font-medium">{item.label}</span>
                          {item.hint ? (
                            <span className="text-[10px] font-normal uppercase tracking-[0.16em] text-platinum/40">
                              {item.hint}
                            </span>
                          ) : null}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </div>
        </div>
      ) : null}
    </>
  );
}
