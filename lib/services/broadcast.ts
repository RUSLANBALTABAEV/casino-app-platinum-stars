/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

/* eslint-disable @typescript-eslint/no-unsafe-return */

import crypto from 'crypto';

import { prisma } from '@/lib/prisma';
import { getBotToken } from '@/lib/telegram/init-data';

type BroadcastSegment = 'ALL' | 'PREMIUM' | 'ACTIVE';

interface SendBroadcastInput {
  title: string;
  message: string;
  segment: BroadcastSegment;
}

export async function sendBroadcast({ title, message, segment }: SendBroadcastInput) {
  const botToken = getBotToken();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any;

  const broadcast = await db.broadcast.create({
    data: {
      id: crypto.randomUUID(),
      title,
      message,
      segment,
      status: 'PENDING'
    }
  });

  const whereClause =
    segment === 'PREMIUM'
      ? { isBanned: false, isPremium: true }
      : segment === 'ACTIVE'
        ? { isBanned: false }
        : {};

  const recipients = await db.user.findMany({
    where: whereClause,
    select: {
      id: true,
      telegramId: true,
      languageCode: true
    }
  });

  if (recipients.length === 0) {
    await db.broadcast.update({
      where: { id: broadcast.id },
      data: {
        status: 'FAILED',
        totalRecipients: 0,
        failed: 0,
        delivered: 0,
        sentAt: new Date()
      }
    });
    return { delivered: 0, failed: 0, broadcastId: broadcast.id };
  }

  const apiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
  let delivered = 0;
  let failed = 0;

  for (const recipient of recipients) {
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: recipient.telegramId.toString(),
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        })
      });

      if (response.ok) {
        delivered += 1;
      } else {
        failed += 1;
      }
    } catch {
      failed += 1;
    }

    await new Promise((resolve) => setTimeout(resolve, 35));
  }

  await db.broadcast.update({
    where: { id: broadcast.id },
    data: {
      status: failed > 0 ? 'FAILED' : 'SENT',
      delivered,
      failed,
      totalRecipients: recipients.length,
      sentAt: new Date()
    }
  });

  return { delivered, failed, broadcastId: broadcast.id };
}

export function getBroadcasts(limit = 20) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any;
  return db.broadcast.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit
  });
}
