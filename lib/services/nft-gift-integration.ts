/**
 * Сервис NFT-интеграции (Раздел 10 ТЗ).
 *
 * Обрабатывает входящие NFT-подарки (Telegram Gifts API), переданные боту,
 * и автоматически начисляет звёзды на баланс пользователя.
 *
 * Поток:
 *  1. Telegram отправляет боту апдейт типа `message` с `gift` или
 *     `message_entity` типа `gift`. В Python-боте это перехватывается
 *     хендлером handle_gift_received() и POST'ится на /api/bot/nft-gift.
 *  2. /api/bot/nft-gift вызывает processIncomingNftGift().
 *  3. Сервис ищет NftGift по telegramGiftId, начисляет баланс, создаёт
 *     запись UserNftGift с source='GIFT_TRANSFER', уведомляет пользователя.
 */

import { prisma } from '@/lib/prisma';
import { logSecurityEvent } from '@/lib/services/security';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ─── Telegram уведомление ──────────────────────────────────────────────────
async function notifyUser(telegramId: number, text: string): Promise<void> {
  try {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramId,
        text,
        parse_mode: 'HTML',
      }),
    });
  } catch {
    // Уведомление — некритичная операция
  }
}

// ─── Основная логика ───────────────────────────────────────────────────────

export interface IncomingGiftPayload {
  /** Telegram ID отправителя (пользователя, который подарил NFT боту) */
  senderTelegramId: number;
  /** ID подарка в Telegram (из апдейта gift.id / sticker.file_unique_id) */
  telegramGiftId: string;
  /** Название подарка (из апдейта) */
  giftName?: string;
  /** Raw payload для отладки */
  rawPayload?: unknown;
}

export interface GiftProcessResult {
  success: boolean;
  credited?: number;
  userGiftId?: string;
  giftName?: string;
  error?: string;
}

/**
 * Обрабатывает входящий NFT-подарок, переданный боту пользователем.
 * Начисляет звёзды на баланс в соответствии со значением priceStars у NftGift.
 */
export async function processIncomingNftGift(
  payload: IncomingGiftPayload,
): Promise<GiftProcessResult> {
  const { senderTelegramId, telegramGiftId, giftName, rawPayload } = payload;

  // Ищем пользователя
  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(senderTelegramId) },
    select: { id: true, firstName: true },
  });

  if (!user) {
    return {
      success: false,
      error: 'Пользователь не найден. Попросите сначала открыть мини-приложение.',
    };
  }

  // Ищем NFT по telegramGiftId
  const nftGift = await prisma.nftGift.findFirst({
    where: { telegramGiftId, isActive: true },
  });

  if (!nftGift) {
    // Неизвестный подарок — логируем, но не начисляем
    await logSecurityEvent({
      type: 'WITHDRAWAL_REQUESTED', // ближайший подходящий тип события
      severity: 'WARNING',
      message: `Получен неизвестный NFT-подарок telegramGiftId=${telegramGiftId}`,
      userId: user.id,
      metadata: { telegramGiftId, giftName, senderTelegramId },
    });

    await notifyUser(
      senderTelegramId,
      `⚠️ Подарок <b>${giftName ?? telegramGiftId}</b> получен, но не найден в каталоге Platinum Stars.\n\nОбратитесь в поддержку.`,
    );

    return {
      success: false,
      error: `NFT с telegramGiftId=${telegramGiftId} не найден в каталоге.`,
    };
  }

  const starsToCredit = nftGift.priceStars ?? 0;

  // Создаём запись UserNftGift и начисляем баланс в одной транзакции
  const result = await prisma.$transaction(async (tx) => {
    // Проверяем дубликаты (один и тот же подарок не должен начисляться дважды)
    const existing = await tx.userNftGift.findFirst({
      where: {
        userId: user.id,
        giftId: nftGift.id,
        source: 'GIFT_TRANSFER',
        metadata: {
          path: ['telegramGiftId'],
          equals: telegramGiftId,
        },
      },
    });

    if (existing) {
      throw new Error('Этот подарок уже был зачтён ранее.');
    }

    // Создаём запись о полученном NFT
    const userGift = await tx.userNftGift.create({
      data: {
        userId: user.id,
        giftId: nftGift.id,
        status: 'OWNED',
        source: 'GIFT_TRANSFER',
        metadata: {
          telegramGiftId,
          receivedAt: new Date().toISOString(),
          senderTelegramId,
          rawPayload: rawPayload ?? null,
          creditedStars: starsToCredit,
        },
      },
    });

    // Начисляем звёзды, если у подарка есть priceStars
    let newBalance = null;
    if (starsToCredit > 0) {
      newBalance = await tx.starBalance.upsert({
        where: { userId: user.id },
        update: {
          available: { increment: starsToCredit },
          lifetimeEarn: { increment: starsToCredit },
        },
        create: {
          userId: user.id,
          available: starsToCredit,
          reserved: 0,
          lifetimeEarn: starsToCredit,
          lifetimeSpend: 0,
          bonusAvailable: 0,
          bonusReserved: 0,
          bonusLifetimeEarn: 0,
          bonusLifetimeSpend: 0,
        },
      });

      await tx.transaction.create({
        data: {
          userId: user.id,
          type: 'DEPOSIT',
          amount: starsToCredit,
          currency: 'STARS',
          provider: 'MANUAL',
          status: 'COMPLETED',
          meta: {
            source: 'NFT_GIFT_TRANSFER',
            userGiftId: userGift.id,
            giftId: nftGift.id,
            giftName: nftGift.name,
            telegramGiftId,
          },
        },
      });
    }

    return { userGift, newBalance };
  });

  // Уведомляем пользователя
  const userName = user.firstName ?? 'Пользователь';
  if (starsToCredit > 0) {
    await notifyUser(
      senderTelegramId,
      `🎁 <b>${userName}</b>, подарок <b>${nftGift.name}</b> получен!\n\n` +
        `✅ На ваш баланс начислено <b>${starsToCredit} ★</b>.\n\n` +
        `Звёзды уже доступны в мини-приложении.`,
    );
  } else {
    await notifyUser(
      senderTelegramId,
      `🎁 <b>${userName}</b>, подарок <b>${nftGift.name}</b> добавлен в ваш инвентарь Platinum Stars!`,
    );
  }

  await logSecurityEvent({
    type: 'WITHDRAWAL_REQUESTED',
    severity: 'INFO',
    message: `NFT-подарок зачтён: ${nftGift.name} (+${starsToCredit}★)`,
    userId: user.id,
    metadata: {
      telegramGiftId,
      giftId: nftGift.id,
      giftName: nftGift.name,
      starsToCredit,
      userGiftId: result.userGift.id,
    },
  });

  return {
    success: true,
    credited: starsToCredit,
    userGiftId: result.userGift.id,
    giftName: nftGift.name,
  };
}
