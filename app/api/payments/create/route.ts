import { NextRequest, NextResponse } from 'next/server';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import {
  createYooKassaPayment,
  getRedirectUrl,
  resolveMobileSdkKey
} from '@/lib/payments/yookassa';

interface CreatePaymentRequestBody {
  amount: number;
  currency?: 'RUB' | 'USD' | 'EUR';
  description?: string;
  returnUrl?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rateResult = applyRateLimit(`${getClientIdentifier(req)}:payments:create`, {
    limit: 20,
    windowMs: 60_000
  });
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много запросов. Попробуйте позже.' }, { status: 429 }),
      rateResult
    );
  }

  let body: CreatePaymentRequestBody;
  try {
    body = (await req.json()) as CreatePaymentRequestBody;
  } catch {
    return applyHeaders(
      NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }),
      rateResult
    );
  }

  if (typeof body.amount !== 'number' || Number.isNaN(body.amount) || body.amount <= 0) {
    return applyHeaders(
      NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 }),
      rateResult
    );
  }

  const description =
    typeof body.description === 'string' && body.description.trim().length > 0
      ? body.description.trim()
      : undefined;

  const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : undefined;
  const currency = body.currency ?? 'RUB';
  const returnUrl = body.returnUrl
    ? getRedirectUrl(req, body.returnUrl)
    : getRedirectUrl(req, '/wallet/success');

  try {
    const payment = await createYooKassaPayment({
      amount: body.amount,
      currency,
      description,
      returnUrl,
      metadata
    });

    return applyHeaders(
      NextResponse.json({
        id: payment.id,
        status: payment.status,
        amount: payment.amount,
        confirmationUrl: payment.confirmation?.confirmation_url ?? null,
        paid: payment.paid,
        metadata: payment.metadata ?? {},
        mobileSdkKey: resolveMobileSdkKey() ?? null
      }),
      rateResult
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected error during payment creation';
    return applyHeaders(
      NextResponse.json({ error: message }, { status: 502 }),
      rateResult
    );
  }
}
