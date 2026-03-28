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

type BattleResult = {
  status: 'WAITING' | 'COMPLETED';
  matchId: string;
  winnerUserId?: string;
  payout?: number;
};

export default function BattlePage(): React.JSX.Element {
  const { initDataRaw } = useTelegram();
  const { refresh: refreshBalance } = useStarBalance();
  const [bet, setBet] = useState(50);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<BattleResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confetti, setConfetti] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const loadInventory = async () => {
      try {
        const response = await fetch('/api/mini-app/nfts', {
          headers: buildTelegramAuthHeaders(initDataRaw),
          signal: controller.signal
        });
        const payload = (await response.json().catch(() => null)) as { items?: InventoryItem[] };
        if (!response.ok) {
          return;
        }
        setInventory(payload.items ?? []);
      } catch {
        // ignore
      }
    };
    void loadInventory();
    return () => controller.abort();
  }, [initDataRaw]);

  const toggleGift = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((giftId) => giftId !== id) : [...prev, id]));
  };

  const joinBattle = async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch('/api/mini-app/games/battle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildTelegramAuthHeaders(initDataRaw)
        },
        body: JSON.stringify({ bet, nftGiftIds: selected })
      });
      const payload = (await response.json().catch(() => ({}))) as { result?: BattleResult; error?: string };
      if (!response.ok || !payload.result) {
        throw new Error(payload.error ?? 'Не удалось войти в батл.');
      }
      setResult(payload.result);
      // Обновляем баланс в хедере после завершения батла
      void refreshBalance();
      if (payload.result.payout && payload.result.payout > 0) {
        setConfetti(false);
        requestAnimationFrame(() => setConfetti(true));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти в батл.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <GameViewport
      backgroundClassName="bg-gradient-to-b from-[#0f0a13] via-[#06060b] to-black"
      contentClassName="flex flex-col gap-4"
      backLabel="Игры"
    >
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.24em] text-purple-300/70">Battle</p>
        <h1 className="text-2xl font-semibold text-white">Батл подарков</h1>
        <p className="text-sm text-white/60">Ставьте звёзды и NFT. Колесо выбирает победителя.</p>
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-purple-300/20 bg-gradient-to-br from-purple-500/10 via-black/40 to-black/80 p-4 shadow-[0_24px_48px_rgba(0,0,0,0.35)]">
        <div className="absolute -left-8 -top-8 h-24 w-24 rounded-full bg-purple-300/20 blur-2xl animate-pulse" />
        <div className="absolute -right-8 bottom-0 h-28 w-28 rounded-full bg-purple-300/10 blur-2xl animate-pulse" />
        <div className="relative mx-auto flex h-36 w-36 items-center justify-center rounded-full border border-purple-300/30 bg-black/30">
          <div className="absolute inset-2 rounded-full border border-purple-300/30 animate-spin" />
          <img
            src="/textures/games/swords.svg"
            alt=""
            className="h-10 w-10 opacity-90"
            aria-hidden
          />
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
        <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.16em] text-white/60">
          Ставка (★)
          <input
            className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white"
            type="number"
            min={1}
            value={bet}
            onChange={(event) => setBet(Number.parseInt(event.target.value, 10) || 1)}
            disabled={isLoading}
          />
        </label>

        <div className="mt-4 space-y-2">
          <p className="text-xs uppercase tracking-[0.16em] text-white/60">NFT для ставки</p>
          {inventory.length === 0 ? (
            <p className="text-xs text-white/50">Нет NFT в инвентаре.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {inventory.map((item) => {
                const isActive = selected.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleGift(item.id)}
                    className={`flex items-center gap-3 rounded-2xl border px-3 py-2 text-left transition ${
                      isActive
                        ? 'border-gold-400/70 bg-gold-400/15'
                        : 'border-white/10 bg-black/40'
                    }`}
                  >
                    <div className="h-10 w-10 overflow-hidden rounded-xl border border-white/10 bg-white/5">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-lg">🎁</div>
                      )}
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-white/50">{item.rarity}</p>
                      <p className="text-sm font-semibold text-white">{item.name}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button
          className="mt-4 w-full rounded-full bg-purple-400/90 px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-black transition active:scale-[0.98] disabled:opacity-60"
          type="button"
          onClick={joinBattle}
          disabled={isLoading}
        >
          {isLoading ? 'Ищем соперника...' : 'Войти в батл'}
        </button>

        {error ? (
          <p className="mt-3 text-xs uppercase tracking-[0.16em] text-red-300">{error}</p>
        ) : null}

        {result ? (
          <div className={`relative mt-4 overflow-hidden rounded-2xl border p-4 text-center transition-all ${result.payout ? 'border-yellow-400/40 bg-yellow-400/10 animate-win-glow-pulse' : 'border-white/10 bg-white/5'}`}>
            <ConfettiBurst active={confetti} className="opacity-90 pointer-events-none" />
            <p className="text-xs uppercase tracking-[0.18em] text-white/60">Статус</p>
            <p className={`mt-2 text-xl font-bold animate-win-scale ${result.payout ? 'text-yellow-300 animate-win-shine' : 'text-white/60'}`}>
              {result.status === 'WAITING'
                ? 'Ожидаем второго игрока...'
                : result.payout
                  ? `Победа! +${result.payout} ★`
                  : 'Результат зафиксирован'}
            </p>
          </div>
        ) : null}
      </div>
    </GameViewport>
  );
}
