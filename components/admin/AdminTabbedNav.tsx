'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';

export type NavSection = {
  title: string;
  icon?: string;
  items: ReadonlyArray<{
    href: string;
    label: string;
    hint?: string;
    icon?: string;
  }>;
};

export const ADMIN_NAV_SECTIONS: ReadonlyArray<NavSection> = [
  {
    title: 'Панель',
    icon: '📊',
    items: [{ href: '/admin', label: 'Обзор', hint: 'Метрики и быстрые действия', icon: '📈' }]
  },
  {
    title: 'Игры',
    icon: '🎮',
    items: [
      { href: '/admin/games', label: 'Конфигурация', hint: 'Кейсы, рулетки, раннер', icon: '⚙️' },
      { href: '/admin/games#new-games', label: 'Новые игры', hint: 'Mines, Crash, Battle', icon: '🆕' },
      { href: '/admin/games#nft-gifts', label: 'NFT каталог', hint: 'Telegram gifts', icon: '🎁' },
      { href: '/admin/games#availability', label: 'Доступность', hint: 'Блокировка игр', icon: '🔒' },
      { href: '/admin/tasks', label: 'Задания', hint: 'Активности и награды', icon: '📋' }
    ]
  },
  {
    title: 'Экономика',
    icon: '💰',
    items: [
      { href: '/admin/economy', label: 'Баланс', hint: 'Курсы, тарифы', icon: '💵' },
      { href: '/admin/daily-gift', label: 'Подарок дня', hint: 'Награды и таймер', icon: '🎁' },
      { href: '/admin/referrals', label: 'Рефералы', hint: 'Управление реферальной программой', icon: '👥' },
      { href: '/admin/statuses', label: 'Статусы', hint: 'Standard / Premium', icon: '⭐' }
    ]
  },
  {
    title: 'Монетизация',
    icon: '💳',
    items: [
      { href: '/admin/promo', label: 'Промокоды', hint: 'Создание и управление', icon: '🎫' },
      { href: '/admin/deposits', label: 'Пополнения', hint: 'Ручные пополнения и чеки', icon: '📥' },
      { href: '/admin/nft-shop', label: 'NFT-магазин', hint: 'Склад и выдача', icon: '🛒' },
      { href: '/admin/withdrawals', label: 'Выводы', hint: 'Заявки на вывод средств', icon: '📤' },
      { href: '/admin/transactions', label: 'Транзакции', hint: 'Пополнения и списания', icon: '📊' }
    ]
  },
  {
    title: 'Сообщество',
    icon: '👥',
    items: [
      { href: '/admin/users', label: 'Пользователи', hint: 'Модерация и статусы', icon: '👤' },
      { href: '/admin/broadcasts', label: 'Рассылки', hint: 'Сообщения от бота', icon: '📢' }
    ]
  },
  {
    title: 'Безопасность',
    icon: '🛡️',
    items: [{ href: '/admin/security', label: 'Аудит', hint: 'Логи и инциденты', icon: '📝' }]
  }
];

export default function AdminTabbedNav({ displayMode }: { displayMode?: 'mobile' | 'desktop' }): React.ReactElement | null {
  const pathname = usePathname();

  // Mobile navigation is now handled by AdminMobileHeader
  if (displayMode === 'mobile') {
    return null;
  }

  // Desktop Sidebar Navigation
  return (
    <nav className="admin-nav hidden lg:flex lg:flex-col">
      {ADMIN_NAV_SECTIONS.map((section) => (
        <div key={section.title} className="admin-nav-section">
          <p className="admin-nav-section__title flex items-center gap-2">
            <span>{section.icon}</span>
            <span>{section.title}</span>
          </p>
          <div className="admin-nav-links">
            {section.items.map((item) => {
              const baseHref = item.href.split('#')[0];
              const isActive =
                baseHref === '/admin' ? pathname === baseHref : pathname.startsWith(baseHref);
              return (
                <Link
                  key={item.href}
                  className={clsx('admin-nav-link', isActive && 'admin-nav-link--active')}
                  href={item.href}
                >
                  <span className="admin-nav-link__label">{item.label}</span>
                  {item.hint ? <span className="admin-nav-link__hint">{item.hint}</span> : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
