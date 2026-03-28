'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import clsx from 'clsx';

import { useTelegram } from '@/context/TelegramContext';
import { getTelegramDisplayName } from '@/lib/telegram';
import { useStarBalance } from '@/lib/hooks/useStarBalance';
import { isDemoModeEnabled, setDemoMode } from '@/lib/demo-mode';

type ProfileData = {
  balance: number;
  streakDays: number;
  earnedToday: number;
  availablePromos: number;
  status: string;
  statusExpiresAt: string | null;
  user: {
    telegramId: number;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    isPremium: boolean;
    avatarUrl: string | null;
  } | null;
};

type ReferralData = {
  referralCode: string;
  referralLink: string;
  invited: number;
  completed: number;
  rewardPerFriend: number;
} | null;

type GameStats = {
  totalSessions: number;
  totalWagered: number;
  totalPayout: number;
  winRate: number;
  favoriteGame: string | null;
} | null;

const QUICK_LINKS = [
  { href: '/leaderboard' as Route, icon: '🏆', label: 'Рейтинг',    sub: 'Лидерборд' },
  { href: '/nft-shop'   as Route, icon: '💎', label: 'NFT',         sub: 'Магазин' },
  { href: '/inventory'  as Route, icon: '🎁', label: 'Инвентарь',   sub: 'Мои NFT' },
  { href: '/wallet'     as Route, icon: '💸', label: 'Кошелёк',     sub: 'Пополнить / вывести' },
];

