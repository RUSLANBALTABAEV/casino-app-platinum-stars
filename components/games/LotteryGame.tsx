'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useTelegram } from '@/context/TelegramContext';
import {
  getDefaultLotteryConfig,
  type LotteryConfig,
  type LotteryPoolDefinition
} from '@/lib/config/lottery-default';
import { buildTelegramAuthHeaders } from '@/lib/telegram';

interface LotteryBalanceDto {
  available: number;
  reserved: number;
}

interface LotteryPoolStateDto extends LotteryPoolDefinition {
  entriesCount: number;
  entriesRemaining: number;
  userEntries: number;
}

interface LotteryWinnerDto {
  entryId: string;
  userId: string;
  poolId: string;
  poolName: string;
  position: number;
  prize: number;
  createdAt: string;
}

interface LotteryApiResponse {
  config: LotteryConfig;
  pools: LotteryPoolStateDto[];
  balance: LotteryBalanceDto;
  userResults: LotteryWinnerDto[];
  recentResults: LotteryWinnerDto[];
}

interface LotteryJoinApiResponse {
  result: {
    entryId: string;
    pool: LotteryPoolStateDto;
    balance: LotteryBalanceDto;
    winners: LotteryWinnerDto[];
  };
  state: {
    pools: LotteryPoolStateDto[];
    balance: LotteryBalanceDto;
    userResults: LotteryWinnerDto[];
    recentResults: LotteryWinnerDto[];
  };
}

interface PoolCardProps {
  pool: LotteryPoolStateDto;
  isJoining: boolean;
  onJoin: (poolId: string) => void;
}

