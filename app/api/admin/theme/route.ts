import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';

const THEME_SETTING_KEY = 'site_theme';

export type ThemeValue = 'holiday' | 'regular';

export interface ThemeResponse {
  theme: ThemeValue;
}

// GET - получить текущую тему
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

// POST - изменить тему (только для админов)
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { theme?: ThemeValue };
    const { theme } = body;

    if (!theme || !['holiday', 'regular'].includes(theme)) {
      return NextResponse.json({ error: 'Invalid theme value' }, { status: 400 });
    }

    await prisma.systemSetting.upsert({
      where: { key: THEME_SETTING_KEY },
      update: { value: theme },
      create: {
        key: THEME_SETTING_KEY,
        description: 'Тема оформления сайта (holiday/regular)',
        value: theme
      }
    });

    return NextResponse.json({ theme, success: true });
  } catch (error) {
    console.error('Failed to update theme:', error);
    return NextResponse.json({ error: 'Failed to update theme' }, { status: 500 });
  }
}
