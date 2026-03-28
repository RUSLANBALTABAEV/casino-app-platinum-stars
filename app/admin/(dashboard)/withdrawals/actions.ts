'use server';

import { revalidatePath } from 'next/cache';

import {
  approveWithdrawal,
  markWithdrawalSent,
  rejectWithdrawal
} from '@/lib/services/withdrawal';

function ensureString(value: FormDataEntryValue | null, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} обязательно к заполнению.`);
  }
  return value.trim();
}

export async function approveWithdrawalAction(formData: FormData): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }
  const withdrawalId = ensureString(formData.get('withdrawalId'), 'Идентификатор заявки');
  const adminIdRaw = formData.get('adminId');
  const adminId = typeof adminIdRaw === 'string' && adminIdRaw.trim().length > 0 ? adminIdRaw.trim() : null;

  await approveWithdrawal(withdrawalId, adminId);
  revalidatePath('/admin/withdrawals');
  revalidatePath('/admin/transactions');
}

export async function rejectWithdrawalAction(formData: FormData): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }
  const withdrawalId = ensureString(formData.get('withdrawalId'), 'Идентификатор заявки');
  const reasonRaw = formData.get('reason');
  const reason =
    typeof reasonRaw === 'string' && reasonRaw.trim().length > 0 ? reasonRaw.trim() : null;
  const adminIdRaw = formData.get('adminId');
  const adminId = typeof adminIdRaw === 'string' && adminIdRaw.trim().length > 0 ? adminIdRaw.trim() : null;

  await rejectWithdrawal(withdrawalId, reason, adminId);
  revalidatePath('/admin/withdrawals');
  revalidatePath('/admin/transactions');
}

export async function markWithdrawalSentAction(formData: FormData): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }
  const withdrawalId = ensureString(formData.get('withdrawalId'), 'Идентификатор заявки');
  const adminIdRaw = formData.get('adminId');
  const adminId = typeof adminIdRaw === 'string' && adminIdRaw.trim().length > 0 ? adminIdRaw.trim() : null;
  const txLinkRaw = formData.get('txLink');
  const txLink = typeof txLinkRaw === 'string' && txLinkRaw.trim().length > 0 ? txLinkRaw.trim() : null;

  await markWithdrawalSent(withdrawalId, adminId, {
    txLink: txLink ?? undefined
  });
  revalidatePath('/admin/withdrawals');
  revalidatePath('/admin/transactions');
}