const DEFAULT_CONFIG = getDefaultLotteryConfig();
const HISTORY_LIMIT = 6;

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function PoolCard({ pool, isJoining, onJoin }: PoolCardProps): React.JSX.Element {
  const fillPercent = pool.participantLimit > 0 ? Math.min((pool.entriesCount / pool.participantLimit) * 100, 100) : 0;
  const numberFormatter = new Intl.NumberFormat('ru-RU');
  const totalBank = Math.round(pool.participantLimit * pool.ticketCost * pool.prizePercent);

  return (
    <article className="rounded-xl border-2 border-white/20 bg-gradient-to-br from-white/10 to-white/5 p-3 shadow-lg backdrop-blur-sm transition-all hover:border-white/30">
      <header className="mb-2 flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-white line-clamp-1">{pool.name}</h3>
          <p className="text-[10px] text-white/60 mt-0.5">Банк: {numberFormatter.format(totalBank)} ★</p>
        </div>
        <span className="rounded-lg border border-white/20 bg-black/40 px-2 py-1 text-[10px] font-bold text-white backdrop-blur-sm shrink-0">
          {pool.ticketCost} ★
        </span>
      </header>

      <div className="mb-2 space-y-1.5">
        <div className="flex items-center justify-between text-[9px] uppercase tracking-wider text-white/50">
          <span>Заполнено</span>
          <span className="font-bold text-white">{pool.entriesCount}/{pool.participantLimit}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 transition-all duration-300"
            style={{ width: `${fillPercent}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[9px] text-white/50">
          <span>Ваши: {pool.userEntries}</span>
          <span>Осталось: {Math.max(pool.entriesRemaining, 0)}</span>
        </div>
      </div>

      <button
        className="w-full rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-lg transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 hover:shadow-xl hover:from-blue-400 hover:to-purple-400"
        disabled={isJoining || pool.entriesRemaining <= 0}
        onClick={() => onJoin(pool.id)}
        type="button"
      >
        {isJoining ? (
          <span className="flex items-center justify-center gap-1.5">
            <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Покупаем…
          </span>
        ) : (
          `🎫 Билет за ${pool.ticketCost} ★`
        )}
      </button>
    </article>
  );
}

export default function LotteryGame(): React.JSX.Element {
  const { initDataRaw } = useTelegram();
  const isAuthorized = Boolean(initDataRaw);
  const [pools, setPools] = useState<LotteryPoolStateDto[]>([]);
  const [balance, setBalance] = useState<LotteryBalanceDto>({ available: 0, reserved: 0 });
  const [userResults, setUserResults] = useState<LotteryWinnerDto[]>([]);
  const [recentResults, setRecentResults] = useState<LotteryWinnerDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingPoolId, setPendingPoolId] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const headers = useMemo(() => buildTelegramAuthHeaders(initDataRaw), [initDataRaw]);

  const showToast = useCallback((message: string, duration = 2400) => {
    setToast(message);
    window.setTimeout(() => setToast(null), duration);
  }, []);

  const loadData = useCallback(
    async (signal?: AbortSignal) => {
      if (!initDataRaw) {
        setPools(
          DEFAULT_CONFIG.pools.map((pool) => ({
            ...pool,
            entriesCount: 0,
            entriesRemaining: pool.participantLimit,
            userEntries: 0
          }))
        );
        setBalance({ available: 0, reserved: 0 });
        setUserResults([]);
        setRecentResults([]);
        setIsLoading(false);
        setError(null);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const authHeaders = initDataRaw ? buildTelegramAuthHeaders(initDataRaw) : undefined;
        const response = await fetch('/api/mini-app/games/lottery', {
          headers: authHeaders,
          signal
        });
        const payload = (await response.json().catch(() => ({}))) as LotteryApiResponse & { error?: string };
        if (!response.ok || !payload?.config) {
          throw new Error(payload?.error ?? 'Не удалось загрузить лотереи.');
        }
        setPools(payload.pools);
        setBalance(payload.balance ?? { available: 0, reserved: 0 });
        setUserResults(payload.userResults ?? []);
        setRecentResults(payload.recentResults ?? []);
      } catch (err) {
        if (signal?.aborted) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Не удалось загрузить лотереи.');
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [initDataRaw, showToast]
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  const handleJoin = useCallback(
    (poolId: string) => {
      if (!initDataRaw) {
        showToast('Недоступно без авторизации.');
        return;
      }
      setPendingPoolId(poolId);
      setError(null);
      void (async () => {
        try {
          const authHeaders = buildTelegramAuthHeaders(initDataRaw);
          const response = await fetch('/api/mini-app/games/lottery', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...authHeaders
            },
            body: JSON.stringify({ action: 'join', poolId })
          });
          const payload = (await response.json().catch(() => ({}))) as LotteryJoinApiResponse & { error?: string };
          if (!response.ok || !payload?.result) {
            throw new Error(payload?.error ?? 'Не удалось купить билет.');
          }
          setPools(payload.state.pools);
          setBalance(payload.state.balance ?? payload.result.balance);
          setUserResults(payload.state.userResults ?? []);
          setRecentResults(payload.state.recentResults ?? []);

          const winnersForPool = payload.result.winners.filter((winner) => winner.poolId === poolId);
          if (winnersForPool.length > 0) {
            showToast('Розыгрыш завершён! Проверьте результаты.');
          } else {
            showToast('Билет успешно куплен!');
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Не удалось купить билет.');
          showToast('Не удалось купить билет.');
        } finally {
          setPendingPoolId(null);
        }
      })();
    },
    [headers, initDataRaw, showToast]
  );

  const refresh = useCallback(() => {
    void loadData();
  }, [loadData]);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden text-white">
      {/* Компактный хедер */}
      <div className="flex items-center justify-between px-2 py-2">
        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-white/20 bg-black/40 px-2 py-1 backdrop-blur-sm">
            <span className="text-[10px] uppercase tracking-wider text-white/60">Баланс</span>
            <div className="text-sm font-bold text-white">{balance.available} ★</div>
          </div>
          {pools.length > 0 && (
            <div className="rounded-lg border border-white/20 bg-black/40 px-2 py-1 backdrop-blur-sm">
              <span className="text-[10px] uppercase tracking-wider text-white/60">Пулов</span>
              <div className="text-xs font-bold text-white">{pools.length}</div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-black/40 text-white/80 backdrop-blur-sm transition hover:text-white active:scale-95"
            disabled={isLoading}
            onClick={() => refresh()}
            type="button"
          >
            <svg
              aria-hidden
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path d="M3 12a9 9 0 0 1 15.5-6.5" />
              <path d="M21 12a9 9 0 0 1-15.5 6.5" />
              <path d="M21 4v6h-6" />
              <path d="M3 20v-6h6" />
            </svg>
          </button>
          <button
            aria-label={isMenuOpen ? 'Скрыть меню' : 'Открыть меню'}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-black/40 text-white/80 backdrop-blur-sm transition hover:text-white active:scale-95"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            type="button"
          >
            <span className="text-base leading-none">⋯</span>
          </button>
        </div>
      </div>

      {/* Игровое поле - список пулов */}
      <div className="relative flex-1 overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-b from-[#0a0d1a] to-[#050509] shadow-[0_0_40px_rgba(0,0,0,0.5)]">
        <div className="h-full overflow-y-auto p-2 scrollbar-hide">
          {!isAuthorized ? (
            <div className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs text-white/65 mb-2">
              Запустите мини-приложение Telegram для сохранения билетов
            </div>
          ) : null}
          
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />
            </div>
          ) : pools.length ? (
            <div className="flex flex-col gap-2">
              {pools.map((pool) => (
                <PoolCard key={pool.id} pool={pool} isJoining={pendingPoolId === pool.id} onJoin={handleJoin} />
              ))}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-white/50">Активных пулов пока нет</p>
            </div>
          )}
        </div>
      </div>

      {/* Toast уведомления */}
      {toast && (
        <div className="pointer-events-none absolute inset-x-4 top-20 z-50 flex justify-center animate-bounce">
          <div className="rounded-full border border-white/30 bg-black/90 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white shadow-xl backdrop-blur-md">
            {toast}
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-x-4 top-16 z-50 rounded-xl border border-red-400/50 bg-red-900/40 px-3 py-2 text-xs text-red-100 backdrop-blur-md animate-pulse">
          {error}
        </div>
      )}

      {isMenuOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0b0f1e] p-4 text-white shadow-[0_24px_48px_rgba(5,8,15,0.45)] sm:p-5">
            <header className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Детали лотереи</h3>
              <button
                aria-label="Закрыть меню"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/80 transition hover:text-white"
                onClick={() => setIsMenuOpen(false)}
                type="button"
              >
                <span className="text-base leading-none">✕</span>
              </button>
            </header>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl border border-white/12 bg-white/6 px-3 py-2 text-sm text-white/70">
                  <span className="block text-[11px] uppercase tracking-[0.16em] text-white/55">Баланс</span>
                  <span className="text-base font-semibold text-white">{balance.available} ★</span>
                </div>
                <div className="rounded-2xl border border-white/12 bg-white/6 px-3 py-2 text-sm text-white/70">
                  <span className="block text-[11px] uppercase tracking-[0.16em] text-white/55">В резерве</span>
                  <span className="text-base font-semibold text-white/80">{balance.reserved} ★</span>
                </div>
              </div>

              <section className="space-y-2">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-white/55">
                  <span>Ваши результаты</span>
                  <span>{Math.min(userResults.length, HISTORY_LIMIT)}</span>
                </div>
                <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                  {userResults.length ? (
                    userResults.slice(0, HISTORY_LIMIT).map((result) => (
                      <div
                        key={result.entryId}
                        className="rounded-2xl border border-white/12 bg-white/6 px-3 py-2 text-sm text-white/80"
                      >
                        <div className="flex items-center justify-between">
                          <span className="truncate">{result.poolName}</span>
                          <span className="text-sm font-semibold text-white">+{result.prize} ★</span>
                        </div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-white/45">
                          Место {result.position} • {formatTimestamp(result.createdAt)}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-white/50">Пока нет выигрышей.</p>
                  )}
                </div>
              </section>

              <section className="space-y-2">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-white/55">
                  <span>Свежие победители</span>
                  <span>{Math.min(recentResults.length, HISTORY_LIMIT)}</span>
                </div>
                <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                  {recentResults.length ? (
                    recentResults.slice(0, HISTORY_LIMIT).map((result) => (
                      <div
                        key={`${result.entryId}-${result.createdAt}`}
                        className="rounded-2xl border border-white/12 bg-white/6 px-3 py-2 text-sm text-white/80"
                      >
                        <div className="flex items-center justify-between">
                          <span className="truncate">{result.poolName}</span>
                          <span className="text-sm font-semibold text-white">+{result.prize} ★</span>
                        </div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-white/45">
                          Место {result.position} • {formatTimestamp(result.createdAt)}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-white/50">Розыгрыши ещё не завершены.</p>
                  )}
                </div>
              </section>
            </div>

            <button
              className="mt-4 w-full rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-white/80 transition hover:text-white"
              onClick={() => setIsMenuOpen(false)}
              type="button"
            >
              Закрыть
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
