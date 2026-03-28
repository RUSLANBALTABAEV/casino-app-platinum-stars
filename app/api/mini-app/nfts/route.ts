import { NextRequest, NextResponse } from 'next/server';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { prisma } from '@/lib/prisma';
import { getDemoBalance, isDemoRequest } from '@/lib/demo-mode';
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

async function resolveUser(req: NextRequest) {
  const raw = req.headers.get('x-telegram-init-data');
  if (!raw) {
    if (isDevTelegramBypassEnabled()) return syncTelegramUser(getDevTelegramUser());
    throw new Error('Missing X-Telegram-Init-Data header');
  }
  try {
    const token = getBotToken();
    if (!verifyInitData(raw, token)) throw new Error('Invalid Telegram signature');
  } catch (error) {
    if (isDevTelegramBypassEnabled()) return syncTelegramUser(getDevTelegramUser());
    throw error;
  }
  const initData = parseInitData(raw);
  assertInitDataIsFresh(initData);
  return syncTelegramUser(ensureTelegramUser(initData));
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // FIX: was missing await, causing potential crash
  const rateResult = await applyRateLimit(`${getClientIdentifier(req)}:miniapp-nfts:get`, {
    limit: 40,
    windowMs: 60_000
  });

  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много запросов. Попробуйте позже.' }, { status: 429 }),
      rateResult
    );
  }

  try {
    if (isDemoRequest(req)) {
      // FIX: was returning only 2 items — craft requires 3 minimum
      return applyHeaders(
        NextResponse.json({
          balance: getDemoBalance(),
          items: [
            {
              id: 'demo-nft-1',
              giftId: 'gift-snowflake',
              name: 'Снежная искра',
              rarity: 'Эпический',
              imageUrl: '/gifts/snowflake.svg',
              priceStars: 150,
              status: 'OWNED',
              receivedAt: new Date().toISOString()
            },
            {
              id: 'demo-nft-2',
              giftId: 'gift-comet',
              name: 'Комета',
              rarity: 'Легендарный',
              imageUrl: '/gifts/comet.svg',
              priceStars: 320,
              status: 'OWNED',
              receivedAt: new Date().toISOString()
            },
            {
              id: 'demo-nft-3',
              giftId: 'gift-snowflake',
              name: 'Снежная искра',
              rarity: 'Эпический',
              imageUrl: '/gifts/snowflake.svg',
              priceStars: 150,
              status: 'OWNED',
              receivedAt: new Date().toISOString()
            },
            {
              id: 'demo-nft-4',
              giftId: 'gift-comet',
              name: 'Комета',
              rarity: 'Легендарный',
              imageUrl: '/gifts/comet.svg',
              priceStars: 320,
              status: 'OWNED',
              receivedAt: new Date().toISOString()
            }
          ]
        }),
        rateResult
      );
    }

    const user = await resolveUser(req);
    const items = await prisma.userNftGift.findMany({
      where: { userId: user.userId, status: { in: ['OWNED', 'PENDING_SEND', 'SENT'] } },
      include: { gift: true },
      orderBy: { createdAt: 'desc' }
    });

    return applyHeaders(
      NextResponse.json({
        items: items.map((item) => ({
          id: item.id,
          giftId: item.giftId,
          name: item.gift.name,
          rarity: item.gift.rarity,
          imageUrl: item.gift.imageUrl,
          priceStars: item.gift.priceStars,
          status: item.status,
          receivedAt: item.createdAt.toISOString()
        }))
      }),
      rateResult
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось загрузить NFT.';
    return applyHeaders(NextResponse.json({ error: message }, { status: 500 }), rateResult);
  }
}
