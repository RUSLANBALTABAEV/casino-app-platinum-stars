'use server';

import { revalidatePath } from 'next/cache';

import { setReferralReward } from '@/lib/services/referral';

export async function saveReferralSettingsAction(formData: FormData): Promise<void> {
  const referralRewardRaw = formData.get('referralReward');
  
  if (!referralRewardRaw) {
    throw new Error('Не указана награда за реферала');
  }

  const referralReward = Number.parseInt(String(referralRewardRaw), 10);
  
  if (!Number.isFinite(referralReward) || referralReward < 0) {
    throw new Error('Неверное значение награды за реферала');
  }

  await setReferralReward(referralReward);
  revalidatePath('/admin/referrals');
}




