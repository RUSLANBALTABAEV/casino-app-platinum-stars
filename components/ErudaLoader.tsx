'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

function shouldEnableEruda(): boolean {
  if (typeof window === 'undefined') return false;
  // Включение кнопки дебага:
  // 1) ENV: NEXT_PUBLIC_ENABLE_ERUDA=1
  if (process.env.NEXT_PUBLIC_ENABLE_ERUDA === '1') return true;
  // 2) query: ?eruda=1
  const q = new URLSearchParams(window.location.search).get('eruda');
  if (q === '1') return true;
  // 3) localStorage флаг
  try {
    if (localStorage.getItem('eruda') === '1') return true;
  } catch {
    // ignore
  }
  return false;
}

async function ensureErudaLoaded(): Promise<void> {
  // @ts-expect-error - глобальный eruda
  if (window.eruda) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://cdn.jsdelivr.net/npm/eruda';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load eruda'));
    document.head.appendChild(script);
  });
}

export default function ErudaLoader(): React.JSX.Element | null {
  const enabled = useMemo(shouldEnableEruda, []);
  const [loaded, setLoaded] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    // Не автозагружаем — ждём нажатия кнопки
  }, [enabled]);

  const toggleEruda = useCallback(async () => {
    if (!loaded) {
      await ensureErudaLoaded();
      // @ts-expect-error - глобальный eruda
      if (!window.eruda?._isInit) {
        // @ts-expect-error
        window.eruda.init();
      }
      setLoaded(true);
      // @ts-expect-error
      window.eruda.show();
      setVisible(true);
      return;
    }
    // @ts-expect-error
    const api = window.eruda;
    if (!api) return;
    if (visible) {
      api.hide();
      setVisible(false);
    } else {
      api.show();
      setVisible(true);
    }
  }, [loaded, visible]);

  if (!enabled) return null;

  return (
    <button
      type="button"
      onClick={toggleEruda}
      style={{
        position: 'fixed',
        right: '12px',
        bottom: '12px',
        zIndex: 9999,
        borderRadius: '9999px',
        padding: '10px 12px',
        border: '1px solid rgba(212,175,55,0.7)',
        background: 'rgba(0,0,0,0.6)',
        color: '#E5E7EB',
        fontSize: '12px',
        textTransform: 'uppercase',
        letterSpacing: '0.12em'
      }}
      aria-label="Toggle Debug Console"
    >
      {visible ? 'Hide Debug' : 'Show Debug'}
    </button>
  );
}



