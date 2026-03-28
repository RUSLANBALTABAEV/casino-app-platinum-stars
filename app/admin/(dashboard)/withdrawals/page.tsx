import React from 'react';

export const runtime = 'nodejs';

import { listWithdrawals, type WithdrawalWithRelations } from '@/lib/services/withdrawal';
import { WithdrawalStatus, WithdrawalType } from '@/types/withdrawal-enums';
import {
  approveWithdrawalAction,
  markWithdrawalSentAction,
  rejectWithdrawalAction
} from './actions';

type SearchParamsPromise = Promise<Record<string, string | string[] | undefined>>;

const STATUS_OPTIONS = ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'SENT'] as const;
const TYPE_OPTIONS = ['ALL', 'STARS', 'NFT_GIFT'] as const;

type StatusOption = typeof STATUS_OPTIONS[number];
type TypeOption = typeof TYPE_OPTIONS[number];

function formatUser(user?: { username: string | null; firstName: string | null; lastName: string | null } | null) {
  if (!user) {
    return '—';
  }
  if (user.username) {
    return `@${user.username}`;
  }
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return full || 'Без имени';
}

export default async function AdminWithdrawalsPage({
  searchParams
}: {
  searchParams: SearchParamsPromise;
}): Promise<React.JSX.Element> {
  const resolvedParams = await searchParams;
  const statusParamRaw = resolvedParams.status;
  const typeParamRaw = resolvedParams.type;

  const statusParam: StatusOption =
    typeof statusParamRaw === 'string' && (STATUS_OPTIONS as readonly string[]).includes(statusParamRaw)
      ? (statusParamRaw as StatusOption)
      : 'ALL';
  const typeParam: TypeOption =
    typeof typeParamRaw === 'string' && (TYPE_OPTIONS as readonly string[]).includes(typeParamRaw)
      ? (typeParamRaw as TypeOption)
      : 'ALL';

  const statusFilter: WithdrawalStatus | undefined = statusParam === 'ALL' ? undefined : (statusParam as WithdrawalStatus);
  const typeFilter: WithdrawalType | undefined = typeParam === 'ALL' ? undefined : (typeParam as WithdrawalType);

  let withdrawals: WithdrawalWithRelations[] = [];
  try {
    withdrawals = await listWithdrawals({
      status: statusFilter,
      type: typeFilter
    });
  } catch {
    withdrawals = [];
  }
  const isDatabaseAvailable = Boolean(process.env.DATABASE_URL);

  return (
    <div className="space-y-4 sm:space-y-5 lg:space-y-8">
      {/* Header */}
      <header className="space-y-1.5 sm:space-y-2">
        <p className="text-[9px] uppercase tracking-[0.18em] text-gold-400/70 sm:text-xs sm:tracking-[0.24em]">Вывод средств</p>
        <h1 className="text-xl font-semibold text-platinum sm:text-2xl lg:text-3xl">Заявки пользователей</h1>
        <p className="text-[11px] text-platinum/60 sm:text-sm">
          Управляйте выводом: одобряйте, отклоняйте и фиксируйте отправку.
        </p>
        {!isDatabaseAvailable && (
          <p className="py-1.5 text-[11px] text-yellow-200 sm:py-2 sm:text-xs">
            ⚠️ Нет подключения к базе данных.
          </p>
        )}
      </header>

      {/* Filters */}
      <section className="space-y-3 text-xs uppercase tracking-[0.12em] text-platinum/70 sm:space-y-4">
        <form className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
          <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            <span className="text-[10px] sm:text-xs">Статус</span>
            <select
              className="h-10 rounded-lg border border-platinum/20 bg-white/5 px-3 py-2 text-xs text-platinum outline-none transition focus:border-gold-400 sm:h-auto sm:rounded-none sm:border-0 sm:border-b sm:bg-transparent"
              defaultValue={statusParam}
              name="status"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            <span className="text-[10px] sm:text-xs">Тип</span>
            <select
              className="h-10 rounded-lg border border-platinum/20 bg-white/5 px-3 py-2 text-xs text-platinum outline-none transition focus:border-gold-400 sm:h-auto sm:rounded-none sm:border-0 sm:border-b sm:bg-transparent"
              defaultValue={typeParam}
              name="type"
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <button
            className="col-span-2 mt-1 h-10 rounded-lg border border-gold-400/30 bg-gold-400/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-gold-300 transition hover:text-gold-100 sm:col-span-1 sm:mt-0 sm:h-auto sm:border-0 sm:bg-transparent"
            type="submit"
          >
            Фильтровать
          </button>
        </form>
      </section>

      <section className="space-y-4 sm:space-y-5 lg:space-y-6">
        {/* Desktop Table */}
        <div className="admin-table-wrapper hidden lg:block">
          <table className="w-full table-auto text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-[0.16em] text-platinum/50">
              <th className="px-3 py-2 font-semibold text-platinum/70">Дата</th>
              <th className="px-3 py-2 font-semibold text-platinum/70">Пользователь</th>
              <th className="px-3 py-2 font-semibold text-platinum/70">Сумма</th>
              <th className="px-3 py-2 font-semibold text-platinum/70">Тип</th>
              <th className="px-3 py-2 font-semibold text-platinum/70">Реквизиты</th>
              <th className="px-3 py-2 font-semibold text-platinum/70">Комментарий</th>
              <th className="px-3 py-2 font-semibold text-platinum/70">Статус</th>
              <th className="px-3 py-2 font-semibold text-platinum/70">Действия</th>
            </tr>
          </thead>
          <tbody>
            {withdrawals.map((withdrawalItem) => {
              const entry: WithdrawalWithRelations = withdrawalItem;
              const createdAt =
                entry.createdAt instanceof Date
                  ? entry.createdAt
                  : new Date(entry.createdAt);
              const user = entry.user ?? null;
              const processedByUser = entry.processedBy ?? null;
              const dateFormatOptions: Intl.DateTimeFormatOptions = {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              };
              const createdAtLabel = createdAt.toLocaleString('ru-RU', dateFormatOptions);
              const formattedUser = formatUser(user);
              let processedByLabel: string | null = null;
              if (processedByUser) {
                if (processedByUser.username) {
                  processedByLabel = `@${processedByUser.username}`;
                } else {
                  processedByLabel = formatUser(processedByUser);
                }
              }

              return (
                <tr key={entry.id} className="border-b border-white/5 text-platinum/80 last:border-none">
                  <td className="px-3 py-2">
                    {createdAtLabel}
                  </td>
                  <td className="px-3 py-2">{formattedUser}</td>
                  <td className="px-3 py-2">
                    {entry.amount.toLocaleString('ru-RU')} {entry.currency}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] ${
                        entry.type === 'NFT_GIFT'
                          ? 'bg-indigo-500/20 text-indigo-100'
                          : 'bg-emerald-500/20 text-emerald-100'
                      }`}
                    >
                      {entry.type === 'NFT_GIFT' ? 'NFT' : 'Звёзды'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-platinum/50 break-words">{entry.destination}</td>
                  <td className="px-3 py-2 text-xs text-platinum/50 break-words max-w-[200px]">
                    {entry.comment ? (
                      <span className="text-gold-300">{entry.comment}</span>
                    ) : (
                      <span className="text-platinum/30">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex px-2 py-0.5 text-[11px] uppercase tracking-[0.12em] ${
                        entry.status === 'SENT'
                          ? 'bg-emerald-500/20 text-emerald-100'
                          : entry.status === 'REJECTED'
                            ? 'bg-red-500/20 text-red-200'
                            : entry.status === 'APPROVED'
                              ? 'bg-indigo-500/20 text-indigo-200'
                              : 'bg-yellow-500/20 text-yellow-100'
                      }`}
                    >
                      {entry.status}
                    </span>
                    {processedByLabel ? (
                      <p className="text-[11px] uppercase tracking-[0.16em] text-platinum/40">
                        {processedByLabel}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-2 text-xs">
                      {(entry.status === 'PENDING' || entry.status === 'APPROVED') && (
                        <form action={approveWithdrawalAction}>
                          <input type="hidden" name="withdrawalId" value={entry.id} />
                          <button
                            className="w-full px-3 py-2 font-semibold uppercase tracking-[0.12em] text-emerald-200 transition hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                            type="submit"
                            disabled={!isDatabaseAvailable}
                          >
                            Одобрить
                          </button>
                        </form>
                      )}
                      {entry.status !== 'REJECTED' && entry.status !== 'SENT' && (
                        <form action={rejectWithdrawalAction} className="flex flex-col gap-1">
                          <input type="hidden" name="withdrawalId" value={entry.id} />
                          <textarea
                            className="border-b border-platinum/20 pb-1 px-3 py-2 text-xs text-platinum outline-none transition focus:border-gold-400 disabled:cursor-not-allowed disabled:opacity-40"
                            name="reason"
                            placeholder="Причина отказа (опционально)"
                            rows={2}
                            disabled={!isDatabaseAvailable}
                          />
                          <button
                            className="px-3 py-2 font-semibold uppercase tracking-[0.12em] text-red-200 transition hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                            type="submit"
                            disabled={!isDatabaseAvailable}
                          >
                            Отклонить
                          </button>
                        </form>
                      )}
                      {(entry.status === 'APPROVED' || entry.status === 'PENDING') && (
                        <form action={markWithdrawalSentAction} className="flex flex-col gap-1">
                          <input type="hidden" name="withdrawalId" value={entry.id} />
                          <input
                            className="border-b border-platinum/20 pb-1 px-3 py-2 text-xs text-platinum outline-none transition focus:border-gold-400 disabled:cursor-not-allowed disabled:opacity-40"
                            name="txLink"
                            placeholder="Ссылка на транзакцию / примечание"
                            disabled={!isDatabaseAvailable}
                          />
                          <button
                            className="px-3 py-2 font-semibold uppercase tracking-[0.12em] text-gold-200 transition hover:text-gold-100 disabled:cursor-not-allowed disabled:opacity-40"
                            type="submit"
                            disabled={!isDatabaseAvailable}
                          >
                            Отметить отправку
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {withdrawals.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-center text-platinum/50" colSpan={8}>
                  Заявки не найдены. Пользователи ещё не делали запрос на вывод средств.
                </td>
              </tr>
            )}
          </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="grid gap-3 lg:hidden">
          {withdrawals.map((entry) => {
            const createdAt =
              entry.createdAt instanceof Date
                ? entry.createdAt
                : new Date(entry.createdAt as unknown as string);
            const dateFormatOptions: Intl.DateTimeFormatOptions = {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            };
            const createdAtLabel = createdAt.toLocaleString('ru-RU', dateFormatOptions);
            const formattedUser = formatUser(entry.user ?? null);
            const processedByLabel = entry.processedBy
              ? entry.processedBy.username
                ? `@${entry.processedBy.username}`
                : formatUser(entry.processedBy)
              : null;

            return (
              <article key={entry.id} className="admin-list-card">
                <div className="admin-list-card__row">
                  <span className="admin-list-card__label">Дата</span>
                  <span className="text-sm text-platinum">{createdAtLabel}</span>
                </div>
                <div className="admin-list-card__row">
                  <span className="admin-list-card__label">Пользователь</span>
                  <span className="text-sm text-platinum/80">{formattedUser}</span>
                </div>
                <div className="admin-list-card__row">
                  <span className="admin-list-card__label">Сумма</span>
                  <span className="font-semibold text-platinum">
                    {entry.amount.toLocaleString('ru-RU')} {entry.currency}
                  </span>
                </div>
                <div className="admin-list-card__row">
                  <span className="admin-list-card__label">Тип</span>
                  <span
                    className={`inline-flex px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                      entry.type === 'NFT_GIFT'
                        ? 'bg-indigo-500/20 text-indigo-100'
                        : 'bg-emerald-500/20 text-emerald-100'
                    }`}
                  >
                    {entry.type === 'NFT_GIFT' ? 'NFT' : 'Звёзды'}
                  </span>
                </div>
                <div className="admin-list-card__row">
                  <span className="admin-list-card__label">Реквизиты</span>
                  <span className="max-w-[60%] break-words text-xs text-platinum/60">
                    {entry.destination}
                  </span>
                </div>
                {entry.comment && (
                  <div className="admin-list-card__row">
                    <span className="admin-list-card__label">NFT / Комментарий</span>
                    <span className="max-w-[60%] break-words text-xs text-gold-300">
                      {entry.comment}
                    </span>
                  </div>
                )}
                <div className="admin-list-card__row">
                  <span className="admin-list-card__label">Статус</span>
                  <div className="flex flex-col items-end gap-1 text-xs">
                    <span
                      className={`inline-flex px-2 py-0.5 uppercase tracking-[0.12em] ${
                        entry.status === 'SENT'
                          ? 'bg-emerald-500/20 text-emerald-100'
                          : entry.status === 'REJECTED'
                            ? 'bg-red-500/20 text-red-200'
                            : entry.status === 'APPROVED'
                              ? 'bg-indigo-500/20 text-indigo-200'
                              : 'bg-yellow-500/20 text-yellow-100'
                      }`}
                    >
                      {entry.status}
                    </span>
                    {processedByLabel ? (
                      <span className="text-[11px] uppercase tracking-[0.16em] text-platinum/40">
                        {processedByLabel}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-2 pt-2 text-xs">
                  {(entry.status === 'PENDING' || entry.status === 'APPROVED') && (
                    <form action={approveWithdrawalAction} className="grid">
                      <input type="hidden" name="withdrawalId" value={entry.id} />
                      <button
                        className="w-full px-3 py-2 font-semibold uppercase tracking-[0.12em] text-emerald-200 transition hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                        type="submit"
                        disabled={!isDatabaseAvailable}
                      >
                        Одобрить
                      </button>
                    </form>
                  )}

                  {entry.status !== 'REJECTED' && entry.status !== 'SENT' && (
                    <form action={rejectWithdrawalAction} className="grid gap-2">
                      <input type="hidden" name="withdrawalId" value={entry.id} />
                      <textarea
                        className="border-b border-platinum/20 pb-1 px-3 py-2 text-xs text-platinum outline-none transition focus:border-gold-400 disabled:cursor-not-allowed disabled:opacity-40"
                        name="reason"
                        placeholder="Причина отказа"
                        rows={2}
                        disabled={!isDatabaseAvailable}
                      />
                      <button
                        className="px-3 py-2 font-semibold uppercase tracking-[0.12em] text-red-200 transition hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                        type="submit"
                        disabled={!isDatabaseAvailable}
                      >
                        Отклонить
                      </button>
                    </form>
                  )}

                  {(entry.status === 'APPROVED' || entry.status === 'PENDING') && (
                    <form action={markWithdrawalSentAction} className="grid gap-2">
                      <input type="hidden" name="withdrawalId" value={entry.id} />
                      <input
                        className="border-b border-platinum/20 pb-1 px-3 py-2 text-xs text-platinum outline-none transition focus:border-gold-400 disabled:cursor-not-allowed disabled:opacity-40"
                        name="txLink"
                        placeholder="Ссылка на транзакцию / примечание"
                        disabled={!isDatabaseAvailable}
                      />
                      <button
                        className="px-3 py-2 font-semibold uppercase tracking-[0.12em] text-gold-200 transition hover:text-gold-100 disabled:cursor-not-allowed disabled:opacity-40"
                        type="submit"
                        disabled={!isDatabaseAvailable}
                      >
                        Отметить отправку
                      </button>
                    </form>
                  )}
                </div>
              </article>
            );
          })}
          {withdrawals.length === 0 && (
            <div className="admin-list-card">
              <p className="text-sm text-platinum/60">
                Заявки не найдены. Пользователи ещё не делали запрос на вывод средств.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
