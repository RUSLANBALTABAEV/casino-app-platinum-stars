'use server';

import { revalidatePath } from 'next/cache';

import {
  approveNftShopOrder,
  createInventoryItem,
  declineNftShopOrder,
  fulfillNftShopOrder,
  updateInventoryStatus
} from '@/lib/services/nft-shop';

function ensureString(value: FormDataEntryValue | null, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} обязательно к заполнению.`);
  }
  return value.trim();
}

function normalizeOptionalString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function addInventoryItemAction(formData: FormData): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }
  const giftId = ensureString(formData.get('giftId'), 'Категория NFT');
  const telegramGiftId = normalizeOptionalString(formData.get('telegramGiftId'));
  const source = normalizeOptionalString(formData.get('source'));
  const notes = normalizeOptionalString(formData.get('notes'));

  await createInventoryItem({
    giftId,
    telegramGiftId,
    source,
    notes
  });
  revalidatePath('/admin/nft-shop');
}

export async function updateInventoryStatusAction(formData: FormData): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }
  const itemId = ensureString(formData.get('itemId'), 'Идентификатор NFT');
  const status = ensureString(formData.get('status'), 'Статус');
  const notes = normalizeOptionalString(formData.get('notes'));

  if (!['IN_STOCK', 'RESERVED', 'SENT'].includes(status)) {
    throw new Error('Недопустимый статус склада.');
  }

  await updateInventoryStatus({
    itemId,
    status: status as 'IN_STOCK' | 'RESERVED' | 'SENT',
    notes
  });
  revalidatePath('/admin/nft-shop');
}

export async function approveNftShopOrderAction(formData: FormData): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }
  const orderId = ensureString(formData.get('orderId'), 'Идентификатор заказа');
  const inventoryItemId = normalizeOptionalString(formData.get('inventoryItemId'));
  const assignAny = normalizeOptionalString(formData.get('assignAny')) === 'true';
  const notes = normalizeOptionalString(formData.get('notes'));
  const adminId = normalizeOptionalString(formData.get('adminId'));

  await approveNftShopOrder({
    orderId,
    adminId,
    inventoryItemId,
    assignAny,
    notes
  });
  revalidatePath('/admin/nft-shop');
}

export async function declineNftShopOrderAction(formData: FormData): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }
  const orderId = ensureString(formData.get('orderId'), 'Идентификатор заказа');
  const reason = normalizeOptionalString(formData.get('reason'));
  const adminId = normalizeOptionalString(formData.get('adminId'));

  await declineNftShopOrder({
    orderId,
    adminId,
    reason
  });
  revalidatePath('/admin/nft-shop');
}

export async function fulfillNftShopOrderAction(formData: FormData): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }
  const orderId = ensureString(formData.get('orderId'), 'Идентификатор заказа');
  const inventoryItemId = normalizeOptionalString(formData.get('inventoryItemId'));
  const notes = normalizeOptionalString(formData.get('notes'));
  const adminId = normalizeOptionalString(formData.get('adminId'));

  await fulfillNftShopOrder({
    orderId,
    adminId,
    inventoryItemId,
    notes
  });
  revalidatePath('/admin/nft-shop');
}
