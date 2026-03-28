import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';

const THEME_SETTING_KEY = 'site_theme';

export type ThemeValue = 'holiday' | 'regular';

export interface ThemeResponse {
  theme: ThemeValue;
}

// GET - получить текущую тему (публичный endpoint)
export async function GET(): Promise<NextResponse<ThemeResponse>> {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: THEME_SETTING_KEY }
    });

    const theme = (setting?.value as ThemeValue) ?? 'regular';

    return NextResponse.json({ theme });
  } catch {
    // По умолчанию возвращаем holiday
    return NextResponse.json({ theme: 'holiday' });
  }
}
