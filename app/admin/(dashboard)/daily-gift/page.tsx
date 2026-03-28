import React from 'react';

export const runtime = 'nodejs';

import { getDailyGiftConfig } from '@/lib/services/daily-gift';
import { saveDailyGiftSettingsAction } from './actions';

function formatHours(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '24';
  }
  return String(Math.round((seconds / 3600) * 100) / 100);
}

export default async function AdminDailyGiftPage(): Promise<React.JSX.Element> {
  const [config, isMock] = await Promise.all([
    getDailyGiftConfig().catch(() => ({
      cooldownSeconds: 24 * 60 * 60,
      baseReward: 10,
      streakStep: 2,
      maxReward: 40,
      rewardsByDay: []
    })),
    Promise.resolve(!process.env.DATABASE_URL)
  ]);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.24em] text-gold-400/70">Ежедневный подарок</p>
        <h1 className="text-3xl font-semibold text-platinum">Настройки подарка дня</h1>
        <p className="max-w-[70ch] text-sm text-platinum/60">
          Настройте таймер и награды. Можно задать фиксированные награды по дням или формулу (base + step).
        </p>
        {isMock && (
          <p className="py-2 text-xs text-yellow-300">
            Подключение к базе данных не настроено. Отображены значения по умолчанию, сохранение отключено.
          </p>
        )}
      </header>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-platinum">Параметры</h2>
        <form action={saveDailyGiftSettingsAction} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/40 p-4">
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.14em] text-platinum/65">
                Кулдаун (часы)
                <input
                  className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-4 py-3 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                  defaultValue={formatHours(config.cooldownSeconds)}
                  disabled={isMock}
                  min={0.25}
                  name="cooldownHours"
                  step={0.25}
                  type="number"
                />
              </label>
              <p className="mt-2 text-xs text-platinum/55">
                Через сколько часов после получения можно снова открыть подарок.
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/40 p-4">
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.14em] text-platinum/65">
                Максимальная награда (★)
                <input
                  className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-4 py-3 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                  defaultValue={config.maxReward}
                  disabled={isMock}
                  min={0}
                  name="maxReward"
                  type="number"
                />
              </label>
              <p className="mt-2 text-xs text-platinum/55">Верхний предел награды для формулы.</p>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/40 p-4">
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.14em] text-platinum/65">
                Базовая награда (★)
                <input
                  className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-4 py-3 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                  defaultValue={config.baseReward}
                  disabled={isMock}
                  min={0}
                  name="baseReward"
                  type="number"
                />
              </label>
              <p className="mt-2 text-xs text-platinum/55">Награда за 1‑й день (если список по дням пуст).</p>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/40 p-4">
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.14em] text-platinum/65">
                Шаг серии (★ за день)
                <input
                  className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-4 py-3 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                  defaultValue={config.streakStep}
                  disabled={isMock}
                  min={0}
                  name="streakStep"
                  type="number"
                />
              </label>
              <p className="mt-2 text-xs text-platinum/55">
                Добавка к награде за каждый следующий день серии (если список по дням пуст).
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/40 p-4">
            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.14em] text-platinum/65">
              Награды по дням (★) — по одной на строку
              <textarea
                className="min-h-[160px] resize-y rounded-lg border border-blue-400/30 bg-blue-500/20 px-4 py-3 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                defaultValue={(config.rewardsByDay ?? []).join('\n')}
                disabled={isMock}
                name="rewardsByDay"
                placeholder={'10\n12\n14\n18\n22\n28\n35'}
              />
            </label>
            <p className="mt-2 text-xs text-platinum/55">
              Если список заполнен — используется он. Если дней больше, чем строк — берётся последняя строка.
            </p>
          </div>

          <button
            className="inline-flex items-center justify-center rounded-xl border border-gold-400/50 bg-gold-500/20 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-gold-200 transition hover:bg-gold-500/30 hover:border-gold-400 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={isMock}
            type="submit"
          >
            Сохранить настройки
          </button>
        </form>
      </section>
    </div>
  );
}

