'use client';

import type { Route } from 'next';
import Link from 'next/link';
import React, { useState } from 'react';

type GameCard = {
  name: string;
  description: string;
  badge: string;
  badgeColor: string;
  emoji: string;
  decorEmojis?: string[];
  gradient: string;
  href?: Route;
  isNew?: boolean;
  isHot?: boolean;
};

const GAMES: GameCard[] = [
  {
    name: 'Кейсы',
    description: 'Раритетные призы и NFT-коллекции',
    badge: 'ХИТ',
    badgeColor: '#fbbf24',
    emoji: '📦',
    decorEmojis: ['🎁', '👑'],
    gradient: 'linear-gradient(135deg, #1a0e00 0%, #3d2200 50%, #1a0e00 100%)',
    href: '/games/cases',
    isHot: true,
  },
  {
    name: 'Краш',
    description: 'Успей вывести до обрушения',
    badge: 'НОВОЕ',
    badgeColor: '#34d399',
    emoji: '🚀',
    decorEmojis: ['x5.2', 'x10.3', 'x51.7'],
    gradient: 'linear-gradient(135deg, #001a0e 0%, #003d22 50%, #001a0e 100%)',
    href: '/games/crash',
    isNew: true,
  },
  {
    name: 'Рулетка',
    description: 'Колесо фортуны и слоты',
    badge: 'ХИТ',
    badgeColor: '#fbbf24',
    emoji: '🎰',
    decorEmojis: ['🎡', '🎲'],
    gradient: 'linear-gradient(135deg, #1a000e 0%, #3d0022 50%, #1a000e 100%)',
    href: '/games/roulette',
    isHot: true,
  },
  {
    name: 'Мины',
    description: 'Риск и множители на каждом ходе',
    badge: 'КЛАССИКА',
    badgeColor: '#a78bfa',
    emoji: '💣',
    decorEmojis: ['💥', '⭐'],
    gradient: 'linear-gradient(135deg, #0e0018 0%, #22003d 50%, #0e0018 100%)',
    href: '/games/mines',
  },
  {
    name: 'Лотерея',
    description: 'Общий банк с другими игроками',
    badge: 'ЕЖЕДН.',
    badgeColor: '#60a5fa',
    emoji: '🎟️',
    decorEmojis: ['🏆', '💰'],
    gradient: 'linear-gradient(135deg, #00101a 0%, #00223d 50%, #00101a 100%)',
    href: '/games/lottery',
  },
  {
    name: 'Батл',
    description: 'PVP против других игроков',
    badge: 'PVP',
    badgeColor: '#f87171',
    emoji: '⚔️',
    decorEmojis: ['🛡️', '👊'],
    gradient: 'linear-gradient(135deg, #1a0000 0%, #3d0000 50%, #1a0000 100%)',
    href: '/games/battle',
  },
  {
    name: 'Раннер',
    description: 'Уклоняйся и собирай звёздную пыль',
    badge: 'СЕЗОН',
    badgeColor: '#fbbf24',
    emoji: '🏃',
    decorEmojis: ['✨', '⭐'],
    gradient: 'linear-gradient(135deg, #1a1000 0%, #3d2800 50%, #1a1000 100%)',
    href: '/games/runner',
  },
  {
    name: 'Апгрейд',
    description: 'Повышай ставку до редких множителей',
    badge: 'РИСК',
    badgeColor: '#fb923c',
    emoji: '⬆️',
    decorEmojis: ['💎', '🔥'],
    gradient: 'linear-gradient(135deg, #1a0800 0%, #3d1800 50%, #1a0800 100%)',
    href: '/games/upgrade',
  },
  {
    name: 'Орёл и решка',
    description: 'Ставка на сторону — шанс на удвоение',
    badge: 'БЫСТРО',
    badgeColor: '#fbbf24',
    emoji: '🪙',
    decorEmojis: ['🦅', '💸'],
    gradient: 'linear-gradient(135deg, #181800 0%, #383800 50%, #181800 100%)',
    href: '/games/coinflip',
  },

  {
    name: 'Крафт NFT',
    description: 'Объединяй NFT, получай редкие подарки',
    badge: 'NFT',
    badgeColor: '#34d399',
    emoji: '⚗️',
    decorEmojis: ['💎', '✨'],
    gradient: 'linear-gradient(135deg, #001a10 0%, #003d25 50%, #001a10 100%)',
    href: '/games/craft',
  },
];

