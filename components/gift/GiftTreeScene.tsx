'use client';

import clsx from 'clsx';
import type { ReactNode } from 'react';
import React, { useMemo } from 'react';

type Ornament = {
  cx: number;
  cy: number;
  r: number;
  color: string;
  delay: string;
  glow: string;
};

const COLORS = [
  { fill: '#ef4444', glow: 'rgba(239,68,68,0.55)' }, // red
  { fill: '#22c55e', glow: 'rgba(34,197,94,0.55)' }, // green
  { fill: '#3b82f6', glow: 'rgba(59,130,246,0.55)' }, // blue
  { fill: '#f59e0b', glow: 'rgba(245,158,11,0.55)' }, // amber
  { fill: '#a78bfa', glow: 'rgba(167,139,250,0.55)' } // purple
] as const;

function makeOrnaments(): Ornament[] {
  const points = [
    [160, 118, 8],
    [132, 132, 7],
    [188, 140, 7],
    [152, 160, 7],
    [206, 170, 8],
    [114, 176, 8],
    [172, 190, 8],
    [138, 214, 9],
    [202, 224, 9],
    [116, 242, 8],
    [168, 250, 10],
    [214, 256, 8]
  ] as const;

  return points.map(([cx, cy, r], index) => {
    const { fill, glow } = COLORS[index % COLORS.length];
    return {
      cx,
      cy,
      r,
      color: fill,
      glow,
      delay: `${(index % 7) * 0.22}s`
    };
  });
}

export default function GiftTreeScene({
  children,
  className
}: {
  children?: ReactNode;
  className?: string;
}): React.JSX.Element {
  const ornaments = useMemo(makeOrnaments, []);

  return (
    <div className={clsx('relative mx-auto w-full max-w-[320px]', className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-5 mx-auto h-24 w-[92%] rounded-[999px] bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.14),transparent_62%)] blur-[1px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-10 h-56 w-56 -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.14),transparent_62%)] blur-2xl"
      />

      <svg
        aria-hidden
        className="relative z-10 block h-auto w-full drop-shadow-[0_24px_55px_rgba(0,0,0,0.55)]"
        viewBox="0 0 320 360"
      >
        <defs>
          <linearGradient id="treeFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#16a34a" />
            <stop offset="1" stopColor="#065f46" />
          </linearGradient>
          <linearGradient id="treeEdge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="rgba(255,255,255,0.18)" />
            <stop offset="1" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
          <linearGradient id="trunkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#b45309" />
            <stop offset="1" stopColor="#7c2d12" />
          </linearGradient>
          <filter id="softGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3.2" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="
                1 0 0 0 0
                0 1 0 0 0
                0 0 1 0 0
                0 0 0 0.7 0"
              result="glow"
            />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="ornGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Star */}
        <g filter="url(#softGlow)">
          <path
            d="M160 26 L172 55 L204 58 L180 78 L188 109 L160 92 L132 109 L140 78 L116 58 L148 55 Z"
            fill="#fbbf24"
            stroke="rgba(255,255,255,0.5)"
            strokeWidth="2"
          />
          <path
            d="M160 33 L170 56 L195 58 L176 73 L182 98 L160 86 L138 98 L144 73 L125 58 L150 56 Z"
            fill="rgba(255,255,255,0.25)"
          />
        </g>

        {/* Tree layers */}
        <g>
          <path
            d="M160 70 C135 92 96 120 72 152 C95 150 113 156 124 168 C100 172 66 196 46 224 C74 222 101 228 114 240 C86 246 52 272 36 300 C76 292 118 300 146 320 C160 332 160 332 174 320 C202 300 244 292 284 300 C268 272 234 246 206 240 C219 228 246 222 274 224 C254 196 220 172 196 168 C207 156 225 150 248 152 C224 120 185 92 160 70 Z"
            fill="url(#treeFill)"
          />
          <path
            d="M160 74 C139 96 107 121 88 144"
            fill="none"
            stroke="url(#treeEdge)"
            strokeWidth="6"
            strokeLinecap="round"
            opacity="0.45"
          />
          <path
            d="M160 78 C181 98 214 124 236 150"
            fill="none"
            stroke="rgba(255,255,255,0.10)"
            strokeWidth="6"
            strokeLinecap="round"
            opacity="0.45"
          />
        </g>

        {/* Garland */}
        <path
          d="M92 156 Q160 188 228 156"
          fill="none"
          stroke="rgba(230,243,255,0.28)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M72 224 Q160 260 248 224"
          fill="none"
          stroke="rgba(230,243,255,0.26)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M58 276 Q160 318 262 276"
          fill="none"
          stroke="rgba(230,243,255,0.24)"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Ornaments */}
        {ornaments.map((o) => (
          <g key={`${o.cx}-${o.cy}`} filter="url(#ornGlow)">
            <circle
              cx={o.cx}
              cy={o.cy}
              r={o.r * 1.9}
              fill={o.glow}
              opacity="0.22"
            >
              <animate
                attributeName="opacity"
                values="0.12;0.28;0.14"
                dur="2.9s"
                begin={o.delay}
                repeatCount="indefinite"
              />
            </circle>
            <circle
              cx={o.cx}
              cy={o.cy}
              r={o.r}
              fill={o.color}
              stroke="rgba(255,255,255,0.45)"
              strokeWidth="1.6"
            >
              <animate
                attributeName="opacity"
                values="0.78;1;0.84"
                dur="2.9s"
                begin={o.delay}
                repeatCount="indefinite"
              />
            </circle>
            <circle
              cx={o.cx - o.r * 0.35}
              cy={o.cy - o.r * 0.35}
              r={Math.max(1.6, o.r * 0.28)}
              fill="rgba(255,255,255,0.65)"
            />
          </g>
        ))}

        {/* Trunk */}
        <path
          d="M140 292 C138 320 138 330 138 344 C138 351 142 356 150 356 H170 C178 356 182 351 182 344 C182 330 182 320 180 292 Z"
          fill="url(#trunkFill)"
        />
        <path
          d="M146 296 C145 324 146 334 146 344 C146 349 148 352 152 352 H158"
          fill="none"
          stroke="rgba(255,255,255,0.14)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>

      <div className="absolute inset-x-0 bottom-0 z-20 flex items-end justify-center pb-0">
        {children}
      </div>
    </div>
  );
}

