'use client';

import React, { useEffect, useState } from 'react';
import ConfettiBurst from '@/components/effects/ConfettiBurst';
import GameViewport from '@/components/games/GameViewport';
import { useTelegram } from '@/context/TelegramContext';
import { useStarBalance } from '@/lib/hooks/useStarBalance';
import { buildTelegramAuthHeaders } from '@/lib/telegram';

type InventoryItem = {
  id: string;
  name: string;
  rarity: string;
  imageUrl?: string | null;
};

type CraftResult = {
  crafted: {
    id: string;
    name: string;
    rarity: string;
    imageUrl?: string | null;
  };
};

const RARITY_COLOR: Record<string, string> = {
  'Обычный':     '#94a3b8',
  'Необычный':   '#4ade80',
  'Редкий':      '#38bdf8',
  'Эпический':   '#c084fc',
  'Легендарный': '#fbbf24',
  'Мифический':  '#f97316',
};

function rarityColor(r: string): string {
  return RARITY_COLOR[r] ?? '#94a3b8';
}

function rarityIcon(r: string): string {
  if (r === 'Легендарный') return '🔥';
  if (r === 'Мифический')  return '🌟';
  if (r === 'Эпический')   return '💜';
  if (r === 'Редкий')      return '💙';
  if (r === 'Необычный')   return '💚';
  return '⚪';
}

const REQUIRED = 3;

