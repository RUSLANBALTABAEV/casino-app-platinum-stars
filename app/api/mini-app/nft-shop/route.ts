import { NextRequest, NextResponse } from 'next/server';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { prisma } from '@/lib/prisma';
import { ensureDatabaseReady } from '@/lib/db/ensure';
import {
  assertInitDataIsFresh,
  getDevTelegramUser,
  ensureTelegramUser,
  getBotToken,
  isDevTelegramBypassEnabled,
  parseInitData,
  verifyInitData
} from '@/lib/telegram/init-data';
import { syncTelegramUser } from '@/lib/services/user';
import { getOrCreateStarBalance } from '@/lib/services/starBalanceService';
import { logSecurityEvent } from '@/lib/services/security';

async function resolveUser(req: NextRequest) {
  const rawInitData = req.headers.get('x-telegram-init-data');
  if (!rawInitData) {
    if (isDevTelegramBypassEnabled()) return syncTelegramUser(getDevTelegramUser());
    throw new Error('Missing X-Telegram-Init-Data header');
  }
  try {
    const botToken = getBotToken();
    if (!verifyInitData(rawInitData, botToken)) throw new Error('Invalid Telegram signature');
  } catch {
    if (isDevTelegramBypassEnabled()) return syncTelegramUser(getDevTelegramUser());
    throw new Error('Invalid Telegram signature');
  }
  const initData = parseInitData(rawInitData);
  assertInitDataIsFresh(initData);
  return syncTelegramUser(ensureTelegramUser(initData));
}

/** GET /api/mini-app/nft-shop — список доступных NFT для покупки */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const rateResult = applyRateLimit(`${getClientIdentifier(req)}:nft-shop:get`, {
    limit: 30,
    windowMs: 60_000
  });
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много запросов.' }, { status: 429 }),
      rateResult
    );
  }

  try {
    await ensureDatabaseReady();

    const { searchParams } = new URL(req.url);
    const rarity = searchParams.get('rarity');
    const sortBy = searchParams.get('sort') ?? 'price_asc';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const limit = 20;

    const where: Record<string, unknown> = { isActive: true };
    if (rarity && rarity !== 'all') where.rarity = rarity;

    const orderBy: Record<string, string> = {};
    if (sortBy === 'price_asc') orderBy.priceStars = 'asc';
    else if (sortBy === 'price_desc') orderBy.priceStars = 'desc';
    else if (sortBy === 'name') orderBy.name = 'asc';
    else orderBy.createdAt = 'desc';

    const [items, total] = await Promise.all([
      prisma.nftGift.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          inventoryItems: {
            where: { status: 'IN_STOCK' },
            select: { id: true }
          }
        }
      }),
      prisma.nftGift.count({ where })
    ]);

    const rarities = await prisma.nftGift.groupBy({
      by: ['rarity'],
      where: { isActive: true },
      _count: true
    });

    const shopItems = items.map(item => ({
      id: item.id,
      name: item.name,
      rarity: item.rarity,
      description: item.description,
      imageUrl: item.imageUrl,
      priceStars: item.priceStars ?? 0,
      priceBonus: item.priceBonus ?? 0,
      inStock: item.inventoryItems.length > 0,
      stockCount: item.inventoryItems.length
    }));

    return applyHeaders(
      NextResponse.json({
        items: shopItems,
        total,
        page,
        pages: Math.ceil(total / limit),
        rarities: rarities.map(r => ({ rarity: r.rarity, count: r._count }))
      }),
      rateResult
    );
  } catch (err) {
    console.error('[NFT-SHOP] GET error:', err);
    return applyHeaders(
      NextResponse.json({ error: 'Ошибка загрузки магазина' }, { status: 500 }),
      rateResult
    );
  }
}