export default function GamesPage(): React.JSX.Element {
  const [pressedIdx, setPressedIdx] = useState<number | null>(null);

  return (
    <section className="space-y-4 pb-2">
      {/* Header */}
      <header className="pt-1 pb-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-yellow-500/70">
          ★ Platinum Stars
        </p>
        <h1 className="mt-1 text-2xl font-extrabold text-white">
          Игровой центр
        </h1>
        <p className="mt-1 text-sm text-white/45">
          Выберите режим и отправляйтесь за звёздами
        </p>
      </header>

      {/* Game cards — Randomalbot style */}
      <div className="space-y-3">
        {GAMES.map((game, idx) => {
          const isPressed = pressedIdx === idx;
          const inner = (
            <div
              className="relative overflow-hidden rounded-2xl border border-white/8 transition-all duration-150"
              style={{
                background: game.gradient,
                transform: isPressed ? 'scale(0.97)' : 'scale(1)',
                boxShadow: `0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
                animation: `slide-up 0.4s ease-out ${idx * 0.06}s both`,
              }}
              onPointerDown={() => setPressedIdx(idx)}
              onPointerUp={() => setPressedIdx(null)}
              onPointerLeave={() => setPressedIdx(null)}
            >
              {/* Shimmer overlay */}
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, transparent 60%)',
                }}
              />

              <div className="flex items-center justify-between px-5 py-4">
                {/* Left: badge + name + desc */}
                <div className="flex-1 min-w-0 pr-4">
                  {/* Badge */}
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.2em]"
                      style={{
                        background: game.badgeColor + '22',
                        color: game.badgeColor,
                        border: `1px solid ${game.badgeColor}44`,
                      }}
                    >
                      {game.isHot && '🔥 '}
                      {game.isNew && '🆕 '}
                      {game.badge}
                    </span>
                  </div>

                  {/* Game name */}
                  <p className="text-xl font-extrabold text-white leading-tight tracking-tight">
                    {game.name}
                  </p>

                  {/* Description */}
                  <p className="mt-1 text-[12px] text-white/50 leading-snug">
                    {game.description}
                  </p>
                </div>

                {/* Right: main emoji + deco */}
                <div className="relative flex-shrink-0 flex items-center justify-end w-24 h-16">
                  {/* Decorative emojis */}
                  {game.decorEmojis?.map((e, i) => (
                    <span
                      key={i}
                      className="absolute text-[11px] font-bold opacity-60"
                      style={{
                        top: i === 0 ? '0%' : i === 1 ? '55%' : '20%',
                        right: i === 0 ? '0%' : i === 1 ? '30%' : '55%',
                        color: game.badgeColor,
                        textShadow: `0 0 8px ${game.badgeColor}88`,
                        transform: `rotate(${[-10, 8, -5][i] ?? 0}deg)`,
                      }}
                    >
                      {e}
                    </span>
                  ))}
                  {/* Main emoji */}
                  <span
                    className="relative z-10 text-5xl leading-none"
                    style={{
                      filter: `drop-shadow(0 0 12px ${game.badgeColor}66)`,
                    }}
                  >
                    {game.emoji}
                  </span>
                </div>
              </div>

              {/* Bottom accent line */}
              <div
                className="h-0.5 w-full"
                style={{
                  background: `linear-gradient(90deg, transparent, ${game.badgeColor}66, transparent)`,
                }}
              />
            </div>
          );

          if (game.href) {
            return (
              <Link key={game.name} href={game.href} className="block">
                {inner}
              </Link>
            );
          }
          return (
            <button key={game.name} type="button" className="block w-full text-left">
              {inner}
            </button>
          );
        })}
      </div>
    </section>
  );
}
