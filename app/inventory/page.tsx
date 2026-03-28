'use client';

import React, { useEffect, useState } from 'react';
import { useTelegram } from '@/context/TelegramContext';
import { buildTelegramAuthHeaders } from '@/lib/telegram';

type InventoryItem = {
  id: string; giftId: string; name: string; rarity: string;
  imageUrl?: string | null; priceStars?: number | null;
  status: string; receivedAt: string;
  telegramGiftId?: string | null;
};

const RARITY_CFG: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  legendary: { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', label: 'Легендарный', icon: '🔥' },
  epic:      { color: '#c084fc', bg: 'rgba(192,132,252,0.12)', label: 'Эпический',  icon: '💜' },
  rare:      { color: '#38bdf8', bg: 'rgba(56,189,248,0.12)',  label: 'Редкий',     icon: '💙' },
  uncommon:  { color: '#4ade80', bg: 'rgba(74,222,128,0.12)', label: 'Необычный',  icon: '💚' },
  common:    { color: '#94a3b8', bg: 'rgba(148,163,184,0.08)',label: 'Обычный',    icon: '⚪' },
};
const rc = (r: string) => RARITY_CFG[r.toLowerCase()] ?? RARITY_CFG.common;

type ActionState = { id: string; type: 'sell' | 'withdraw' } | null;