export default function ProfilePage(): React.JSX.Element {
  const { initDataRaw, user: tgUser } = useTelegram();
  const { state: balanceState, refresh: refreshBalance } = useStarBalance();

  const [profile,   setProfile]   = useState<ProfileData | null>(null);
  const [referral,  setReferral]  = useState<ReferralData>(null);
  const [gameStats, setGameStats] = useState<GameStats>(null);
  const [loading,   setLoading]   = useState(true);
  const [copied,    setCopied]    = useState(false);
  const [demoMode,  setDemoState] = useState(false);

  React.useEffect(() => { setDemoState(isDemoModeEnabled()); }, []);

  const handleToggleDemo = () => {
    const next = !demoMode;
    setDemoMode(next);
    setDemoState(next);
    window.location.reload();
  };

  const fetchProfile = useCallback(async () => {
    if (!initDataRaw) return;
    try {
      const res  = await fetch('/api/mini-app/profile', { headers: { 'x-telegram-init-data': initDataRaw } });
      if (!res.ok) return;
      const data = await res.json();
      setProfile(data.profile ?? null);
      setReferral(data.referral ?? null);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [initDataRaw]);

  const fetchGameStats = useCallback(async () => {
    if (!initDataRaw) return;
    try {
      const res  = await fetch('/api/mini-app/profile/stats', { headers: { 'x-telegram-init-data': initDataRaw } });
      if (!res.ok) return;
      const data = await res.json();
      setGameStats(data.stats ?? null);
    } catch { /* silent */ }
  }, [initDataRaw]);

  useEffect(() => {
    void fetchProfile();
    void fetchGameStats();
    void refreshBalance();
  }, [fetchProfile, fetchGameStats, refreshBalance]);

  const displayName = profile?.user
    ? getTelegramDisplayName(profile.user as Parameters<typeof getTelegramDisplayName>[0])
    : getTelegramDisplayName(tgUser);

  const balance = balanceState.status === 'ready' ? balanceState.available : (profile?.balance ?? 0);
  const initials = displayName.replace('@', '').split(' ').filter(Boolean).slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '').join('') || '★';

  const handleCopy = () => {
    if (!referral?.referralLink) return;
    const link = referral.referralLink;

    const ok = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      try { (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success'); } catch { /* ignore */ }
    };

    // 1. Telegram native API — best option for all Telegram versions
    const tg = (window as any).Telegram?.WebApp;
    if (typeof tg?.writeTextToClipboard === 'function') {
      try { tg.writeTextToClipboard(link, (success: boolean) => { if (success !== false) ok(); }); return; }
      catch { /* fallthrough */ }
    }

    // 2. Standard Clipboard API
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(link).then(ok).catch(() => execCommandCopy(link, ok));
      return;
    }

    // 3. execCommand fallback for Telegram WebView (bypasses global userSelect:none)
    execCommandCopy(link, ok);
  };

  function execCommandCopy(text: string, onSuccess: () => void) {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;';
    el.style.userSelect = 'text';
    (el.style as any).webkitUserSelect = 'text';
    document.body.appendChild(el);
    el.focus({ preventScroll: true });
    el.select();
    el.setSelectionRange(0, text.length);
    try { if (document.execCommand('copy')) onSuccess(); } catch { /* ignore */ }
    document.body.removeChild(el);
  }

  if (loading) {
    return (
      <section className="space-y-4 animate-pulse">
        <div className="rounded-2xl bg-white/5 h-28" />
        <div className="grid grid-cols-2 gap-3">
          {[0,1,2,3].map(i => <div key={i} className="h-20 rounded-2xl bg-white/5" />)}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4 pb-32">

      {/* ── Profile hero card ── */}
      <div
        className="relative overflow-hidden rounded-2xl border border-yellow-500/20 p-5"
        style={{
          background: 'linear-gradient(135deg, #0d0900 0%, #1f1400 60%, #0d0900 100%)',
          boxShadow: '0 0 40px rgba(251,191,36,0.08), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        {/* Background glow */}
        <div className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full blur-3xl"
          style={{ background: 'rgba(251,191,36,0.12)' }} />

        <div className="relative flex items-center gap-4">
          {/* Avatar */}
          <div
            className="relative flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full text-xl font-extrabold"
            style={{
              background: 'linear-gradient(135deg, #fbbf24, #d97706)',
              color: '#000',
              boxShadow: '0 0 20px rgba(251,191,36,0.4)',
            }}
          >
            {initials}
            {profile?.user?.isPremium && (
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-yellow-400 text-[10px] font-bold text-black shadow">
                ⭐
              </span>
            )}
          </div>

          {/* Name + streak */}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-extrabold text-white leading-tight truncate">{displayName}</h1>
            {profile?.status === 'PREMIUM' && (
              <span className="inline-block mt-0.5 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>
                Premium
              </span>
            )}
            {profile?.streakDays ? (
              <p className="mt-1 text-xs text-white/50">🔥 Серия {profile.streakDays} дней</p>
            ) : null}
          </div>
        </div>

        {/* Balance big display */}
        <div className="mt-4 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-yellow-500/60">Баланс</p>
            <p className="mt-0.5 text-3xl font-extrabold tracking-tight leading-none"
              style={{ color: '#fbbf24', textShadow: '0 0 20px rgba(251,191,36,0.4)' }}>
              ★ {balance.toLocaleString('ru')}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Сегодня</p>
            <p className="mt-0.5 text-xl font-bold text-white/70 leading-none">
              +{(profile?.earnedToday ?? 0).toLocaleString('ru')} ★
            </p>
          </div>
        </div>

        {/* Bottom accent */}
        <div className="mt-4 h-px w-full"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(251,191,36,0.4), transparent)' }} />
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Сыграно игр', value: gameStats?.totalSessions != null ? gameStats.totalSessions.toLocaleString('ru') : '—', icon: '🎮' },
          { label: 'Винрейт',     value: gameStats?.winRate != null ? `${gameStats.winRate.toFixed(1)}%` : '—',               icon: '📈' },
        ].map(stat => (
          <div key={stat.label}
            className="relative overflow-hidden rounded-2xl border border-white/8 px-4 py-4"
            style={{ background: 'linear-gradient(135deg, #0a0a0a, #161616)' }}>
            <p className="text-lg">{stat.icon}</p>
            <p className="mt-1 text-xl font-extrabold text-white">{stat.value}</p>
            <p className="text-[10px] uppercase tracking-wider text-white/40">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* ── Demo mode ── */}
      <div
        className="rounded-2xl border px-5 py-4"
        style={{
          background: demoMode ? 'linear-gradient(135deg,#1a1000,#2d1a00)' : 'rgba(255,255,255,0.03)',
          borderColor: demoMode ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.08)',
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-white">Демо-режим</p>
            <p className="text-[11px] text-white/45">
              {demoMode ? '🟢 Включён — игра без реальных ставок' : '⚫ Выключен — реальные ставки'}
            </p>
          </div>
          <button type="button" onClick={handleToggleDemo}
            className="relative h-7 w-12 rounded-full transition-colors duration-300 focus:outline-none flex-shrink-0"
            style={{ background: demoMode ? '#fbbf24' : 'rgba(255,255,255,0.15)' }}>
            <span className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-300 ${demoMode ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
        {demoMode && (
          <div className="mt-3 rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-[11px] text-yellow-400/90">
            ⚠️ В демо-режиме баланс виртуальный. Выигрыши и проигрыши не сохраняются.
          </div>
        )}
      </div>

      {/* ── Quick links — 2×2 banner style ── */}
      <div className="grid grid-cols-2 gap-3">
        {QUICK_LINKS.map(link => (
          <Link key={link.href} href={link.href}
            className="group relative overflow-hidden rounded-2xl border border-white/8 px-4 py-4 transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #0d0900, #1a1200)' }}>
            <div className="pointer-events-none absolute -top-4 -right-4 text-5xl opacity-10 transition group-hover:opacity-20">
              {link.icon}
            </div>
            <span className="text-2xl">{link.icon}</span>
            <p className="mt-2 text-sm font-bold text-white">{link.label}</p>
            <p className="text-[11px] text-white/40">{link.sub}</p>
          </Link>
        ))}
      </div>

      {/* ── Referral ── */}
      {referral && (
        <div
          className="rounded-2xl border border-yellow-500/15 px-5 py-4 space-y-3"
          style={{ background: 'linear-gradient(135deg, #0d0900, #1a1200)' }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
              🔗 Реферальная программа
            </h2>
            <span className="text-[10px] text-white/35">💰 Зарабатывай за друзей</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-2.5">
              <p className="text-[10px] text-white/40">Приглашено</p>
              <p className="text-xl font-extrabold text-white">{referral.completed ?? 0}</p>
            </div>
            <div className="rounded-xl border border-yellow-500/25 px-3 py-2.5"
              style={{ background: 'rgba(251,191,36,0.08)' }}>
              <p className="text-[10px] text-white/40">Заработано</p>
              <p className="text-xl font-extrabold text-yellow-400">★ {(referral.completed ?? 0) * (referral.rewardPerFriend ?? 0)}</p>
            </div>
          </div>

          <button type="button" onClick={() => void handleCopy()}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/4 px-4 py-3 text-left transition hover:border-yellow-500/30 active:scale-[0.99]">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-white/40 mb-0.5">Реферальная ссылка</p>
              <p className="truncate text-xs font-mono text-white/65">
                {referral.referralLink || '…'}
              </p>
            </div>
            <span className={clsx('flex-shrink-0 text-xs font-bold transition-colors', copied ? 'text-emerald-400' : 'text-yellow-400')}>
              {copied ? '✓ Скопировано' : 'Копировать'}
            </span>
          </button>
        </div>
      )}
    </section>
  );
}
