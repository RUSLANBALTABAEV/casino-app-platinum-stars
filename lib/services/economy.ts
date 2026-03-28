/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */

import {
  DEFAULT_ECONOMY_CONFIG,
  ECONOMY_DEFAULT_PAYMENT_OPTIONS,
  type EconomyConfig,
  type EconomyPaymentOption
} from '@/lib/config/economy-default';
import { getGameSetting } from '@/lib/services/game-settings';
import { getSystemSetting, upsertSystemSetting } from '@/lib/services/system-settings';

export type { EconomyConfig, EconomyPaymentOption, CurrencyCode } from '@/lib/config/economy-default';

export interface ActivityCostSummary {
  rouletteSpin: number | null;
  runnerAttempt: number | null;
  lotteryTickets: number[];
}

function cloneDefaults(): EconomyConfig {
  return JSON.parse(JSON.stringify(DEFAULT_ECONOMY_CONFIG)) as EconomyConfig;
}

function toPositiveNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return fallback;
}

function normalizePaymentOption(option: unknown, fallback: EconomyPaymentOption): EconomyPaymentOption {
  if (!option || typeof option !== 'object') {
    return { ...fallback };
  }
  const record = option as Record<string, unknown>;
  const id =
    typeof record.id === 'string' && record.id.trim().length > 0 ? record.id.trim() : fallback.id;
  const label =
    typeof record.label === 'string' && record.label.trim().length > 0
      ? record.label.trim()
      : fallback.label;
  const caption =
    typeof record.caption === 'string' && record.caption.trim().length > 0
      ? record.caption.trim()
      : fallback.caption;

  const stars = Math.round(toPositiveNumber(record.stars, fallback.stars));
  const amount = Math.round(toPositiveNumber(record.amount, fallback.amount));

  const currencyRaw =
    typeof record.currency === 'string' && record.currency.trim().length > 0
      ? (record.currency.trim().toUpperCase() as 'RUB' | 'USD' | 'EUR' | (string & {}))
      : fallback.currency;

  return {
    id,
    label,
    caption,
    stars,
    amount,
    currency: currencyRaw
  };
}

function sanitizeUrlCandidate(value: unknown, fallback: string | null): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return fallback;
}

export function normalizeEconomyConfig(value: unknown): EconomyConfig {
  const base = cloneDefaults();

  if (!value || typeof value !== 'object') {
    return base;
  }

  const record = value as Record<string, unknown>;

  if (record.exchangeRates && typeof record.exchangeRates === 'object') {
    for (const [key, rawValue] of Object.entries(record.exchangeRates as Record<string, unknown>)) {
      const normalizedKey = key.toUpperCase().replace(/\s+/g, '_');
      const parsed = toPositiveNumber(rawValue, Number.NaN);
      if (Number.isFinite(parsed) && parsed > 0) {
        base.exchangeRates[normalizedKey] = parsed;
      }
    }
  }

  const paymentSource = Array.isArray(record.paymentOptions)
    ? (record.paymentOptions as unknown[])
    : [];
  if (paymentSource.length > 0) {
    const normalized: EconomyPaymentOption[] = [];
    for (let index = 0; index < paymentSource.length; index += 1) {
      const fallback =
        ECONOMY_DEFAULT_PAYMENT_OPTIONS[index] ?? ECONOMY_DEFAULT_PAYMENT_OPTIONS[0];
      const option = normalizePaymentOption(paymentSource[index], fallback);
      normalized.push(option);
    }
    base.paymentOptions = normalized;
  }

  if (record.customPurchase && typeof record.customPurchase === 'object') {
    const custom = record.customPurchase as Record<string, unknown>;
    base.customPurchase.minStars = Math.max(
      1,
      Math.round(toPositiveNumber(custom.minStars, base.customPurchase.minStars))
    );
    base.customPurchase.maxStars = Math.max(
      base.customPurchase.minStars,
      Math.round(toPositiveNumber(custom.maxStars, base.customPurchase.maxStars))
    );
    base.customPurchase.rubPerStar = toPositiveNumber(
      custom.rubPerStar,
      base.customPurchase.rubPerStar
    );
  }

  if (record.telegramPurchase && typeof record.telegramPurchase === 'object') {
    const telegram = record.telegramPurchase as Record<string, unknown>;
    base.telegramPurchase.minStars = Math.max(
      1,
      Math.round(toPositiveNumber(telegram.minStars, base.telegramPurchase.minStars))
    );
    base.telegramPurchase.maxStars = Math.max(
      base.telegramPurchase.minStars,
      Math.round(toPositiveNumber(telegram.maxStars, base.telegramPurchase.maxStars))
    );
    if (Array.isArray(telegram.presets) && telegram.presets.length > 0) {
      const normalizedPresets = telegram.presets
        .map((value) => Math.round(toPositiveNumber(value, 0)))
        .filter((value) => value > 0)
        .sort((a, b) => a - b);
      if (normalizedPresets.length > 0) {
        base.telegramPurchase.presets = Array.from(new Set(normalizedPresets));
      }
    }
  }

  if (record.externalLinks && typeof record.externalLinks === 'object') {
    const links = record.externalLinks as Record<string, unknown>;
    base.externalLinks.miniAppUrl = sanitizeUrlCandidate(
      links.miniAppUrl,
      base.externalLinks.miniAppUrl
    );
    base.externalLinks.topupUrl = sanitizeUrlCandidate(
      links.topupUrl,
      base.externalLinks.topupUrl
    );
    base.externalLinks.withdrawUrl = sanitizeUrlCandidate(
      links.withdrawUrl,
      base.externalLinks.withdrawUrl
    );
  }

  return base;
}