export default function InventoryPage(): React.JSX.Element {
  const { initDataRaw } = useTelegram();
  const [items,      setItems]      = useState<InventoryItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [action,     setAction]     = useState<ActionState>(null);
  const [toast,      setToast]      = useState<{ msg: string; ok: boolean } | null>(null);
  const [selected,   setSelected]   = useState<InventoryItem | null>(null);
  const [confirmType, setConfirmType] = useState<'sell' | 'withdraw' | null>(null);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    fetch('/api/mini-app/nfts', {
      headers: buildTelegramAuthHeaders(initDataRaw),
      signal: ctrl.signal
    })
      .then(r => r.json())
      .then((d: { items?: InventoryItem[]; error?: string }) => {
        if (d.error) throw new Error(d.error);
        setItems(d.items ?? []);
      })
      .catch(e => { if (e.name !== 'AbortError') setError(e.message); })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [initDataRaw]);

  const handleSell = async (item: InventoryItem) => {
    setAction({ id: item.id, type: 'sell' });
    setConfirmType(null); setSelected(null);
    try {
      const res = await fetch('/api/mini-app/nfts/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildTelegramAuthHeaders(initDataRaw) },
        body: JSON.stringify({ userGiftId: item.id })
      });
      const d = await res.json() as { success?: boolean; error?: string; gift?: { priceStars?: number; name?: string } };
      if (!res.ok || !d.success) throw new Error(d.error ?? 'Не удалось продать');
      setItems(prev => prev.filter(i => i.id !== item.id));
      showToast(`✅ Продано: ${d.gift?.name ?? item.name} (+${d.gift?.priceStars ?? 0} ★)`, true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Ошибка продажи', false);
    } finally { setAction(null); }
  };

  const handleWithdraw = async (item: InventoryItem) => {
    setAction({ id: item.id, type: 'withdraw' });
    setConfirmType(null); setSelected(null);
    try {
      const res = await fetch('/api/mini-app/nfts/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildTelegramAuthHeaders(initDataRaw) },
        body: JSON.stringify({ userGiftId: item.id })
      });
      const d = await res.json() as { success?: boolean; error?: string; message?: string };
      if (!res.ok || !d.success) throw new Error(d.error ?? 'Не удалось создать заявку');
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'PENDING_SEND' } : i));
      showToast(`🎁 Заявка создана! ${d.message ?? ''}`, true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Ошибка вывода', false);
    } finally { setAction(null); }
  };

  const openConfirm = (item: InventoryItem, type: 'sell' | 'withdraw') => {
    setSelected(item);
    setConfirmType(type);
  };

  return (
    <section className="space-y-4 pb-4">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 max-w-[90vw] rounded-2xl px-4 py-3 text-sm font-bold shadow-xl"
          style={{
            background: toast.ok ? 'rgba(52,211,153,0.95)' : 'rgba(239,68,68,0.95)',
            color: '#000', animation: 'fadeSlideDown 0.3s ease-out',
          }}>
          {toast.msg}
        </div>
      )}

      {/* Confirm modal */}
      {selected && confirmType && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.85)' }}>
          <div className="w-full max-w-sm rounded-2xl border border-white/10 p-6 space-y-4"
            style={{ background: '#0d0d12' }}>
            <p className="text-lg font-extrabold text-white text-center">
              {confirmType === 'sell' ? '💰 Продать NFT?' : '📤 Вывести NFT?'}
            </p>
            <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/4 p-3">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-2xl"
                style={{ background: rc(selected.rarity).bg }}>
                {selected.imageUrl
                  ? <img src={selected.imageUrl} alt="" className="h-full w-full rounded-xl object-cover" />
                  : rc(selected.rarity).icon}
              </div>
              <div>
                <p className="text-sm font-bold text-white">{selected.name}</p>
                <p className="text-xs font-bold" style={{ color: rc(selected.rarity).color }}>
                  {rc(selected.rarity).icon} {rc(selected.rarity).label}
                </p>
              </div>
            </div>

            {confirmType === 'sell' ? (
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/8 p-3 text-xs text-white/60">
                NFT будет продан за <span className="font-bold text-emerald-400">{selected.priceStars ?? 0} ★</span>.
                Звёзды сразу зачислятся на баланс.
              </div>
            ) : (
              <div className="rounded-xl border border-blue-400/20 bg-blue-400/8 p-3 text-xs text-white/60 space-y-1">
                <p>NFT будет отправлен на ваш аккаунт Telegram через <span className="font-bold text-blue-300">transferGift</span>.</p>
                <p>Обычно занимает несколько секунд. Если не сработает — администратор обработает вручную до 24ч.</p>
                {!selected.telegramGiftId && (
                  <p className="text-yellow-400 font-bold">⚠️ У этого NFT нет Telegram ID — возможна только ручная обработка</p>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button type="button"
                onClick={() => { setSelected(null); setConfirmType(null); }}
                className="flex-1 rounded-xl border border-white/15 bg-white/6 py-3 text-sm font-bold text-white/60 transition active:scale-95">
                Отмена
              </button>
              <button type="button"
                onClick={() => confirmType === 'sell' ? void handleSell(selected) : void handleWithdraw(selected)}
                className="flex-1 rounded-xl py-3 text-sm font-bold text-black transition active:scale-95"
                style={{
                  background: confirmType === 'sell'
                    ? 'linear-gradient(135deg,#34d399,#059669)'
                    : 'linear-gradient(135deg,#38bdf8,#0284c7)',
                }}>
                {confirmType === 'sell' ? '💰 Продать' : '📤 Вывести'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-yellow-400/70">Инвентарь</p>
        <h1 className="text-2xl font-extrabold text-white">Мои NFT</h1>
        <p className="text-sm text-white/40 mt-1">Продайте за звёзды или выведите на Telegram</p>
      </div>

      {loading && (
        <div className="grid grid-cols-1 gap-3">
          {[1,2,3].map(i => (
            <div key={i} className="h-24 rounded-2xl border border-white/8 animate-pulse"
              style={{ background: 'rgba(255,255,255,0.03)' }} />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-red-400/30 bg-red-400/8 p-4 text-sm text-red-300">{error}</div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-2xl border border-white/8 py-12 text-center"
          style={{ background: 'rgba(255,255,255,0.02)' }}>
          <p className="text-4xl mb-3">🎁</p>
          <p className="text-sm font-bold text-white/50">Инвентарь пуст</p>
          <p className="text-xs text-white/25 mt-1">Откройте кейсы или отправьте боту NFT-подарок</p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="space-y-3">
          {items.map(item => {
            const cfg = rc(item.rarity);
            const isPending = item.status === 'PENDING_SEND';
            const isSent = item.status === 'SENT';
            const isActing = action?.id === item.id;

            return (
              <div key={item.id}
                className="overflow-hidden rounded-2xl border"
                style={{
                  background: `linear-gradient(135deg,${cfg.bg},rgba(0,0,0,0.5))`,
                  borderColor: cfg.color + '30',
                  opacity: isSent ? 0.5 : 1,
                }}>
                <div className="flex items-center gap-4 p-4">
                  {/* Image */}
                  <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border text-3xl"
                    style={{ borderColor: cfg.color + '44', background: cfg.bg }}>
                    {item.imageUrl
                      ? <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                      : cfg.icon}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                        style={{ background: cfg.color + 'dd', color: '#000' }}>
                        {cfg.icon} {cfg.label}
                      </span>
                      {isPending && (
                        <span className="text-[9px] font-bold text-blue-400 uppercase tracking-wider">⏳ Выводится</span>
                      )}
                      {isSent && (
                        <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">✅ Отправлен</span>
                      )}
                    </div>
                    <p className="text-sm font-extrabold text-white truncate">{item.name}</p>
                    <p className="text-[10px] text-white/35 mt-0.5">
                      {new Date(item.receivedAt).toLocaleDateString('ru-RU')}
                      {item.priceStars ? ` · ${item.priceStars} ★` : ''}
                    </p>
                  </div>
                </div>

                {/* Action buttons */}
                {!isSent && !isPending && (
                  <div className="flex gap-2 px-4 pb-4">
                    {/* Sell */}
                    <button type="button"
                      disabled={!item.priceStars || isActing}
                      onClick={() => openConfirm(item, 'sell')}
                      className="flex-1 rounded-xl py-2.5 text-xs font-extrabold uppercase tracking-wider transition active:scale-95 disabled:opacity-35"
                      style={{
                        background: item.priceStars ? 'linear-gradient(135deg,#34d399,#059669)' : 'rgba(255,255,255,0.06)',
                        color: item.priceStars ? '#000' : 'rgba(255,255,255,0.3)',
                      }}>
                      {isActing && action?.type === 'sell'
                        ? '⏳...'
                        : item.priceStars ? `💰 Продать ${item.priceStars}★` : 'Нет цены'}
                    </button>

                    {/* Withdraw to Telegram */}
                    <button type="button"
                      disabled={isActing}
                      onClick={() => openConfirm(item, 'withdraw')}
                      className="flex-1 rounded-xl py-2.5 text-xs font-extrabold uppercase tracking-wider transition active:scale-95 disabled:opacity-35"
                      style={{ background: 'linear-gradient(135deg,#38bdf8,#0284c7)', color: '#000' }}>
                      {isActing && action?.type === 'withdraw' ? '⏳...' : '📤 В Telegram'}
                    </button>
                  </div>
                )}

                {isPending && (
                  <div className="px-4 pb-4">
                    <div className="rounded-xl border border-blue-400/20 bg-blue-400/8 px-3 py-2 text-xs text-blue-300 text-center">
                      ⏳ Заявка обрабатывается — NFT будет отправлен скоро
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes fadeSlideDown {
          from { opacity:0; transform: translateX(-50%) translateY(-10px); }
          to   { opacity:1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </section>
  );
}
