'use client';

import clsx from 'clsx';
import React, { useEffect, useState } from 'react';

import ConfettiBurst from '@/components/effects/ConfettiBurst';

import styles from './daily-gift.module.css';

function formatReward(value: number): string {
  return `+${value.toLocaleString('ru-RU')} ★`;
}

export default function DailyGiftModal({
  open,
  loading,
  reward,
  streak,
  onClose
}: {
  open: boolean;
  loading: boolean;
  reward: number | null;
  streak: number | null;
  onClose: () => void;
}): React.JSX.Element | null {
  const [confetti, setConfetti] = useState(false);
  const [readyToReveal, setReadyToReveal] = useState(false);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (!open) {
      setConfetti(false);
      setReadyToReveal(false);
      setOpened(false);
      return;
    }
    setConfetti(false);
    setReadyToReveal(false);
    setOpened(false);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    // FIX §5: Сократили таймеры — анимация открытия быстрее
    const openTimer = window.setTimeout(() => {
      setOpened(true);
    }, 600);
    const revealTimer = window.setTimeout(() => {
      setReadyToReveal(true);
    }, 900);
    return () => {
      window.clearTimeout(openTimer);
      window.clearTimeout(revealTimer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (loading || !reward) {
      return;
    }
    if (!readyToReveal) {
      return;
    }
    const timer = window.setTimeout(() => {
      setConfetti(true);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [loading, open, readyToReveal, reward]);

  if (!open) {
    return null;
  }

  const showReward = !loading && !!reward && readyToReveal;

  return (
    <div className={clsx('fixed inset-0 z-[70] flex items-center justify-center px-4', styles.backdrop)}>
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/12 bg-[#070b16] p-5 shadow-[0_30px_70px_rgba(0,0,0,0.55)] backdrop-blur-xl">
        <ConfettiBurst active={confetti} className="opacity-80" />

        <header className="relative z-10 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/55">Ежедневный подарок</p>
            <h3 className="mt-1 text-lg font-semibold text-white">Открываем коробку…</h3>
          </div>
          {/* FIX §5: Кнопка закрытия ВСЕГДА активна — убрали disabled={loading}.
              Пользователь может закрыть модальное окно в любой момент,
              не ожидая завершения анимации или ответа сервера. */}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/8 text-white/80 transition hover:text-white active:scale-[0.97]"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </header>

        <div className="relative z-10 mt-6 flex flex-col items-center gap-5">
          <div className="relative">
            <div className={clsx(styles.present, !opened && styles.shake)}>
              <div className={styles.presentGlow} />
              <div className={styles.presentBody}>
                <div className={styles.ribbonVertical} />
                <div className={styles.ribbonHorizontal} />
              </div>
              <div className={clsx(styles.presentLid, opened && styles.openLid)}>
                <div className={styles.ribbonVertical} />
                <div className={styles.ribbonHorizontal} />
                <div className={styles.bow}>
                  <span className={styles.bowLoop} />
                  <span className={styles.bowLoop} />
                  <span className={styles.bowKnot} />
                </div>
              </div>
            </div>
          </div>

          {!showReward ? (
            <div className="w-full rounded-2xl border border-white/10 bg-white/6 p-4 text-center">
              <p className="text-sm font-semibold text-white">Получаем подарок…</p>
              <p className="mt-1 text-xs text-white/55">Секунда, синхронизируемся с сервером.</p>
            </div>
          ) : (
            <div className={clsx('w-full rounded-2xl border border-white/12 bg-white/6 p-4 text-center', styles.revealCard)}>
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/55">
                {streak && streak > 1 ? `Серия: ${streak} дней` : 'Начало серии'}
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">{formatReward(reward)}</p>
              <p className="mt-2 text-sm text-white/60">Возвращайтесь завтра — награда растёт с серией.</p>
            </div>
          )}

          {/* FIX §5: Кнопка "Круто!" активна сразу как только загрузка завершена.
              Убрали disabled={loading} — кнопка реагирует мгновенно. */}
          <button
            type="button"
            onClick={onClose}
            className={clsx(
              'w-full rounded-full border px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] transition active:scale-[0.98]',
              showReward
                ? 'border-white/15 bg-white/10 text-white hover:bg-white/14'
                : 'border-white/10 bg-white/6 text-white/60'
            )}
          >
            {showReward ? 'Круто!' : 'Подождите…'}
          </button>
        </div>
      </div>
    </div>
  );
}
