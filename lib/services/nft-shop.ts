import { prisma } from '@/lib/prisma';

export const NFT_SHOP_TRANSFER_FEE_STARS = 25;

export type NftShopOrderWithRelations = Awaited<ReturnType<typeof listNftShopOrders>>[number];
export type NftInventoryItemWithGift = Awaited<ReturnType<typeof listNftInventoryItems>>[number];

function ensurePositiveInt(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Некорректное значение ${label}.`);
  }
  return Math.floor(value);
}

function normalizeNotes(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 256) : null;
}

export async function listNftShopOrders(options?: {
  status?: 'PENDING' | 'APPROVED' | 'DECLINED' | 'FULFILLED';
  type?: 'BUY' | 'SELL';
  limit?: number;
}): Promise<
  Array<
    Awaited<
      ReturnType<
        typeof prisma.nftShopOrder.findMany
      >
    >[number] & {
      user: Awaited<ReturnType<typeof prisma.user.findUnique>>;
      gift: Awaited<ReturnType<typeof prisma.nftGift.findUnique>>;
      assignedItem: Awaited<ReturnType<typeof prisma.nftInventoryItem.findUnique>> | null;
      userGift: (Awaited<ReturnType<typeof prisma.userNftGift.findFirst>> & {
        gift: Awaited<ReturnType<typeof prisma.nftGift.findUnique>>;
      }) | null;
      processedBy: Awaited<ReturnType<typeof prisma.user.findUnique>> | null;
    }
  >
> {
  const limit = options?.limit && options.limit > 0 ? Math.min(options.limit, 200) : 100;
  return prisma.nftShopOrder.findMany({
    where: {
      ...(options?.status ? { status: options.status } : {}),
      ...(options?.type ? { type: options.type } : {})
    },
    include: {
      user: true,
      gift: true,
      assignedItem: true,
      userGift: { include: { gift: true } },
      processedBy: true
    },
    orderBy: { createdAt: 'desc' },
    take: limit
  });
}

export async function listNftInventoryItems(options?: {
  status?: 'IN_STOCK' | 'RESERVED' | 'SENT';
  giftId?: string;
  limit?: number;
}): Promise<
  Array<
    Awaited<
      ReturnType<
        typeof prisma.nftInventoryItem.findMany
      >
    >[number] & {
      gift: Awaited<ReturnType<typeof prisma.nftGift.findUnique>>;
    }
  >
> {
  const limit = options?.limit && options.limit > 0 ? Math.min(options.limit, 300) : 200;
  return prisma.nftInventoryItem.findMany({
    where: {
      ...(options?.status ? { status: options.status } : {}),
      ...(options?.giftId ? { giftId: options.giftId } : {})
    },
    include: { gift: true },
    orderBy: { createdAt: 'desc' },
    take: limit
  });
}

export async function createInventoryItem(data: {
  giftId: string;
  telegramGiftId?: string | null;
  source?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<
  Awaited<ReturnType<typeof prisma.nftInventoryItem.create>>
> {
  return prisma.nftInventoryItem.create({
    data: {
      giftId: data.giftId,
      telegramGiftId: data.telegramGiftId ?? null,
      source: data.source ?? null,
      notes: normalizeNotes(data.notes),
      metadata: data.metadata ?? null
    }
  });
}

export async function updateInventoryStatus(data: {
  itemId: string;
  status: 'IN_STOCK' | 'RESERVED' | 'SENT';
  notes?: string | null;
}): Promise<
  Awaited<ReturnType<typeof prisma.nftInventoryItem.update>>
> {
  return prisma.nftInventoryItem.update({
    where: { id: data.itemId },
    data: {
      status: data.status,
      notes: normalizeNotes(data.notes)
    }
  });
}

export async function createPurchaseOrder(data: {
  userId: string;
  giftId: string;
  source?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<{
  order: Awaited<ReturnType<typeof prisma.nftShopOrder.create>>;
  balance: Awaited<ReturnType<typeof prisma.starBalance.update>>;
  gift: Awaited<ReturnType<typeof prisma.nftGift.findUnique>>;
  feeStars: number;
}> {
  return prisma.$transaction(async (tx) => {
    const gift = await tx.nftGift.findUnique({ where: { id: data.giftId } });
    if (!gift || !gift.isActive) {
      throw new Error('NFT недоступен для покупки.');
    }

    const price = gift.priceStars ?? 0;
    if (!price || price <= 0) {
      throw new Error('Некорректная цена NFT.');
    }

    const inStockCount = await tx.nftInventoryItem.count({
      where: {
        giftId: gift.id,
        status: 'IN_STOCK'
      }
    });
    if (inStockCount <= 0) {
      throw new Error('NFT временно нет в наличии.');
    }

    const feeStars = ensurePositiveInt(NFT_SHOP_TRANSFER_FEE_STARS, 'комиссии');
    const totalStars = price + feeStars;

    const balance = await tx.starBalance.upsert({
      where: { userId: data.userId },
      update: {},
      create: {
        userId: data.userId,
        available: 0,
        reserved: 0,
        lifetimeEarn: 0,
        lifetimeSpend: 0,
        bonusAvailable: 0,
        bonusReserved: 0,
        bonusLifetimeEarn: 0,
        bonusLifetimeSpend: 0
      }
    });

    if (balance.available < totalStars) {
      throw new Error('Недостаточно звёзд.');
    }

    const updatedBalance = await tx.starBalance.update({
      where: { userId: data.userId },
      data: {
        available: { decrement: totalStars },
        lifetimeSpend: { increment: totalStars }
      }
    });

    const order = await tx.nftShopOrder.create({
      data: {
        userId: data.userId,
        giftId: gift.id,
        type: 'BUY',
        status: 'PENDING',
        priceStars: price,
        feeStars,
        totalStars,
        source: data.source ?? null,
        metadata: data.metadata ?? null
      }
    });

    await tx.transaction.create({
      data: {
        userId: data.userId,
        type: 'PURCHASE',
        amount: totalStars,
        currency: 'STARS',
        provider: 'MANUAL',
        status: 'COMPLETED',
        meta: {
          source: 'NFT_SHOP',
          orderId: order.id,
          giftId: gift.id,
          giftName: gift.name,
          feeStars
        }
      }
    });

    return { order, balance: updatedBalance, gift, feeStars };
  });
}

export async function createSellOrder(data: {
  userId: string;
  userGiftId: string;
  source?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<{
  order: Awaited<ReturnType<typeof prisma.nftShopOrder.create>>;
  balance: Awaited<ReturnType<typeof prisma.starBalance.upsert>>;
  gift: Awaited<ReturnType<typeof prisma.userNftGift.findFirst>>;
}> {
  return prisma.$transaction(async (tx) => {
    const ownedGift = await tx.userNftGift.findFirst({
      where: { id: data.userGiftId, userId: data.userId, status: 'OWNED' },
      include: { gift: true }
    });

    if (!ownedGift) {
      throw new Error('NFT не найден или уже использован.');
    }

    const priceStars = ownedGift.gift.priceStars ?? 0;
    if (priceStars <= 0) {
      throw new Error('Этот NFT нельзя продать за звёзды.');
    }

    await tx.userNftGift.update({
      where: { id: ownedGift.id },
      data: {
        status: 'SOLD',
        metadata: {
          ...(ownedGift.metadata as Record<string, unknown> | null),
          soldAt: new Date().toISOString(),
          soldPrice: priceStars
        }
      }
    });

    const balance = await tx.starBalance.upsert({
      where: { userId: data.userId },
      update: {
        available: { increment: priceStars },
        lifetimeEarn: { increment: priceStars }
      },
      create: {
        userId: data.userId,
        available: priceStars,
        reserved: 0,
        lifetimeEarn: priceStars,
        lifetimeSpend: 0,
        bonusAvailable: 0,
        bonusReserved: 0,
        bonusLifetimeEarn: 0,
        bonusLifetimeSpend: 0
      }
    });

    const order = await tx.nftShopOrder.create({
      data: {
        userId: data.userId,
        giftId: ownedGift.giftId,
        type: 'SELL',
        status: 'FULFILLED',
        priceStars,
        feeStars: 0,
        totalStars: priceStars,
        source: data.source ?? null,
        metadata: data.metadata ?? null,
        userGiftId: ownedGift.id,
        fulfilledAt: new Date()
      }
    });

    await tx.transaction.create({
      data: {
        userId: data.userId,
        type: 'DEPOSIT',
        amount: priceStars,
        currency: 'STARS',
        provider: 'MANUAL',
        status: 'COMPLETED',
        meta: {
          source: 'NFT_TOPUP',
          orderId: order.id,
          userGiftId: ownedGift.id,
          giftId: ownedGift.giftId,
          giftName: ownedGift.gift.name
        }
      }
    });

    return { order, balance, gift: ownedGift };
  });
}

export async function approveNftShopOrder(data: {
  orderId: string;
  adminId?: string | null;
  assignAny?: boolean;
  inventoryItemId?: string | null;
  notes?: string | null;
}): Promise<Awaited<ReturnType<typeof prisma.nftShopOrder.update>>> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.nftShopOrder.findUnique({
      where: { id: data.orderId },
      include: { gift: true }
    });

    if (!order) {
      throw new Error('Заказ не найден.');
    }

    if (order.status === 'DECLINED' || order.status === 'FULFILLED') {
      throw new Error('Нельзя изменить статус завершённого заказа.');
    }

    let assignedItemId = order.assignedItemId;

    if (data.inventoryItemId) {
      const item = await tx.nftInventoryItem.findUnique({ where: { id: data.inventoryItemId } });
      if (!item || item.status !== 'IN_STOCK') {
        throw new Error('Выбранный NFT недоступен на складе.');
      }
      if (item.giftId !== order.giftId) {
        throw new Error('NFT не соответствует выбранной категории.');
      }
      await tx.nftInventoryItem.update({
        where: { id: item.id },
        data: { status: 'RESERVED' }
      });
      assignedItemId = item.id;
    } else if (data.assignAny && !assignedItemId) {
      const item = await tx.nftInventoryItem.findFirst({
        where: { giftId: order.giftId, status: 'IN_STOCK' },
        orderBy: { createdAt: 'asc' }
      });
      if (!item) {
        throw new Error('Нет свободных NFT в выбранной категории.');
      }
      await tx.nftInventoryItem.update({
        where: { id: item.id },
        data: { status: 'RESERVED' }
      });
      assignedItemId = item.id;
    }

    return tx.nftShopOrder.update({
      where: { id: order.id },
      data: {
        status: 'APPROVED',
        assignedItemId,
        notes: normalizeNotes(data.notes),
        processedById: data.adminId ?? null,
        approvedAt: new Date()
      }
    });
  });
}

export async function declineNftShopOrder(data: {
  orderId: string;
  adminId?: string | null;
  reason?: string | null;
}): Promise<Awaited<ReturnType<typeof prisma.nftShopOrder.update>>> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.nftShopOrder.findUnique({ where: { id: data.orderId } });
    if (!order) {
      throw new Error('Заказ не найден.');
    }
    if (order.status === 'DECLINED' || order.status === 'FULFILLED') {
      throw new Error('Нельзя изменить статус завершённого заказа.');
    }

    if (order.assignedItemId) {
      await tx.nftInventoryItem.update({
        where: { id: order.assignedItemId },
        data: { status: 'IN_STOCK' }
      });
    }

    return tx.nftShopOrder.update({
      where: { id: order.id },
      data: {
        status: 'DECLINED',
        notes: normalizeNotes(data.reason),
        processedById: data.adminId ?? null,
        declinedAt: new Date()
      }
    });
  });
}

export async function fulfillNftShopOrder(data: {
  orderId: string;
  adminId?: string | null;
  inventoryItemId?: string | null;
  notes?: string | null;
}): Promise<Awaited<ReturnType<typeof prisma.nftShopOrder.update>>> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.nftShopOrder.findUnique({
      where: { id: data.orderId },
      include: { gift: true }
    });

    if (!order) {
      throw new Error('Заказ не найден.');
    }

    if (order.status === 'DECLINED') {
      throw new Error('Нельзя отправить NFT по отклонённому заказу.');
    }

    if (order.status === 'FULFILLED') {
      return order;
    }

    let assignedItemId = order.assignedItemId;

    if (data.inventoryItemId) {
      const item = await tx.nftInventoryItem.findUnique({ where: { id: data.inventoryItemId } });
      if (!item || item.status !== 'IN_STOCK') {
        throw new Error('Выбранный NFT недоступен на складе.');
      }
      if (item.giftId !== order.giftId) {
        throw new Error('NFT не соответствует выбранной категории.');
      }
      await tx.nftInventoryItem.update({
        where: { id: item.id },
        data: { status: 'SENT' }
      });
      assignedItemId = item.id;
    } else if (!assignedItemId) {
      const item = await tx.nftInventoryItem.findFirst({
        where: { giftId: order.giftId, status: 'IN_STOCK' },
        orderBy: { createdAt: 'asc' }
      });
      if (!item) {
        throw new Error('Нет свободных NFT в выбранной категории.');
      }
      await tx.nftInventoryItem.update({
        where: { id: item.id },
        data: { status: 'SENT' }
      });
      assignedItemId = item.id;
    } else {
      await tx.nftInventoryItem.update({
        where: { id: assignedItemId },
        data: { status: 'SENT' }
      });
    }

    await tx.userNftGift.create({
      data: {
        userId: order.userId,
        giftId: order.giftId,
        status: 'SENT',
        source: 'SHOP',
        metadata: {
          orderId: order.id,
          assignedItemId
        }
      }
    });

    return tx.nftShopOrder.update({
      where: { id: order.id },
      data: {
        status: 'FULFILLED',
        assignedItemId,
        notes: normalizeNotes(data.notes),
        processedById: data.adminId ?? null,
        fulfilledAt: new Date()
      }
    });
  });
}
