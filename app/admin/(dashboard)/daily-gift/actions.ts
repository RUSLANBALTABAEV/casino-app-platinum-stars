'use server';

import { revalidatePath } from 'next/cache';

import { setDailyGiftConfig, type DailyGiftConfig } from '@/lib/services/daily-gift';

function parseRewards(value: string): number[] {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }
  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines
    .map((line) => Number.parseInt(line.replace(/[^\d-]/g, ''), 10))
    .filter((n) => Number.isFinite(n) && n >= 0);
}

export async function saveDailyGiftSettingsAction(formData: FormData): Promise<void> {
  const cooldownSecondsRaw = Number.parseInt(String(formData.get('cooldownSeconds') ?? ''), 10);
  const cooldownHoursRaw = Number.parseFloat(String(formData.get('cooldownHours') ?? ''));
  const baseReward = Number.parseInt(String(formData.get('baseReward') ?? ''), 10);
  const streakStep = Number.parseInt(String(formData.get('streakStep') ?? ''), 10);
  const maxReward = Number.parseInt(String(formData.get('maxReward') ?? ''), 10);
  const rewardsByDayRaw = String(formData.get('rewardsByDay') ?? '');

  const cooldownSeconds =
    Number.isFinite(cooldownHoursRaw) && cooldownHoursRaw > 0
      ? Math.round(cooldownHoursRaw * 3600)
      : cooldownSecondsRaw;

  const next: DailyGiftConfig = {
    cooldownSeconds: Number.isFinite(cooldownSeconds) ? cooldownSeconds : 24 * 60 * 60,
    baseReward: Number.isFinite(baseReward) ? baseReward : 10,
    streakStep: Number.isFinite(streakStep) ? streakStep : 2,
    maxReward: Number.isFinite(maxReward) ? maxReward : 40,
    rewardsByDay: parseRewards(rewardsByDayRaw)
  };

  await setDailyGiftConfig(next);
  revalidatePath('/admin/daily-gift');
}
