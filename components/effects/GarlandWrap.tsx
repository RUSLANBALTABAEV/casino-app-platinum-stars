'use client';

import clsx from 'clsx';
import React, { useId } from 'react';

type GarlandVariant =
  | 'home-actions'
  | 'home-stats'
  | 'wallet-providers'
  | 'wallet-withdraw'
  | 'tasks-header'
  | 'promo-header'
  | 'games-header';

type GarlandPreset = {
  viewBox: string;
  className: string;
  path: string;
  pathGlow?: string;
  stroke?: string;
  strokeWidth?: number;
  lights: Array<{ cx: number; cy: number; color?: string; r?: number }>;
};

const LIGHT_COLORS = ['#f87171', '#facc15', '#38bdf8', '#22c55e', '#f97316'];

const PRESETS: Record<GarlandVariant, GarlandPreset> = {
  'home-actions': {
    viewBox: '0 0 640 200',
    className: 'inset-x-[-24px] -top-10 h-40',
    path: 'M-5 110 C 60 20, 180 170, 280 100 S 470 140, 645 80',
    pathGlow: 'M-5 118 C 60 28, 180 178, 280 108 S 470 148, 645 88',
    lights: [
      { cx: 10, cy: 108 },
      { cx: 90, cy: 60 },
      { cx: 170, cy: 150 },
      { cx: 260, cy: 90 },
      { cx: 340, cy: 140 },
      { cx: 420, cy: 110 },
      { cx: 500, cy: 90 },
      { cx: 580, cy: 110 }
    ]
  },
  'home-stats': {
    viewBox: '0 0 640 200',
    className: 'inset-x-[-16px] -top-6 h-36',
    path: 'M-10 130 C 90 40, 180 200, 320 110 S 540 170, 650 120',
    pathGlow: 'M-10 136 C 90 46, 180 206, 320 116 S 540 176, 650 126',
    lights: [
      { cx: 20, cy: 130 },
      { cx: 110, cy: 80 },
      { cx: 200, cy: 160 },
      { cx: 300, cy: 120 },
      { cx: 380, cy: 150 },
      { cx: 460, cy: 140 },
      { cx: 540, cy: 150 }
    ]
  },
  'wallet-providers': {
    viewBox: '0 0 640 200',
    className: 'inset-x-[-20px] -top-10 h-40',
    path: 'M-5 120 C 120 10, 220 180, 360 80 S 560 150, 650 70',
    pathGlow: 'M-5 126 C 120 16, 220 186, 360 86 S 560 156, 650 76',
    lights: [
      { cx: 10, cy: 118 },
      { cx: 90, cy: 70 },
      { cx: 180, cy: 140 },
      { cx: 260, cy: 90 },
      { cx: 350, cy: 130 },
      { cx: 430, cy: 110 },
      { cx: 520, cy: 140 },
      { cx: 600, cy: 90 }
    ]
  },
  'wallet-withdraw': {
    viewBox: '0 0 640 220',
    className: 'inset-x-[-12px] -top-4 h-44',
    path: 'M-10 150 C 110 60, 210 210, 320 130 S 520 190, 650 140',
    pathGlow: 'M-10 156 C 110 66, 210 216, 320 136 S 520 196, 650 146',
    lights: [
      { cx: 30, cy: 150 },
      { cx: 120, cy: 100 },
      { cx: 210, cy: 180 },
      { cx: 300, cy: 140 },
      { cx: 380, cy: 190 },
      { cx: 470, cy: 160 },
      { cx: 560, cy: 180 }
    ]
  },
  'tasks-header': {
    viewBox: '0 0 640 200',
    className: 'inset-x-[-18px] -top-6 h-36',
    path: 'M-5 120 C 100 10, 200 180, 320 80 S 540 180, 650 70',
    pathGlow: 'M-5 126 C 100 16, 200 186, 320 86 S 540 186, 650 76',
    lights: [
      { cx: 10, cy: 120 },
      { cx: 95, cy: 60 },
      { cx: 185, cy: 150 },
      { cx: 275, cy: 90 },
      { cx: 360, cy: 150 },
      { cx: 450, cy: 110 },
      { cx: 540, cy: 160 }
    ]
  },
  'promo-header': {
    viewBox: '0 0 640 180',
    className: 'inset-x-[-12px] -top-5 h-32',
    path: 'M-8 100 C 90 20, 220 150, 330 70 S 520 150, 648 60',
    pathGlow: 'M-8 106 C 90 26, 220 156, 330 76 S 520 156, 648 66',
    lights: [
      { cx: 10, cy: 100 },
      { cx: 90, cy: 50 },
      { cx: 180, cy: 120 },
      { cx: 270, cy: 75 },
      { cx: 360, cy: 130 },
      { cx: 450, cy: 90 },
      { cx: 540, cy: 140 }
    ]
  },
  'games-header': {
    viewBox: '0 0 640 210',
    className: 'inset-x-[-16px] -top-8 h-40',
    path: 'M-15 140 C 90 30, 200 200, 320 100 S 540 190, 655 90',
    pathGlow: 'M-15 146 C 90 36, 200 206, 320 106 S 540 196, 655 96',
    lights: [
      { cx: 20, cy: 140 },
      { cx: 110, cy: 70 },
      { cx: 200, cy: 170 },
      { cx: 290, cy: 110 },
      { cx: 380, cy: 180 },
      { cx: 470, cy: 140 },
      { cx: 560, cy: 160 }
    ]
  }
};