export async function getEconomyConfig(): Promise<EconomyConfig> {
  const stored = await getSystemSetting<EconomyConfig>('economy:config');
  return normalizeEconomyConfig(stored ?? null);
}

export async function saveEconomyConfig(config: EconomyConfig): Promise<void> {
  const normalized = normalizeEconomyConfig(config);
  await upsertSystemSetting({
    key: 'economy:config',
    value: normalized,
    description: 'Настройки обменного курса и вариантов пополнения'
  });
}

export async function getActivityCostSummary(): Promise<ActivityCostSummary> {
  const [rouletteSetting, runnerSetting, lotterySetting] = await Promise.all([
    getGameSetting('ROULETTE', 'config').catch(() => null),
    getGameSetting('RUNNER', 'config').catch(() => null),
    getGameSetting('LOTTERY', 'config').catch(() => null)
  ]);

  let rouletteSpin: number | null = null;
  if (
    rouletteSetting &&
    typeof rouletteSetting === 'object' &&
    'value' in rouletteSetting &&
    rouletteSetting.value &&
    typeof rouletteSetting.value === 'object' &&
    'spinCost' in rouletteSetting.value
  ) {
    const cost = (rouletteSetting.value as Record<string, unknown>).spinCost;
    rouletteSpin = Math.round(toPositiveNumber(cost, 0)) || null;
  }

  let runnerAttempt: number | null = null;
  if (
    runnerSetting &&
    typeof runnerSetting === 'object' &&
    'value' in runnerSetting &&
    runnerSetting.value &&
    typeof runnerSetting.value === 'object'
  ) {
    const value = runnerSetting.value as Record<string, unknown>;
    const costCandidate = value.attemptCost ?? value.entryCost;
    const parsed = Math.round(toPositiveNumber(costCandidate, 0));
    runnerAttempt = parsed > 0 ? parsed : null;
  }

  const lotteryTickets: number[] = [];
  if (
    lotterySetting &&
    typeof lotterySetting === 'object' &&
    'value' in lotterySetting &&
    lotterySetting.value &&
    typeof lotterySetting.value === 'object'
  ) {
    const value = lotterySetting.value as Record<string, unknown>;
    const pools = Array.isArray(value.pools) ? (value.pools as unknown[]) : [];
    for (const pool of pools) {
      if (!pool || typeof pool !== 'object') {
        continue;
      }
      const ticketCost = Math.round(toPositiveNumber((pool as Record<string, unknown>).ticketCost, 0));
      if (ticketCost > 0) {
        lotteryTickets.push(ticketCost);
      }
    }
  }

  lotteryTickets.sort((a, b) => a - b);

  return {
    rouletteSpin,
    runnerAttempt,
    lotteryTickets: Array.from(new Set(lotteryTickets))
  };
}
