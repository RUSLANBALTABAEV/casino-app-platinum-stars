import { NextRequest, NextResponse } from 'next/server';
import { enableTOTP } from '@/lib/services/admin-totp';
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

    const { token } = await req.json() as { token: string };

    if (!token) {
      return applyHeaders(
        NextResponse.json({ error: 'Token is required' }, { status: 400 }),
        rateResult
      );
    }

    await ensureDatabaseReady();

    const success = await enableTOTP(authResult.userId, token);

    if (!success) {
      return applyHeaders(
        NextResponse.json({ error: 'Invalid verification token' }, { status: 400 }),
        rateResult
      );
    }

    return applyHeaders(
      NextResponse.json({
        success: true,
        message: 'TOTP enabled successfully'
      }),
      rateResult
    );
  } catch (error) {
    console.error('TOTP enable error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    const status = errorMessage.includes('Unauthorized') || errorMessage.includes('token') ? 401 : 500;
    return applyHeaders(
      NextResponse.json({ error: errorMessage }, { status }),
      rateResult
    );
  }
}

