import React from 'react';

export const dynamic = 'force-dynamic';

import { StatusPlan } from '@/types/status-plan';

import { listStatusPlans } from '@/lib/services/status';
import { saveStatusPlanAction } from './actions';

type StatusPlanRecord = Omit<StatusPlan, 'benefits'> & {
  benefits: Record<string, unknown> | null;
};
const MOCK_PLANS: StatusPlanRecord[] = [
  {
    id: 'mock-standard',
    slug: 'standard',
    name: 'Стандарт',
    tier: 'STANDARD',
    price: 0,
    currency: 'RUB',
    durationDays: null,
    description: 'Базовый уровень без ограничений.',
    benefits: {
      bonuses: ['Ежедневные задания', 'Гарантированный доступ к играм']
    },
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: 'mock-premium',
    slug: 'premium',
    name: 'Премиум',
    tier: 'PREMIUM',
    price: 399,
    currency: 'RUB',
    durationDays: 30,
    description: 'Расширенные привилегии и ускоренный прогресс.',
    benefits: {
      multipliers: ['+15% к наградам', 'Доступ к эксклюзивным промокодам'],
      perks: ['Премиум-аватар', 'Участие в закрытых турнирах']
    },
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  }
];

async function loadStatusPlans() {
  if (!process.env.DATABASE_URL) {
    return {
      plans: MOCK_PLANS,
      isMock: true
    };
  }

  try {
    const plansRaw = await listStatusPlans({ includeInactive: true });
    const plans: StatusPlanRecord[] = plansRaw.map((plan) => ({
      ...plan,
      benefits:
        plan.benefits && typeof plan.benefits === 'object'
          ? (plan.benefits as Record<string, unknown>)
          : null
    }));
    return {
      plans,
      isMock: false
    };
  } catch {
    return {
      plans: [],
      isMock: false
    };
  }
}

export default async function AdminStatusesPage(): Promise<React.JSX.Element> {
  const { plans, isMock } = await loadStatusPlans();

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.24em] text-gold-400/70">Статусы</p>
        <h1 className="text-3xl font-semibold text-platinum">Уровни доступа</h1>
        <p className="max-w-[70ch] text-sm text-platinum/60">
          Управляйте тарифами статусов и их преимуществами. Премиум можно активировать вручную, через платёж или промокод.
        </p>
        {isMock && (
          <p className="py-2 text-xs text-yellow-300">
            Подключение к базе данных не настроено. Отображены демонстрационные статусы, формы отключены.
          </p>
        )}
      </header>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4 py-4">
          <h2 className="text-lg font-semibold text-platinum">Текущие планы</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className="space-y-3 py-3 text-sm text-platinum/70"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-platinum/50">
                      {plan.tier === 'PREMIUM' ? 'Премиум' : 'Стандарт'}
                    </p>
                    <p className="text-lg font-semibold text-platinum">{plan.name}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${
                      plan.isActive
                        ? 'bg-emerald-500/20 text-emerald-200'
                        : 'bg-red-500/20 text-red-200'
                    }`}
                  >
                    {plan.isActive ? 'Активен' : 'Отключен'}
                  </span>
                </div>
                <p className="text-xs text-platinum/55">{plan.description ?? 'Без описания'}</p>
                <div className="space-y-1 text-xs text-platinum/50">
                  <p>
                    Стоимость: {plan.price > 0 ? `${plan.price} ${plan.currency}` : 'Бесплатно'}
                  </p>
                  <p>
                    Длительность:{' '}
                    {plan.durationDays ? `${plan.durationDays} дней` : 'Без ограничения'}
                  </p>
                  {plan.benefits && (
                    <pre className="px-3 py-2 font-mono text-[11px] text-platinum/70">
                      {JSON.stringify(plan.benefits, null, 2)}
                    </pre>
                  )}
                </div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-platinum/35">
                  Обновлено:{' '}
                  {plan.updatedAt instanceof Date
                    ? plan.updatedAt.toLocaleString('ru-RU')
                    : String(plan.updatedAt)}
                </p>
              </div>
            ))}
            {plans.length === 0 && (
              <p className="py-4 text-center text-sm text-platinum/60">
                Статусы не найдены. Добавьте первый статус с правой стороны.
              </p>
            )}
          </div>
        </div>

        <aside className="space-y-4 py-4">
          <h2 className="text-lg font-semibold text-platinum">Создать или обновить статус</h2>
          <form action={saveStatusPlanAction} className="space-y-4">
            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.16em] text-platinum/60">
              Slug
              <input
                className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30"
                disabled={isMock}
                name="slug"
                placeholder="premium"
                required
              />
            </label>
            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.16em] text-platinum/60">
              Название
              <input
                className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30"
                disabled={isMock}
                name="name"
                placeholder="Премиум"
                required
              />
            </label>
            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.16em] text-platinum/60">
              Описание
              <textarea
                className="min-h-[80px] rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30"
                disabled={isMock}
                name="description"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.16em] text-platinum/60">
              Тип статуса
              <select
                className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30"
                defaultValue="PREMIUM"
                disabled={isMock}
                name="tier"
              >
                <option value="STANDARD">STANDARD</option>
                <option value="PREMIUM">PREMIUM</option>
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.16em] text-platinum/60">
                Стоимость
                <input
                  className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30"
                  defaultValue={0}
                  disabled={isMock}
                  min={0}
                  name="price"
                  type="number"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.16em] text-platinum/60">
                Валюта
                <input
                  className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30"
                  defaultValue="RUB"
                  disabled={isMock}
                  name="currency"
                  placeholder="RUB"
                />
              </label>
            </div>
            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.16em] text-platinum/60">
              Длительность (дни)
              <input
                className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30"
                disabled={isMock}
                min={0}
                name="durationDays"
                placeholder="Например 30"
                type="number"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.16em] text-platinum/60">
              Преимущества (JSON)
              <textarea
                className="min-h-[120px] rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-3 py-2 font-mono text-xs text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30"
                disabled={isMock}
                name="benefits"
                placeholder='{"bonuses": ["+10% к монетам"]}'
                spellCheck={false}
              />
            </label>
            <label className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-platinum/60">
              <input
                className="h-5 w-5 border-b border-platinum/20 text-gold-400"
                defaultChecked
                disabled={isMock}
                name="isActive"
                type="checkbox"
              />
              Активен
            </label>
            <button
              className="w-full px-6 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-gold-200 transition hover:text-gold-100"
              disabled={isMock}
              type="submit"
            >
              Сохранить статус
            </button>
          </form>
        </aside>
      </section>
    </div>
  );
}
