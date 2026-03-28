/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import React from 'react';

export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/prisma';
import { adjustUserBalance, toggleUserBan, updateUserStatus } from './actions';

type AdminUser = {
  id: string;
  telegramId: bigint;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  isBanned: boolean;
  status: 'STANDARD' | 'PREMIUM';
  statusExpiresAt: Date | null;
  balances: {
    available: number;
    reserved: number;
  } | null;
};

async function getUsers(query?: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any;
  const trimmed = query?.trim().replace(/^@/, '') ?? '';
  const filters: Record<string, unknown>[] = [];

  if (trimmed) {
    filters.push({ username: { contains: trimmed, mode: 'insensitive' } });
    if (/^\d+$/.test(trimmed)) {
      try {
        filters.push({ telegramId: BigInt(trimmed) });
      } catch {
        // Ignore invalid bigint.
      }
    }
  }

  const users = (await db.user.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    where: filters.length ? { OR: filters } : undefined,
    include: {
      balances: true
    }
  })) as unknown as AdminUser[];

  return users.map((user) => ({
    ...user,
    balances: user.balances
      ? { available: Number(user.balances.available), reserved: Number(user.balances.reserved) }
      : null
  }));
}

export default async function AdminUsersPage({
  searchParams
}: {
  searchParams?: { q?: string };
}): Promise<React.JSX.Element> {
  const isMockMode = !process.env.DATABASE_URL;
  const query = searchParams?.q?.trim() ?? '';

  const users: AdminUser[] = isMockMode
    ? (Array.from({ length: 6 }).map((_, index) => ({
        id: `mock-${index}`,
        telegramId: BigInt(100000 + index),
        firstName: 'Demo',
        lastName: `User ${index}`,
        username: `demo_user_${index}`,
        isBanned: index === 2,
        status: index % 3 === 0 ? 'PREMIUM' : 'STANDARD',
        statusExpiresAt: index % 3 === 0 ? new Date(Date.now() + 7 * 24 * 3600_000) : null,
        balances: {
          available: 1000 + index * 250,
          reserved: 120 + index * 20
        }
      })) as unknown as AdminUser[])
        .filter((user) =>
          query ? user.username?.toLowerCase().includes(query.replace(/^@/, '').toLowerCase()) : true
        )
    : await getUsers(query).catch(() => []);

  return (
    <div className="space-y-4 sm:space-y-5 lg:space-y-6">
      {/* Header */}
      <header className="space-y-1.5 sm:space-y-2">
        <p className="text-[9px] uppercase tracking-[0.16em] text-gold-400/60 sm:text-[10px] sm:tracking-[0.2em]">Пользователи</p>
        <h1 className="text-xl font-bold text-platinum sm:text-2xl lg:text-3xl">Управление игроками</h1>
        <p className="text-[11px] text-platinum/60 sm:text-xs lg:text-sm">
          Профили, балансы, блокировки и активность пользователей.
        </p>
        {isMockMode && (
          <div className="rounded-lg border border-yellow-400/30 bg-yellow-400/10 px-3 py-2 sm:rounded-xl">
            <p className="text-[11px] text-yellow-300 sm:text-xs">
              ⚠️ Демо-режим. Формы отключены.
            </p>
          </div>
        )}
      </header>

      <section className="space-y-3 sm:space-y-4">
        {/* Search Form */}
        <form action="/admin/users" method="get" className="space-y-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2 sm:space-y-0">
          <label className="block text-[10px] uppercase tracking-[0.16em] text-gold-400/60 sm:text-xs sm:tracking-[0.2em]">Поиск</label>
          <div className="flex w-full items-center gap-2 sm:max-w-md">
            <input
              name="q"
              defaultValue={query}
              placeholder="@username или ID"
              className="h-11 w-full rounded-lg border border-blue-400/30 bg-blue-900/30 px-3 text-sm text-white placeholder:text-blue-200/50 sm:h-10 sm:rounded-xl"
            />
            <button
              type="submit"
              className="h-11 rounded-lg border border-gold-400/30 bg-gold-500/10 px-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-200 sm:h-10 sm:rounded-xl sm:text-xs sm:tracking-[0.2em]"
            >
              Найти
            </button>
          </div>
        </form>
        {/* Десктопная таблица */}
        <div className="hidden lg:block overflow-x-auto rounded-xl border border-blue-400/30 bg-blue-900/30 backdrop-blur-sm">
          <table className="w-full table-auto text-sm">
            <thead>
              <tr className="border-b border-blue-400/20 bg-blue-800/40 text-left text-xs uppercase tracking-[0.16em]">
                <th className="px-3 py-3 font-semibold text-blue-200">Пользователь</th>
                <th className="px-3 py-3 font-semibold text-blue-200">Telegram ID</th>
                <th className="px-3 py-3 font-semibold text-blue-200">Баланс</th>
                <th className="px-3 py-3 font-semibold text-blue-200">Резерв</th>
                <th className="px-3 py-3 font-semibold text-blue-200">Состояние</th>
                <th className="px-3 py-3 font-semibold text-blue-200">Действия</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const balance = user.balances;
                return (
                <tr key={user.id} className="border-b border-blue-400/10 bg-blue-900/20 hover:bg-blue-800/30 transition-colors last:border-none">
                  <td className="px-3 py-3">
                    <p className="font-medium text-white">
                      {[user.firstName, user.lastName].filter(Boolean).join(' ') || 'Без имени'}
                    </p>
                    <p className="text-xs text-blue-200/80">
                      {user.username ? `@${user.username}` : '—'}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-xs text-blue-200">{user.telegramId.toString()}</td>
                  <td className="px-3 py-3 font-semibold text-white">{balance?.available ?? 0} ★</td>
                  <td className="px-3 py-3 font-semibold text-white">{balance?.reserved ?? 0} ★</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1 text-xs uppercase tracking-[0.12em]">
                      <span
                        className={`inline-flex w-max px-2 py-0.5 font-semibold ${
                          user.status === 'PREMIUM'
                            ? 'bg-indigo-500/20 text-indigo-200'
                            : 'bg-blue-500/20 text-blue-200'
                        }`}
                      >
                        {user.status === 'PREMIUM' ? 'Premium' : 'Standard'}
                      </span>
                      {user.statusExpiresAt ? (
                        <span className="text-[10px] text-blue-300/70">
                          до {new Date(user.statusExpiresAt).toLocaleDateString('ru-RU')}
                        </span>
                      ) : null}
                      <span
                        className={`inline-flex w-max px-2 py-0.5 text-[11px] font-semibold ${
                          user.isBanned
                            ? 'bg-red-500/20 text-red-200'
                            : 'bg-emerald-500/20 text-emerald-200'
                        }`}
                      >
                        {user.isBanned ? 'Заблокирован' : 'Активен'}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-2 text-xs">
                      <form action={adjustUserBalance} className="flex items-center gap-2">
                        <input type="hidden" name="userId" value={user.id} />
                        <input
                          className="flex-1 rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-xs text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                          name="amount"
                          placeholder="+100"
                          type="number"
                          required
                          disabled={isMockMode}
                        />
                        <button
                          className="rounded-lg border border-gold-400/50 bg-gold-400/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-gold-300 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                          type="submit"
                          disabled={isMockMode}
                        >
                          Обновить
                        </button>
                      </form>
                      <form action={updateUserStatus} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="userId" value={user.id} />
                        <select
                          className="flex-1 rounded-lg border border-blue-400/30 bg-blue-500/20 px-2 py-2 text-[10px] uppercase tracking-[0.12em] text-white outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                          name="status"
                          defaultValue={user.status}
                          disabled={isMockMode}
                        >
                          <option value="STANDARD">Standard</option>
                          <option value="PREMIUM">Premium</option>
                        </select>
                        <input
                          className="w-20 rounded-lg border border-blue-400/30 bg-blue-500/20 px-2 py-2 text-[10px] text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                          name="durationDays"
                          type="number"
                          min={0}
                          placeholder="Дней"
                          disabled={isMockMode}
                        />
                        <button
                          className="rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                          type="submit"
                          disabled={isMockMode}
                        >
                          Статус
                        </button>
                      </form>
                      <form action={toggleUserBan}>
                        <input type="hidden" name="userId" value={user.id} />
                        <input type="hidden" name="ban" value={user.isBanned ? 'false' : 'true'} />
                        <button
                          className={`w-full rounded-lg border px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
                            user.isBanned
                              ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300'
                              : 'border-red-400/50 bg-red-400/10 text-red-200'
                          }`}
                          type="submit"
                          disabled={isMockMode}
                        >
                          {user.isBanned ? 'Разблокировать' : 'Заблокировать'}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-blue-200" colSpan={6}>
                  Пользователи не найдены. Откройте мини-приложение, чтобы создать первые аккаунты.
                </td>
              </tr>
            )}
          </tbody>
          </table>
        </div>

        {/* Мобильные карточки */}
        <div className="lg:hidden space-y-3">
          {users.map((user) => {
            const balance = user.balances;
            return (
              <article key={user.id} className="rounded-xl border border-blue-400/30 bg-blue-900/30 backdrop-blur-sm p-4 space-y-3">
                <div className="flex items-start justify-between pb-2 border-b border-white/5">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-white">
                    {[user.firstName, user.lastName].filter(Boolean).join(' ') || 'Без имени'}
                    </p>
                    <p className="text-[10px] text-blue-200/80 mt-0.5">
                      {user.username ? `@${user.username}` : '—'}
                    </p>
                    <p className="text-[9px] text-blue-300/70 mt-1">ID: {user.telegramId.toString()}</p>
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    <span
                      className={`inline-flex px-2 py-0.5 text-[9px] uppercase tracking-[0.1em] font-semibold ${
                        user.status === 'PREMIUM'
                          ? 'bg-indigo-500/20 text-indigo-200'
                          : 'bg-blue-500/20 text-blue-200'
                      }`}
                    >
                      {user.status === 'PREMIUM' ? 'Premium' : 'Standard'}
                    </span>
                    <span
                      className={`inline-flex px-2 py-0.5 text-[9px] uppercase tracking-[0.1em] font-semibold ${
                        user.isBanned
                          ? 'bg-red-500/20 text-red-200'
                          : 'bg-emerald-500/20 text-emerald-200'
                      }`}
                    >
                      {user.isBanned ? 'Заблокирован' : 'Активен'}
                    </span>
                  </div>
                </div>
                <div className="admin-list-card__row">
                  <span className="admin-list-card__label">Telegram ID</span>
                  <span className="text-xs text-platinum/60">{user.telegramId.toString()}</span>
                </div>
                <div className="admin-list-card__row">
                  <span className="admin-list-card__label">Баланс</span>
                  <span className="font-semibold text-platinum">
                    {balance?.available ?? 0} ★
                  </span>
                </div>
                <div className="admin-list-card__row">
                  <span className="admin-list-card__label">Резерв</span>
                  <span className="text-platinum/80">{balance?.reserved ?? 0} ★</span>
                </div>
                <div className="admin-list-card__row">
                  <span className="admin-list-card__label">Статус</span>
                  <div className="flex flex-col items-end gap-1 text-xs">
                    <span
                      className={`inline-flex w-max px-2 py-0.5 font-semibold ${
                        user.status === 'PREMIUM'
                          ? 'bg-indigo-500/20 text-indigo-200'
                          : 'bg-blue-500/20 text-blue-200'
                      }`}
                    >
                      {user.status}
                    </span>
                    {user.statusExpiresAt ? (
                      <span className="text-[11px] text-platinum/40">
                        до {new Date(user.statusExpiresAt).toLocaleDateString('ru-RU')}
                      </span>
                    ) : null}
                    <span
                      className={`inline-flex w-max px-2 py-0.5 text-[11px] font-semibold ${
                        user.isBanned
                          ? 'bg-red-500/20 text-red-200'
                          : 'bg-emerald-500/20 text-emerald-200'
                      }`}
                    >
                      {user.isBanned ? 'Заблокирован' : 'Активен'}
                    </span>
                  </div>
                </div>
                <div className="grid gap-3 pt-2 text-xs">
                  <form action={adjustUserBalance} className="grid gap-2">
                    <input type="hidden" name="userId" value={user.id} />
                    <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.18em] text-platinum/40">
                      Коррекция баланса
                      <div className="flex gap-2">
                        <input
                          className="w-full rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-3 py-2 text-xs text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                          name="amount"
                          placeholder="+100"
                          type="number"
                          required
                          disabled={isMockMode}
                        />
                        <button
                          className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-gold-300 transition hover:text-gold-100 disabled:cursor-not-allowed disabled:opacity-40"
                          type="submit"
                          disabled={isMockMode}
                        >
                          OK
                        </button>
                      </div>
                    </label>
                  </form>

                  <form action={updateUserStatus} className="grid gap-2">
                    <input type="hidden" name="userId" value={user.id} />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <select
                        className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-3 py-2 text-xs uppercase tracking-[0.14em] text-white outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                        name="status"
                        defaultValue={user.status}
                        disabled={isMockMode}
                      >
                        <option value="STANDARD">Standard</option>
                        <option value="PREMIUM">Premium</option>
                      </select>
                      <input
                        className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-3 py-2 text-xs text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                        name="durationDays"
                        type="number"
                        min={0}
                        placeholder="Дней"
                        disabled={isMockMode}
                      />
                    </div>
                    <button
                      className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-platinum/80 transition hover:text-gold-100 disabled:cursor-not-allowed disabled:opacity-40"
                      type="submit"
                      disabled={isMockMode}
                    >
                      Обновить статус
                    </button>
                  </form>

                  <form action={toggleUserBan} className="grid">
                    <input type="hidden" name="userId" value={user.id} />
                    <input type="hidden" name="ban" value={user.isBanned ? 'false' : 'true'} />
                    <button
                      className={`w-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                        user.isBanned
                          ? 'text-emerald-300 hover:text-emerald-200'
                          : 'text-red-200 hover:text-red-100'
                      } disabled:cursor-not-allowed disabled:opacity-40`}
                      type="submit"
                      disabled={isMockMode}
                    >
                      {user.isBanned ? 'Разблокировать' : 'Заблокировать'}
                    </button>
                  </form>
                </div>
              </article>
            );
          })}
          {users.length === 0 && (
            <div className="rounded-xl border border-blue-400/30 bg-blue-900/30 backdrop-blur-sm p-6 text-center">
              <p className="text-sm text-blue-200">
                Пользователи не найдены. Откройте мини-приложение, чтобы создать первые аккаунты.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
