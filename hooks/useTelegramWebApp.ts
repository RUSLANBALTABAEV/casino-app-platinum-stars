'use client';

import { useEffect, useState } from 'react';
import type {
  TelegramInitData, TelegramThemeParams,
  TelegramUser, TelegramWebApp
} from '../types/telegram';

type ColorScheme = 'light' | 'dark';

interface TelegramState {
  webApp?: TelegramWebApp;
  colorScheme: ColorScheme;
  viewportHeight: number;
  initData?: TelegramInitData;
  initDataRaw?: string;
  themeParams?: TelegramThemeParams;
  user?: TelegramUser;
  isReady: boolean;
}

// Read initData from every possible Telegram source
function readRawInitData(): string | null {
  if (typeof window === 'undefined') return null;

  // Primary: standard Telegram WebApp
  const tg = (window as Record<string, any>).Telegram?.WebApp;
  if (typeof tg?.initData === 'string' && tg.initData.length > 20) {
    return tg.initData;
  }

  // Secondary: some Telegram versions use TelegramWebviewProxy
  const proxy = (window as Record<string, any>).TelegramWebviewProxy;
  if (typeof proxy?.initData === 'string' && proxy.initData.length > 20) {
    return proxy.initData;
  }

  // Tertiary: URL hash fragment (some Telegram Desktop versions)
  try {
    const hash = window.location.hash.slice(1);
    if (hash.includes('auth_date=') && hash.includes('hash=')) {
      const decoded = decodeURIComponent(hash);
      if (decoded.length > 20) return decoded;
    }
  } catch { /* ignore */ }

  return null;
}

function getTgWebApp(): TelegramWebApp | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Record<string, any>).Telegram?.WebApp as TelegramWebApp | undefined;
}

export function useTelegramWebApp(): TelegramState {
  const [colorScheme,    setColorScheme]    = useState<ColorScheme>('dark');
  const [viewportHeight, setViewportHeight] = useState<number>(0);
  const [initData,       setInitData]       = useState<TelegramInitData | undefined>();
  const [initDataRaw,    setInitDataRaw]    = useState<string | undefined>();
  const [themeParams,    setThemeParams]    = useState<TelegramThemeParams | undefined>();
  const [user,           setUser]           = useState<TelegramUser | undefined>();
  const [isReady,        setIsReady]        = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setIsReady(true);
      return;
    }

    const tgWA = getTgWebApp();

    // Setup Telegram WebApp
    try {
      tgWA?.ready?.();
      tgWA?.expand?.();
      tgWA?.disableVerticalSwipes?.();
    } catch { /* ignore */ }

    // Apply color scheme
    const scheme = (tgWA?.colorScheme as ColorScheme) ?? 'dark';
    setColorScheme(scheme);
    document.documentElement.dataset.theme = scheme;

    // Apply viewport height
    const vh = tgWA?.viewportStableHeight || window.innerHeight;
    setViewportHeight(vh);
    document.documentElement.style.setProperty('--tg-viewport-height', `${vh}px`);

    // Apply theme params
    if (tgWA?.themeParams) setThemeParams(tgWA.themeParams);

    // Read initData with retries
    let attempts = 0;
    const MAX_ATTEMPTS = 15;

    function tryReadInitData() {
      const raw = readRawInitData();
      if (raw) {
        setInitDataRaw(raw);
        const wa = getTgWebApp();
        if (wa?.initDataUnsafe) {
          setInitData(wa.initDataUnsafe as TelegramInitData);
          setUser(wa.initDataUnsafe.user as TelegramUser | undefined);
        }
        setIsReady(true);
        return;
      }

      attempts++;
      if (attempts >= MAX_ATTEMPTS) {
        // Give up — allow app to load, games will show error messages
        setIsReady(true);
        return;
      }

      // Retry with increasing delay: 50, 100, 150, 200... ms
      setTimeout(tryReadInitData, attempts * 50);
    }

    tryReadInitData();

    // Listen for Telegram events
    const onTheme = () => {
      const wa = getTgWebApp();
      const s = (wa?.colorScheme as ColorScheme) ?? 'dark';
      setColorScheme(s);
      document.documentElement.dataset.theme = s;
    };
    const onViewport = () => {
      const wa = getTgWebApp();
      const h = wa?.viewportStableHeight || window.innerHeight;
      setViewportHeight(h);
      document.documentElement.style.setProperty('--tg-viewport-height', `${h}px`);
    };

    tgWA?.onEvent?.('themeChanged', onTheme);
    tgWA?.onEvent?.('viewportChanged', onViewport);

    return () => {
      tgWA?.offEvent?.('themeChanged', onTheme);
      tgWA?.offEvent?.('viewportChanged', onViewport);
    };
  }, []);

  // Prevent text selection
  useEffect(() => {
    document.body.style.userSelect = 'none';
    document.body.style.setProperty('-webkit-user-select', 'none');
    return () => {
      document.body.style.userSelect = '';
      document.body.style.removeProperty('-webkit-user-select');
    };
  }, []);

  return {
    webApp: getTgWebApp(),
    colorScheme,
    viewportHeight,
    initData,
    initDataRaw,
    themeParams,
    user,
    isReady,
  };
}
