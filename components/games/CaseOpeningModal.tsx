'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CaseDefinition, CaseItemDefinition } from '@/lib/config/case-default';
import ConfettiBurst from '@/components/effects/ConfettiBurst';

function formatStars(value: number): string {
  return `${value.toLocaleString('ru-RU')} ★`;
}

function getItemIcon(item: CaseItemDefinition): string {
  const n = item.name.toLowerCase();
  if (n.includes('шлем') || n.includes('helm'))      return '⛑️';
  if (n.includes('плащ') || n.includes('cloak'))     return '🧥';
  if (n.includes('магнитар'))                        return '🌌';
  if (n.includes('компас'))                          return '🧭';
  if (n.includes('пыль') || n.includes('dust'))      return '✨';
  if (n.includes('звезд') || n.includes('star'))     return '⭐';
  if (n.includes('меч')   || n.includes('sword'))    return '⚔️';
  if (n.includes('щит')   || n.includes('shield'))   return '🛡️';
  if (n.includes('корон') || n.includes('crown'))    return '👑';
  if (n.includes('криста')|| n.includes('crystal'))  return '💎';
  if (n.includes('ракет') || n.includes('rocket'))   return '🚀';
  if (n.includes('артефа')|| n.includes('artifact')) return '🏺';
  if (n.includes('токен') || n.includes('token'))    return '🎫';
  if (n.includes('ключ')  || n.includes('key'))      return '🗝️';
  if (item.stars && item.stars > 0)                  return '💰';
  if (item.rarity === 'Легендарный')                 return '🔥';
  if (item.rarity === 'Эпический')                   return '💜';
  if (item.rarity === 'Редкий')                      return '💙';
  return '📦';
}

function buildStrip(
  items: CaseItemDefinition[],
  winner: CaseItemDefinition | null,
  total: number,
  winnerIdx: number,
): CaseItemDefinition[] {
  const pool = items.length > 0 ? items : (winner ? [winner] : []);
  if (pool.length === 0) return [];
  return Array.from({ length: total }, (_, i) =>
    i === winnerIdx && winner ? winner : pool[Math.floor(Math.random() * pool.length)]!,
  );
}

const ITEM_W    = 106;
const ITEM_GAP  = 8;
const ITEM_STEP = ITEM_W + ITEM_GAP;
const WINNER_IDX = 38;
const TOTAL      = 50;
// CSS transition duration — browser handles the GPU interpolation, no jank
const ANIM_MS    = 2800;

