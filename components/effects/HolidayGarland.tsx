'use client';

import clsx from 'clsx';
import React, { useMemo } from 'react';

type Light = {
  cx: number;
  cy: number;
  color: string;
  delay: string;
};

const BULBS = ['#ef4444', '#38bdf8', '#22c55e', '#fbbf24', '#f472b6'] as const;

export default function HolidayGarland({ className }: { className?: string }): React.JSX.Element {
  const lights = useMemo<Light[]>(
    () =>
      [
        { cx: 60, cy: 34 },
        { cx: 150, cy: 28 },
        { cx: 250, cy: 24 },
        { cx: 350, cy: 28 },
        { cx: 450, cy: 24 },
        { cx: 550, cy: 28 },
        { cx: 650, cy: 24 },
        { cx: 750, cy: 28 },
        { cx: 850, cy: 24 },
        { cx: 950, cy: 32 }
      ].map((pos, index) => ({
        ...pos,
        color: BULBS[index % BULBS.length],
        delay: `${(index % 6) * 0.2}s`
      })),
    []
  );

  return (
    <div
      aria-hidden
      className={clsx('pointer-events-none absolute inset-x-0 top-0 z-30', className)}
    >
      <div
        className="relative w-full px-4 sm:px-6"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}
      >
        <div className="relative h-14 sm:h-16">
          <svg
            aria-hidden
            className="absolute inset-x-0 top-2 h-10 w-full sm:h-12"
            preserveAspectRatio="none"
            viewBox="0 0 1000 80"
          >
            <defs>
              <linearGradient id="garlandWire" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor="rgba(255,255,255,0)" />
                <stop offset="0.2" stopColor="rgba(226,241,255,0.2)" />
                <stop offset="0.5" stopColor="rgba(255,255,255,0.25)" />
                <stop offset="0.8" stopColor="rgba(226,241,255,0.2)" />
                <stop offset="1" stopColor="rgba(255,255,255,0)" />
              </linearGradient>
            </defs>
            <path
              d="M0 26 C140 70 260 6 400 26 C520 46 620 6 740 26 C860 46 920 30 1000 18"
              fill="none"
              stroke="url(#garlandWire)"
              strokeLinecap="round"
              strokeWidth="3.2"
            />
            <path
              d="M0 30 C140 74 260 10 400 30 C520 50 620 10 740 30 C860 50 920 34 1000 22"
              fill="none"
              stroke="rgba(255,255,255,0.05)"
              strokeLinecap="round"
              strokeWidth="1.4"
            />
          </svg>

          {lights.map((light, index) => (
            <span
              key={`${light.cx}-${index}`}
              className="absolute h-3.5 w-3.5 rounded-full"
              style={{
                left: `${(light.cx / 1000) * 100}%`,
                top: `${(light.cy / 80) * 100}%`,
                backgroundColor: light.color,
                boxShadow: `0 0 10px ${light.color}66, 0 0 20px ${light.color}44`,
                animation: `garlandTwinkle 3.2s ease-in-out infinite`,
                animationDelay: light.delay
              }}
            />
          ))}

          <span className="holiday-wreath absolute left-2 top-6 h-9 w-9 sm:left-3 sm:top-5 sm:h-11 sm:w-11" />
          <span className="holiday-wreath absolute right-2 top-6 h-9 w-9 sm:right-3 sm:top-5 sm:h-11 sm:w-11" />
        </div>
      </div>
    </div>
  );
}