export default function CraftPage(): React.JSX.Element {
  const { initDataRaw } = useTelegram();
  const { refresh: refreshBalance } = useStarBalance();
  const [inventory, setInventory]   = useState<InventoryItem[]>([]);
  const [selected, setSelected]     = useState<string[]>([]);
  const [result, setResult]         = useState<CraftResult | null>(null);
  const [isLoading, setIsLoading]   = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [confetti, setConfetti]     = useState(false);
  const [brewing, setBrewing]       = useState(false); // flask animation

  // Load inventory
  useEffect(() => {
    const controller = new AbortController();
    setIsFetching(true);
    fetch('/api/mini-app/nfts', {
      headers: buildTelegramAuthHeaders(initDataRaw),
      signal: controller.signal,
    })
      .then(r => r.json())
      .then((payload: { items?: InventoryItem[] }) => {
        setInventory(payload.items ?? []);
      })
      .catch(() => {})
      .finally(() => setIsFetching(false));
    return () => controller.abort();
  }, [initDataRaw]);

  const toggleItem = (id: string) => {
    if (result) return; // after craft, no changes
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= REQUIRED) return prev; // max 3
      return [...prev, id];
    });
    setError(null);
  };

  const removeSlot = (idx: number) => {
    setSelected(prev => prev.filter((_, i) => i !== idx));
  };

  const craft = async () => {
    if (selected.length < REQUIRED || isLoading) return;
    setIsLoading(true);
    setError(null);
    setResult(null);
    setBrewing(true);

    try {
      const res = await fetch('/api/mini-app/games/craft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildTelegramAuthHeaders(initDataRaw),
        },
        body: JSON.stringify({ giftIds: selected }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        result?: CraftResult;
        error?: string;
      };
      if (!res.ok || !payload.result) {
        throw new Error(payload.error ?? 'Не удалось выполнить крафт.');
      }
      // Small delay so brewing animation plays
      await new Promise(r => setTimeout(r, 1200));
      setResult(payload.result);
      setBrewing(false);
      // Обновляем баланс в хедере после крафта (крафт может стоить NFT/звёзды)
      void refreshBalance();
      requestAnimationFrame(() => setConfetti(true));
      // Remove used items from inventory display
      setInventory(prev => prev.filter(item => !selected.includes(item.id)));
      setSelected([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось выполнить крафт.');
      setBrewing(false);
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setConfetti(false);
    setSelected([]);
    setError(null);
  };

  const selectedItems = selected.map(id => inventory.find(item => item.id === id)).filter(Boolean) as InventoryItem[];

  return (
    <GameViewport
      backgroundClassName="bg-gradient-to-b from-[#071017] via-[#04080b] to-black"
      contentClassName="flex flex-col gap-4"
      backLabel="Игры"
    >
      <ConfettiBurst active={confetti} className="opacity-90 pointer-events-none" />

      {/* Title */}
      <div className="space-y-1">
        <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-cyan-400">Craft</p>
        <h1 className="text-2xl font-bold text-white">Крафт NFT</h1>
        <p className="text-sm text-white/50">
          Выберите {REQUIRED} NFT — получите предмет более редкого класса
        </p>
      </div>

      {/* === Craft Cauldron === */}
      <div className="relative overflow-hidden rounded-2xl border border-cyan-400/20"
        style={{ background: 'linear-gradient(135deg,#071820,#030b10)' }}>

        {/* Glow blobs */}
        <div className="pointer-events-none absolute -left-6 -top-6 h-24 w-24 rounded-full blur-2xl opacity-40"
          style={{ background: '#22d3ee' }} />
        <div className="pointer-events-none absolute -right-6 -bottom-6 h-24 w-24 rounded-full blur-2xl opacity-20"
          style={{ background: '#a855f7' }} />

        <div className="relative flex flex-col items-center px-4 py-5">
          {/* Flask icon */}
          <div className="relative mb-4 flex h-20 w-20 items-center justify-center rounded-full border-2 border-cyan-400/30"
            style={{ background: 'rgba(34,211,238,0.07)' }}>
            <div className="absolute inset-3 rounded-full border border-cyan-400/20"
              style={{ animation: brewing ? 'cauldronPulse 0.6s ease-in-out infinite' : 'none' }} />
            <span className="text-4xl leading-none"
              style={{ animation: brewing ? 'cauldronSpin 1.5s linear infinite' : 'none' }}>
              ⚗️
            </span>
          </div>

          {/* 3 slots */}
          <div className="flex w-full items-center justify-center gap-3 mb-2">
            {Array.from({ length: REQUIRED }).map((_, i) => {
              const item = selectedItems[i];
              return (
                <div key={i} className="flex-1 max-w-[100px]">
                  {item ? (
                    <button
                      type="button"
                      onClick={() => removeSlot(i)}
                      className="relative w-full rounded-xl border-2 overflow-hidden transition-all active:scale-95"
                      style={{
                        borderColor: rarityColor(item.rarity),
                        background: `${rarityColor(item.rarity)}18`,
                        boxShadow: `0 0 16px ${rarityColor(item.rarity)}44`,
                      }}
                    >
                      <div className="flex flex-col items-center p-2">
                        <div className="h-10 w-10 rounded-lg overflow-hidden border border-white/10 mb-1">
                          {item.imageUrl
                            ? <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                            : <div className="flex h-full w-full items-center justify-center text-xl">{rarityIcon(item.rarity)}</div>
                          }
                        </div>
                        <span className="text-[8px] font-bold uppercase tracking-wider leading-tight text-center"
                          style={{ color: rarityColor(item.rarity) }}>
                          {item.rarity}
                        </span>
                        <span className="text-[9px] text-white/70 font-medium text-center leading-tight mt-0.5">
                          {item.name.length > 10 ? item.name.slice(0, 9) + '…' : item.name}
                        </span>
                      </div>
                      {/* Remove X */}
                      <div className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white/60 text-[10px]">
                        ✕
                      </div>
                    </button>
                  ) : (
                    <div className="flex aspect-square w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/15"
                      style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <span className="text-2xl opacity-20">+</span>
                      <span className="text-[8px] text-white/20 mt-0.5">Слот {i + 1}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Progress bar */}
          <div className="w-full flex items-center gap-2 mb-1">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-white/10">
              <div className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${(selected.length / REQUIRED) * 100}%`,
                  background: 'linear-gradient(90deg, #22d3ee, #a855f7)',
                }} />
            </div>
            <span className="text-[10px] font-bold text-white/50 whitespace-nowrap">
              {selected.length}/{REQUIRED}
            </span>
          </div>

          {/* Craft button */}
          <button
            type="button"
            onClick={craft}
            disabled={isLoading || selected.length < REQUIRED}
            className="mt-3 w-full rounded-xl py-3.5 text-sm font-bold uppercase tracking-[0.2em] transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: selected.length >= REQUIRED
                ? 'linear-gradient(135deg, #22d3ee, #a855f7)'
                : 'rgba(255,255,255,0.08)',
              color: selected.length >= REQUIRED ? '#000' : 'rgba(255,255,255,0.4)',
              boxShadow: selected.length >= REQUIRED ? '0 0 30px rgba(34,211,238,0.3)' : 'none',
            }}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-t-transparent border-black/40 animate-spin" />
                Крафтим...
              </span>
            ) : selected.length < REQUIRED
              ? `Выберите ещё ${REQUIRED - selected.length}`
              : '⚗️ Скрафтить'}
          </button>

          {error && (
            <p className="mt-2 w-full text-center text-xs text-red-400">{error}</p>
          )}
        </div>
      </div>

      {/* === Result card === */}
      {result && (
        <div
          className="overflow-hidden rounded-2xl border p-5 text-center"
          style={{
            borderColor: rarityColor(result.crafted.rarity),
            background: `linear-gradient(135deg,${rarityColor(result.crafted.rarity)}22,${rarityColor(result.crafted.rarity)}0a)`,
            boxShadow: `0 0 50px ${rarityColor(result.crafted.rarity)}33`,
            animation: 'craftReveal 0.5s ease-out forwards',
          }}
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/50 mb-3">
            🎉 Новый предмет
          </p>
          {result.crafted.imageUrl && (
            <img
              src={result.crafted.imageUrl}
              alt={result.crafted.name}
              className="mx-auto mb-3 h-20 w-20 rounded-2xl object-cover border"
              style={{ borderColor: rarityColor(result.crafted.rarity) + '66' }}
            />
          )}
          <p className="text-2xl font-bold text-white mb-1">{result.crafted.name}</p>
          <p className="text-sm font-bold uppercase tracking-wider mb-4"
            style={{ color: rarityColor(result.crafted.rarity) }}>
            {rarityIcon(result.crafted.rarity)} {result.crafted.rarity}
          </p>
          <button
            type="button"
            onClick={reset}
            className="rounded-xl border border-white/15 bg-white/8 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-white/12 active:scale-[0.98]"
          >
            Крафтить ещё
          </button>
        </div>
      )}

      {/* === Inventory list === */}
      <div className="rounded-2xl border border-white/10 overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.03)' }}>
        <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">
            Инвентарь NFT
          </p>
          {inventory.length > 0 && (
            <span className="text-[10px] text-white/30">{inventory.length} предм.</span>
          )}
        </div>

        {isFetching ? (
          <div className="flex items-center justify-center gap-2 py-8">
            <div className="h-4 w-4 rounded-full border-2 border-t-transparent border-cyan-400 animate-spin" />
            <span className="text-sm text-white/40">Загружаем...</span>
          </div>
        ) : inventory.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-3xl mb-2">🎁</p>
            <p className="text-sm text-white/40">Нет доступных NFT</p>
            <p className="text-xs text-white/25 mt-1">Откройте кейсы, чтобы получить предметы</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-0">
            {inventory.map((item, idx) => {
              const isSelected = selected.includes(item.id);
              const isDisabled = !isSelected && selected.length >= REQUIRED;
              const color = rarityColor(item.rarity);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleItem(item.id)}
                  disabled={isDisabled}
                  className="relative flex items-center gap-3 px-4 py-3 text-left transition active:scale-[0.98] disabled:opacity-35"
                  style={{
                    background: isSelected ? `${color}18` : 'transparent',
                    borderBottom: idx < inventory.length - 2 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                    borderRight: idx % 2 === 0 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                  }}
                >
                  {/* Selected check */}
                  {isSelected && (
                    <div className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full text-black text-[10px] font-bold"
                      style={{ background: color }}>
                      {selected.indexOf(item.id) + 1}
                    </div>
                  )}

                  <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-xl border"
                    style={{ borderColor: isSelected ? color + '88' : 'rgba(255,255,255,0.1)' }}>
                    {item.imageUrl
                      ? <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                      : <div className="flex h-full w-full items-center justify-center text-xl bg-white/5">{rarityIcon(item.rarity)}</div>
                    }
                  </div>

                  <div className="min-w-0">
                    <p className="text-[9px] font-bold uppercase tracking-wider leading-tight"
                      style={{ color }}>
                      {item.rarity}
                    </p>
                    <p className="text-sm font-semibold text-white leading-tight truncate">
                      {item.name}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes cauldronPulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50%       { opacity: 1;   transform: scale(1.08); }
        }
        @keyframes cauldronSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes craftReveal {
          from { opacity: 0; transform: translateY(16px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
      `}</style>
    </GameViewport>
  );
}
