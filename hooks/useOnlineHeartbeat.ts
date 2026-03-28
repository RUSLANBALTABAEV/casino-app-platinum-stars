'use client';

import { useEffect, useRef } from 'react';

const DEFAULT_INTERVAL_MS = 20_000;

export function useOnlineHeartbeat(initDataRaw?: string): void {
  const lastSentAtRef = useRef<number>(0);

  useEffect(() => {
    if (!initDataRaw) {
      return;
    }

    let destroyed = false;
    let timer: number | null = null;

    const ping = async () => {
      if (destroyed) {
        return;
      }
      if (document.visibilityState !== 'visible') {
        return;
      }

      const now = Date.now();
      if (now - lastSentAtRef.current < DEFAULT_INTERVAL_MS / 2) {
        return;
      }
      lastSentAtRef.current = now;

      try {
        await fetch('/api/mini-app/online', {
          method: 'POST',
          headers: {
            'x-telegram-init-data': initDataRaw
          },
          cache: 'no-store'
        });
      } catch {
        // ignore
      }
    };

    const schedule = () => {
      if (timer) {
        window.clearInterval(timer);
      }
      timer = window.setInterval(() => {
        void ping();
      }, DEFAULT_INTERVAL_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void ping();
      }
    };

    void ping();
    schedule();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      destroyed = true;
      if (timer) {
        window.clearInterval(timer);
      }
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [initDataRaw]);
}

