import { NextRequest, NextResponse } from 'next/server';

import { verifyInitData } from '@/lib/tma/verify';
import { getDevTelegramUser, isDevTelegramBypassEnabled } from '@/lib/telegram/init-data';

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (isDevTelegramBypassEnabled()) {
    return NextResponse.json(getDevTelegramUser());
  }
  const hdr = req.headers.get('authorization') || '';
  const initData = hdr.startsWith('tma ') ? hdr.slice(4) : '';
  const botToken = process.env.TELEGRAM_BOT_TOKEN || '';

  const v = verifyInitData(initData, botToken);
  if (!v.ok) return NextResponse.json({ error: 'invalid_init_data' }, { status: 401 });

  let user: any = {};
  try {
    user = JSON.parse(v.data?.user || '{}') as Record<string, unknown>;
  } catch {
    // ignore
  }

  const username = typeof user?.username === 'string' ? (user.username as string) : null;
  const firstName = typeof user?.first_name === 'string' ? (user.first_name as string) : null;
  const lastName = typeof user?.last_name === 'string' ? (user.last_name as string) : null;
  const id = typeof user?.id === 'number' ? (user.id as number) : null;
  const displayName =
    username ? `@${username}` : [firstName, lastName].filter(Boolean).join(' ') || 'Без имени';

  return NextResponse.json({
    id,
    username,
    first_name: firstName,
    last_name: lastName,
    displayName
  });
}










