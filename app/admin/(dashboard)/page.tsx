/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import React from 'react';
import Link from 'next/link';

import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

type DashboardTransaction = {
  id: string;
  type: string;
  status: string;
  amount: number;
  currency: string;
  user: {
    username: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null;
  createdAt: Date;
  provider?: string | null;
};

type DashboardMetrics = {
  usersCount: number;
  promoCount: number;
  taskCount: number;
  totalAvailable: number;
  totalReserved: number;
  alertsCount: number;
  transactions: DashboardTransaction[];
};

async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const since = new Date(Date.now() - 24 * 3600_000);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any;

  const [usersCount, promoCount, taskCount, balances, transactions, alertsCount] = await Promise.all([
    db.user.count(),
    db.promoCode.count(),
    db.task.count({ where: { isActive: true } }),
    db.starBalance.aggregate({
      _sum: { available: true, reserved: true }
    }),
    db.transaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: {
        user: {
          select: {
            username: true,
            firstName: true,
            lastName: true
          }
        }
      }
    }),
    db.securityEvent.count({
      where: {
        createdAt: { gte: since },
        severity: { in: ['WARNING', 'CRITICAL'] }
      }
    })
  ]);

  return {
    usersCount,
    promoCount,
    taskCount,
    totalAvailable: balances._sum.available ?? 0,
    totalReserved: balances._sum.reserved ?? 0,
    transactions: transactions as DashboardTransaction[],
    alertsCount
  };
}

function formatUserName(user?: { username: string | null; firstName: string | null; lastName: string | null } | null) {
  if (!user) {
    return '—';
  }
  if (user.username) {
    return `@${user.username}`;
  }
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return full || 'Без имени';
}

