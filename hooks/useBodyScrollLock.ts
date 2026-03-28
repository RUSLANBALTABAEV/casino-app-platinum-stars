'use client';

import { useEffect } from 'react';

export function useBodyScrollLock(active = true): void {
  useEffect(() => {
    if (!active) {
      return;
    }

    const { style } = document.body;
    const previousOverflow = style.overflow;
    const previousHeight = style.height;

    style.overflow = 'hidden';
    style.height = '100vh';

    return () => {
      style.overflow = previousOverflow;
      style.height = previousHeight;
    };
  }, [active]);
}
