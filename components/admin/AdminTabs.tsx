'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';

import { ADMIN_NAV_SECTIONS } from '@/components/admin/AdminNav';

type TabItem = {
  href: string;
  label: string;
  hint?: string;
};

const TABS: TabItem[] = ADMIN_NAV_SECTIONS.flatMap((section) => section.items);

export default function AdminTabs(): React.ReactElement {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Административные разделы"
      className="admin-tabs"
    >
      {TABS.map((tab) => {
        const isActive =
          tab.href === '/admin'
            ? pathname === tab.href
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            className={clsx(
              'admin-tab',
              isActive && 'admin-tab--active'
            )}
            href={tab.href}
          >
            <span className="admin-tab__label">{tab.label}</span>
            {tab.hint ? <span className="admin-tab__hint">{tab.hint}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
