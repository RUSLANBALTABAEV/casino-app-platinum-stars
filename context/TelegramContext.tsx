'use client';

import { createContext, useContext, type ReactNode } from 'react';

import { useTelegramWebApp } from '../hooks/useTelegramWebApp';

const TelegramContext = createContext<
  ReturnType<typeof useTelegramWebApp> | undefined
>(undefined);

export function TelegramProvider({
  children
}: {
  children: ReactNode;
}): React.JSX.Element {
  const telegram = useTelegramWebApp();

  return (
    <TelegramContext.Provider value={telegram}>
      {children}
    </TelegramContext.Provider>
  );
}

export function useTelegram(): ReturnType<typeof useTelegramWebApp> {
  const context = useContext(TelegramContext);
  if (!context) {
    throw new Error('useTelegram must be used within a TelegramProvider');
  }

  return context;
}