/** POST /api/mini-app/nft-shop — купить NFT */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const rateResult = applyRateLimit(`${getClientIdentifier(req)}:nft-shop:buy`, {
    limit: 5,
    windowMs: 60_000
  });
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много запросов.' }, { status: 429 }),
      rateResult
    );
  }

  let user: Awaited<ReturnType<typeof resolveUser>>;
  try {
    user = await resolveUser(req);
  } catch (err) {
    return applyHeaders(
      NextResponse.json({ error: 'Требуется авторизация' }, { status: 401 }),
      rateResult
    );
  }

  let body: { giftId: string; useBonus?: boolean };
  try {
    body = await req.json();
  } catch {
    return applyHeaders(
      NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 }),
      rateResult
    );
  }

  if (!body.giftId || typeof body.giftId !== 'string') {
    return applyHeaders(
      NextResponse.json({ error: 'Укажите giftId' }, { status: 400 }),
      rateResult
    );
  }

  try {
    await ensureDatabaseReady();

    const result = await prisma.$transaction(async (tx) => {
      const gift = await tx.nftGift.findUnique({
        where: { id: body.giftId, isActive: true },
        include: {
          inventoryItems: {
            where: { status: 'IN_STOCK' },
            orderBy: { createdAt: 'asc' },
            take: 1
          }
        }
      });

      if (!gift) throw new Error('NFT не найден или недоступен');
      if (gift.inventoryItems.length === 0) throw new Error('NFT нет в наличии');

      const inventoryItem = gift.inventoryItems[0];
      const price = body.useBonus ? (gift.priceBonus ?? gift.priceStars ?? 0) : (gift.priceStars ?? 0);

      if (price <= 0) throw new Error('Цена NFT не установлена');

      const balance = await tx.starBalance.findUnique({ where: { userId: user.userId } });
      if (!balance) throw new Error('Баланс не найден');

      if (body.useBonus) {
        if (balance.bonusAvailable < price) throw new Error('Недостаточно бонусных звёзд');
        await tx.starBalance.update({
          where: { userId: user.userId },
          data: {
            bonusAvailable: { decrement: price },
            bonusLifetimeSpend: { increment: price }
          }
        });
      } else {
        if (balance.available < price) throw new Error('Недостаточно звёзд');
        await tx.starBalance.update({
          where: { userId: user.userId },
          data: {
            available: { decrement: price },
            lifetimeSpend: { increment: price }
          }
        });
      }

      // Резервируем инвентарный предмет
      await tx.nftInventoryItem.update({
        where: { id: inventoryItem.id },
        data: { status: 'RESERVED' }
      });

      // Создаём NFT пользователю
      const userGift = await tx.userNftGift.create({
        data: {
          userId: user.userId,
          giftId: gift.id,
          status: 'OWNED',
          source: 'SHOP',
          metadata: { purchasedAt: new Date().toISOString(), price, currency: body.useBonus ? 'BONUS' : 'STARS' }
        }
      });

      // Создаём заказ
      const order = await tx.nftShopOrder.create({
        data: {
          userId: user.userId,
          giftId: gift.id,
          type: 'BUY',
          status: 'FULFILLED',
          priceStars: price,
          feeStars: 0,
          totalStars: price,
          source: body.useBonus ? 'BONUS' : 'STARS',
          assignedItemId: inventoryItem.id,
          userGiftId: userGift.id,
          fulfilledAt: new Date()
        }
      });

      // Транзакция расхода
      await tx.transaction.create({
        data: {
          userId: user.userId,
          type: 'PURCHASE',
          amount: price,
          currency: 'STARS',
          provider: 'MANUAL',
          status: 'COMPLETED',
          meta: { source: 'NFT_SHOP', giftId: gift.id, giftName: gift.name, orderId: order.id }
        }
      });

      // Помечаем инвентарный предмет как отправленный
      await tx.nftInventoryItem.update({
        where: { id: inventoryItem.id },
        data: { status: 'SENT' }
      });

      return { order, userGift, gift };
    });

    await logSecurityEvent({
      type: 'NFT_PURCHASED',
      severity: 'INFO',
      message: `Пользователь купил NFT "${result.gift.name}" за ${result.order.priceStars} звёзд`,
      userId: user.userId,
      metadata: { giftId: body.giftId, orderId: result.order.id }
    });

    return applyHeaders(
      NextResponse.json({
        success: true,
        orderId: result.order.id,
        userGiftId: result.userGift.id,
        gift: { id: result.gift.id, name: result.gift.name, rarity: result.gift.rarity, imageUrl: result.gift.imageUrl }
      }),
      rateResult
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ошибка покупки';
    return applyHeaders(
      NextResponse.json({ error: message }, { status: 400 }),
      rateResult
    );
  }
}
