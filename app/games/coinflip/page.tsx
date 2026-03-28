'use client';

import React, { useState } from 'react';
import GameViewport from '@/components/games/GameViewport';
import ConfettiBurst from '@/components/effects/ConfettiBurst';
import { useTelegram } from '@/context/TelegramContext';
import { buildTelegramAuthHeaders } from '@/lib/telegram';
import { useStarBalance } from '@/lib/hooks/useStarBalance';

type CoinflipResult = { win: boolean; payout: number; flip: 'heads' | 'tails'; balance?: { available: number } };
const BET_PRESETS = [10, 25, 50, 100, 250];

export default function CoinflipPage(): React.JSX.Element {
  const { initDataRaw } = useTelegram();
  const { refresh: refreshBalance } = useStarBalance();
  const [bet, setBet] = useState(25);
  const [choice, setChoice] = useState<'heads' | 'tails'>('heads');
  const [isPlaying, setIsPlaying] = useState(false);
  const [result, setResult] = useState<CoinflipResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confetti, setConfetti] = useState(false);
  const [spinning, setSpinning] = useState(false);

  const play = async () => {
    setIsPlaying(true); setError(null); setResult(null);
    setSpinning(true); setConfetti(false);
    try {
      const res = await fetch('/api/mini-app/games/coinflip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildTelegramAuthHeaders(initDataRaw) },
        body: JSON.stringify({ bet, choice })
      });
      const data = await res.json().catch(() => ({})) as { result?: CoinflipResult; error?: string };
      await new Promise(r => setTimeout(r, 1200));
      setSpinning(false);
      if (!res.ok || !data.result) throw new Error(data.error ?? 'Не удалось сыграть.');
      setResult(data.result);
      // Refresh balance in header
      void refreshBalance();
      if (data.result.win) requestAnimationFrame(() => setConfetti(true));
    } catch (err) {
      setSpinning(false);
      setError(err instanceof Error ? err.message : 'Не удалось сыграть.');
    } finally { setIsPlaying(false); }
  };

  const coinFace = spinning ? null : result?.flip === 'tails' ? '/textures/games/reshka.png'
    : result?.flip === 'heads' ? '/textures/games/orel.png' : null;

  return (
    <GameViewport backgroundClassName="bg-[#08060a]" contentClassName="flex flex-col gap-4" backLabel="Игры">
      <ConfettiBurst active={confetti} className="opacity-90 pointer-events-none" />
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-yellow-400/70">Coin Flip</p>
        <h1 className="text-2xl font-extrabold text-white">Орёл и решка</h1>
        <p className="text-sm text-white/40 mt-1">Ставьте на сторону монеты — удвоение при угадывании</p>
      </div>
      <div className="relative flex flex-col items-center justify-center py-10 rounded-2xl border border-white/8 overflow-hidden"
        style={{ background: 'linear-gradient(135deg,#100c00,#1f1600)' }}>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-40 w-40 rounded-full blur-3xl"
            style={{ background: spinning ? 'rgba(251,191,36,0.15)' : result?.win ? 'rgba(52,211,153,0.12)' : 'rgba(251,191,36,0.08)' }} />
        </div>
        <div className="relative flex h-32 w-32 items-center justify-center rounded-full border-4 overflow-hidden"
          style={{
            borderColor: spinning ? '#fbbf24' : result?.win ? '#34d399' : result ? '#f87171' : '#fbbf24',
            boxShadow: `0 0 30px ${spinning ? 'rgba(251,191,36,0.4)' : result?.win ? 'rgba(52,211,153,0.3)' : 'rgba(251,191,36,0.2)'}`,
            animation: spinning ? 'coinSpin 0.15s linear infinite' : result ? 'coinLand 0.4s ease-out' : 'none',
          }}>
          {coinFace
            ? <img src={coinFace} alt="" className="h-full w-full object-cover" />
            : <span className="text-5xl">{spinning ? '🪙' : choice === 'heads' ? '🦅' : '🌙'}</span>}
        </div>
        {!spinning && result && (
          <div className="mt-4 text-center" style={{ animation: 'fadeUp 0.3s ease-out' }}>
            <p className="text-3xl font-extrabold" style={{ color: result.win ? '#34d399' : '#f87171' }}>
              {result.win ? `+${result.payout} ★` : `−${bet} ★`}
            </p>
            <p className="text-sm mt-1" style={{ color: result.win ? '#34d399' : 'rgba(255,255,255,0.4)' }}>
              {result.win ? '🎉 Победа!' : `Выпало: ${result.flip === 'heads' ? 'Орёл' : 'Решка'}`}
            </p>
          </div>
        )}
        {spinning && <p className="mt-4 text-sm font-bold text-yellow-400/70 animate-pulse">Подбрасываем...</p>}
      </div>
      <div className="flex gap-3">
        {(['heads', 'tails'] as const).map(side => (
          <button key={side} type="button" disabled={isPlaying} onClick={() => setChoice(side)}
            className="flex-1 flex flex-col items-center gap-2 rounded-2xl border py-4 transition-all active:scale-95 disabled:opacity-50"
            style={{
              background: choice === side ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.04)',
              borderColor: choice === side ? 'rgba(251,191,36,0.5)' : 'rgba(255,255,255,0.08)',
            }}>
            <span className="text-3xl">{side === 'heads' ? '🦅' : '🌙'}</span>
            <span className="text-sm font-bold" style={{ color: choice === side ? '#fbbf24' : 'rgba(255,255,255,0.5)' }}>
              {side === 'heads' ? 'Орёл' : 'Решка'}
            </span>
          </button>
        ))}
      </div>
      <div className="rounded-2xl border border-white/8 p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Ставка ★</p>
        <input type="number" min={1} value={bet} onChange={e => setBet(parseInt(e.target.value) || 1)}
          disabled={isPlaying}
          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-xl font-bold text-center text-white focus:outline-none focus:border-yellow-500/40 disabled:opacity-50" />
        <div className="flex gap-2">
          {BET_PRESETS.map(p => (
            <button key={p} type="button" disabled={isPlaying} onClick={() => setBet(p)}
              className="flex-1 rounded-xl py-2 text-[11px] font-bold transition active:scale-95 disabled:opacity-40"
              style={{
                background: bet === p ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${bet === p ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.08)'}`,
                color: bet === p ? '#fbbf24' : 'rgba(255,255,255,0.5)',
              }}>{p}</button>
          ))}
        </div>
        <div className="rounded-xl border border-white/8 bg-white/4 px-4 py-3 flex justify-between">
          <span className="text-sm text-white/50">Выигрыш при победе:</span>
          <span className="text-sm font-bold text-yellow-400">+{Math.round(bet * 1.92)} ★</span>
        </div>
        <button type="button" onClick={() => void play()} disabled={isPlaying}
          className="w-full rounded-xl py-4 text-base font-extrabold uppercase tracking-wider transition active:scale-95 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg,#fbbf24,#d97706)', color: '#000' }}>
          {isPlaying ? '🪙 Подбрасываем...' : '🪙 Подбросить'}
        </button>
        {error && <p className="text-xs text-red-400 text-center font-bold">⚠️ {error}</p>}
      </div>
      <style>{`
        @keyframes coinSpin { from { transform: rotateY(0deg); } to { transform: rotateY(360deg); } }
        @keyframes coinLand { 0% { transform: scale(1.15); } 100% { transform: scale(1); } }
        @keyframes fadeUp { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform:translateY(0); } }
      `}</style>
    </GameViewport>
  );
}