interface GarlandWrapProps {
  variant: GarlandVariant;
  className?: string;
}

export default function GarlandWrap({ variant, className }: GarlandWrapProps): React.JSX.Element | null {
  const preset = PRESETS[variant];
  const gradientId = useId();
  const glowId = useId();
  const bulbId = useId();

  if (!preset) {
    return null;
  }

  return (
    <svg
      aria-hidden
      className={clsx(
        'pointer-events-none absolute z-0 w-full max-w-full stroke-white/35',
        preset.className,
        className
      )}
      fill="none"
      preserveAspectRatio="none"
      viewBox={preset.viewBox}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="rgba(255,255,255,0)" />
          <stop offset="0.2" stopColor="rgba(226,241,255,0.45)" />
          <stop offset="0.5" stopColor="rgba(255,255,255,0.7)" />
          <stop offset="0.8" stopColor="rgba(226,241,255,0.45)" />
          <stop offset="1" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <radialGradient id={bulbId} cx="35%" cy="35%" r="70%">
          <stop offset="0" stopColor="rgba(255,255,255,0.9)" />
          <stop offset="0.35" stopColor="rgba(255,255,255,0.35)" />
          <stop offset="1" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        d={preset.path}
        stroke={preset.stroke ?? `url(#${gradientId})`}
        strokeLinecap="round"
        strokeWidth={preset.strokeWidth ?? 2.6}
      />
      {preset.pathGlow ? (
        <path
          d={preset.pathGlow}
          stroke="rgba(255,255,255,0.18)"
          strokeLinecap="round"
          strokeWidth={1.4}
          strokeDasharray="12 18"
        />
      ) : null}
      <path
        d={preset.path}
        stroke="rgba(255,255,255,0.12)"
        strokeLinecap="round"
        strokeWidth={1.2}
        strokeDasharray="6 14"
      />
      {preset.lights.map((light, index) => {
        const color = light.color ?? LIGHT_COLORS[index % LIGHT_COLORS.length];
        const radius = light.r ?? 6;

        return (
          <g key={`${light.cx}-${light.cy}-${index}`}>
            <circle
              cx={light.cx}
              cy={light.cy}
              fill={color}
              r={radius}
              filter={`url(#${glowId})`}
              style={{
                animation: 'garlandTwinkle 3.4s ease-in-out infinite',
                animationDelay: `${(index % 6) * 0.24}s`
              }}
            />
            <circle cx={light.cx} cy={light.cy} fill={color} opacity={0.18} r={radius * 1.9} />
            <circle cx={light.cx} cy={light.cy} fill={`url(#${bulbId})`} r={radius * 1.2} />
          </g>
        );
      })}
      <g opacity={0.9}>
        <circle cx={36} cy={92} r={12} fill="none" stroke="#22c55e" strokeWidth={3} />
        <circle
          cx={36}
          cy={92}
          r={8.5}
          fill="none"
          stroke="#16a34a"
          strokeWidth={2}
          strokeDasharray="2 3"
        />
        <circle cx={30} cy={86} r={2} fill="#ef4444" />
        <circle cx={42} cy={85} r={2} fill="#f97316" />
        <circle cx={29} cy={97} r={2} fill="#facc15" />
        <circle cx={43} cy={98} r={2} fill="#ef4444" />
      </g>
      <g opacity={0.9}>
        <circle cx={604} cy={90} r={12} fill="none" stroke="#22c55e" strokeWidth={3} />
        <circle
          cx={604}
          cy={90}
          r={8.5}
          fill="none"
          stroke="#16a34a"
          strokeWidth={2}
          strokeDasharray="2 3"
        />
        <circle cx={598} cy={84} r={2} fill="#ef4444" />
        <circle cx={610} cy={83} r={2} fill="#f97316" />
        <circle cx={597} cy={95} r={2} fill="#facc15" />
        <circle cx={611} cy={96} r={2} fill="#ef4444" />
      </g>
    </svg>
  );
}
