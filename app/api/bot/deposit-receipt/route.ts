import { NextRequest, NextResponse } from 'next/server';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { prisma } from '@/lib/prisma';
import { getBotToken } from '@/lib/telegram/init-data';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rateResult = applyRateLimit(getClientIdentifier(req), {
    limit: 5,
    windowMs: 60_000
  });
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много запросов.' }, { status: 429 }),
      rateResult
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      telegramId?: number;
      fileId?: string;
      fileType?: string;
      userInfo?: {
        telegramId?: number;
        firstName?: string;
        lastName?: string;
        username?: string;
        phoneNumber?: string;
      };
    };

    if (!body.telegramId || !body.fileId) {
      return applyHeaders(
        NextResponse.json({ error: 'Не указаны обязательные параметры' }, { status: 400 }),
        rateResult
      );
    }

    // Находим пользователя
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(body.telegramId) }
    });

    if (!user) {
      return applyHeaders(
        NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 }),
        rateResult
      );
    }

    // Ищем активный запрос на пополнение (PENDING)
    const activeRequest = await prisma.manualDepositRequest.findFirst({
      where: {
        userId: user.id,
        status: 'PENDING'
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Определяем chat_id канала для чеков
    const receiptsChannelId = process.env.RECEIPTS_CHANNEL_ID || '@platino2026ch';

    // Формируем информацию о пользователе
    const userInfo = body.userInfo || {};
    const userName = userInfo.firstName || 'Пользователь';
    const userUsername = userInfo.username ? `@${userInfo.username}` : 'без username';
    const userPhone = userInfo.phoneNumber || 'не указан';

    if (activeRequest) {
      // Обновляем существующий запрос
      await prisma.manualDepositRequest.update({
        where: { id: activeRequest.id },
        data: {
          receiptFileId: body.fileId,
          receiptType: body.fileType || 'photo'
        }
      });

      // Отправляем чек в канал через Telegram Bot API
      try {
        const botToken = getBotToken();
        let channelId = receiptsChannelId;
        
        // Если указан invite link (начинается с +), пытаемся получить chat_id
        if (channelId.startsWith('+')) {
          try {
            const getChatUrl = `https://api.telegram.org/bot${botToken}/getChat`;
            const chatResponse = await fetch(getChatUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: channelId })
            });
            
            if (chatResponse.ok) {
              const chatData = await chatResponse.json() as { ok?: boolean; result?: { id?: number } };
              if (chatData.ok && chatData.result?.id) {
                channelId = String(chatData.result.id);
                console.log(`Resolved invite link to chat_id: ${channelId}`);
              }
            }
          } catch (resolveError) {
            console.warn(`Failed to resolve invite link ${channelId}:`, resolveError);
            console.warn('Используйте числовой chat_id канала в RECEIPTS_CHANNEL_ID');
          }
        }
        
        const receiptCaption = `👤 <b>От:</b> ${userName} (${userUsername})\n` +
          `📱 <b>Телефон:</b> ${userPhone}\n` +
          `🆔 <b>ID:</b> ${body.telegramId}\n` +
          `📋 <b>Запрос:</b> ${activeRequest.id}\n` +
          `💰 <b>Сумма:</b> ${activeRequest.stars} ★ (${activeRequest.rubAmount} ₽)\n` +
          `📝 <b>Назначение:</b> ${activeRequest.paymentPurpose || 'не указано'}`;

        const apiUrl = body.fileType === 'photo'
          ? `https://api.telegram.org/bot${botToken}/sendPhoto`
          : `https://api.telegram.org/bot${botToken}/sendDocument`;

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: channelId,
            [body.fileType === 'photo' ? 'photo' : 'document']: body.fileId,
            caption: receiptCaption,
            parse_mode: 'HTML'
          })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Failed to send receipt to channel ${channelId}:`, errorText);
          
          if (errorText.includes('chat not found') || errorText.includes('chat_id is empty')) {
            console.error('='.repeat(60));
            console.error('ОШИБКА: Канал не найден!');
            console.error('='.repeat(60));
            console.error('Решение:');
            console.error('1. Убедитесь, что бот добавлен как АДМИНИСТРАТОР в канал');
            console.error('2. Для приватных каналов используйте числовой chat_id (например: -1001234567890)');
            console.error('3. Получите chat_id канала через скрипт get_channel_id.py');
            console.error('='.repeat(60));
          }
        } else {
          console.log(`Receipt sent to channel ${channelId}`);
        }
      } catch (error) {
        console.error(`Failed to send receipt to channel ${receiptsChannelId}:`, error);
      }

      return applyHeaders(
        NextResponse.json({
          success: true,
          depositRequestId: activeRequest.id
        }),
        rateResult
      );
    } else {
      // Создаем новый запрос без указания суммы (админ уточнит)
      const newRequest = await prisma.manualDepositRequest.create({
        data: {
          userId: user.id,
          stars: 0, // Будет уточнено админом
          rubAmount: 0,
          receiptFileId: body.fileId,
          receiptType: body.fileType || 'photo',
          status: 'PENDING'
        }
      });

      // Отправляем чек в канал через Telegram Bot API
      try {
        const botToken = getBotToken();
        let channelId = receiptsChannelId;
        
        // Если указан invite link (начинается с +), пытаемся получить chat_id
        if (channelId.startsWith('+')) {
          try {
            const getChatUrl = `https://api.telegram.org/bot${botToken}/getChat`;
            const chatResponse = await fetch(getChatUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: channelId })
            });
            
            if (chatResponse.ok) {
              const chatData = await chatResponse.json() as { ok?: boolean; result?: { id?: number } };
              if (chatData.ok && chatData.result?.id) {
                channelId = String(chatData.result.id);
                console.log(`Resolved invite link to chat_id: ${channelId}`);
              }
            }
          } catch (resolveError) {
            console.warn(`Failed to resolve invite link ${channelId}:`, resolveError);
            console.warn('Используйте числовой chat_id канала в RECEIPTS_CHANNEL_ID');
          }
        }
        
        const receiptCaption = `👤 <b>От:</b> ${userName} (${userUsername})\n` +
          `📱 <b>Телефон:</b> ${userPhone}\n` +
          `🆔 <b>ID:</b> ${body.telegramId}\n` +
          `📋 <b>Запрос:</b> ${newRequest.id}\n` +
          `⚠️ <b>Сумма не указана, требуется уточнение</b>`;

        const apiUrl = body.fileType === 'photo'
          ? `https://api.telegram.org/bot${botToken}/sendPhoto`
          : `https://api.telegram.org/bot${botToken}/sendDocument`;

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: channelId,
            [body.fileType === 'photo' ? 'photo' : 'document']: body.fileId,
            caption: receiptCaption,
            parse_mode: 'HTML'
          })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Failed to send receipt to channel ${channelId}:`, errorText);
          
          if (errorText.includes('chat not found') || errorText.includes('chat_id is empty')) {
            console.error('='.repeat(60));
            console.error('ОШИБКА: Канал не найден!');
            console.error('='.repeat(60));
            console.error('Решение:');
            console.error('1. Убедитесь, что бот добавлен как АДМИНИСТРАТОР в канал');
            console.error('2. Для приватных каналов используйте числовой chat_id (например: -1001234567890)');
            console.error('3. Получите chat_id канала через скрипт get_channel_id.py');
            console.error('='.repeat(60));
          }
        } else {
          console.log(`Receipt sent to channel ${channelId}`);
        }
      } catch (error) {
        console.error(`Failed to send receipt to channel ${receiptsChannelId}:`, error);
      }

      return applyHeaders(
        NextResponse.json({
          success: true,
          depositRequestId: newRequest.id
        }),
        rateResult
      );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Внутренняя ошибка сервера';
    return applyHeaders(
      NextResponse.json({ error: message }, { status: 500 }),
      rateResult
    );
  }
}
