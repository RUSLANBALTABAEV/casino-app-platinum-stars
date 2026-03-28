/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import React from 'react';

export const runtime = 'nodejs';

import { getBroadcasts } from '@/lib/services/broadcast';
import { sendBroadcastAction } from './actions';

type BroadcastRecord = Awaited<ReturnType<typeof getBroadcasts>>[number];

export default async function AdminBroadcastsPage(): Promise<React.JSX.Element> {
  const isMockMode = !process.env.DATABASE_URL;

  const broadcasts: BroadcastRecord[] = isMockMode
    ? (Array.from({ length: 4 }).map((_, index) => ({
        id: `broadcast-mock-${index}`,
        title: `Демо рассылка #${index + 1}`,
        message: 'Пример сообщения. Включайте рассылку, чтобы держать игроков в курсе новостей.',
        segment: index % 2 === 0 ? 'ALL' : 'PREMIUM',
        status: index % 3 === 0 ? 'SENT' : 'FAILED',
        totalRecipients: 1200 + index * 50,
        delivered: 1100 + index * 45,
        failed: index % 3 === 0 ? 12 : 40,
        createdAt: new Date(),
        sentAt: new Date()
      })) as BroadcastRecord[])
    : ((await getBroadcasts().catch(() => [])) as BroadcastRecord[]);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.24em] text-gold-400/70">Коммуникации</p>
        <h1 className="text-3xl font-semibold text-platinum">Рассылки от имени бота</h1>
        <p className="text-sm text-platinum/60">
          Отправляйте пользователям персонализированные сообщения, уведомляйте о новых играх и
          акциях. Сообщения доставляются от официального бота.
        </p>
        {isMockMode && (
          <p className="py-2 text-xs text-yellow-300">
            Подключение к базе данных не настроено. Отображены демонстрационные данные, отправка
            рассылок отключена.
          </p>
        )}
      </header>

      <section className="flex flex-col gap-6">
        <div className="space-y-4">
          {broadcasts.map((broadcast) => (
            <article
              key={broadcast.id}
              className="space-y-3 py-4"
            >
              <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-platinum">{broadcast.title}</h2>
                  <p className="text-xs uppercase tracking-[0.14em] text-platinum/50">
                    Сегмент: {broadcast.segment ?? 'ALL'}
                  </p>
                </div>
                <span
                  className={`inline-flex px-2 py-0.5 text-[11px] uppercase tracking-[0.12em] ${
                    broadcast.status === 'SENT'
                      ? 'bg-emerald-500/20 text-emerald-200'
                      : broadcast.status === 'FAILED'
                        ? 'bg-red-500/20 text-red-200'
                        : 'bg-yellow-500/20 text-yellow-200'
                  }`}
                >
                  {broadcast.status === 'SENT'
                    ? 'Отправлено'
                    : broadcast.status === 'FAILED'
                      ? 'Ошибки доставки'
                      : 'В очереди'}
                </span>
              </header>

              <p className="text-sm text-platinum/70 whitespace-pre-wrap">{broadcast.message}</p>

              <div className="flex flex-wrap gap-4 text-xs uppercase tracking-[0.16em] text-platinum/45">
                <span>Получателей: {broadcast.totalRecipients}</span>
                <span>Доставлено: {broadcast.delivered}</span>
                <span>Ошибок: {broadcast.failed}</span>
              </div>
            </article>
          ))}
          {broadcasts.length === 0 && (
            <p className="py-4 text-center text-sm text-platinum/50">
              Рассылки ещё не запускались.
            </p>
          )}
        </div>

        <aside className="space-y-4 py-4">
          <h2 className="text-lg font-semibold text-platinum">Новая рассылка</h2>
          <form action={sendBroadcastAction} className="space-y-4">
            <label className="flex flex-col gap-2 text-sm text-platinum/70">
              Заголовок
              <input
                className="border-b border-platinum/20 pb-1 px-3 py-2 text-sm text-platinum outline-none transition focus:border-gold-400 disabled:cursor-not-allowed disabled:opacity-40"
                name="title"
                placeholder="Акция выходного дня"
                required
                disabled={isMockMode}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-platinum/70">
              Сообщение
              <textarea
                className="min-h-[150px] border-b border-platinum/20 pb-1 px-3 py-2 text-sm text-platinum outline-none transition focus:border-gold-400 disabled:cursor-not-allowed disabled:opacity-40"
                name="message"
                placeholder="Привет! Сегодня запускаем новую рулетку..."
                required
                disabled={isMockMode}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-platinum/70">
              Сегмент
              <select
                className="border-b border-platinum/20 pb-1 px-3 py-2 text-sm text-platinum outline-none transition focus:border-gold-400 disabled:cursor-not-allowed disabled:opacity-40"
                defaultValue="ALL"
                name="segment"
                disabled={isMockMode}
              >
                <option value="ALL">Все пользователи</option>
                <option value="ACTIVE">Активные (не в бане)</option>
                <option value="PREMIUM">Telegram Premium</option>
              </select>
            </label>
            <button
              className="w-full px-6 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-gold-200 transition hover:text-gold-100 disabled:cursor-not-allowed disabled:opacity-40"
              type="submit"
              disabled={isMockMode}
            >
              Отправить рассылку
            </button>
          </form>
        </aside>
      </section>
    </div>
  );
}