export default function CaseOpeningModal({
  open,
  loading,
  lootCase,
  reward,
  nftGift,
  onClose,
  onOpenAnother,
}: {
  open: boolean;
  loading: boolean;
  lootCase: CaseDefinition | null;
  reward: CaseItemDefinition | null;
  nftGift?: { id: string; name: string; rarity: string; imageUrl?: string | null } | null;
  onClose: () => void;
  onOpenAnother?: () => void;
  animationMode?: 'lottie' | 'gif';
}): React.JSX.Element | null {
  const [phase, setPhase]               = useState<'waiting' | 'spinning' | 'reveal'>('waiting');
  const [confetti, setConfetti]         = useState(false);
  const [strip, setStrip]               = useState<CaseItemDefinition[]>([]);
  const [highlightWinner, setHighlight] = useState(false);
  const [translateX, setTranslateX]     = useState(0);   // CSS-driven, no RAF loop
  const [showNftPopup, setShowNftPopup] = useState(false);

  const startedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const accent = useMemo(() => reward?.color ?? '#fbbf24', [reward?.color]);

  // ── Reset on close ──────────────────────────────────────────────
  useEffect(() => {
    if (open) return;
    setPhase('waiting');
    setConfetti(false);
    setHighlight(false);
    setStrip([]);
    setTranslateX(0);
    setShowNftPopup(false);
    startedRef.current = false;
  }, [open]);

  // ── Pre-fill strip with random items while waiting for API ───────
  useEffect(() => {
    if (!open || !lootCase) return;
    setStrip(buildStrip(lootCase.items, null, TOTAL, WINNER_IDX));
  }, [open, lootCase]);

  // ── Start animation once reward arrives ─────────────────────────
  useEffect(() => {
    if (!open || !reward || loading || !lootCase || startedRef.current) return;
    startedRef.current = true;

    const finalStrip = buildStrip(lootCase.items, reward, TOTAL, WINNER_IDX);
    setStrip(finalStrip);

    // One RAF to let DOM render the strip at translateX(0), then fire CSS transition
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const w = containerRef.current?.clientWidth ?? 360;
        const center = w / 2 - ITEM_W / 2;
        const nudge  = (Math.random() - 0.5) * 30;
        const target = -(WINNER_IDX * ITEM_STEP - center + nudge);
        setTranslateX(target);       // triggers CSS transition
        setPhase('spinning');

        setTimeout(() => {
          setPhase('reveal');
          setHighlight(true);
          setTimeout(() => setConfetti(true), 150);
          if (nftGift) setTimeout(() => setShowNftPopup(true), 600);
        }, ANIM_MS + 100);
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reward, loading]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center"
      style={{ background: 'rgba(2,4,18,0.97)' }}
    >
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 h-72 w-[500px] blur-[90px] opacity-20 rounded-full"
        style={{ background: accent }}
      />
      <ConfettiBurst active={confetti} className="opacity-90" />

      <div
        className="relative w-full max-w-lg mx-3 mb-3 sm:mb-0 overflow-hidden rounded-2xl border border-white/10"
        style={{
          background: 'linear-gradient(180deg,#0d1117 0%,#070a10 100%)',
          boxShadow: `0 0 60px ${accent}22, 0 30px 60px rgba(0,0,0,0.85)`,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: accent }}>
              Открытие кейса
            </p>
            <h2 className="mt-0.5 text-xl font-bold text-white">{lootCase?.name ?? 'Кейс'}</h2>
          </div>
          <button
            type="button" onClick={onClose}
            disabled={loading || phase === 'spinning'}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/50 transition hover:text-white disabled:opacity-30"
          >✕</button>
        </div>

        <div className="h-px" style={{ background: `linear-gradient(90deg,transparent,${accent}88,transparent)` }} />

        {/* ── Strip ── */}
        <div className="relative bg-black/50 py-4" ref={containerRef}>
          {/* Arrows */}
          <div className="pointer-events-none absolute top-0.5 left-1/2 -translate-x-1/2 z-20 h-0 w-0"
            style={{ borderLeft:'9px solid transparent', borderRight:'9px solid transparent', borderTop:`11px solid ${accent}` }} />
          <div className="pointer-events-none absolute bottom-0.5 left-1/2 -translate-x-1/2 z-20 h-0 w-0"
            style={{ borderLeft:'9px solid transparent', borderRight:'9px solid transparent', borderBottom:`11px solid ${accent}` }} />
          {/* Center line */}
          <div className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 z-20 w-0.5"
            style={{ background: accent, opacity: phase === 'spinning' ? 0.9 : 0.35 }} />
          {/* Fade sides */}
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20"
            style={{ background: 'linear-gradient(90deg,#070a10,transparent)' }} />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20"
            style={{ background: 'linear-gradient(270deg,#070a10,transparent)' }} />

          <div className="overflow-hidden h-[126px]">
            <div
              className="flex"
              style={{
                gap: ITEM_GAP,
                paddingLeft: 4,
                transform: `translateX(${translateX}px)`,
                // GPU-accelerated CSS transition — no jank, no RAF loop
                transition: phase === 'spinning'
                  ? `transform ${ANIM_MS}ms cubic-bezier(0.12, 0.8, 0.32, 1)`
                  : 'none',
                willChange: 'transform',
              }}
            >
              {strip.map((item, i) => {
                const isWinner = i === WINNER_IDX && highlightWinner;
                return (
                  <div
                    key={i}
                    className="flex-shrink-0 flex flex-col items-center justify-center rounded-xl border overflow-hidden"
                    style={{
                      width: ITEM_W,
                      height: 116,
                      borderColor: isWinner ? (item.color ?? accent) : ((item.color ?? '#fff') + '33'),
                      background: isWinner
                        ? `linear-gradient(135deg,${item.color ?? accent}55,${item.color ?? accent}22)`
                        : `linear-gradient(135deg,${item.color ?? '#fff'}12,${item.color ?? '#fff'}06)`,
                      boxShadow: isWinner ? `0 0 36px ${item.color ?? accent}aa` : 'none',
                      transform: isWinner ? 'scale(1.07)' : 'scale(1)',
                      transition: 'all 0.4s cubic-bezier(0.16,0.9,0.22,1)',
                    }}
                  >
                    {/* NFT badge */}
                    {item.nftGiftId && (
                      <span className="mb-0.5 rounded-full bg-emerald-400/20 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider text-emerald-300">
                        NFT
                      </span>
                    )}
                    <span className="text-[1.75rem] leading-none mb-0.5">{getItemIcon(item)}</span>
                    <span className="text-[8px] font-bold uppercase tracking-wider px-1 text-center leading-tight"
                      style={{ color: item.color ?? '#94a3b8' }}>
                      {item.rarity}
                    </span>
                    <span className="mt-0.5 text-[9px] text-white/70 font-medium px-1 text-center leading-tight">
                      {item.name.length > 13 ? item.name.slice(0, 11) + '…' : item.name}
                    </span>
                    {item.stars && item.stars > 0 ? (
                      <span className="mt-0.5 text-[9px] font-bold text-yellow-400">{item.stars}★</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="h-px" style={{ background: `linear-gradient(90deg,transparent,${accent}44,transparent)` }} />

        {/* ── Status / Result ── */}
        <div className="px-5 py-4">
          {(loading || phase === 'waiting') && (
            <div className="flex items-center justify-center gap-3 py-3">
              <div className="h-5 w-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: accent }} />
              <p className="text-sm font-medium text-white/55">Открываем кейс...</p>
            </div>
          )}

          {phase === 'spinning' && (
            <div className="flex items-center justify-center gap-3 py-3">
              <div className="flex gap-1.5">
                {[0,1,2].map(i => (
                  <div key={i} className="h-2 w-2 rounded-full animate-bounce"
                    style={{ background: accent, animationDelay: `${i*0.12}s` }} />
                ))}
              </div>
              <p className="text-sm font-medium text-white/55">Прокручиваем...</p>
            </div>
          )}

          {phase === 'reveal' && reward && (
            <div style={{ animation: 'caseReveal 0.45s ease-out forwards' }}>
              {/* NFT popup */}
              {nftGift && showNftPopup && (
                <div
                  className="mb-4 overflow-hidden rounded-xl border border-emerald-400/40 p-4"
                  style={{
                    background: 'linear-gradient(135deg,rgba(52,211,153,0.18),rgba(16,185,129,0.08))',
                    boxShadow: '0 0 40px rgba(52,211,153,0.2)',
                    animation: 'nftPop 0.5s cubic-bezier(0.16,0.9,0.22,1) forwards',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl border border-emerald-400/40 bg-emerald-400/10 text-3xl">
                      {nftGift.imageUrl
                        ? <img src={nftGift.imageUrl} alt={nftGift.name} className="h-full w-full rounded-xl object-cover" />
                        : '🎁'}
                    </div>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-emerald-400">🎉 NFT Подарок!</p>
                      <p className="mt-0.5 text-base font-bold text-white">{nftGift.name}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300">{nftGift.rarity}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Win card */}
              <div
                className="rounded-xl border p-4 mb-4"
                style={{
                  borderColor: (reward.color ?? '#fff') + '50',
                  background: `linear-gradient(135deg,${reward.color ?? '#fff'}18,${reward.color ?? '#fff'}08)`,
                  boxShadow: `0 0 40px ${reward.color ?? '#fff'}18`,
                }}
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl text-4xl"
                    style={{ background: (reward.color ?? '#fff') + '14', border: `1px solid ${reward.color ?? '#fff'}28` }}>
                    {getItemIcon(reward)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: reward.color ?? '#94a3b8' }}>
                      {reward.rarity}
                      {reward.nftGiftId && <span className="ml-2 text-emerald-400">• NFT</span>}
                    </p>
                    <p className="mt-0.5 text-base font-bold text-white truncate">{reward.name}</p>
                    {reward.stars && reward.stars > 0
                      ? <p className="mt-1 text-sm font-bold text-yellow-400">{formatStars(reward.stars)}</p>
                      : null}
                    {reward.description
                      ? <p className="mt-1 text-xs text-white/45 line-clamp-1">{reward.description}</p>
                      : null}
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={onClose}
                  className="flex-1 rounded-xl border border-white/15 bg-white/8 py-3.5 text-sm font-bold uppercase tracking-wider text-white transition hover:bg-white/12 active:scale-[0.98]">
                  Забрать
                </button>
                {onOpenAnother && (
                  <button type="button" onClick={onOpenAnother}
                    className="flex-1 rounded-xl py-3.5 text-sm font-bold uppercase tracking-wider text-black transition active:scale-[0.98]"
                    style={{ background: `linear-gradient(135deg,${accent},${accent}bb)` }}>
                    Открыть ещё
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>


    </div>
  );
}
