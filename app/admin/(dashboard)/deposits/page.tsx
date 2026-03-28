/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import React from 'react';

export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/prisma';
import DepositActionsClient from './DepositActionsClient';

type DepositRequest = {
  id: string;
  stars: number;
  rubAmount: number;
  paymentPurpose: string | null;
  receiptFileId: string | null;
  receiptType: string | null;
  status: string;
  adminNote: string | null;
  createdAt: Date;
  user: {
    firstName: string | null;
    lastName: string | null;
    username: string | null;
    telegramId: bigint;
  };
};

async function getDepositRequests() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any;

  const requests = await db.manualDepositRequest.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      user: {
        select: {
          firstName: true,
          lastName: true,
          username: true,
          telegramId: true
        }
      }
    }
  });

  return requests as DepositRequest[];
}

export default async function AdminDepositsPage(): Promise<React.JSX.Element> {
  const isMockMode = !process.env.DATABASE_URL;

  const requests: DepositRequest[] = isMockMode
    ? (Array.from({ length: 5 }).map((_, index) => ({
        id: `deposit-mock-${index}`,
        stars: 100 + index * 50,
        rubAmount: 500 + index * 250,
        paymentPurpose: index % 3 === 0 ? 'долг' : index % 3 === 1 ? 'подарок' : 'занимаю',
        receiptFileId: `file_${index}`,
        receiptType: 'photo',
        status: index === 0 ? 'PENDING' : index === 1 ? 'APPROVED' : 'COMPLETED',
        adminNote: null,
        createdAt: new Date(),
        user: {
          firstName: 'Demo',
          lastName: `User ${index}`,
          username: `demo_user_${index}`,
          telegramId: BigInt(100000 + index)
        }
      })) as DepositRequest[])
    : await getDepositRequests().catch(() => []);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-[10px] uppercase tracking-[0.2em] text-gold-400/60 sm:text-xs">Пополнения</p>
        <h1 className="text-2xl font-bold text-platinum sm:text-3xl">Запросы на ручное пополнение</h1>
        <p className="text-xs text-platinum/60 sm:text-sm">
          Проверяйте чеки и подтверждайте пополнения. После подтверждения звёзды будут автоматически зачислены пользователю.
        </p>
        {isMockMode && (
          <div className="rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-3 py-2">
            <p className="text-xs text-yellow-300">
              ⚠️ Подключение к базе данных не настроено. Отображены демонстрационные запросы.
            </p>
          </div>
        )}
      </header>

      <section className="space-y-4">
        {/* Десктопная таблица */}
        <div className="hidden lg:block overflow-x-auto rounded-xl border border-blue-400/30 bg-blue-900/30 backdrop-blur-sm">
          <table className="w-full table-auto text-sm">
            <thead>
              <tr className="border-b border-blue-400/20 bg-blue-800/40 text-left text-xs uppercase tracking-[0.16em]">
                <th className="px-3 py-3 font-semibold text-blue-200">Пользователь</th>
                <th className="px-3 py-3 font-semibold text-blue-200">Сумма</th>
                <th className="px-3 py-3 font-semibold text-blue-200">Звёзды</th>
                <th className="px-3 py-3 font-semibold text-blue-200">Назначение</th>
                <th className="px-3 py-3 font-semibold text-blue-200">Чек</th>
                <th className="px-3 py-3 font-semibold text-blue-200">Статус</th>
                <th className="px-3 py-3 font-semibold text-blue-200">Дата</th>
                <th className="px-3 py-3 font-semibold text-blue-200">Действия</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => {
                const userName = request.user.username
                  ? `@${request.user.username}`
                  : [request.user.firstName, request.user.lastName].filter(Boolean).join(' ') || 'Без имени';
                return (
                  <tr key={request.id} className="border-b border-blue-400/10 bg-blue-900/20 hover:bg-blue-800/30 transition-colors last:border-none">
                    <td className="px-3 py-3 font-medium text-white">{userName}</td>
                    <td className="px-3 py-3 text-white">{request.rubAmount.toLocaleString('ru-RU')} ₽</td>
                    <td className="px-3 py-3 font-semibold text-gold-300">{request.stars} ★</td>
                    <td className="px-3 py-3 text-xs text-blue-200">{request.paymentPurpose ?? '—'}</td>
                    <td className="px-3 py-3">
                      {request.receiptFileId ? (
                        <span className="text-xs text-blue-300 font-mono">file_id: {request.receiptFileId.slice(0, 20)}...</span>
                      ) : (
                        <span className="text-xs text-blue-400/60">Нет</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex px-2 py-0.5 text-xs uppercase tracking-[0.1em] ${
                          request.status === 'COMPLETED'
                            ? 'bg-emerald-500/20 text-emerald-200'
                            : request.status === 'REJECTED'
                              ? 'bg-red-500/20 text-red-200'
                              : request.status === 'APPROVED'
                                ? 'bg-indigo-500/20 text-indigo-200'
                                : 'bg-yellow-500/20 text-yellow-100'
                        }`}
                      >
                        {request.status === 'PENDING' ? 'Ожидает' : request.status === 'APPROVED' ? 'Одобрено' : request.status === 'REJECTED' ? 'Отклонено' : 'Завершено'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-blue-200">
                      {new Date(request.createdAt).toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td className="px-3 py-2">
                      <DepositActionsClient
                        depositId={request.id}
                        status={request.status}
                        stars={request.stars}
                        userName={userName}
                        isMockMode={isMockMode}
                      />
                    </td>
                  </tr>
                );
              })}
              {requests.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-center text-blue-200" colSpan={8}>
                    Запросы не найдены.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Мобильные карточки */}
        <div className="lg:hidden space-y-3">
          {requests.map((request) => {
            const userName = request.user.username
              ? `@${request.user.username}`
              : [request.user.firstName, request.user.lastName].filter(Boolean).join(' ') || 'Без имени';
            return (
              <article key={request.id} className="rounded-xl border border-blue-400/30 bg-blue-900/30 backdrop-blur-sm p-4 space-y-3">
                <div className="flex items-start justify-between pb-2 border-b border-white/5">
                  <div className="flex-1">
                    <p className="text-sm font-bold text-white">{userName}</p>
                    <p className="text-xs text-blue-200/80 mt-1">
                      {new Date(request.createdAt).toLocaleString('ru-RU')}
                    </p>
                  </div>
                  <span
                    className={`inline-flex px-2 py-1 text-[9px] uppercase tracking-[0.12em] font-semibold rounded-lg ${
                      request.status === 'COMPLETED'
                        ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30'
                        : request.status === 'REJECTED'
                          ? 'bg-red-500/20 text-red-200 border border-red-400/30'
                          : request.status === 'APPROVED'
                            ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-400/30'
                            : 'bg-yellow-500/20 text-yellow-100 border border-yellow-400/30'
                    }`}
                  >
                    {request.status === 'PENDING' ? 'Ожидает' : request.status === 'APPROVED' ? 'Одобрено' : request.status === 'REJECTED' ? 'Отклонено' : 'Завершено'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 pb-2 border-b border-white/5">
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.12em] text-blue-300/70 mb-1">Сумма</p>
                    <p className="text-sm font-bold text-white">{request.rubAmount.toLocaleString('ru-RU')} ₽</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.12em] text-blue-300/70 mb-1">Звёзды</p>
                    <p className="text-sm font-bold text-gold-300">{request.stars} ★</p>
                  </div>
                </div>
                {request.paymentPurpose && (
                  <div className="pb-2 border-b border-blue-400/20">
                    <p className="text-[9px] uppercase tracking-[0.12em] text-blue-300/70 mb-1">Назначение</p>
                    <p className="text-xs text-blue-200">{request.paymentPurpose}</p>
                  </div>
                )}
                {request.receiptFileId && (
                  <div className="pb-2 border-b border-blue-400/20">
                    <p className="text-[9px] uppercase tracking-[0.12em] text-blue-300/70 mb-1">Чек</p>
                    <p className="text-xs text-blue-300 font-mono break-all">{request.receiptFileId}</p>
                  </div>
                )}
                <DepositActionsClient
                  depositId={request.id}
                  status={request.status}
                  stars={request.stars}
                  userName={userName}
                  isMockMode={isMockMode}
                />
              </article>
            );
          })}
          {requests.length === 0 && (
            <div className="rounded-xl border border-blue-400/30 bg-blue-900/30 backdrop-blur-sm p-6 text-center">
              <p className="text-sm text-blue-200">Запросы не найдены.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

