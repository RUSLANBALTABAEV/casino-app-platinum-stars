import React from 'react';

export const runtime = 'nodejs';

import { prisma } from '@/lib/prisma';
import {
  NFT_SHOP_TRANSFER_FEE_STARS,
  listNftInventoryItems,
  listNftShopOrders
} from '@/lib/services/nft-shop';
import {
  addInventoryItemAction,
  approveNftShopOrderAction,
  declineNftShopOrderAction,
  fulfillNftShopOrderAction,
  updateInventoryStatusAction
} from './actions';

type SearchParamsPromise = Promise<Record<string, string | string[] | undefined>>;

const STATUS_OPTIONS = ['ALL', 'PENDING', 'APPROVED', 'DECLINED', 'FULFILLED'] as const;
const TYPE_OPTIONS = ['ALL', 'BUY', 'SELL'] as const;

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

function formatDate(value: Date | string | null | undefined): string {
  if (!value) {
    return '—';
  }
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default async function AdminNftShopPage({
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

  const statusFilter = statusParam === 'ALL' ? undefined : (statusParam as 'PENDING' | 'APPROVED' | 'DECLINED' | 'FULFILLED');
  const typeFilter = typeParam === 'ALL' ? undefined : (typeParam as 'BUY' | 'SELL');

  const [orders, inventoryItems, nftGifts] = await Promise.all([
    listNftShopOrders({ status: statusFilter, type: typeFilter }),
    listNftInventoryItems({}),
    prisma.nftGift.findMany({
      orderBy: { updatedAt: 'desc' },
      where: { isActive: true }
    })
  ]);

  const isDatabaseAvailable = Boolean(process.env.DATABASE_URL);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.24em] text-gold-400/70">NFT-магазин</p>
        <h1 className="text-3xl font-semibold text-platinum">Склад и выдача NFT</h1>
        <p className="text-sm text-platinum/60">
          Пользователь оплачивает NFT в звёздах, комиссия за выдачу фиксирована: {NFT_SHOP_TRANSFER_FEE_STARS}★.
          После оплаты создаётся заявка, которую администратор подтверждает и отправляет вручную через отдельный аккаунт.
        </p>
        {!isDatabaseAvailable && (
          <p className="py-2 text-xs text-yellow-200">
            Нет подключения к базе данных. Укажите переменную окружения <code>DATABASE_URL</code>, чтобы
            обрабатывать заявки.
          </p>
        )}
      </header>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-platinum">Склад NFT</h2>
          <span className="text-xs uppercase tracking-[0.16em] text-platinum/40">Всего: {inventoryItems.length}</span>
        </div>
        <form className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_2fr_auto]" action={addInventoryItemAction}>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.12em] text-platinum/50">
            Категория NFT
            <select
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-platinum"
              name="giftId"
              defaultValue={nftGifts[0]?.id}
            >
              {nftGifts.map((gift) => (
                <option key={gift.id} value={gift.id}>
                  {gift.name} · {gift.rarity}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.12em] text-platinum/50">
            Telegram Gift ID
            <input
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-platinum"
              name="telegramGiftId"
              placeholder="gift_123"
              type="text"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.12em] text-platinum/50">
            Источник
            <input
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-platinum"
              name="source"
              placeholder="@store_account"
              type="text"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.12em] text-platinum/50">
            Заметки
            <input
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-platinum"
              name="notes"
              placeholder="Партия 01/2026"
              type="text"
            />
          </label>
          <button
            className="self-end rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-200 transition hover:text-emerald-100 disabled:opacity-50"
            type="submit"
            disabled={!isDatabaseAvailable}
          >
            Добавить
          </button>
        </form>

        <div className="admin-table-wrapper">
          <table className="w-full table-auto text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-[0.16em] text-platinum/50">
                <th className="px-3 py-2 font-semibold text-platinum/70">Дата</th>
                <th className="px-3 py-2 font-semibold text-platinum/70">Категория</th>
                <th className="px-3 py-2 font-semibold text-platinum/70">Telegram ID</th>
                <th className="px-3 py-2 font-semibold text-platinum/70">Статус</th>
                <th className="px-3 py-2 font-semibold text-platinum/70">Заметки</th>
                <th className="px-3 py-2 font-semibold text-platinum/70">Действия</th>
              </tr>
            </thead>
            <tbody>
              {inventoryItems.map((item) => (
                <tr key={item.id} className="border-b border-white/5 text-platinum/80 last:border-none">
                  <td className="px-3 py-2 text-xs text-platinum/60">{formatDate(item.createdAt)}</td>
                  <td className="px-3 py-2">
                    <div className="text-xs font-semibold text-platinum">{item.gift?.name}</div>
                    <div className="text-[10px] uppercase tracking-[0.12em] text-platinum/40">{item.gift?.rarity}</div>
                    <div className="text-[10px] text-platinum/30">{item.id}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-platinum/50 break-words">{item.telegramGiftId ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex px-2 py-0.5 text-[11px] uppercase tracking-[0.12em] ${
                        item.status === 'SENT'
                          ? 'bg-emerald-500/20 text-emerald-100'
                          : item.status === 'RESERVED'
                            ? 'bg-yellow-500/20 text-yellow-100'
                            : 'bg-indigo-500/20 text-indigo-100'
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-platinum/50 break-words">{item.notes ?? '—'}</td>
                  <td className="px-3 py-2">
                    <form className="flex flex-wrap gap-2" action={updateInventoryStatusAction}>
                      <input type="hidden" name="itemId" value={item.id} />
                      <select
                        className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-platinum"
                        name="status"
                        defaultValue={item.status}
                      >
                        <option value="IN_STOCK">IN_STOCK</option>
                        <option value="RESERVED">RESERVED</option>
                        <option value="SENT">SENT</option>
                      </select>
                      <input
                        className="w-32 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-platinum"
                        name="notes"
                        placeholder="Комментарий"
                        type="text"
                      />
                      <button
                        className="rounded-lg border border-white/10 px-2 py-1 text-xs uppercase tracking-[0.12em] text-platinum/70 transition hover:text-platinum"
                        type="submit"
                        disabled={!isDatabaseAvailable}
                      >
                        Сохранить
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-platinum/40">Заявки</p>
            <h2 className="text-xl font-semibold text-platinum">Заказы пользователей</h2>
          </div>
          <form className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.12em] text-platinum/70">
            <label className="flex items-center gap-2">
              Статус
              <select
                className="border-b border-platinum/20 pb-1 px-3 py-2 text-xs text-platinum outline-none transition focus:border-gold-400"
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
            <label className="flex items-center gap-2">
              Тип
              <select
                className="border-b border-platinum/20 pb-1 px-3 py-2 text-xs text-platinum outline-none transition focus:border-gold-400"
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
              className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-gold-300 transition hover:text-gold-100"
              type="submit"
            >
              Фильтровать
            </button>
          </form>
        </div>

        <div className="admin-table-wrapper">
          <table className="w-full table-auto text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-[0.16em] text-platinum/50">
                <th className="px-3 py-2 font-semibold text-platinum/70">Дата</th>
                <th className="px-3 py-2 font-semibold text-platinum/70">Пользователь</th>
                <th className="px-3 py-2 font-semibold text-platinum/70">NFT</th>
                <th className="px-3 py-2 font-semibold text-platinum/70">Сумма</th>
                <th className="px-3 py-2 font-semibold text-platinum/70">Статус</th>
                <th className="px-3 py-2 font-semibold text-platinum/70">Действия</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b border-white/5 text-platinum/80 last:border-none">
                  <td className="px-3 py-2 text-xs text-platinum/60">{formatDate(order.createdAt)}</td>
                  <td className="px-3 py-2">
                    <div className="text-xs font-semibold text-platinum">{formatUser(order.user)}</div>
                    <div className="text-[10px] text-platinum/30">{order.userId}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-xs font-semibold text-platinum">{order.gift?.name}</div>
                    <div className="text-[10px] uppercase tracking-[0.12em] text-platinum/40">{order.type}</div>
                    <div className="text-[10px] text-platinum/30">{order.id}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div className="text-platinum">{order.priceStars}★ + {order.feeStars}★</div>
                    <div className="text-[10px] uppercase tracking-[0.12em] text-platinum/50">Всего {order.totalStars}★</div>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex px-2 py-0.5 text-[11px] uppercase tracking-[0.12em] ${
                        order.status === 'FULFILLED'
                          ? 'bg-emerald-500/20 text-emerald-100'
                          : order.status === 'DECLINED'
                            ? 'bg-red-500/20 text-red-200'
                            : order.status === 'APPROVED'
                              ? 'bg-indigo-500/20 text-indigo-200'
                              : 'bg-yellow-500/20 text-yellow-100'
                      }`}
                    >
                      {order.status}
                    </span>
                    {order.assignedItemId ? (
                      <p className="text-[10px] text-platinum/40">NFT ID: {order.assignedItemId}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-2 text-xs">
                      {(order.status === 'PENDING' || order.status === 'APPROVED') && (
                        <form className="flex flex-wrap gap-2" action={approveNftShopOrderAction}>
                          <input type="hidden" name="orderId" value={order.id} />
                          <input
                            className="w-40 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-platinum"
                            name="inventoryItemId"
                            placeholder="ID конкретного NFT"
                            type="text"
                          />
                          <button
                            className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-emerald-100"
                            name="assignAny"
                            type="submit"
                            value="true"
                            disabled={!isDatabaseAvailable}
                          >
                            Одобрить (любой)
                          </button>
                          <button
                            className="rounded-lg border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-platinum/70"
                            name="assignAny"
                            type="submit"
                            value="false"
                            disabled={!isDatabaseAvailable}
                          >
                            Одобрить (по ID)
                          </button>
                        </form>
                      )}
                      {order.status !== 'DECLINED' && order.status !== 'FULFILLED' && (
                        <form className="flex flex-wrap gap-2" action={fulfillNftShopOrderAction}>
                          <input type="hidden" name="orderId" value={order.id} />
                          <input
                            className="w-40 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-platinum"
                            name="inventoryItemId"
                            placeholder="ID для отправки"
                            type="text"
                          />
                          <button
                            className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-emerald-100"
                            type="submit"
                            disabled={!isDatabaseAvailable}
                          >
                            Отправлено
                          </button>
                        </form>
                      )}
                      {order.status !== 'DECLINED' && order.status !== 'FULFILLED' && (
                        <form className="flex flex-wrap gap-2" action={declineNftShopOrderAction}>
                          <input type="hidden" name="orderId" value={order.id} />
                          <input
                            className="w-40 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-platinum"
                            name="reason"
                            placeholder="Причина"
                            type="text"
                          />
                          <button
                            className="rounded-lg border border-red-400/40 bg-red-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-red-200"
                            type="submit"
                            disabled={!isDatabaseAvailable}
                          >
                            Отклонить
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