export default async function AdminDashboardPage(): Promise<React.JSX.Element> {
  const isMockMode = !process.env.DATABASE_URL;

  const metrics: DashboardMetrics = isMockMode
    ? {
        usersCount: 1280,
        promoCount: 6,
        taskCount: 12,
        totalAvailable: 420_000,
        totalReserved: 56_000,
        alertsCount: 2,
        transactions: Array.from({ length: 6 }).map((_, index) => ({
          id: `mock-${index}`,
          type: 'DEPOSIT',
          status: 'COMPLETED',
          amount: 500 + index * 120,
          currency: 'STARS',
          provider: 'YOOKASSA',
          createdAt: new Date(),
          user: { username: `mock_user_${index}`, firstName: 'Demo', lastName: `#${index}` }
        }))
      }
    : await getDashboardMetrics().catch(() => ({
        usersCount: 0,
        promoCount: 0,
        taskCount: 0,
        totalAvailable: 0,
        totalReserved: 0,
        alertsCount: 0,
        transactions: []
      }));

  const quickSections = [
    {
      title: 'Игровой контент',
      description: 'Конфигурация рулеток, кейсов и ежедневных активностей.',
      links: [
        { href: '/admin/games', label: 'Игры' },
        { href: '/admin/tasks', label: 'Задания' }
      ]
    },
    {
      title: 'Экономика',
      description: 'Тарифы, курсы, статусы и реферальные награды.',
      links: [
        { href: '/admin/economy', label: 'Экономика' },
        { href: '/admin/statuses', label: 'Статусы' }
      ]
    },
    {
      title: 'Монетизация',
      description: 'Промокоды, пополнения и контроль финансовых операций.',
      links: [
        { href: '/admin/promo', label: 'Промокоды' },
        { href: '/admin/withdrawals', label: 'Выводы' },
        { href: '/admin/transactions', label: 'Транзакции' }
      ]
    },
    {
      title: 'Сообщество',
      description: 'Управление игроками и коммуникации через бота.',
      links: [
        { href: '/admin/users', label: 'Пользователи' },
        { href: '/admin/broadcasts', label: 'Рассылки' }
      ]
    },
    {
      title: 'Безопасность',
      description: 'Анализ инцидентов и событий аудита.',
      links: [{ href: '/admin/security', label: 'Журнал событий' }]
    }
  ] as const;

  const integrations = [
    {
      label: 'База данных',
      ok: Boolean(process.env.DATABASE_URL),
      hint: process.env.DATABASE_URL ? 'Подключена' : 'Нет подключения'
    },
    {
      label: 'YooKassa',
      ok: Boolean(process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY),
      hint: process.env.YOOKASSA_SHOP_ID ? 'Ключи заданы' : 'Требуется настройка'
    },
    {
      label: 'Telegram Bot',
      ok: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      hint: process.env.TELEGRAM_BOT_TOKEN ? 'Токен активен' : 'Нет токена'
    },
    {
      label: 'NFT интеграция',
      ok: Boolean(process.env.NFT_PROVIDER_API_KEY),
      hint: process.env.NFT_PROVIDER_API_KEY ? 'Ключ найден' : 'Опционально'
    }
  ] as const;

  return (
    <div className="space-y-5 sm:space-y-6 lg:space-y-8">
      {/* Hero Section */}
      <section className="admin-panel admin-panel--glass">
        <div className="flex flex-col gap-4 sm:gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1.5 sm:space-y-2">
            <p className="text-[9px] uppercase tracking-[0.28em] text-gold-300/70 sm:text-[10px] sm:tracking-[0.32em]">Dashboard</p>
            <h1 className="text-xl font-semibold text-white sm:text-2xl lg:text-3xl">Командный обзор</h1>
            <p className="text-xs text-platinum/60 sm:text-sm">
              Быстрые метрики платформы, состояние игр и монетизации.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex items-center gap-1.5 rounded-xl border border-gold-400/30 bg-gold-400/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-gold-200 transition hover:border-gold-300 sm:gap-2 sm:rounded-2xl sm:px-4 sm:text-[11px] sm:tracking-[0.18em]"
              href="/admin/games"
            >
              Конфигурация игр
              <span aria-hidden>→</span>
            </Link>
            <Link
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70 transition hover:text-white sm:gap-2 sm:rounded-2xl sm:px-4 sm:text-[11px] sm:tracking-[0.18em]"
              href="/admin/users"
            >
              Пользователи
            </Link>
          </div>
        </div>
        {isMockMode && (
          <div className="mt-4 rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-3 py-2 text-[11px] text-yellow-200 sm:mt-5 sm:rounded-2xl sm:px-4 sm:text-xs">
            ⚠️ База данных не настроена. Демо-данные.
          </div>
        )}
      </section>

      {/* KPI Cards - Better mobile grid */}
      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:gap-4 xl:grid-cols-3 2xl:grid-cols-6">
        {[
          { label: 'Пользователи', value: metrics.usersCount.toLocaleString('ru-RU'), icon: '👥' },
          { label: 'Задания', value: metrics.taskCount.toLocaleString('ru-RU'), icon: '📋' },
          { label: 'Промокоды', value: metrics.promoCount.toLocaleString('ru-RU'), icon: '🎫' },
          { label: 'Баланс', value: `${metrics.totalAvailable.toLocaleString('ru-RU')} ★`, icon: '💰' },
          { label: 'Резерв', value: `${metrics.totalReserved.toLocaleString('ru-RU')} ★`, icon: '🔒' },
          { label: 'Инциденты', value: metrics.alertsCount.toLocaleString('ru-RU'), icon: '⚠️' }
        ].map((card) => (
          <div key={card.label} className="admin-kpi">
            <div className="flex items-start justify-between">
              <p className="text-[9px] uppercase tracking-[0.18em] text-platinum/50 sm:text-[10px] sm:tracking-[0.22em]">{card.label}</p>
              <span className="text-base sm:hidden">{card.icon}</span>
            </div>
            <p className="mt-1.5 text-lg font-semibold text-white sm:mt-2 sm:text-2xl">{card.value}</p>
            <p className="mt-2 hidden text-sm text-platinum/40 sm:mt-3 sm:block">{card.icon}</p>
          </div>
        ))}
      </section>

      {/* Quick Sections + Integrations */}
      <section className="grid gap-4 sm:gap-5 lg:gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="admin-panel">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[9px] uppercase tracking-[0.18em] text-platinum/40 sm:text-[10px] sm:tracking-[0.22em]">Быстрые разделы</p>
              <h2 className="text-base font-semibold text-white sm:text-lg">Сценарии управления</h2>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:mt-5 sm:grid-cols-2 sm:gap-4">
            {quickSections.map((section) => (
              <div key={section.title} className="rounded-xl border border-white/10 bg-white/5 p-3 sm:rounded-2xl sm:p-4">
                <p className="text-[9px] uppercase tracking-[0.14em] text-platinum/50 sm:text-[10px] sm:tracking-[0.18em]">{section.title}</p>
                <h3 className="mt-1.5 text-sm font-semibold text-white sm:mt-2 sm:text-base">{section.title}</h3>
                <p className="mt-1.5 text-[11px] text-platinum/60 sm:mt-2 sm:text-xs">{section.description}</p>
                <div className="mt-3 flex flex-wrap gap-1.5 sm:mt-4 sm:gap-2">
                  {section.links.map((link) => (
                    <Link
                      key={link.href}
                      className="inline-flex items-center gap-1.5 rounded-full border border-gold-400/30 bg-gold-400/10 px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-gold-200 transition hover:border-gold-300 sm:gap-2 sm:px-3 sm:text-[10px] sm:tracking-[0.2em]"
                      href={link.href}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="admin-panel admin-panel--glass">
          <p className="text-[9px] uppercase tracking-[0.18em] text-platinum/50 sm:text-[10px] sm:tracking-[0.22em]">Состояние платформы</p>
          <h2 className="mt-1.5 text-base font-semibold text-white sm:mt-2 sm:text-lg">Интеграции и сервисы</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:grid-cols-1 sm:gap-3">
            {integrations.map((integration) => (
              <div
                key={integration.label}
                className={`rounded-xl border px-3 py-2.5 text-sm sm:rounded-2xl sm:px-4 sm:py-3 ${
                  integration.ok
                    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
                    : 'border-red-400/30 bg-red-400/10 text-red-100'
                }`}
              >
                <p className="text-[9px] uppercase tracking-[0.14em] opacity-70 sm:text-[10px] sm:tracking-[0.18em]">{integration.label}</p>
                <p className="mt-0.5 text-sm font-semibold sm:mt-1 sm:text-base">
                  {integration.ok ? 'Активно' : 'Нет'}
                </p>
                <p className="mt-0.5 hidden text-[10px] uppercase tracking-[0.18em] opacity-60 sm:mt-1 sm:block">{integration.hint}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Transactions Section */}
      <section className="admin-panel">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[9px] uppercase tracking-[0.18em] text-platinum/50 sm:text-[10px] sm:tracking-[0.22em]">Финансы</p>
            <h2 className="text-base font-semibold text-white sm:text-lg">Последние транзакции</h2>
          </div>
          <Link className="text-[10px] uppercase tracking-[0.18em] text-gold-200 sm:text-xs sm:tracking-[0.22em]" href="/admin/transactions">
            Все →
          </Link>
        </div>

        {/* Desktop Table */}
        <div className="mt-4 hidden lg:block admin-table-wrapper">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5 text-left text-[10px] uppercase tracking-[0.22em] text-platinum/50">
                <th className="px-5 py-3">Пользователь</th>
                <th className="px-5 py-3">Тип</th>
                <th className="px-5 py-3">Сумма</th>
                <th className="px-5 py-3">Статус</th>
                <th className="px-5 py-3">Дата</th>
              </tr>
            </thead>
            <tbody>
              {metrics.transactions.map((transaction) => (
                <tr key={transaction.id} className="border-b border-white/5 last:border-none">
                  <td className="px-5 py-3 text-white">{formatUserName(transaction.user)}</td>
                  <td className="px-5 py-3 text-platinum/70">{transaction.type}</td>
                  <td className="px-5 py-3 font-semibold text-white">
                    {transaction.amount.toLocaleString('ru-RU')} {transaction.currency}
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-white/70">
                      {transaction.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-platinum/60">
                    {new Date(transaction.createdAt).toLocaleString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </td>
                </tr>
              ))}
              {metrics.transactions.length === 0 && (
                <tr>
                  <td className="px-5 py-6 text-center text-platinum/60" colSpan={5}>
                    Транзакции пока не зафиксированы.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 space-y-3 lg:hidden">
          {metrics.transactions.map((transaction) => (
            <div key={transaction.id} className="admin-list-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-white">{formatUserName(transaction.user)}</p>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-platinum/50">{transaction.type}</p>
                </div>
                <span className="inline-flex rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[9px] uppercase tracking-[0.16em] text-white/70">
                  {transaction.status}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-white/5 pt-3 text-xs text-platinum/60">
                <span className="text-sm font-semibold text-white">
                  {transaction.amount.toLocaleString('ru-RU')} {transaction.currency}
                </span>
                <span>
                  {new Date(transaction.createdAt).toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
            </div>
          ))}
          {metrics.transactions.length === 0 && (
            <div className="admin-list-card text-center text-sm text-platinum/60">
              Транзакции пока не зафиксированы.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
