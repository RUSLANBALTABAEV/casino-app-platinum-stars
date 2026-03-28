import { NextRequest, NextResponse } from 'next/server';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { redeemPromoForUser } from '@/lib/services/promo';
import { syncTelegramUser } from '@/lib/services/user';
import {
  assertInitDataIsFresh,
  getDevTelegramUser,
  ensureTelegramUser,
  getBotToken,
  isDevTelegramBypassEnabled,
  parseInitData,
  verifyInitData
} from '@/lib/telegram/init-data';

interface RedeemBody {
  code?: string;
}

function getInitData(req: NextRequest): string | null {
  return req.headers.get('x-telegram-init-data');
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rateResult = applyRateLimit(`${getClientIdentifier(req)}:miniapp-promo`, {
    limit: 5,
    windowMs: 60_000
  });
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много попыток. Попробуйте позже.' }, { status: 429 }),
      rateResult
    );
  }

  const rawInitData = getInitData(req);
  if (!rawInitData) {
    if (isDevTelegramBypassEnabled()) {
      const synced = await syncTelegramUser(getDevTelegramUser());
      const body = (await req.json().catch(() => ({}))) as RedeemBody;
      const code = body.code?.trim();
      if (!code) {
        return applyHeaders(
          NextResponse.json({ error: 'Введите промокод' }, { status: 422 }),
          rateResult
        );
      }
      try {
        const result = await redeemPromoForUser(synced.userId, code);
        return applyHeaders(
          NextResponse.json({
            success: true,
            reward: result.reward,
            promoId: result.promoId,
            remainingGlobalUses: result.remainingGlobalUses,
            grantedStatus: result.grantedStatus
          }),
          rateResult
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Промокод не найден';
        return applyHeaders(NextResponse.json({ error: message }, { status: 400 }), rateResult);
      }
    }
    return applyHeaders(
      NextResponse.json({ error: 'Missing X-Telegram-Init-Data header' }, { status: 401 }),
      rateResult
    );
  }

  try {
    const botToken = getBotToken();
    if (!verifyInitData(rawInitData, botToken)) {
      return applyHeaders(
        NextResponse.json({ error: 'Invalid Telegram signature' }, { status: 401 }),
        rateResult
      );
    }
  } catch (error) {
    if (isDevTelegramBypassEnabled()) {
      const synced = await syncTelegramUser(getDevTelegramUser());
      const body = (await req.json().catch(() => ({}))) as RedeemBody;
      const code = body.code?.trim();
      if (!code) {
        return applyHeaders(
          NextResponse.json({ error: 'Введите промокод' }, { status: 422 }),
          rateResult
        );
      }
      try {
        const result = await redeemPromoForUser(synced.userId, code);
        return applyHeaders(
          NextResponse.json({
            success: true,
            reward: result.reward,
            promoId: result.promoId,
            remainingGlobalUses: result.remainingGlobalUses,
            grantedStatus: result.grantedStatus
          }),
          rateResult
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Промокод не найден';
        return applyHeaders(NextResponse.json({ error: message }, { status: 400 }), rateResult);
      }
    }
    throw error;
  }

  const initData = parseInitData(rawInitData);
  try {
    assertInitDataIsFresh(initData);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid init data';
    return applyHeaders(NextResponse.json({ error: message }, { status: 401 }), rateResult);
  }

  const body = (await req.json().catch(() => ({}))) as RedeemBody;
  const code = body.code?.trim();
  if (!code) {
    return applyHeaders(
      NextResponse.json({ error: 'Введите промокод' }, { status: 422 }),
      rateResult
    );
  }

  const telegramUser = ensureTelegramUser(initData);
  const synced = await syncTelegramUser(telegramUser);

  try {
    const result = await redeemPromoForUser(synced.userId, code);
    return applyHeaders(
      NextResponse.json({
        success: true,
        reward: result.reward,
        promoId: result.promoId,
        remainingGlobalUses: result.remainingGlobalUses,
        grantedStatus: result.grantedStatus
      }),
      rateResult
    );
  } catch (error) {
    // Обрабатываем различные типы ошибок и выдаем понятные сообщения
    let message = 'Промокод не найден';
    
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      
      // Проверяем тип ошибки и выдаем соответствующее сообщение
      if (errorMessage.includes('не найден') || errorMessage.includes('not found')) {
        message = 'Промокод не найден';
      } else if (errorMessage.includes('отключен') || errorMessage.includes('неактив')) {
        message = 'Промокод не найден';
      } else if (errorMessage.includes('истёк') || errorMessage.includes('expired')) {
        message = 'Срок действия промокода истёк';
      } else if (errorMessage.includes('лимит') || errorMessage.includes('limit')) {
        message = 'Лимит активаций промокода исчерпан';
      } else if (errorMessage.includes('уже активировал') || errorMessage.includes('duplicate')) {
        message = 'Вы уже активировали этот промокод';
      } else if (errorMessage.includes('ещё не активирован') || errorMessage.includes('not activated')) {
        message = 'Промокод ещё не активирован';
      } else if (errorMessage.includes('prisma') || errorMessage.includes('database') || errorMessage.includes('db')) {
        // Скрываем технические ошибки БД
        message = 'Промокод не найден';
      } else {
        // Для других ошибок используем оригинальное сообщение, если оно понятное
        message = error.message;
      }
    }
    
    return applyHeaders(
      NextResponse.json({ error: message }, { status: 400 }),
      rateResult
    );
  }
}
