'use client';

import clsx from 'clsx';
import React from 'react';

type Icicle = {
  x: number; // 0..1
  width: number; // 0..1
  length: number; // 0..1
  dripDelayMs: number;
  variant: IcicleVariant;
};

type IcicleVariant =
  | 'needle'
  | 'chunky'
  | 'split'
  | 'jagged'
  | 'long'
  | 'fork'
  | 'crystal';

const ICICLES: Icicle[] = [
  { x: 0.02, width: 0.06, length: 0.55, dripDelayMs: 0, variant: 'chunky' },
  { x: 0.1, width: 0.04, length: 0.35, dripDelayMs: 1200, variant: 'needle' },
  { x: 0.16, width: 0.03, length: 0.28, dripDelayMs: 2400, variant: 'crystal' },
  { x: 0.22, width: 0.05, length: 0.48, dripDelayMs: 800, variant: 'jagged' },
  { x: 0.31, width: 0.06, length: 0.64, dripDelayMs: 1600, variant: 'long' },
  { x: 0.41, width: 0.03, length: 0.28, dripDelayMs: 3200, variant: 'needle' },
  { x: 0.46, width: 0.05, length: 0.46, dripDelayMs: 2000, variant: 'split' },
  { x: 0.56, width: 0.07, length: 0.7, dripDelayMs: 600, variant: 'fork' },
  { x: 0.66, width: 0.04, length: 0.36, dripDelayMs: 2800, variant: 'crystal' },
  { x: 0.72, width: 0.03, length: 0.26, dripDelayMs: 3600, variant: 'needle' },
  { x: 0.78, width: 0.05, length: 0.5, dripDelayMs: 1400, variant: 'jagged' },
  { x: 0.86, width: 0.06, length: 0.62, dripDelayMs: 2200, variant: 'chunky' },
  { x: 0.94, width: 0.04, length: 0.34, dripDelayMs: 1000, variant: 'split' }
];

function buildIciclePath({
  variant,
  left,
  right,
  topY,
  tipY
}: {
  variant: IcicleVariant;
  left: number;
  right: number;
  topY: number;
  tipY: number;
}): string {
  const w = Math.max(6, right - left);
  const mid = left + w / 2;
  const h = Math.max(12, tipY - topY);

  switch (variant) {
    case 'needle': {
      const tip = topY + h;
      return `M ${left} ${topY}
              C ${left + w * 0.15} ${topY + h * 0.08}, ${mid - w * 0.08} ${topY + h * 0.62}, ${mid} ${tip}
              C ${mid + w * 0.08} ${topY + h * 0.62}, ${right - w * 0.15} ${topY + h * 0.08}, ${right} ${topY} Z`;
    }
    case 'long': {
      const tip = topY + h * 1.08;
      return `M ${left} ${topY}
              C ${left + w * 0.22} ${topY + h * 0.12}, ${mid - w * 0.18} ${topY + h * 0.58}, ${mid} ${tip}
              C ${mid + w * 0.16} ${topY + h * 0.58}, ${right - w * 0.22} ${topY + h * 0.12}, ${right} ${topY} Z`;
    }
    case 'chunky': {
      const tip = topY + h * 0.92;
      return `M ${left} ${topY}
              C ${left + w * 0.35} ${topY + h * 0.2}, ${mid - w * 0.24} ${topY + h * 0.62}, ${mid} ${tip}
              C ${mid + w * 0.28} ${topY + h * 0.62}, ${right - w * 0.32} ${topY + h * 0.2}, ${right} ${topY} Z`;
    }
    case 'split': {
      const tip1X = mid - w * 0.12;
      const tip2X = mid + w * 0.12;
      const tip = topY + h;
      const midY = topY + h * 0.78;
      return `M ${left} ${topY}
              C ${left + w * 0.18} ${topY + h * 0.08}, ${mid - w * 0.22} ${topY + h * 0.42}, ${mid} ${midY}
              L ${tip1X} ${tip}
              L ${mid} ${midY + h * 0.04}
              L ${tip2X} ${tip}
              L ${mid + w * 0.18} ${topY + h * 0.42}
              C ${right - w * 0.18} ${topY + h * 0.08}, ${right - w * 0.08} ${topY + h * 0.04}, ${right} ${topY} Z`;
    }
    case 'fork': {
      const t1 = topY + h;
      const t2 = topY + h * 0.82;
      return `M ${left} ${topY}
              C ${left + w * 0.22} ${topY + h * 0.1}, ${mid - w * 0.22} ${topY + h * 0.55}, ${mid - w * 0.08} ${t2}
              L ${mid - w * 0.2} ${t1}
              L ${mid} ${t2}
              L ${mid + w * 0.2} ${t1}
              L ${mid + w * 0.08} ${t2}
              C ${mid + w * 0.22} ${topY + h * 0.55}, ${right - w * 0.22} ${topY + h * 0.1}, ${right} ${topY} Z`;
    }
    case 'jagged': {
      const tip = topY + h;
      const y1 = topY + h * 0.22;
      const y2 = topY + h * 0.44;
      const y3 = topY + h * 0.66;
      return `M ${left} ${topY}
              L ${left + w * 0.12} ${y1}
              L ${left + w * 0.06} ${y2}
              L ${left + w * 0.22} ${y3}
              L ${mid} ${tip}
              L ${right - w * 0.22} ${y3}
              L ${right - w * 0.06} ${y2}
              L ${right - w * 0.12} ${y1}
              L ${right} ${topY} Z`;
    }
    case 'crystal':
    default: {
      const tip = topY + h;
      const ridgeY = topY + h * 0.58;
      return `M ${left} ${topY}
              C ${left + w * 0.18} ${topY + h * 0.1}, ${mid - w * 0.24} ${ridgeY}, ${mid} ${tip}
              C ${mid + w * 0.24} ${ridgeY}, ${right - w * 0.18} ${topY + h * 0.1}, ${right} ${topY}
              L ${mid + w * 0.16} ${ridgeY - h * 0.08}
              L ${mid} ${topY + h * 0.18}
              L ${mid - w * 0.16} ${ridgeY - h * 0.08}
              Z`;
    }
  }
}

