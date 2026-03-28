'use client';

import React, { useState } from 'react';
import GameViewport from '@/components/games/GameViewport';
import ConfettiBurst from '@/components/effects/ConfettiBurst';
import { useTelegram } from '@/context/TelegramContext';
import { useStarBalance } from '@/lib/hooks/useStarBalance';
import { buildTelegramAuthHeaders } from '@/lib/telegram';

type UpgradeResult = {
  win: boolean; payout: number;
  nftGift?: { id: string; name: string; rarity: string; imageUrl?: string | null } | null;
};

const BET_PRESETS = [20, 50, 100, 200, 500];
const WIN_CHANCE = 55; // display only

export default function UpgradePage(): React.JSX.Element {
  const { initDataRaw } = useTelegram();
  const { refresh: refreshBalance } = useStarBalance();
  const [bet, setBet]       = useState(50);
  const [isPlaying, setIsPlaying] = useState(false);
  const [result, setResult] = useState<UpgradeResult | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [confetti, setConfetti] = useState(false);
  const [animating, setAnimating] = useState(false);

  const play = async () => {
    setIsPlaying(true); setError(null); setResult(null);
    setAnimating(true); setConfetti(false);
    try {
      const res = await fetch('/api/mini-app/games/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildTelegramAuthHeaders(initDataRaw) },
        body: JSON.stringify({ bet })
      });
      await new Promise(r => setTimeout(r, 1000));
      const data = await res.json().catch(() => ({})) as { result?: UpgradeResult; error?: string };
      setAnimating(false);
      if (!res.ok || !data.result) throw new Error(data.error ?? 'Не удалось сыграть.');
      setResult(data.result);
      void refreshBalance();
      if (data.result.win) requestAnimationFrame(() => setConfetti(true));
    } catch (err) {
      setAnimating(false);
      setError(err instanceof Error ? err.message : 'Не удалось сыграть.');
    } finally { setIsPlaying(false); }
  };

  const payout = Math.round(bet * 1.9);

  return (
    <GameViewport
      backgroundClassName="bg-[#0a0508]"
      contentClassName="flex flex-col gap-4"
      backLabel="Игры"
    >
      <ConfettiBurst active={confetti} className="opacity-90 pointer-events-none" />

      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-rose-400/70">Upgrade</p>
        <h1 className="text-2xl font-extrabold text-white">Апгрейд</h1>
        <p className="text-sm text-white/40 mt-1">Повышайте ставку — шанс на ×1.9</p>
      </div>

      {/* Visual */}
      <div
        className="relative flex flex-col items-center justify-center py-8 rounded-2xl border border-white/8 overflow-hidden gap-4"
        style={{ background: 'linear-gradient(135deg,#100518,#1a0828)' }}
      >
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-48 w-48 rounded-full blur-3xl opacity-30"
            style={{ background: animating ? '#a855f7' : result?.win ? '#34d399' : '#a855f7' }} />
        </div>

        {/* Arrow animation */}
        <div className="relative flex items-center gap-4">
          {/* From */}
          <div className="flex flex-col items-center gap-1">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-3xl">⭐</div>
            <span className="text-sm font-bold text-white">{bet} ★</span>
          </div>

          {/* Arrow + icon */}
          <div className="flex flex-col items-center gap-1">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full text-2xl"
              style={{
                background: animating ? 'rgba(168,85,247,0.3)' : 'rgba(255,255,255,0.08)',
                animation: animating ? 'upgradeArrow 0.3s ease-in-out infinite alternate' : 'none',
              }}>
              {animating ? '⬆️' : result?.win ? '✅' : result ? '❌' : '⬆️'}
            </div>
            <span className="text-[10px] font-bold text-white/40">×1.9</span>
          </div>

          {/* To */}
          <div className="flex flex-col items-center gap-1">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border text-3xl"
              style={{
                border: result?.win ? '1px solid rgba(52,211,153,0.4)' : '1px solid rgba(255,255,255,0.1)',
                background: result?.win ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.05)',
              }}>
              {animating ? '❓' : result?.win ? '💎' : result ? '💨' : '💎'}
            </div>
            <span className="text-sm font-bold"
              style={{ color: result?.win ? '#34d399' : 'rgba(255,255,255,0.5)' }}>
              {payout} ★
            </span>
          </div>
        </div>

        {/* Chance bar */}
        <div className="w-full max-w-[200px]">
          <div className="flex justify-between text-[10px] text-white/40 mb-1">
            <span>Шанс апгрейда</span>
            <span className="text-rose-400 font-bold">{WIN_CHANCE}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${WIN_CHANCE}%`,
                background: animating
                  ? 'linear-gradient(90deg,#a855f7,#ec4899)'
                  : 'linear-gradient(90deg,#f43f5e,#fbbf24)',
                animation: animating ? 'barPulse 0.4s ease-in-out infinite alternate' : 'none',
              }} />
          </div>
        </div>

        {/* Result */}
        {!animating && result && (
          <div className="text-center" style={{ animation: 'fadeUp 0.3s ease-out' }}>
            <p className="text-3xl font-extrabold"
              style={{ color: result.win ? '#34d399' : '#f87171' }}>
              {result.win ? `+${result.payout} ★` : 'Не удалось'}
            </p>
            {result.nftGift && (
              <p className="text-sm text-emerald-400 mt-1">🎁 NFT: {result.nftGift.name}</p>
            )}
          </div>
        )}
        {animating && (
          <p className="text-sm font-bold text-purple-400 animate-pulse">Апгрейдим...</p>
        )}
      </div>

      {/* Bet control */}
      <div className="rounded-2xl border border-white/8 p-4 space-y-3"
        style={{ background: 'rgba(255,255,255,0.03)' }}>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Ставка ★</p>
        <input type="number" min={1} value={bet}
          onChange={e => setBet(parseInt(e.target.value) || 1)}
          disabled={isPlaying}
          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-xl font-bold text-center text-white focus:outline-none disabled:opacity-50" />
        <div className="flex gap-2">
          {BET_PRESETS.map(p => (
            <button key={p} type="button" disabled={isPlaying}
              onClick={() => setBet(p)}
              className="flex-1 rounded-xl py-2 text-[11px] font-bold transition active:scale-95 disabled:opacity-40"
              style={{
                background: bet === p ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${bet === p ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.08)'}`,
                color: bet === p ? '#c084fc' : 'rgba(255,255,255,0.5)',
              }}>
              {p}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-white/8 bg-white/4 px-4 py-3 flex justify-between">
          <span className="text-sm text-white/50">Потенциальный выигрыш:</span>
          <span className="text-sm font-bold text-yellow-400">+{payout - bet} ★</span>
        </div>

        <button type="button" onClick={() => void play()} disabled={isPlaying}
          className="w-full rounded-xl py-4 text-base font-extrabold uppercase tracking-wider transition active:scale-95 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: '#fff' }}>
          {isPlaying ? '⬆️ Апгрейдим...' : '⬆️ Апгрейд'}
        </button>

        {error && <p className="text-xs text-red-400 text-center font-bold">⚠️ {error}</p>}
      </div>

      <style>{`
        @keyframes upgradeArrow { from { transform: translateY(0); } to { transform: translateY(-4px); } }
        @keyframes barPulse { from { opacity: 0.7; } to { opacity: 1; } }
        @keyframes fadeUp { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform:translateY(0); } }
      `}</style>
    </GameViewport>
  );
}
