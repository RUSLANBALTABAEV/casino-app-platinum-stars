import { NextRequest, NextResponse } from 'next/server';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { getDemoBalance, isDemoRequest } from '@/lib/demo-mode';
import { prisma } from '@/lib/prisma';
import { getGameAvailability, getGameSetting } from '@/lib/services/game-settings';
import { logSecurityEvent } from '@/lib/services/security';
import { syncTelegramUser } from '@/lib/services/user';
import {
  assertInitDataIsFresh,
  ensureTelegramUser,
  getBotToken,
  getDevTelegramUser,
  isDevTelegramBypassEnabled,
  parseInitData,
  verifyInitData
} from '@/lib/telegram/init-data';

type CraftBody = {
  giftIds?: string[];
};

async function resolveUser(req: NextRequest) {
  const raw = req.headers.get('x-telegram-init-data');
  if (!raw) {
    if (isDevTelegramBypassEnabled()) {
      return syncTelegramUser(getDevTelegramUser());
    }
    throw new Error('Missing X-Telegram-Init-Data header');
  }
  try {
    const token = getBotToken();
    if (!verifyInitData(raw, token)) {
      throw new Error('Invalid Telegram signature');
    }
  } catch (error) {
    if (isDevTelegramBypassEnabled()) {
      return syncTelegramUser(getDevTelegramUser());
    }
    throw error;
  }
  const initData = parseInitData(raw);
  assertInitDataIsFresh(initData);
  const telegramUser = ensureTelegramUser(initData);
  return syncTelegramUser(telegramUser);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rateResult = await applyRateLimit(`${getClientIdentifier(req)}:miniapp-craft:post`, {
    limit: 8,
    windowMs: 60_000
  });
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много попыток. Попробуйте позже.' }, { status: 429 }),
      rateResult
    );
  }

  let body: CraftBody;
  try {
    body = (await req.json()) as CraftBody;
  } catch {
    return applyHeaders(
      NextResponse.json({ error: 'Некорректный формат запроса.' }, { status: 400 }),
      rateResult
    );
  }

  const giftIds = Array.isArray(body.giftIds) ? body.giftIds.filter(Boolean) : [];

  try {
    const availability = await getGameAvailability('CRAFT');
    if (!availability.enabled) {
      return applyHeaders(
        NextResponse.json({ error: availability.message ?? 'Игра временно недоступна.' }, { status: 403 }),
        rateResult
      );
    }

    if (isDemoRequest(req)) {
      return applyHeaders(
        NextResponse.json({
          success: true,
          result: {
            crafted: {
              id: 'gift-comet',
              name: 'Комета',
              rarity: 'Легендарный',
              imageUrl: '/gifts/comet.svg'
            },
            balance: getDemoBalance()
          }
        }),
        rateResult
      );
    }

    const setting = await getGameSetting('CRAFT', 'config');
    const config = (setting?.value ?? {}) as {
      requiredCount?: number;
      rarityOrder?: string[];
    };
    const requiredCount = typeof config.requiredCount === 'number' ? config.requiredCount : 3;
    const rarityOrder = Array.isArray(config.rarityOrder)
      ? config.rarityOrder
      : ['Обычный', 'Необычный', 'Редкий', 'Эпический', 'Легендарный', 'Мифический'];

    if (giftIds.length < requiredCount) {
      throw new Error(`Для крафта нужно минимум ${requiredCount} NFT.`);
    }

    const user = await resolveUser(req);

    const result = await prisma.$transaction(async (tx) => {
      const owned = await tx.userNftGift.findMany({
        where: {
          userId: user.userId,
          id: { in: giftIds },
          status: 'OWNED'
        },
        include: { gift: true }
      });

      if (owned.length < requiredCount) {
        throw new Error('Недостаточно NFT для крафта.');
      }

      const highestRarity = owned.reduce((current, item) => {
        const currentIndex = rarityOrder.indexOf(current);
        const itemIndex = rarityOrder.indexOf(item.gift.rarity);
        return itemIndex > currentIndex ? item.gift.rarity : current;
      }, owned[0]?.gift.rarity ?? rarityOrder[0]);

      const nextIndex = Math.min(rarityOrder.length - 1, rarityOrder.indexOf(highestRarity) + 1);
      const targetRarity = rarityOrder[nextIndex] ?? highestRarity;

      const possibleGifts = await tx.nftGift.findMany({
        where: { rarity: targetRarity, isActive: true }
      });

      if (!possibleGifts.length) {
        throw new Error('Нет доступных подарков для крафта этой редкости.');
      }

      const craftedGift = possibleGifts[Math.floor(Math.random() * possibleGifts.length)];

      await tx.userNftGift.updateMany({
        where: { id: { in: owned.map((item) => item.id) } },
        data: { status: 'CRAFTED' }
      });

      const created = await tx.userNftGift.create({
        data: {
          userId: user.userId,
          giftId: craftedGift.id,
          source: 'CRAFT',
          metadata: {
            from: owned.map((item) => item.id)
          }
        }
      });

      await tx.gameSession.create({
        data: {
          userId: user.userId,
          gameType: 'CRAFT',
          wager: 0,
          payout: 0,
          finishedAt: new Date(),
          metadata: {
            craftedGiftId: craftedGift.id,
            usedGiftIds: owned.map((item) => item.id)
          }
        }
      });

      return {
        crafted: {
          id: craftedGift.id,
          name: craftedGift.name,
          rarity: craftedGift.rarity,
          imageUrl: craftedGift.imageUrl ?? null,
          recordId: created.id
        }
      };
    });

    await logSecurityEvent({
      type: 'CRAFT_COMPLETE',
      severity: 'INFO',
      message: 'Крафт NFT завершён',
      userId: user.userId,
      metadata: result
    });

    return applyHeaders(NextResponse.json({ success: true, result }), rateResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось выполнить крафт.';
    return applyHeaders(NextResponse.json({ error: message }, { status: 400 }), rateResult);
  }
}
