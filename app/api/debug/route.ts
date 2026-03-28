import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth/jwt';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production' && process.env.DEBUG_API !== '1') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const user = getUserFromRequest(req);
    return NextResponse.json({
      authenticated: !!user,
      user: user ? {
        userId: user.userId,
        telegramId: user.telegramId
      } : null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({
      authenticated: false,
      error: 'Authentication failed',
      timestamp: new Date().toISOString()
    });
  }
}
