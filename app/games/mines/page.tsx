'use client';

import React, { useMemo, useState } from 'react';
import ConfettiBurst from '@/components/effects/ConfettiBurst';
import GameViewport from '@/components/games/GameViewport';
import { useTelegram } from '@/context/TelegramContext';
import { useStarBalance } from '@/lib/hooks/useStarBalance';
import { buildTelegramAuthHeaders } from '@/lib/telegram';

type MinesStatus = 'idle' | 'active' | 'lost' | 'cashed';
type MinesResult = {
  sessionId: string; gridSize: number; minesCount: number;
  picks: number[]; status: 'active' | 'lost' | 'cashed';
  multiplier: number; payout?: number; mines?: number[];
};

const MINE_COUNTS = [1, 3, 5, 10, 15];
const BET_PRESETS = [10, 25, 50, 100, 200];

export default function MinesPage(): React.JSX.Element {
  const { initDataRaw } = useTelegram();
  const { refresh: refreshBalance } = useStarBalance();
  const [bet, setBet] = useState(25);
  const [minesCount, setMinesCount] = useState(5);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<MinesStatus>('idle');
  const [picks, setPicks] = useState<number[]>([]);
  const [mines, setMines] = useState<number[] | null>(null);
  const [multiplier, setMultiplier] = useState(1);
  const [payout, setPayout] = useState<number | null>(null);
  const [confetti, setConfetti] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastReveal, setLastReveal] = useState<'gem' | 'mine' | null>(null);

  const cells = useMemo(() => Array.from({ length: 25 }, (_, i) => i), []);
  const isActive = status === 'active';
  const isFinished = status === 'lost' || status === 'cashed';

  const updateFromResult = (result: MinesResult) => {
    setSessionId(result.sessionId);
    setStatus(result.status);
    setPicks(result.picks);
    setMultiplier(result.multiplier);
    setPayout(result.payout ?? null);
    setMines(result.mines ?? null);
  };

  const startGame = async () => {
    setIsLoading(true); setError(null); setLastReveal(null);
    setPicks([]); setMines(null); setConfetti(false);
    try {
      const res = await fetch('/api/mini-app/games/mines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildTelegramAuthHeaders(initDataRaw) },
        body: JSON.stringify({ action: 'start', bet, mines: minesCount })
      });
      const data = await res.json().catch(() => ({})) as { result?: MinesResult; error?: string };
      if (!res.ok || !data.result) throw new Error(data.error ?? 'Не удалось начать игру.');
      setStatus('active'); setPayout(null); setMines(null);
      updateFromResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось начать игру.');
    } finally { setIsLoading(false); }
  };

  const pickCell = async (index: number) => {
    if (!sessionId || !isActive || isLoading) return;
    setIsLoading(true); setError(null); setLastReveal(null);
    try {
      const res = await fetch('/api/mini-app/games/mines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildTelegramAuthHeaders(initDataRaw) },
        body: JSON.stringify({ action: 'pick', sessionId, index })
      });
      const data = await res.json().catch(() => ({})) as { result?: MinesResult; error?: string };
      if (!res.ok || !data.result) throw new Error(data.error ?? 'Не удалось открыть ячейку.');
      const wasMine = data.result.status === 'lost';
      if (wasMine || data.result.status === 'cashed') void refreshBalance();
      setLastReveal(wasMine ? 'mine' : 'gem');
      updateFromResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось открыть ячейку.');
    } finally { setIsLoading(false); }
  };

  const cashout = async () => {
    if (!sessionId || !isActive || isLoading) return;
    setIsLoading(true); setError(null);
    try {
      const res = await fetch('/api/mini-app/games/mines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildTelegramAuthHeaders(initDataRaw) },
        body: JSON.stringify({ action: 'cashout', sessionId })
      });
      const data = await res.json().catch(() => ({})) as { result?: MinesResult; error?: string };
      if (!res.ok || !data.result) throw new Error(data.error ?? 'Не удалось забрать выигрыш.');
      updateFromResult(data.result);
      void refreshBalance();
      setConfetti(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось забрать выигрыш.');
    } finally { setIsLoading(false); }
  };

  const safeCells = picks.length;
  const potential = Math.round(bet * multiplier);
  const profit = potential - bet;

  return (
    <GameViewport
      backgroundClassName="bg-[#050a06]"
      contentClassName="flex flex-col gap-3"
      backLabel="Игры"
    >
      <ConfettiBurst active={confetti} className="opacity-90 pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-400/70">Mines</p>
          <h1 className="text-2xl font-extrabold text-white">Минное поле</h1>
        </div>
        {isActive && (
          <div className="text-right">
            <p className="text-[10px] text-white/40 uppercase tracking-wider">Потенциал</p>
            <p className="text-2xl font-extrabold text-emerald-400">+{profit} ★</p>
          </div>
        )}
      </div>

      {/* Multiplier bar */}
      {isActive && (
        <div
          className="rounded-2xl border border-emerald-400/20 px-4 py-3"
          style={{ background: 'linear-gradient(135deg,#061209,#0a1f0e)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">💎</span>
              <span className="text-sm font-bold text-white">{safeCells} открыто</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-white/40 uppercase tracking-wider">Множитель</span>
              <p className="text-xl font-extrabold text-emerald-400">×{multiplier.toFixed(2)}</p>
            </div>
          </div>
          {/* Progress dots */}
          <div className="flex gap-1 flex-wrap">
            {Array.from({ length: 25 - minesCount }).map((_, i) => (
              <div key={i} className="h-2 w-2 rounded-full transition-all duration-300"
                style={{ background: i < safeCells ? '#34d399' : 'rgba(255,255,255,0.1)' }} />
            ))}
          </div>
        </div>
      )}

      {/* Grid */}
      <div
        className="relative overflow-hidden rounded-2xl border border-white/8 p-3"
        style={{ background: 'linear-gradient(180deg,#0a120b,#060d07)' }}
      >
        {/* Ambient glow */}
        <div className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{ boxShadow: isActive ? 'inset 0 0 40px rgba(52,211,153,0.06)' : 'none' }} />

        <div className="grid grid-cols-5 gap-2">
          {cells.map((index) => {
            const isPicked   = picks.includes(index);
            const isMine     = mines?.includes(index) ?? false;
            const isRevealed = isPicked || (isFinished && isMine);
            const isLastPick = isPicked && picks[picks.length - 1] === index;
            const canPick    = isActive && !isPicked && !isLoading;

            let bg = 'rgba(255,255,255,0.06)';
            let border = 'rgba(255,255,255,0.08)';
            let shadow = 'none';

            if (isRevealed && isMine) {
              bg = 'rgba(239,68,68,0.2)';
              border = 'rgba(239,68,68,0.5)';
              shadow = '0 0 12px rgba(239,68,68,0.3)';
            } else if (isRevealed && !isMine) {
              bg = 'rgba(52,211,153,0.15)';
              border = 'rgba(52,211,153,0.5)';
              shadow = isLastPick ? '0 0 18px rgba(52,211,153,0.5)' : '0 0 8px rgba(52,211,153,0.2)';
            } else if (canPick) {
              bg = 'rgba(255,255,255,0.07)';
              border = 'rgba(255,255,255,0.12)';
            }

            return (
              <button
                key={index}
                type="button"
                disabled={!canPick}
                onClick={() => void pickCell(index)}
                className="relative flex aspect-square items-center justify-center rounded-xl transition-all duration-200 active:scale-90"
                style={{ background: bg, border: `1px solid ${border}`, boxShadow: shadow }}
              >
                {isRevealed ? (
                  isMine ? (
                    <span className="text-xl" style={{ filter: 'drop-shadow(0 0 6px rgba(239,68,68,0.8))' }}>💣</span>
                  ) : (
                    <span className="text-xl" style={{ filter: 'drop-shadow(0 0 6px rgba(52,211,153,0.8))' }}>💎</span>
                  )
                ) : (
                  canPick ? (
                    <div className="h-2.5 w-2.5 rounded-full bg-white/20" />
                  ) : (
                    <div className="h-2 w-2 rounded-full bg-white/10" />
                  )
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Controls */}
      <div
        className="rounded-2xl border border-white/8 p-4 space-y-3"
        style={{ background: 'rgba(255,255,255,0.03)' }}
      >
        {/* Bet row */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 mb-2">Ставка ★</p>
          <div className="flex gap-2">
            <input
              type="number" min={1} value={bet}
              onChange={e => setBet(parseInt(e.target.value) || 1)}
              disabled={isActive || isLoading}
              className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-base font-bold text-white text-center focus:outline-none focus:border-yellow-500/40 disabled:opacity-50"
            />
          </div>
          <div className="flex gap-1.5 mt-2">
            {BET_PRESETS.map(p => (
              <button key={p} type="button" disabled={isActive || isLoading}
                onClick={() => setBet(p)}
                className="flex-1 rounded-lg py-1.5 text-[11px] font-bold transition active:scale-95 disabled:opacity-40"
                style={{
                  background: bet === p ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${bet === p ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.08)'}`,
                  color: bet === p ? '#fbbf24' : 'rgba(255,255,255,0.5)',
                }}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Mines count */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 mb-2">Мин на поле 💣</p>
          <div className="flex gap-2">
            {MINE_COUNTS.map(m => (
              <button key={m} type="button" disabled={isActive || isLoading}
                onClick={() => setMinesCount(m)}
                className="flex-1 rounded-xl py-2.5 text-sm font-bold transition active:scale-95 disabled:opacity-40"
                style={{
                  background: minesCount === m ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${minesCount === m ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)'}`,
                  color: minesCount === m ? '#f87171' : 'rgba(255,255,255,0.5)',
                }}>
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={() => void startGame()}
            disabled={isLoading || isActive}
            className="flex-1 rounded-xl py-3.5 text-sm font-extrabold uppercase tracking-wider transition active:scale-95 disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg,#fbbf24,#d97706)', color: '#000' }}>
            {isLoading && !isActive ? '⏳ Создаём...' : '▶ Новая игра'}
          </button>
          <button type="button" onClick={() => void cashout()}
            disabled={isLoading || !isActive || picks.length === 0}
            className="flex-1 rounded-xl py-3.5 text-sm font-extrabold uppercase tracking-wider transition active:scale-95 disabled:opacity-40"
            style={{ background: isActive && picks.length > 0 ? 'linear-gradient(135deg,#34d399,#059669)' : 'rgba(255,255,255,0.06)', color: isActive && picks.length > 0 ? '#000' : 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.1)' }}>
            {isLoading && isActive ? '⏳ Фиксируем...' : `💸 Забрать ${isActive ? potential + '★' : ''}`}
          </button>
        </div>

        {error && <p className="text-xs text-red-400 text-center font-bold">⚠️ {error}</p>}
      </div>

      {/* Result */}
      {status === 'lost' && (
        <div className="rounded-2xl border border-red-500/30 p-4 text-center"
          style={{ background: 'linear-gradient(135deg,rgba(239,68,68,0.15),rgba(185,28,28,0.08))' }}>
          <p className="text-4xl mb-2">💥</p>
          <p className="text-base font-extrabold text-red-400">Мина! Ставка сгорела</p>
          <p className="text-sm text-white/40 mt-1">Открыто безопасных: {picks.length - 1}</p>
        </div>
      )}
      {status === 'cashed' && (
        <div className="rounded-2xl border border-emerald-400/30 p-4 text-center"
          style={{ background: 'linear-gradient(135deg,rgba(52,211,153,0.15),rgba(5,150,105,0.08))' }}>
          <p className="text-4xl mb-2">🎉</p>
          <p className="text-2xl font-extrabold text-emerald-400">+{payout ?? 0} ★</p>
          <p className="text-sm text-white/40 mt-1">×{multiplier.toFixed(2)} · {picks.length} ходов</p>
        </div>
      )}
    </GameViewport>
  );
}
