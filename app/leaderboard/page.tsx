'use client';

import React, { useEffect, useState, useCallback } from 'react';

import { useTelegram } from '@/context/TelegramContext';
import { buildTelegramAuthHeaders } from '@/lib/telegram';
import { useStarBalance } from '@/lib/hooks/useStarBalance';

type LeaderboardEntry = {
  rank: number;
  userId: string;
  displayName: string;
  telegramId: number;
  lifetimeEarn: number;
  gamesPlayed: number;
  isPremium: boolean;
};

type CurrentUserRank = {
  rank: number;
  lifetimeEarn: number;
  gamesPlayed: number;
} | null;

const RARITY_ICON: Record<number, { icon: string; color: string; bg: string }> = {
  1: { icon: '🥇', color: '#FFD700', bg: 'rgba(255,215,0,0.12)' },
  2: { icon: '🥈', color: '#C0C0C0', bg: 'rgba(192,192,192,0.10)' },
  3: { icon: '🥉', color: '#CD7F32', bg: 'rgba(205,127,50,0.10)' }
};

function formatStars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

export default function LeaderboardPage(): React.JSX.Element {
  const { initDataRaw } = useTelegram();
  const { state: balanceState } = useStarBalance();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [currentUserRank, setCurrentUserRank] = useState<CurrentUserRank>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (initDataRaw) headers['x-telegram-init-data'] = initDataRaw;

      const res = await fetch('/api/mini-app/leaderboard', { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Ошибка загрузки');
      setLeaderboard(data.leaderboard ?? []);
      setCurrentUserRank(data.currentUserRank ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки рейтинга');
    } finally {
      setLoading(false);
    }
  }, [initDataRaw]);

  useEffect(() => {
    void fetchLeaderboard();
  }, [fetchLeaderboard]);

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="ui-kicker">Рейтинг</p>
        <h1 className="ui-title">Лидерборд</h1>
        <p className="ui-lead max-w-[44ch]">
          Топ игроков по заработанным звёздам за всё время.
        </p>
      </header>

      {/* Моя позиция */}
      {currentUserRank && (
        <div className="ui-card ui-card-gold flex items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gold-400/40 bg-gold-400/10 text-gold-400 font-semibold text-sm">
              #{currentUserRank.rank}
            </div>
            <div>
              <p className="text-sm font-medium text-platinum">Моя позиция</p>
              <p className="text-xs text-platinum/55">{currentUserRank.gamesPlayed} игр сыграно</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold text-gold-400">★ {formatStars(currentUserRank.lifetimeEarn)}</p>
            <p className="text-xs text-platinum/55">за всё время</p>
          </div>
        </div>
      )}

      {/* Список */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="ui-card flex items-center gap-4 px-5 py-4 animate-pulse">
              <div className="h-10 w-10 rounded-full bg-white/8" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-32 rounded bg-white/8" />
                <div className="h-3 w-20 rounded bg-white/6" />
              </div>
              <div className="h-5 w-16 rounded bg-white/8" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="ui-card px-5 py-8 text-center">
          <p className="text-platinum/60 text-sm mb-3">{error}</p>
          <button
            onClick={() => void fetchLeaderboard()}
            className="ui-btn-gold px-6 py-2 text-sm rounded-xl"
            type="button"
          >
            Повторить
          </button>
        </div>
      ) : leaderboard.length === 0 ? (
        <div className="ui-card px-5 py-10 text-center">
          <p className="text-4xl mb-3">🏆</p>
          <p className="text-platinum/60 text-sm">Рейтинг пока пуст. Начните играть!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {leaderboard.map(entry => {
            const medal = RARITY_ICON[entry.rank];
            return (
              <div
                key={entry.userId}
                className="ui-card flex items-center gap-4 px-4 py-3.5 transition duration-200"
                style={medal ? { background: medal.bg, borderColor: `${medal.color}30` } : undefined}
              >
                {/* Ранг */}
                <div
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                  style={
                    medal
                      ? { background: `${medal.color}18`, color: medal.color }
                      : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)' }
                  }
                >
                  {medal ? medal.icon : `#${entry.rank}`}
                </div>

                {/* Имя */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-medium text-platinum">
                      {entry.displayName}
                    </p>
                    {entry.isPremium && (
                      <span className="flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium bg-gold-400/15 text-gold-400 uppercase tracking-wide">
                        Premium
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-platinum/45">{entry.gamesPlayed} игр</p>
                </div>

                {/* Звёзды */}
                <div className="text-right flex-shrink-0">
                  <p
                    className="text-sm font-semibold"
                    style={medal ? { color: medal.color } : { color: '#D4AF37' }}
                  >
                    ★ {formatStars(entry.lifetimeEarn)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
