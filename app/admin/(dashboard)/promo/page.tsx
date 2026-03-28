/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import React from 'react';

export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/prisma';
import { createPromo, togglePromo } from './actions';

type PromoRecord = Awaited<ReturnType<typeof getPromos>>[number];

async function getPromos() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any;

  const promos = await db.promoCode.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      _count: {
        select: { redemptions: true }
      }
    }
  });

  return promos;
}

export default async function AdminPromoPage(): Promise<React.JSX.Element> {
  const isMockMode = !process.env.DATABASE_URL;

  const promos: PromoRecord[] = isMockMode
    ? Array.from({ length: 4 }).map((_, index) => ({
        id: `promo-mock-${index}`,
        code: `MOCK-${2025 + index}`,
        description: 'Демонстрационный промокод',
        starReward: 250 + index * 50,
        usageLimit: 100,
        perUserLimit: 1,
        bonusPercent: index * 5,
        grantsStatus: index % 2 === 0 ? 'PREMIUM' : null,
        statusDurationDays: index % 2 === 0 ? 14 : null,
        validFrom: new Date(),
        validTo: new Date(Date.now() + 7 * 24 * 3600_000),
        isActive: index % 2 === 0,
        _count: { redemptions: 10 + index * 3 }
      })) as PromoRecord[]
    : ((await getPromos().catch(() => [])) as PromoRecord[]);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-[10px] uppercase tracking-[0.2em] text-gold-400/60 sm:text-xs">Промокоды</p>
        <h1 className="text-2xl font-bold text-platinum sm:text-3xl">Каталог промо-акций</h1>
        <p className="text-xs text-platinum/60 sm:text-sm">
          Создавайте промокоды для новых кампаний и отслеживайте их эффективность.
        </p>
        {isMockMode && (
          <div className="rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-3 py-2">
            <p className="text-xs text-yellow-300">
              ⚠️ Подключение к базе данных не настроено. Отображены демонстрационные промокоды, формы
              отключены.
            </p>
          </div>
        )}
      </header>

      <section className="flex flex-col gap-4">
        {/* Десктопная таблица */}
        <div className="hidden lg:block overflow-x-auto rounded-xl border border-blue-400/30 bg-blue-900/30 backdrop-blur-sm">
          <table className="w-full table-auto text-sm">
            <thead>
              <tr className="border-b border-blue-400/20 bg-blue-800/40 text-left text-xs uppercase tracking-[0.16em]">
                <th className="px-3 py-3 font-semibold text-blue-200">Код</th>
                <th className="px-3 py-3 font-semibold text-blue-200">Описание</th>
                <th className="px-3 py-3 font-semibold text-blue-200">Бонус</th>
                <th className="px-3 py-3 font-semibold text-blue-200">Статус</th>
                <th className="px-3 py-3 font-semibold text-blue-200">Лимиты</th>
                <th className="px-3 py-3 font-semibold text-blue-200">Период</th>
                <th className="px-3 py-3 font-semibold text-blue-200">Статус</th>
                <th className="px-3 py-3 font-semibold text-blue-200">Действия</th>
              </tr>
            </thead>
            <tbody>
              {promos.map((promo) => (
                <tr key={promo.id} className="border-b border-blue-400/10 bg-blue-900/20 hover:bg-blue-800/30 transition-colors last:border-none">
                  <td className="px-3 py-3 font-semibold text-white">{promo.code}</td>
                  <td className="px-3 py-3 text-xs text-blue-200">{promo.description ?? '—'}</td>
                  <td className="px-3 py-3 font-semibold text-white">{promo.starReward} ★</td>
                  <td className="px-3 py-3 text-xs text-blue-200">
                    {promo.grantsStatus ? (
                      <div className="space-y-1">
                        <span className="inline-flex px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-indigo-200">
                          {promo.grantsStatus}
                        </span>
                        <span className="block text-[11px] text-blue-300/70">
                          {promo.statusDurationDays
                            ? `${promo.statusDurationDays} д.`
                            : 'Без срока'}
                        </span>
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col text-xs text-blue-200">
                      <span>
                        {promo._count.redemptions}
                        {promo.usageLimit ? ` / ${promo.usageLimit}` : ''} (общий)
                      </span>
                      <span>На пользователя: {promo.perUserLimit}</span>
                      {promo.bonusPercent ? <span>Бонус: +{promo.bonusPercent}%</span> : null}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs text-blue-200">
                    {promo.validFrom instanceof Date
                      ? promo.validFrom.toLocaleDateString('ru-RU')
                      : '—'}{' '}
                    —{' '}
                    {promo.validTo instanceof Date
                      ? promo.validTo.toLocaleDateString('ru-RU')
                      : 'Без срока'}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex px-2 py-0.5 text-xs uppercase tracking-[0.1em] ${
                        promo.isActive
                          ? 'bg-emerald-500/20 text-emerald-200'
                          : 'bg-red-500/20 text-red-200'
                      }`}
                    >
                      {promo.isActive ? 'Активен' : 'Выключен'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <form action={togglePromo} className="inline">
                      <input type="hidden" name="promoId" value={promo.id} />
                      <input type="hidden" name="command" value={promo.isActive ? 'deactivate' : 'activate'} />
                      <button
                        className={`rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                          promo.isActive
                            ? 'border-red-400/50 bg-red-500/20 text-red-100 hover:bg-red-500/30'
                            : 'border-emerald-400/50 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30'
                        } disabled:cursor-not-allowed disabled:opacity-40`}
                        type="submit"
                        disabled={isMockMode}
                      >
                        {promo.isActive ? 'Отключить' : 'Включить'}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {promos.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-center text-blue-200" colSpan={8}>
                    Промокоды не найдены. Создайте первый промокод с правой стороны.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Мобильные карточки */}
        <div className="lg:hidden space-y-3">
          {promos.map((promo) => (
            <article key={promo.id} className="rounded-xl border border-blue-400/30 bg-blue-900/30 backdrop-blur-sm p-4 space-y-3">
              <div className="flex items-start justify-between pb-2 border-b border-white/5">
                <div className="flex-1">
                  <p className="text-sm font-bold text-gold-300">{promo.code}</p>
                  <p className="text-xs text-blue-200/80 mt-1">{promo.description ?? '—'}</p>
                </div>
                <span
                  className={`inline-flex px-2 py-1 text-[9px] uppercase tracking-[0.12em] font-semibold rounded-lg ${
                    promo.isActive
                      ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30'
                      : 'bg-red-500/20 text-red-200 border border-red-400/30'
                  }`}
                >
                  {promo.isActive ? 'Активен' : 'Выключен'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 pb-2 border-b border-white/5">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.12em] text-blue-300/70 mb-1">Бонус</p>
                  <p className="text-sm font-bold text-white">{promo.starReward} ★</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-[0.12em] text-blue-300/70 mb-1">Использований</p>
                  <p className="text-sm font-semibold text-white">
                    {promo._count.redemptions}
                    {promo.usageLimit ? ` / ${promo.usageLimit}` : ''}
                  </p>
                </div>
              </div>
              {(promo.grantsStatus || promo.bonusPercent) && (
                <div className="pb-2 border-b border-white/5">
                  {promo.grantsStatus && (
                    <p className="text-[9px] uppercase tracking-[0.12em] text-platinum/50 mb-1">Статус</p>
                  )}
                  {promo.grantsStatus && (
                    <p className="text-xs text-indigo-200 font-semibold">
                      {promo.grantsStatus} {promo.statusDurationDays ? `(${promo.statusDurationDays} д.)` : ''}
                    </p>
                  )}
                  {promo.bonusPercent && (
                    <p className="text-xs text-platinum/60 mt-1">Бонус: +{promo.bonusPercent}%</p>
                  )}
                </div>
              )}
              <div className="text-xs text-platinum/60 pb-2 border-b border-white/5">
                <p className="text-[9px] uppercase tracking-[0.12em] text-platinum/50 mb-1">Период</p>
                <p>
                  {promo.validFrom instanceof Date
                    ? promo.validFrom.toLocaleDateString('ru-RU')
                    : '—'}{' '}
                  —{' '}
                  {promo.validTo instanceof Date
                    ? promo.validTo.toLocaleDateString('ru-RU')
                    : 'Без срока'}
                </p>
                <p className="text-[10px] text-platinum/50 mt-1">На пользователя: {promo.perUserLimit}</p>
              </div>
              <form action={togglePromo}>
                <input type="hidden" name="promoId" value={promo.id} />
                <input type="hidden" name="command" value={promo.isActive ? 'deactivate' : 'activate'} />
                <button
                  className={`w-full rounded-lg border px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
                    promo.isActive
                      ? 'border-red-400/50 bg-red-400/10 text-red-200'
                      : 'border-emerald-400/50 bg-emerald-400/10 text-emerald-200'
                  }`}
                  type="submit"
                  disabled={isMockMode}
                >
                  {promo.isActive ? 'Отключить' : 'Включить'}
                </button>
              </form>
            </article>
          ))}
          {promos.length === 0 && (
            <div className="rounded-xl border border-white/10 bg-black/40 p-6 text-center">
              <p className="text-sm text-platinum/60">
                Промокоды не найдены. Создайте первый промокод с помощью формы.
              </p>
            </div>
          )}
        </div>

        <aside className="space-y-4 py-4">
          <h2 className="text-lg font-semibold text-platinum">Создать промокод</h2>
          <form action={createPromo} className="space-y-4">
            <label className="flex flex-col gap-2 text-sm text-platinum/70">
              Код
              <input
                className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                name="code"
                placeholder="ASTRO-2025"
                required
                disabled={isMockMode}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-platinum/70">
              Описание
              <textarea
                className="min-h-[80px] rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                name="description"
                placeholder="Краткое описание акции"
                disabled={isMockMode}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-platinum/70">
              Бонус в звёздах
              <input
                className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                name="reward"
                placeholder="Например 250"
                type="number"
                min={0}
                defaultValue={0}
                disabled={isMockMode}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-platinum/70">
              Общий лимит
              <input
                className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                name="usageLimit"
                placeholder="Оставьте пустым для безлимитного"
                type="number"
                min={1}
                disabled={isMockMode}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-platinum/70">
              Лимит на пользователя
              <input
                className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                name="perUserLimit"
                placeholder="По умолчанию 1"
                type="number"
                min={1}
                disabled={isMockMode}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-platinum/70">
              Бонус в %
              <input
                className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                name="bonusPercent"
                placeholder="Например 15"
                type="number"
                min={0}
                disabled={isMockMode}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm text-platinum/70">
                Выдать статус
                <select
                  className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                  defaultValue="none"
                  name="grantsStatus"
                  disabled={isMockMode}
                >
                  <option value="none">Нет</option>
                  <option value="STANDARD">STANDARD</option>
                  <option value="PREMIUM">PREMIUM</option>
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm text-platinum/70">
                Длительность (дни)
                <input
                  className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                  name="statusDurationDays"
                  placeholder="Например 7"
                  type="number"
                  min={1}
                  disabled={isMockMode}
                />
              </label>
            </div>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-2 text-sm text-platinum/70">
                Старт акции
                <input
                  className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                  name="validFrom"
                  type="datetime-local"
                  disabled={isMockMode}
                />
              </label>
              <label className="flex flex-col gap-2 text-sm text-platinum/70">
                Окончание
                <input
                  className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                  name="validTo"
                  type="datetime-local"
                  disabled={isMockMode}
                />
              </label>
            </div>
            <button
              className="w-full px-6 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-gold-200 transition hover:text-gold-100 disabled:cursor-not-allowed disabled:opacity-40"
              type="submit"
              disabled={isMockMode}
            >
              Создать
            </button>
          </form>
        </aside>
      </section>
    </div>
  );
}
