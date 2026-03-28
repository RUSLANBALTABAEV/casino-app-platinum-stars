'use client';

import type { Route } from 'next';
import clsx from 'clsx';
import React from 'react';

export type BottomNavIcon = 'profile' | 'games' | 'gift' | 'tasks' | 'promo' | 'wallet';

export interface BottomNavItem {
  href: Route;
  label: string;
  icon: BottomNavIcon;
}

interface BottomNavProps {
  items: BottomNavItem[];
  activePath: string;
  onNavigate: (href: Route) => void;
}

const ICON_STROKE = 1.8;

function TabIcon({
  name,
  active
}: {
  name: BottomNavIcon;
  active: boolean;
}): React.JSX.Element {
  const gradientId = `nav-${name}-gradient`;
  const stroke = active ? '#D4AF37' : '#CBA135';
  const glow = active ? 'drop-shadow(0 0 6px rgba(212,175,55,0.55))' : 'none';

  switch (name) {
    case 'profile':
      return (
        <svg
          aria-hidden
          className="h-6 w-6"
          viewBox="0 0 24 24"
          style={{ filter: glow }}
        >
          <defs>
            <linearGradient
              gradientTransform="rotate(45)"
              id={gradientId}
              x1="0%"
              x2="100%"
              y1="0%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#D4AF37" />
              <stop offset="100%" stopColor="#CBA135" />
            </linearGradient>
          </defs>
          <circle
            cx="12"
            cy="8"
            fill="none"
            r="4.5"
            stroke={active ? `url(#${gradientId})` : stroke}
            strokeWidth={ICON_STROKE}
          />
          <path
            d="M19.5 20.75c0-3.59-3.358-6-7.5-6s-7.5 2.41-7.5 6"
            fill="none"
            stroke={stroke}
            strokeLinecap="round"
            strokeWidth={ICON_STROKE}
          />
        </svg>
      );
    case 'games':
      return (
        <svg
          aria-hidden
          className="h-6 w-6"
          viewBox="0 0 24 24"
          style={{ filter: glow }}
        >
          <path
            d="M5 7.5h14c1.38 0 2 1.12 1.4 2.5l-3.4 8c-.4.94-1.1 1.5-1.9 1.5H8.9c-.8 0-1.5-.56-1.9-1.5l-3.4-8c-.6-1.38.02-2.5 1.4-2.5Z"
            fill="none"
            stroke={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={ICON_STROKE}
          />
          <path
            d="M9 10.5v3M7.5 12h3"
            stroke={stroke}
            strokeLinecap="round"
            strokeWidth={ICON_STROKE}
          />
          <circle
            cx="15.75"
            cy="12.25"
            fill={active ? '#D4AF37' : 'none'}
            r="1.1"
            stroke={stroke}
            strokeWidth={ICON_STROKE}
          />
          <circle
            cx="13.25"
            cy="14.75"
            fill={active ? '#CBA135' : 'none'}
            r="1.1"
            stroke={stroke}
            strokeWidth={ICON_STROKE}
          />
        </svg>
      );
    case 'tasks':
      return (
        <svg
          aria-hidden
          className="h-6 w-6"
          viewBox="0 0 24 24"
          style={{ filter: glow }}
        >
          <path
            d="M8.5 4.75h7M5.25 8.5h13.5M7 12.5h10M9.75 16.5H17"
            fill="none"
            stroke={stroke}
            strokeLinecap="round"
            strokeWidth={ICON_STROKE}
          />
          <circle
            cx="5"
            cy="12.5"
            fill={active ? '#D4AF37' : 'none'}
            r="1.3"
            stroke={stroke}
            strokeWidth={ICON_STROKE}
          />
          <circle
            cx="7.25"
            cy="16.5"
            fill={active ? '#D4AF37' : 'none'}
            r="1.3"
            stroke={stroke}
            strokeWidth={ICON_STROKE}
          />
        </svg>
      );
    case 'gift':
      return (
        <svg
          aria-hidden
          className="h-6 w-6"
          viewBox="0 0 24 24"
          style={{ filter: glow }}
        >
          <path
            d="M4.75 10h14.5v8.75c0 1.1-.9 2-2 2h-10.5c-1.1 0-2-.9-2-2V10Z"
            fill="none"
            stroke={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={ICON_STROKE}
          />
          <path
            d="M4.75 10V8.75c0-1.1.9-2 2-2h10.5c1.1 0 2 .9 2 2V10"
            fill="none"
            stroke={stroke}
            strokeLinecap="round"
            strokeWidth={ICON_STROKE}
          />
          <path
            d="M12 6.75V20.75"
            fill="none"
            stroke={stroke}
            strokeLinecap="round"
            strokeWidth={ICON_STROKE}
          />
          <path
            d="M12 6.75c-1.55 0-2.75-.85-2.75-1.95 0-.95.85-1.8 2.05-1.8 1.05 0 2.05.7 2.7 2.05.65-1.35 1.65-2.05 2.7-2.05 1.2 0 2.05.85 2.05 1.8 0 1.1-1.2 1.95-2.75 1.95"
            fill="none"
            stroke={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={ICON_STROKE}
          />
        </svg>
      );
    case 'promo':
      return (
        <svg
          aria-hidden
          className="h-6 w-6"
          viewBox="0 0 24 24"
          style={{ filter: glow }}
        >
          <path
            d="M5.5 7.5 12 4l6.5 3.5v5c0 3.5-2.5 5.5-6.5 7-4-1.5-6.5-3.5-6.5-7v-5Z"
            fill="none"
            stroke={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={ICON_STROKE}
          />
          <path
            d="M9 11.5h6"
            stroke={stroke}
            strokeLinecap="round"
            strokeWidth={ICON_STROKE}
          />
          <path
            d="M10 9.75h4"
            stroke={stroke}
            strokeLinecap="round"
            strokeWidth={ICON_STROKE}
          />
        </svg>
      );
    case 'wallet':
      return (
        <svg
          aria-hidden
          className="h-6 w-6"
          viewBox="0 0 24 24"
          style={{ filter: glow }}
        >
          <path
            d="M5.75 7.5h12.5c1.24 0 2.25 1 2.25 2.25v7.25c0 1.25-1.01 2.25-2.25 2.25H5.75c-1.24 0-2.25-1-2.25-2.25V9.75c0-1.25 1.01-2.25 2.25-2.25Z"
            fill="none"
            stroke={stroke}
            strokeLinecap="round"
            strokeWidth={ICON_STROKE}
          />
          <path
            d="M17.5 12.75c0 .69-.56 1.25-1.25 1.25s-1.25-.56-1.25-1.25.56-1.25 1.25-1.25 1.25.56 1.25 1.25Z"
            fill={active ? '#D4AF37' : 'none'}
            stroke={stroke}
            strokeWidth={ICON_STROKE}
          />
          <path
            d="M5.25 7.25V6.5c0-1.66 1.34-3 3-3h8.5"
            fill="none"
            stroke={stroke}
            strokeLinecap="round"
            strokeWidth={ICON_STROKE}
          />
        </svg>
      );
    default:
      return <span />;
  }
}

function BottomNav({
  items,
  activePath,
  onNavigate
}: BottomNavProps): React.JSX.Element {
  return (
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[calc(0.75rem+var(--safe-area-bottom))]"
      data-bottom-nav="1"
    >
      <div
        className="pointer-events-auto flex w-full max-w-[600px] border-t border-white/8 px-1 pt-2 pb-1"
        style={{ background: 'rgba(8,8,10,0.97)', backdropFilter: 'blur(20px)' }}
      >
        {items.map((item) => {
          const isActive =
            item.href === '/'
              ? activePath === item.href
              : activePath.startsWith(item.href);

          return (
            <button
              key={item.href}
              className="flex flex-1 flex-col items-center gap-1 px-2 py-1.5 transition-all duration-200 active:scale-95"
              onClick={() => onNavigate(item.href)}
              type="button"
            >
              {/* Active indicator dot */}
              <div
                className="mb-0.5 h-0.5 w-6 rounded-full transition-all duration-300"
                style={{
                  background: isActive ? '#fbbf24' : 'transparent',
                  boxShadow: isActive ? '0 0 8px rgba(251,191,36,0.6)' : 'none',
                }}
              />
              <TabIcon active={isActive} name={item.icon} />
              <span
                className="text-[10px] font-bold uppercase tracking-[0.1em] transition-colors duration-200"
                style={{ color: isActive ? '#fbbf24' : 'rgba(255,255,255,0.45)' }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default BottomNav;
