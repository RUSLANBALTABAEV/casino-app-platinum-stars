'use client';

import React, { useCallback, useEffect, useState } from 'react';

import DailyGiftModal from '@/components/daily/DailyGiftModal';
import TreasureBoxLottie from '@/components/animations/TreasureBoxLottie';
import GiftTreeScene from '@/components/gift/GiftTreeScene';
import { useTelegram } from '@/context/TelegramContext';

type DailyGiftStatusDto = {
  canClaim: boolean;
  secondsUntilNextClaim: number;
  currentStreak: number;
  nextReward: number;
  nextStreak: number;
  lastClaimedAt: string | null;
};

type DailyGiftGetResponse = {
  status: DailyGiftStatusDto;
  error?: string;
};

type DailyGiftClaimResponse = {
  success?: boolean;
  result?: {
    reward: number;
    streak: number;
    balance: { available: number; reserved: number };
  };
  status?: DailyGiftStatusDto;
  error?: string;
};

function formatCooldown(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function GiftPage(): React.JSX.Element {
  const { initDataRaw } = useTelegram();
  const isTelegramContextReady = Boolean(initDataRaw);
  const [status, setStatus] = useState<DailyGiftStatusDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [reward, setReward] = useState<number | null>(null);
  const [streak, setStreak] = useState<number | null>(null);
  const [animationPhase, setAnimationPhase] = useState<'idle' | 'opening' | 'opened'>('idle');

  const fetchStatus = useCallback(async () => {
    if (!isTelegramContextReady) {
      setIsLoading(false);
      setStatus(null);
      setError('Откройте эту страницу внутри Telegram (через бота), чтобы получить подарок.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      headers['x-telegram-init-data'] = initDataRaw!;
      const response = await fetch('/api/mini-app/daily-gift', {
        method: 'GET',
        headers,
        cache: 'no-store'
      });

      const data = (await response.json().catch(() => null)) as DailyGiftGetResponse | null;
      if (!response.ok || !data?.status) {
        throw new Error(data?.error ?? 'Не удалось получить статус подарка.');
      }
      setStatus(data.status);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Не удалось получить статус подарка.';
      setError(
        message.includes('Missing X-Telegram-Init-Data')
          ? 'Откройте эту страницу внутри Telegram (через бота), чтобы получить подарок.'
          : message
      );
    } finally {
      setIsLoading(false);
    }
  }, [initDataRaw, isTelegramContextReady]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const handleClaim = useCallback(() => {
    if (!isTelegramContextReady) {
      setError('Откройте эту страницу внутри Telegram (через бота), чтобы получить подарок.');
      return;
    }
    if (!status?.canClaim || isClaiming) {
      return;
    }

    setModalOpen(true);
    setIsClaiming(true);
    setReward(null);
    setStreak(null);
    setError(null);
    setAnimationPhase('opening');

    void (async () => {
      try {
        const headers: Record<string, string> = {};
        headers['x-telegram-init-data'] = initDataRaw!;
        const response = await fetch('/api/mini-app/daily-gift', {
          method: 'POST',
          headers
        });
        const data = (await response.json().catch(() => null)) as DailyGiftClaimResponse | null;
        if (!response.ok || !data?.result) {
          throw new Error(data?.error ?? 'Не удалось забрать подарок.');
        }
        setReward(data.result.reward);
        setStreak(data.result.streak);
        setAnimationPhase('opened');
        if (data.status) {
          setStatus(data.status);
        } else {
          await fetchStatus();
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Не удалось забрать подарок.';
        setError(
          message.includes('Missing X-Telegram-Init-Data')
            ? 'Откройте эту страницу внутри Telegram (через бота), чтобы получить подарок.'
            : message
        );
        setModalOpen(false);
        setAnimationPhase('idle');
      } finally {
        setIsClaiming(false);
      }
    })();
  }, [fetchStatus, initDataRaw, isClaiming, isTelegramContextReady, status?.canClaim]);

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="ui-kicker">Подарок</p>
        <h1 className="ui-title">🎁 Подарок дня</h1>
        <p className="ui-lead max-w-[52ch]">
          Под ёлкой вас ждёт коробка со звёздами. Забирайте каждый день — серия увеличивает награду.
        </p>
      </header>

      <DailyGiftModal
        open={modalOpen}
        loading={isClaiming}
        reward={reward}
        streak={streak}
        onClose={() => {
          setModalOpen(false);
          setReward(null);
          setStreak(null);
          setAnimationPhase('idle');
        }}
      />

      <article className="ui-card ui-card-glass ui-card-gold ui-card-pad overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_55%),radial-gradient(circle_at_bottom,rgba(34,211,238,0.10),transparent_60%)]"
        />
        <div className="relative z-10 grid gap-6 md:grid-cols-[minmax(0,1fr)_340px] md:items-center">
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-[0.16em] text-platinum/55">Наряжаем ёлку</p>
              <h2 className="text-lg font-semibold text-platinum">🎄 Новогодняя вкладка</h2>
              <p className="text-sm text-platinum/60">
                Откройте коробку — и звёзды сразу упадут на баланс.
              </p>
            </div>

            {status && !isLoading ? (
              <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-platinum/45">
                <span>
                  Серия: {status.currentStreak > 0 ? `${status.currentStreak} дн.` : '—'}
                </span>
                <span>Следующая: {status.nextStreak} дн.</span>
                <span>Награда: +{status.nextReward.toLocaleString('ru-RU')} ★</span>
              </div>
            ) : null}

            {error ? (
              <p className="ui-chip border-red-400/25 bg-red-500/10 text-red-200">{error}</p>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {isLoading ? (
                <div className="h-11 w-full animate-pulse rounded-full border border-white/10 bg-white/5 sm:w-56" />
              ) : status ? (
                <>
                  {!status.canClaim ? (
                    <div className="ui-chip justify-center border-white/14 bg-black/40 text-white/70">
                      Через {formatCooldown(status.secondsUntilNextClaim)}
                    </div>
                  ) : null}
                  <button
                    className="ui-btn w-full border border-emerald-400/40 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                    disabled={!isTelegramContextReady || !status.canClaim || isClaiming}
                    onClick={handleClaim}
                    type="button"
                  >
                    {isClaiming ? 'Открываем…' : status.canClaim ? 'Открыть подарок' : 'Завтра'}
                  </button>
                </>
              ) : (
                <button
                  className="ui-btn ui-btn-secondary w-full sm:w-auto"
                  disabled={!isTelegramContextReady}
                  onClick={() => void fetchStatus()}
                  type="button"
                >
                  Обновить
                </button>
              )}
            </div>
          </div>

          <GiftTreeScene className="md:justify-self-end">
            <TreasureBoxLottie
              className="relative z-10 h-[200px] w-[200px] translate-y-6 drop-shadow-[0_18px_40px_rgba(0,0,0,0.55)]"
              phase={animationPhase === 'opening' ? 'opening' : animationPhase === 'opened' ? 'opened' : 'idle'}
              renderer="canvas"
            />
          </GiftTreeScene>
        </div>
      </article>

      <article className="ui-card ui-card-glass ui-card-pad">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative z-10 space-y-3 text-sm text-platinum/70">
          <p className="ui-kicker">Как это работает</p>
          <ul className="space-y-2">
            <li>Раз в сутки можно открыть коробку и получить звёзды.</li>
            <li>Если заходите каждый день — серия растёт и награда увеличивается.</li>
            <li>Пропуск дня сбрасывает серию.</li>
          </ul>
        </div>
      </article>
    </section>
  );
}
