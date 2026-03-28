'use client';

import { useMemo } from 'react';

import { useTelegram } from '../context/TelegramContext';
import { createApiClient } from '../lib/apiClient';

export function useTelegramApi(baseUrl?: string) {
  const { initDataRaw } = useTelegram();

  return useMemo(
    () =>
      createApiClient({
        baseUrl,
        initDataRaw
      }),
    [baseUrl, initDataRaw]
  );
}
