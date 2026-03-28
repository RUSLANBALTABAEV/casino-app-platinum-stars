import { NextRequest, NextResponse } from 'next/server';
import { ensureDatabaseReady } from '@/lib/db/ensure';
import { authenticateAdmin, getClientIP, getUserAgent, applyAdminRateLimit } from '@/lib/services/admin-auth';
import { applyHeaders } from '@/lib/http/rate-limit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Hardening: do not expose password-based admin auth unless configured.
  if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Rate limiting
  const rateResult = await applyAdminRateLimit(req, 5, 60_000); // 5 попыток в минуту
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много попыток. Попробуйте через минуту.' }, { status: 429 }),
      rateResult
    );
  }

  try {
    await ensureDatabaseReady();

    const { password, totpToken } = await req.json() as { password: string; totpToken?: string };

    if (!password) {
      return applyHeaders(
        NextResponse.json({ error: 'Введите пароль' }, { status: 400 }),
        rateResult
      );
    }

    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);

    try {
      const result = await authenticateAdmin(password, totpToken, ipAddress, userAgent);

      return applyHeaders(
        NextResponse.json({
          success: true,
          token: result.session.token,
          expiresAt: result.session.expiresAt.toISOString(),
          message: 'Доступ предоставлен',
          totpNotEnabled: result.totpNotEnabled || false
        }),
        rateResult
      );
    } catch (authError) {
      const errorMessage = authError instanceof Error ? authError.message : 'Ошибка аутентификации';
      
      if (errorMessage === 'TOTP_REQUIRED') {
        return applyHeaders(
          NextResponse.json({
            error: 'Введите код из Google Authenticator',
            requiresTOTP: true,
            totpConfigured: true
          }, { status: 401 }),
          rateResult
        );
      }

      if (errorMessage === 'Invalid password') {
        return applyHeaders(
          NextResponse.json({ error: 'Неверный пароль' }, { status: 401 }),
          rateResult
        );
      }

      if (errorMessage === 'Invalid TOTP token') {
        return applyHeaders(
          NextResponse.json({ error: 'Неверный код из Google Authenticator' }, { status: 401 }),
          rateResult
        );
      }

      return applyHeaders(
        NextResponse.json({ error: errorMessage }, { status: 401 }),
        rateResult
      );
    }
  } catch (error) {
    console.error('Admin auth error:', error);
    return applyHeaders(
      NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 }),
      rateResult
    );
  }
}
