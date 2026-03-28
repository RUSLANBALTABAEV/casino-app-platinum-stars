'use client';

import React, { useEffect, useRef } from 'react';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

export default function SnowDrift({ className = '' }: { className?: string }): React.JSX.Element | null {
  const driftRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const isFirstCycleRef = useRef(true);

  useEffect(() => {
    if (prefersReducedMotion()) {
      return;
    }

    const CYCLE_MS = 90_000;
    const MAX_FILL = 1;
    const MIN_FILL_AFTER_SHAKE = 0.05;
    const FILL_PHASE = 0.78;
    const SHAKE_PHASE = 0.06;

    const loop = (ts: number) => {
      const el = driftRef.current;
      if (!el) {
        rafRef.current = window.requestAnimationFrame(loop);
        return;
      }
      if (!startRef.current) {
        startRef.current = ts;
      }
      const elapsed = ts - startRef.current;
      const cycleT = (elapsed % CYCLE_MS) / CYCLE_MS; // 0..1
      const isNewCycle = elapsed > 0 && elapsed % CYCLE_MS < 18; // first frames of new cycle
      if (isNewCycle) {
        isFirstCycleRef.current = false;
      }

      const baseMin = isFirstCycleRef.current ? 0 : MIN_FILL_AFTER_SHAKE;
      let fill = baseMin;
      let shakePx = 0;

      if (cycleT < FILL_PHASE) {
        const k = cycleT / FILL_PHASE;
        fill = baseMin + (MAX_FILL - baseMin) * k;
      } else if (cycleT < FILL_PHASE + SHAKE_PHASE) {
        const k = (cycleT - FILL_PHASE) / SHAKE_PHASE; // 0..1
        // quick shake + "shake off" down to ~5%
        fill = MAX_FILL - (MAX_FILL - MIN_FILL_AFTER_SHAKE) * k;
        shakePx = Math.sin(k * Math.PI * 6) * (1 - k) * 7;
      } else {
        const remaining = 1 - (FILL_PHASE + SHAKE_PHASE);
        const k = remaining > 0 ? (cycleT - (FILL_PHASE + SHAKE_PHASE)) / remaining : 1;
        fill = MIN_FILL_AFTER_SHAKE + (MAX_FILL - MIN_FILL_AFTER_SHAKE) * k;
      }

      el.style.setProperty('--drift-fill', Math.max(0, Math.min(1, fill)).toFixed(4));
      el.style.setProperty('--drift-shake', `${shakePx.toFixed(2)}px`);

      rafRef.current = window.requestAnimationFrame(loop);
    };

    rafRef.current = window.requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = null;
      startRef.current = 0;
    };
  }, []);

  return (
    <div
      aria-hidden
      className={['holiday-snowdrift', className].filter(Boolean).join(' ')}
      ref={driftRef}
      style={{ ['--drift-fill' as any]: 0, ['--drift-shake' as any]: '0px' }}
    />
  );
}
