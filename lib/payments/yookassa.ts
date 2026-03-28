import type { NextRequest } from 'next/server';

const YOOKASSA_API_URL = 'https://api.yookassa.ru/v3/payments';

export interface CreatePaymentInput {
  amount: number;
  currency?: 'RUB' | 'USD' | 'EUR';
  description?: string;
  returnUrl: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface YooKassaPaymentResponse {
  id: string;
  status: string;
  amount: {
    
    value: string;
    currency: string;
  };
  confirmation?: {
    type: string;
    confirmation_url?: string;
  };
  created_at?: string;
  paid: boolean;
  receipt_registration?: string;
  metadata?: Record<string, unknown>;
}

function ensureEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function resolveMobileSdkKey(): string | undefined {
  return process.env.NEXT_PUBLIC_YOOKASSA_MOBILE_SDK_KEY;
}

export function getRedirectUrl(req: NextRequest, fallback: string): string {
  try {
    const origin = req.nextUrl.origin;
    return new URL(fallback, origin).toString();
  } catch {
    return fallback;
  }
}

export async function createYooKassaPayment(
  input: CreatePaymentInput
): Promise<YooKassaPaymentResponse> {
  const shopId = ensureEnv('YOOKASSA_SHOP_ID', '1183438');
  const secretKey = ensureEnv('YOOKASSA_SECRET_KEY', 'test_PnjqmYg3Xxa6yJAGBbU2ZMdpSQMrAik9w554S00Vs4g');

  const amountValue = input.amount.toFixed(2);
  const body = {
    amount: {
      value: amountValue,
      currency: input.currency ?? 'RUB'
    },
    capture: true,
    confirmation: {
      type: 'redirect',
      return_url: input.returnUrl
    },
    description: input.description?.slice(0, 128),
    metadata: input.metadata ?? {}
  };

  const authToken = Buffer.from(`${shopId}:${secretKey}`).toString('base64');
  const response = await fetch(YOOKASSA_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authToken}`,
      'Content-Type': 'application/json',
      'Idempotence-Key': crypto.randomUUID()
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`YooKassa payment creation failed: ${response.status} ${errorBody}`);
  }

  return (await response.json()) as YooKassaPaymentResponse;
}
