/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: true,
  typedRoutes: false,
  serverExternalPackages: [],
  // Отключаем pages router, используем только app router
  pageExtensions: ['tsx', 'ts', 'jsx', 'js'],
  async headers() {
    // Security headers (kept conservative to avoid breaking Telegram WebApp embedding).
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()'
          }
        ]
      }
    ];
  },
  env: {
    NEXT_PUBLIC_MINI_APP_URL:
      process.env.NEXT_PUBLIC_MINI_APP_URL ??
      process.env.TELEGRAM_MINI_APP_URL ??
      'https://astrogame-io.ru',
    NEXT_PUBLIC_TOPUP_URL:
      process.env.NEXT_PUBLIC_TOPUP_URL ??
      process.env.TOPUP_URL ??
      '',
    NEXT_PUBLIC_WITHDRAW_URL:
      process.env.NEXT_PUBLIC_WITHDRAW_URL ??
      process.env.WITHDRAW_URL ??
      ''
  }
};

export default nextConfig;
