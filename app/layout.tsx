import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import React from 'react';

import RootLayoutShell from '@/components/RootLayoutShell';
import { TelegramProvider } from '@/context/TelegramContext';
import ErudaLoader from '@/components/ErudaLoader';
import { prisma } from '@/lib/prisma';

import './globals.css';

export const metadata: Metadata = {
  title: 'AstroPlay • Telegram Mini App',
  description:
    'Премиальный игровой мини-приложение с кейсами, рулеткой, раннером и лотереей на Telegram-звёзды.',
  applicationName: 'AstroPlay'
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F4F5' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0B0C' }
  ]
};

async function getTheme(): Promise<'holiday' | 'regular'> {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'site_theme' }
    });
    return (setting?.value as 'holiday' | 'regular') ?? 'regular';
  } catch {
    return 'holiday';
  }
}

export default async function RootLayout({
  children
}: {
  children: React.ReactNode;
}): Promise<React.JSX.Element> {
  const theme = await getTheme();
  const isHoliday = theme === 'holiday';

  return (
    <html lang="ru" data-holiday={isHoliday ? '1' : '0'} suppressHydrationWarning>
      <body className="font-sans">
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <ErudaLoader />
        <TelegramProvider>
          <RootLayoutShell>{children}</RootLayoutShell>
        </TelegramProvider>
      </body>
    </html>
  );
}
