export type CurrencyCode = 'RUB' | 'USD' | 'EUR' | (string & {});

export interface EconomyPaymentOption {
  id: string;
  stars: number;
  amount: number;
  currency: CurrencyCode;
  label: string;
  caption: string;
}

export interface EconomyConfig {
  exchangeRates: Record<string, number>;
  paymentOptions: EconomyPaymentOption[];
  customPurchase: {
    minStars: number;
    maxStars: number;
    rubPerStar: number;
  };
  telegramPurchase: {
    minStars: number;
    maxStars: number;
    presets: number[];
  };
  externalLinks: {
    miniAppUrl: string | null;
    topupUrl: string | null;
    withdrawUrl: string | null;
  };
}

const RAW_MINI_APP_URL =
  process.env.NEXT_PUBLIC_MINI_APP_URL ??
  process.env.TELEGRAM_MINI_APP_URL ??
  'https://astrogam-prod-scripter0123.amvera.io';
const RAW_TOPUP_URL =
  process.env.NEXT_PUBLIC_TOPUP_URL ??
  process.env.TOPUP_URL ??
  '';
const RAW_WITHDRAW_URL =
  process.env.NEXT_PUBLIC_WITHDRAW_URL ??
  process.env.WITHDRAW_URL ??
  '';

function sanitizeUrl(url: string | undefined | null): string | null {
  if (!url) {
    return null;
  }
  const trimmed = url.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export const ECONOMY_DEFAULT_PAYMENT_OPTIONS: EconomyPaymentOption[] = [
  {
    id: 'starter',
    stars: 500,
    amount: 99,
    currency: 'RUB',
    label: '500 ★',
    caption: 'Быстрый старт'
  },
  {
    id: 'booster',
    stars: 1200,
    amount: 199,
    currency: 'RUB',
    label: '1 200 ★',
    caption: 'Популярный выбор'
  },
  {
    id: 'vip',
    stars: 2500,
    amount: 349,
    currency: 'RUB',
    label: '2 500 ★',
    caption: 'Для активных игроков'
  },
  {
    id: 'ultra',
    stars: 5000,
    amount: 599,
    currency: 'RUB',
    label: '5 000 ★',
    caption: 'Максимальный буст'
  }
] as const;

export const DEFAULT_ECONOMY_CONFIG: EconomyConfig = {
  exchangeRates: {
    STAR_TO_RUB: 0.2,
    STAR_TO_USD: 0.003,
    STAR_TO_EUR: 0.0027
  },
  paymentOptions: [...ECONOMY_DEFAULT_PAYMENT_OPTIONS],
  customPurchase: {
    minStars: 100,
    maxStars: 50000,
    rubPerStar: 0.2
  },
  telegramPurchase: {
    minStars: 10,
    maxStars: 50000,
    presets: [100, 250, 500, 1000]
  },
  externalLinks: {
    miniAppUrl: sanitizeUrl(RAW_MINI_APP_URL),
    topupUrl: sanitizeUrl(RAW_TOPUP_URL),
    withdrawUrl: sanitizeUrl(RAW_WITHDRAW_URL)
  }
};
