import React from 'react';

export const runtime = 'nodejs';

import { DEFAULT_ECONOMY_CONFIG } from '@/lib/config/economy-default';
import { prisma } from '@/lib/prisma';
import { getActivityCostSummary, normalizeEconomyConfig } from '@/lib/services/economy';
import { getReferralReward } from '@/lib/services/referral';
import { listSystemSettings, type SystemSettingRecord } from '@/lib/services/system-settings';
import { saveEconomySettingsAction } from './actions';

async function loadEconomyConfig() {
  if (!process.env.DATABASE_URL) {
    return {
      config: DEFAULT_ECONOMY_CONFIG,
      isMock: true
    };
  }

  const setting = await prisma.systemSetting
    .findUnique({
      where: { key: 'economy:config' }
    })
    .catch(() => null);

  if (!setting?.value) {
    return {
      config: DEFAULT_ECONOMY_CONFIG,
      isMock: false
    };
  }

  return {
    config: normalizeEconomyConfig(setting.value),
    isMock: false
  };
}

export default async function AdminEconomyPage(): Promise<React.JSX.Element> {
  const [{ config, isMock }, activityCosts, settings, referralReward] = await Promise.all([
    loadEconomyConfig(),
    getActivityCostSummary().catch(() => ({
      rouletteSpin: null,
      runnerAttempt: null,
      lotteryTickets: []
    })),
    listSystemSettings().catch((): SystemSettingRecord[] => []),
    getReferralReward().catch(() => 0)
  ]);

  const economySetting = settings.find((item) => item.key === 'economy:config') ?? null;
  const economyUpdatedLabel =
    economySetting?.updatedAt instanceof Date
      ? economySetting.updatedAt.toLocaleString('ru-RU')
      : null;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.24em] text-gold-400/70">Экономика</p>
        <h1 className="text-3xl font-semibold text-platinum">Курсы и тарифы</h1>
        <p className="max-w-[70ch] text-sm text-platinum/60">
          Настройте обменный курс звёзд, пакеты пополнений и границы кастомного или Telegram-пополнения.
          Эти параметры отображаются в кошельке пользователей и определяют стоимость активности внутри игр.
        </p>
        {isMock && (
          <p className="py-2 text-xs text-yellow-300">
            Подключение к базе данных не настроено. Отображены значения по умолчанию, сохранение отключено.
          </p>
        )}
      </header>

      <section className="flex flex-col gap-6">
        <form
          action={saveEconomySettingsAction}
          className="space-y-6 py-4"
        >
          <div>
            <h2 className="text-lg font-semibold text-platinum">Обменные курсы</h2>
            <p className="text-sm text-platinum/60">
              Значения определяют цену одной звезды в выбранной валюте. Используются для отображения в кошельке.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {[
              { name: 'starToRub', label: 'STAR → RUB', value: config.exchangeRates.STAR_TO_RUB },
              { name: 'starToUsd', label: 'STAR → USD', value: config.exchangeRates.STAR_TO_USD },
              { name: 'starToEur', label: 'STAR → EUR', value: config.exchangeRates.STAR_TO_EUR }
            ].map((field) => (
              <label key={field.name} className="flex flex-col gap-2 text-xs uppercase tracking-[0.14em] text-platinum/65">
                {field.label}
                <input
                  className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-4 py-3 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                  defaultValue={field.value}
                  disabled={isMock}
                  inputMode="decimal"
                  min={0}
                  name={field.name}
                  step="0.0001"
                  type="number"
                />
              </label>
            ))}
          </div>

          <div>
            <h3 className="text-base font-semibold text-platinum">Пакеты пополнения</h3>
            <p className="text-xs text-platinum/60">
              Опишите массив вариантов пополнения в формате JSON. Каждый объект должен содержать id, stars, amount, currency, label и caption.
            </p>
          </div>
          <textarea
            className="min-h-[240px] w-full rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-4 py-3 font-mono text-xs text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
            defaultValue={JSON.stringify(config.paymentOptions, null, 2)}
            disabled={isMock}
            name="paymentOptions"
            spellCheck={false}
          />

          <div className="flex flex-col gap-4">
            <div className="space-y-4 py-4">
              <h3 className="text-sm font-semibold text-platinum">Кастомное пополнение</h3>
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.14em] text-platinum/65">
                Минимум звёзд
                <input
                  className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-4 py-3 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                  defaultValue={config.customPurchase.minStars}
                  disabled={isMock}
                  min={1}
                  name="customMinStars"
                  type="number"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.14em] text-platinum/65">
                Максимум звёзд
                <input
                  className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-4 py-3 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                  defaultValue={config.customPurchase.maxStars}
                  disabled={isMock}
                  min={1}
                  name="customMaxStars"
                  type="number"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.14em] text-platinum/65">
                RUB за 1 ★
                <input
                  className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-4 py-3 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                  defaultValue={config.customPurchase.rubPerStar}
                  disabled={isMock}
                  inputMode="decimal"
                  min={0}
                  name="customRubPerStar"
                  step="0.0001"
                  type="number"
                />
              </label>
            </div>

            <div className="space-y-4 py-4">
              <h3 className="text-sm font-semibold text-platinum">Telegram Stars</h3>
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.14em] text-platinum/65">
                Минимум звёзд
                <input
                  className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-4 py-3 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                  defaultValue={config.telegramPurchase.minStars}
                  disabled={isMock}
                  min={1}
                  name="telegramMinStars"
                  type="number"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.14em] text-platinum/65">
                Максимум звёзд
                <input
                  className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-4 py-3 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                  defaultValue={config.telegramPurchase.maxStars}
                  disabled={isMock}
                  min={1}
                  name="telegramMaxStars"
                  type="number"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.14em] text-platinum/65">
                Пресеты (через запятую)
                <input
                  className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-4 py-3 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                  defaultValue={config.telegramPurchase.presets.join(', ')}
                  disabled={isMock}
                  name="telegramPresets"
                  placeholder="100, 250, 500, 1000"
                  type="text"
                />
              </label>
            </div>
          </div>

          <div className="space-y-4 py-4">
            <h3 className="text-sm font-semibold text-platinum">Реферальная программа</h3>
            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.14em] text-platinum/65">
              Награда за друга (★)
              <input
                className="rounded-lg border border-blue-400/30 bg-blue-500/20 pb-1 px-4 py-3 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                defaultValue={referralReward}
                disabled={isMock}
                min={0}
                name="referralReward"
                type="number"
              />
            </label>
            <p className="text-xs text-platinum/55">
              Значение определяет, сколько звёзд получает пригласивший за успешно завершённое целевое действие приглашённого игрока.
            </p>
          </div>

          <button
            className="inline-flex items-center justify-center px-8 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-gold-200 transition hover:text-gold-100 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={isMock}
            type="submit"
          >
            Сохранить экономику
          </button>
        </form>

        <aside className="space-y-4 py-4">
          <h2 className="text-lg font-semibold text-platinum">Стоимость активностей</h2>
          <div className="space-y-4 text-sm text-platinum/70">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-platinum/50">Рулетка</p>
              <p className="text-lg font-semibold text-platinum">
                {activityCosts.rouletteSpin ? `${activityCosts.rouletteSpin} ★ за прокрутку` : 'Не настроено'}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-platinum/50">Раннер</p>
              <p className="text-lg font-semibold text-platinum">
                {activityCosts.runnerAttempt ? `${activityCosts.runnerAttempt} ★ за попытку` : 'Не настроено'}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-platinum/50">Лотереи</p>
              <p className="text-lg font-semibold text-platinum">
                {activityCosts.lotteryTickets.length > 0
                  ? `Билеты: ${activityCosts.lotteryTickets.map((value) => `${value} ★`).join(', ')}`
                  : 'Не настроено'}
              </p>
            </div>
          </div>

          {economyUpdatedLabel && (
            <div className="py-3 text-xs text-platinum/55">
              <p className="font-semibold text-platinum/80">Последнее изменение</p>
              <p>{economyUpdatedLabel}</p>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
