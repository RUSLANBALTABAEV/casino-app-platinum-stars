import { NextRequest, NextResponse } from 'next/server';
import { setupTOTP } from '@/lib/services/admin-totp';
import { ensureDatabaseReady } from '@/lib/db/ensure';
import { requireAdminAuth, applyAdminRateLimit } from '@/lib/services/admin-auth';
import { applyHeaders } from '@/lib/http/rate-limit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Rate limiting
  const rateResult = applyAdminRateLimit(req, 5, 60_000);
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      rateResult
    );
  }

  try {
    const authResult = await requireAdminAuth(req);
    
    if (!authResult.isAuthenticated) {
      if (authResult.requiresTOTP) {
        return applyHeaders(
          NextResponse.json({ error: 'TOTP required', requiresTOTP: true }, { status: 401 }),
          rateResult
        );
      }
      return applyHeaders(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
        rateResult
      );
    }

    await ensureDatabaseReady();

    const result = await setupTOTP(authResult.userId, 'Casino IXC Admin');

    return applyHeaders(
      NextResponse.json({
        success: true,
        secret: result.secret,
        qrCodeUrl: result.qrCodeUrl,
        backupCodes: result.backupCodes
      }),
      rateResult
    );
  } catch (error) {
    console.error('TOTP setup error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    const status = errorMessage.includes('Unauthorized') || errorMessage.includes('token') ? 401 : 500;
    return applyHeaders(
      NextResponse.json({ error: errorMessage }, { status }),
      rateResult
    );
  }
}

