'use client';

import React, { useMemo, useState } from 'react';

import ConfettiBurst from '@/components/effects/ConfettiBurst';

import GameViewport from '@/components/games/GameViewport';
import { useTelegram } from '@/context/TelegramContext';
import { useStarBalance } from '@/lib/hooks/useStarBalance';
import { buildTelegramAuthHeaders } from '@/lib/telegram';

type CellValue = 'X' | 'O' | null;

type TicTacToeResult = {
  sessionId: string;
  board: CellValue[];
  status: 'active' | 'win' | 'lose' | 'draw';
  payout?: number;
};

export default function TicTacToePage(): React.JSX.Element {
  const { initDataRaw } = useTelegram();
  const { refresh: refreshBalance } = useStarBalance();
  const [bet, setBet] = useState(25);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [board, setBoard] = useState<CellValue[]>(Array(9).fill(null));
  const [status, setStatus] = useState<TicTacToeResult['status'] | 'idle'>('idle');
  const [payout, setPayout] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confetti, setConfetti] = useState(false);

  const cells = useMemo(() => Array.from({ length: 9 }, (_, index) => index), []);

  const updateFromResult = (result: TicTacToeResult) => {
    setSessionId(result.sessionId);
    if (result.status === 'win') {
      setConfetti(false);
      requestAnimationFrame(() => setConfetti(true));
    }
    setBoard(result.board);
    setStatus(result.status);
    setPayout(result.payout ?? null);
    // Обновляем баланс в хедере при завершении игры
    if (result.status === 'win' || result.status === 'lose' || result.status === 'draw') {
      void refreshBalance();
    }
  };

  const startGame = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/mini-app/games/tictactoe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildTelegramAuthHeaders(initDataRaw)
        },
        body: JSON.stringify({ action: 'start', bet })
      });
      const payload = (await response.json().catch(() => ({}))) as { result?: TicTacToeResult; error?: string };
      if (!response.ok || !payload.result) {
        throw new Error(payload.error ?? 'Не удалось начать игру.');
      }
      setPayout(null);
      updateFromResult(payload.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось начать игру.');
    } finally {
      setIsLoading(false);
    }
  };

  const makeMove = async (index: number) => {
    if (!sessionId || status !== 'active' || isLoading || board[index]) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/mini-app/games/tictactoe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildTelegramAuthHeaders(initDataRaw)
        },
        body: JSON.stringify({ action: 'move', sessionId, index })
      });
      const payload = (await response.json().catch(() => ({}))) as { result?: TicTacToeResult; error?: string };
      if (!response.ok || !payload.result) {
        throw new Error(payload.error ?? 'Не удалось сделать ход.');
      }
      updateFromResult(payload.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сделать ход.');
    } finally {
      setIsLoading(false);
    }
  };

  const isFinished = status !== 'active' && status !== 'idle';

  return (
    <GameViewport
      backgroundClassName="bg-gradient-to-b from-[#10101d] via-[#080812] to-black"
      contentClassName="flex flex-col gap-4"
      backLabel="Игры"
    >
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.24em] text-blue-300/70">Tic-Tac-Toe</p>
        <h1 className="text-2xl font-semibold text-white">Крестики-нолики</h1>
        <p className="text-sm text-white/60">Сделайте ход, а затем соперник ответит.</p>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
        <div className="relative overflow-hidden rounded-3xl border border-blue-300/20 bg-gradient-to-br from-blue-400/10 via-black/40 to-black/80 p-3">
          <div className="absolute -left-8 -top-10 h-24 w-24 rounded-full bg-blue-300/20 blur-2xl animate-pulse" />
          <div className="absolute -right-6 bottom-0 h-28 w-28 rounded-full bg-blue-300/10 blur-2xl animate-pulse" />
          <div className="relative grid grid-cols-3 gap-2">
            {cells.map((cell) => {
              const value = board[cell];
              return (
                <button
                  key={cell}
                  className={`flex h-20 items-center justify-center rounded-2xl border text-2xl transition ${
                    value
                      ? 'border-white/20 bg-black/50'
                      : 'border-white/10 bg-black/30 hover:bg-black/40'
                  }`}
                  type="button"
                  onClick={() => makeMove(cell)}
                  disabled={isLoading || status !== 'active' || value !== null}
                >
                  {value === 'X' ? (
                    <img src="/textures/games/x.svg" alt="X" className="h-8 w-8" />
                  ) : value === 'O' ? (
                    <img src="/textures/games/circle.svg" alt="O" className="h-8 w-8" />
                  ) : (
                    <span className="text-xs uppercase tracking-[0.2em] text-white/20">•</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.16em] text-white/60">
            Ставка (★)
            <input
              className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white"
              type="number"
              min={1}
              value={bet}
              onChange={(event) => setBet(Number.parseInt(event.target.value, 10) || 1)}
              disabled={isLoading || status === 'active'}
            />
          </label>
        </div>

        <button
          className="mt-4 w-full rounded-full bg-blue-400/90 px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-black transition active:scale-[0.98] disabled:opacity-60"
          type="button"
          onClick={startGame}
          disabled={isLoading || status === 'active'}
        >
          {isLoading && !sessionId ? 'Готовим матч...' : 'Начать матч'}
        </button>

        {error ? (
          <p className="mt-3 text-xs uppercase tracking-[0.16em] text-red-300">{error}</p>
        ) : null}

        {isFinished ? (
          <div className={`relative mt-4 overflow-hidden rounded-2xl border p-4 text-center transition-all ${status === 'win' ? 'border-yellow-400/40 bg-yellow-400/10 animate-win-glow-pulse' : 'border-white/10 bg-white/5'}`}>
            <ConfettiBurst active={confetti} className="opacity-90 pointer-events-none" />
            <p className="text-xs uppercase tracking-[0.18em] text-white/60">Результат</p>
            <p className={`mt-2 text-xl font-bold animate-win-scale ${status === 'win' ? 'text-yellow-300 animate-win-shine' : 'text-white/60'}`}>
              {status === 'win'
                ? `Победа! +${payout ?? 0} ★`
                : status === 'draw'
                  ? 'Ничья — ставка возвращена'
                  : 'Поражение'}
            </p>
          </div>
        ) : null}
      </div>
    </GameViewport>
  );
}