export default function IciclesOverlay({
  className
}: {
  className?: string;
}): React.JSX.Element {
  return (
    <div
      aria-hidden
      className={clsx(
        'pointer-events-none absolute inset-x-0 top-0 z-20 overflow-hidden',
        className
      )}
    >
      <svg
        className="h-[88px] w-full"
        viewBox="0 0 1200 120"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="icicleFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.85)" />
            <stop offset="35%" stopColor="rgba(200,235,255,0.6)" />
            <stop offset="100%" stopColor="rgba(120,180,220,0.05)" />
          </linearGradient>
          <linearGradient id="icicleStroke" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.65)" />
            <stop offset="100%" stopColor="rgba(56,189,248,0.25)" />
          </linearGradient>
          <filter id="icicleGlow" x="-20%" y="-40%" width="140%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="
                1 0 0 0 0
                0 1 0 0 0
                0 0 1 0 0
                0 0 0 0.55 0"
              result="glow"
            />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect x="0" y="0" width="1200" height="20" fill="rgba(255,255,255,0.10)" />
        <rect x="0" y="0" width="1200" height="3" fill="rgba(180,230,255,0.18)" />

        {ICICLES.map((icicle, index) => {
          const x = icicle.x * 1200;
          const w = Math.max(14, icicle.width * 1200);
          const h = 18 + icicle.length * 92;
          const mid = x + w / 2;
          const left = x;
          const right = x + w;
          const tipY = 20 + h;
          const d = buildIciclePath({
            variant: icicle.variant,
            left,
            right,
            topY: 20,
            tipY
          });

          return (
            <g key={index} filter="url(#icicleGlow)">
              <path d={d} fill="url(#icicleFill)" stroke="url(#icicleStroke)" strokeWidth="1.2" />
              <circle cx={mid + w * 0.08} cy={tipY - 6} r="2.3" fill="rgba(255,255,255,0.7)" />
              <circle cx={mid - w * 0.12} cy={tipY - 14} r="1.6" fill="rgba(255,255,255,0.45)" />
              <circle
                className="holiday-icicle-drip"
                style={{ animationDelay: `${icicle.dripDelayMs}ms` }}
                cx={mid}
                cy={tipY + 2}
                r="2.1"
                fill="rgba(180,230,255,0.55)"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
