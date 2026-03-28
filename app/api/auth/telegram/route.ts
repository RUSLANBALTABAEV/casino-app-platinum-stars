import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { syncTelegramUser } from '@/lib/services/user';
import { parseInitData } from '@/lib/telegram/init-data';
import { verifyTelegramInitData } from '@/lib/auth/telegram';

export const runtime = 'nodejs';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

interface AuthRequestBody {
  initData: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body: AuthRequestBody = await req.json();
    const { initData: rawInitData } = body;

    // Логируем длину initData для диагностики
    const initDataLength = rawInitData?.length || 0;
    console.log(`[AUTH] initData length: ${initDataLength}`);

    if (!rawInitData) {
      console.log('[AUTH] Error: initData empty (likely opened outside Telegram)');
      return NextResponse.json({ error: 'Missing initData' }, { status: 400 });
    }

    // Verify Telegram initData
    try {
      verifyTelegramInitData(rawInitData, 600); // 10 минут
      console.log('[AUTH] Verification passed');
    } catch (error: any) {
      console.log('[AUTH] Error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    // Parse init data
    const initData = parseInitData(rawInitData);
    if (!initData.user) {
      console.log('[AUTH] Error: Invalid user data in initData');
      return NextResponse.json({ error: 'Invalid user data' }, { status: 400 });
    }
    console.log('[AUTH] User ID from initData:', initData.user.id);

    // Sync user with database
    // Skip DB operations during build time
    if (!process.env.DATABASE_URL) {
      console.log('[AUTH] No DATABASE_URL, returning build-time user');
      return NextResponse.json({
        success: true,
        user: {
          id: 'build-time-user',
          telegramId: initData.user.id,
          displayName: initData.user.username || initData.user.first_name || 'Build User',
          balance: 0,
        }
      });
    }

    console.log('[AUTH] Syncing user with database...');
    const synced = await syncTelegramUser(initData.user);
    console.log('[AUTH] User synced:', { userId: synced.userId, balance: synced.balance.available });

    // Create JWT token
    const token = jwt.sign(
      {
        userId: synced.userId,
        telegramId: initData.user.id,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
      },
      JWT_SECRET
    );

    // Set HTTP-only cookie
    const response = NextResponse.json({
      success: true,
      user: {
        id: synced.userId,
        telegramId: initData.user.id,
        displayName: synced.profile.username
          ? `@${synced.profile.username}`
          : `${synced.profile.firstName || ''} ${synced.profile.lastName || ''}`.trim() || 'Пользователь',
        balance: synced.balance.available,
      }
    });

    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60, // 24 hours
      path: '/',
    });

    return response;

  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
