import React from 'react';

export const runtime = 'nodejs';

import { listSecurityEvents } from '@/lib/services/security';

type SecurityEventRecord = Awaited<ReturnType<typeof listSecurityEvents>>[number];

export default async function AdminSecurityPage(): Promise<React.JSX.Element> {
  const isMockMode = !process.env.DATABASE_URL;

  const events: SecurityEventRecord[] = isMockMode
    ? (Array.from({ length: 6 }).map((_, index) => ({
        id: `sec-${index}`,
        type: index % 2 === 0 ? 'PROMO_DUPLICATE' : 'TASK_LIMIT',
        severity: index % 3 === 0 ? 'CRITICAL' : index % 3 === 1 ? 'WARNING' : 'INFO',
        message: 'Демонстрационное событие безопасности',
        createdAt: new Date(),
        metadata: { reward: 250 },
        userId: null,
        user: {
          firstName: 'Demo',
          lastName: `User ${index}`,
          username: `demo_user_${index}`
        }
      })) as SecurityEventRecord[])
    : ((await listSecurityEvents().catch(() => [])) as SecurityEventRecord[]);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.24em] text-gold-400/70">Безопасность</p>
        <h1 className="text-3xl font-semibold text-platinum">Мониторинг и антифрод</h1>
        <p className="text-sm text-platinum/60">
          Отслеживайте подозрительные действия, повторные попытки активаций и другие события,
          требующие внимания модерации.
        </p>
        {isMockMode && (
          <p className="py-2 text-xs text-yellow-300">
            Подключение к базе данных не настроено. Отображены демонстрационные события.
          </p>
        )}
      </header>

      <div className="admin-table-wrapper">
        <table className="w-full table-auto text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-[0.16em] text-platinum/50">
              <th className="px-3 py-2 font-semibold text-platinum/70">Событие</th>
              <th className="px-3 py-2 font-semibold text-platinum/70">Пользователь</th>
              <th className="px-3 py-2 font-semibold text-platinum/70">Сообщение</th>
              <th className="px-3 py-2 font-semibold text-platinum/70">Дата</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => {
              const createdAtDate =
                event.createdAt instanceof Date
                  ? event.createdAt
                  : new Date(event.createdAt as string | number | Date);

              return (
                <tr key={event.id} className="border-b border-white/5 last:border-none">
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex px-2 py-0.5 text-[11px] uppercase tracking-[0.1em] ${
                      event.severity === 'CRITICAL'
                        ? 'bg-red-500/20 text-red-200'
                        : event.severity === 'WARNING'
                          ? 'bg-yellow-500/20 text-yellow-200'
                          : 'bg-blue-500/20 text-blue-200'
                    }`}
                  >
                    {event.type}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-col">
                    <span className="font-medium text-platinum">
                      {[event.user?.firstName, event.user?.lastName].filter(Boolean).join(' ') || 'Без имени'}
                    </span>
                    <span className="text-xs text-platinum/50">
                      {event.user?.username ? `@${event.user.username}` : '—'}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 text-xs text-platinum/60">
                  {event.message}
                  {event.metadata && (
                    <pre className="mt-1 overflow-x-auto p-2 text-[11px] text-platinum/50">
                      {JSON.stringify(event.metadata, null, 2)}
                    </pre>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-platinum/55">
                  {createdAtDate.toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </td>
                </tr>
              );
            })}
            {events.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-center text-platinum/50" colSpan={4}>
                  Инциденты не зафиксированы.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
