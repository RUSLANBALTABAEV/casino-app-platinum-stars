/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
import React from 'react';

export const runtime = 'nodejs';

import { prisma } from '@/lib/prisma';

type SearchParamsPromise = Promise<Record<string, string | string[] | undefined>>;
type AdminTransaction = Awaited<ReturnType<typeof getTransactions>>[number];

async function getTransactions(status?: string, provider?: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any;

  return await db.transaction.findMany({
    where: {
      status: status && status !== 'ALL' ? status : undefined,
      provider: provider && provider !== 'ALL' ? provider : undefined
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      user: {
        select: {
          username: true,
          firstName: true,
          lastName: true
        }
      }
    }
  });
}

function formatUser(user?: {
  username: string | null;
  firstName: string | null;
  lastName: string | null;
}) {
  if (!user) {
    return '—';
  }
  if (user.username) {
    return `@${user.username}`;
  }
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return full || 'Без имени';
}

export default async function AdminTransactionsPage({
  searchParams
}: {
  searchParams: SearchParamsPromise;
}): Promise<React.JSX.Element> {
  const resolvedParams = await searchParams;
  const statusValue = resolvedParams.status;
  const providerValue = resolvedParams.provider;
  const statusParam =
    typeof statusValue === 'string' && statusValue.length > 0 ? statusValue : 'ALL';
  const providerParam =
    typeof providerValue === 'string' && providerValue.length > 0 ? providerValue : 'ALL';
  const isMockMode = !process.env.DATABASE_URL;

  const transactions: AdminTransaction[] = isMockMode
    ? (Array.from({ length: 8 }).map((_, index) => ({
        id: `tx-mock-${index}`,
        createdAt: new Date(Date.now() - index * 3600_000),
        amount: 300 + index * 75,
        currency: 'RUB',
        status: index % 3 === 0 ? 'PENDING' : 'COMPLETED',
        provider: index % 2 === 0 ? 'YOOKASSA' : 'TELEGRAM_STARS',
        type: index % 2 === 0 ? 'DEPOSIT' : 'WITHDRAWAL',
        user: {
          username: `mock_user_${index}`,
          firstName: 'Demo',
          lastName: `#${index}`
        }
      })) as unknown as AdminTransaction[])
    : await getTransactions(statusParam, providerParam).catch(() => []);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.24em] text-gold-400/70">Финансы</p>
        <h1 className="text-3xl font-semibold text-platinum">Журнал транзакций</h1>
        <p className="text-sm text-platinum/60">
          Анализируйте поступления и списания, ищите аномалии и контролируйте выплаты игрокам.
        </p>
        {isMockMode && (
          <p className="py-2 text-xs text-yellow-300">
            Подключение к базе данных не настроено. Отображены демонстрационные транзакции, фильтры
            работают условно.
          </p>
        )}
      </header>

      <section className="space-y-4 text-xs uppercase tracking-[0.12em] text-platinum/70">
        <form className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            Статус
            <select
              className="border-b border-platinum/20 pb-1 px-3 py-2 text-xs text-platinum outline-none transition focus:border-gold-400"
              defaultValue={statusParam}
              name="status"
              disabled={isMockMode}
            >
              {['ALL', 'PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Провайдер
            <select
              className="border-b border-platinum/20 pb-1 px-3 py-2 text-xs text-platinum outline-none transition focus:border-gold-400"
              defaultValue={providerParam}
              name="provider"
              disabled={isMockMode}
            >
              {['ALL', 'YOOKASSA', 'TELEGRAM_STARS', 'MANUAL'].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <button
            className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-gold-300 transition hover:text-gold-100"
            type="submit"
            disabled={isMockMode}
          >
            Фильтровать
          </button>
        </form>
      </section>

      <section className="space-y-6">
        <div className="admin-table-wrapper">
          <table className="w-full table-auto text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-[0.16em] text-platinum/50">
              <th className="px-3 py-2 font-semibold text-platinum/70">Дата</th>
              <th className="px-3 py-2 font-semibold text-platinum/70">Пользователь</th>
              <th className="px-3 py-2 font-semibold text-platinum/70">Тип</th>
              <th className="px-3 py-2 font-semibold text-platinum/70">Провайдер</th>
              <th className="px-3 py-2 font-semibold text-platinum/70">Сумма</th>
              <th className="px-3 py-2 font-semibold text-platinum/70">Статус</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction) => (
              <tr key={transaction.id} className="border-b border-white/5 text-platinum/80 last:border-none">
                <td className="px-3 py-2">
                  {new Date(transaction.createdAt).toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </td>
                <td className="px-3 py-2">{formatUser(transaction.user)}</td>
                <td className="px-3 py-2">{transaction.type}</td>
                <td className="px-3 py-2">{transaction.provider}</td>
                <td className="px-3 py-2">
                  {transaction.amount.toLocaleString('ru-RU')} {transaction.currency}
                </td>
                <td className="px-3 py-2">{transaction.status}</td>
              </tr>
            ))}
            {transactions.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-center text-platinum/50" colSpan={6}>
                  Транзакции не найдены.
                </td>
              </tr>
            )}
          </tbody>
          </table>
        </div>

        <div className="admin-list-mobile">
          {transactions.map((transaction) => (
            <article key={transaction.id} className="admin-list-card">
              <div className="admin-list-card__row">
                <span className="admin-list-card__label">Дата</span>
                <span className="text-sm text-platinum/80">
                  {new Date(transaction.createdAt).toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
              <div className="admin-list-card__row">
                <span className="admin-list-card__label">Пользователь</span>
                <span className="text-sm text-platinum/70">{formatUser(transaction.user)}</span>
              </div>
              <div className="admin-list-card__row">
                <span className="admin-list-card__label">Тип</span>
                <span className="font-semibold text-platinum">{transaction.type}</span>
              </div>
              <div className="admin-list-card__row">
                <span className="admin-list-card__label">Провайдер</span>
                <span className="text-platinum/70">{transaction.provider}</span>
              </div>
              <div className="admin-list-card__row">
                <span className="admin-list-card__label">Сумма</span>
                <span className="font-semibold text-platinum">
                  {transaction.amount.toLocaleString('ru-RU')} {transaction.currency}
                </span>
              </div>
              <div className="admin-list-card__row">
                <span className="admin-list-card__label">Статус</span>
                <span className="inline-flex px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-platinum/80">
                  {transaction.status}
                </span>
              </div>
            </article>
          ))}
          {transactions.length === 0 && (
            <div className="admin-list-card">
              <p className="text-sm text-platinum/60">Транзакции не найдены.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
