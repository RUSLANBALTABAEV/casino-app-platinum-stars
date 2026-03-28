'use server';

import { revalidatePath } from 'next/cache';

import {
  DEFAULT_ECONOMY_CONFIG,
  type EconomyConfig,
  type EconomyPaymentOption
} from '@/lib/config/economy-default';
import { normalizeEconomyConfig, saveEconomyConfig } from '@/lib/services/economy';
import { getReferralReward, setReferralReward } from '@/lib/services/referral';

function parseNumberField(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function parsePaymentOptions(raw: string): EconomyPaymentOption[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error();
    }
    return parsed as EconomyPaymentOption[];
  } catch {
    throw new Error('Неверный формат JSON для вариантов пополнения.');
  }
}

function parsePresets(raw: string, fallback: number[]): number[] {
  const tokens = raw
    .split(/[,\s]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const presets = tokens
    .map((token) => Number.parseInt(token, 10))
    .filter((value) => Number.isFinite(value) && value > 0);
  return presets.length > 0 ? Array.from(new Set(presets)).sort((a, b) => a - b) : fallback;
}

export async function saveEconomySettingsAction(formData: FormData): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }

  const currentReferralReward = await getReferralReward();
  const starToRub = parseNumberField(formData.get('starToRub'), DEFAULT_ECONOMY_CONFIG.exchangeRates.STAR_TO_RUB);
  const starToUsd = parseNumberField(formData.get('starToUsd'), DEFAULT_ECONOMY_CONFIG.exchangeRates.STAR_TO_USD);
  const starToEur = parseNumberField(formData.get('starToEur'), DEFAULT_ECONOMY_CONFIG.exchangeRates.STAR_TO_EUR);

  const customMinStars = parseNumberField(
    formData.get('customMinStars'),
    DEFAULT_ECONOMY_CONFIG.customPurchase.minStars
  );
  const customMaxStars = parseNumberField(
    formData.get('customMaxStars'),
    DEFAULT_ECONOMY_CONFIG.customPurchase.maxStars
  );
  const customRubPerStar = parseNumberField(
    formData.get('customRubPerStar'),
    DEFAULT_ECONOMY_CONFIG.customPurchase.rubPerStar
  );

  const telegramMinStars = parseNumberField(
    formData.get('telegramMinStars'),
    DEFAULT_ECONOMY_CONFIG.telegramPurchase.minStars
  );
  const telegramMaxStars = parseNumberField(
    formData.get('telegramMaxStars'),
    DEFAULT_ECONOMY_CONFIG.telegramPurchase.maxStars
  );
  const telegramPresetsRaw = formData.get('telegramPresets');
  const referralReward = parseNumberField(formData.get('referralReward'), currentReferralReward);

  const paymentOptionsRaw = formData.get('paymentOptions');
  let paymentOptions: EconomyPaymentOption[] = DEFAULT_ECONOMY_CONFIG.paymentOptions.map((option) => ({
    ...option
  }));
  if (typeof paymentOptionsRaw === 'string' && paymentOptionsRaw.trim()) {
    paymentOptions = parsePaymentOptions(paymentOptionsRaw.trim());
  }

  const config: EconomyConfig = {
    exchangeRates: {
      STAR_TO_RUB: starToRub,
      STAR_TO_USD: starToUsd,
      STAR_TO_EUR: starToEur
    },
    paymentOptions,
    customPurchase: {
      minStars: Math.max(1, Math.round(customMinStars)),
      maxStars: Math.max(Math.round(customMaxStars), Math.round(customMinStars)),
      rubPerStar: customRubPerStar
    },
    telegramPurchase: {
      minStars: Math.max(1, Math.round(telegramMinStars)),
      maxStars: Math.max(Math.round(telegramMaxStars), Math.round(telegramMinStars)),
      presets:
        typeof telegramPresetsRaw === 'string' && telegramPresetsRaw.trim()
          ? parsePresets(telegramPresetsRaw, DEFAULT_ECONOMY_CONFIG.telegramPurchase.presets)
          : DEFAULT_ECONOMY_CONFIG.telegramPurchase.presets
    },
    externalLinks: DEFAULT_ECONOMY_CONFIG.externalLinks
  };

  const normalized = normalizeEconomyConfig(config);
  await saveEconomyConfig(normalized);
  await setReferralReward(referralReward);
  revalidatePath('/admin/economy');
}
