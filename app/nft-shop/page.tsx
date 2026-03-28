'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTelegram } from '@/context/TelegramContext';
import { useStarBalance } from '@/lib/hooks/useStarBalance';

type ShopItem = {
  id: string; name: string; rarity: string;
  description: string | null; imageUrl: string | null;
  priceStars: number; priceBonus: number;
  inStock: boolean; stockCount: number;
};
type RarityFilter = { rarity: string; count: number };

const RARITY_CFG: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  legendary: { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', label: 'Легендарный', icon: '🔥' },
  epic:      { color: '#c084fc', bg: 'rgba(192,132,252,0.12)', label: 'Эпический',  icon: '💜' },
  rare:      { color: '#38bdf8', bg: 'rgba(56,189,248,0.12)',  label: 'Редкий',     icon: '💙' },
  uncommon:  { color: '#4ade80', bg: 'rgba(74,222,128,0.12)', label: 'Необычный',  icon: '💚' },
  common:    { color: '#94a3b8', bg: 'rgba(148,163,184,0.08)',label: 'Обычный',    icon: '⚪' },
};
const rc = (r: string) => RARITY_CFG[r.toLowerCase()] ?? RARITY_CFG.common;

type Tab = 'shop' | 'deposit';

export default function NftShopPage(): React.JSX.Element {
  const { initDataRaw } = useTelegram();
  const { state: balanceState } = useStarBalance();

  const [tab,            setTab]           = useState<Tab>('shop');
  const [items,          setItems]          = useState<ShopItem[]>([]);
  const [rarities,       setRarities]       = useState<RarityFilter[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [selectedRarity, setSelectedRarity] = useState('all');
  const [sortBy,         setSortBy]         = useState('price_asc');
  const [buying,         setBuying]         = useState<string | null>(null);
  const [toast,          setToast]          = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchShop = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ rarity: selectedRarity, sort: sortBy });
      const headers: Record<string, string> = {};
      if (initDataRaw) headers['x-telegram-init-data'] = initDataRaw;
      const res  = await fetch(`/api/mini-app/nft-shop?${params}`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Ошибка');
      setItems(data.items ?? []);
      setRarities(data.rarities ?? []);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Ошибка загрузки', false);
    } finally { setLoading(false); }
  }, [initDataRaw, selectedRarity, sortBy]);

  useEffect(() => { void fetchShop(); }, [fetchShop]);

  const handleBuy = async (item: ShopItem) => {
    if (!initDataRaw || buying) return;
    setBuying(item.id);
    try {
      const res = await fetch('/api/mini-app/nft-shop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': initDataRaw },
        body: JSON.stringify({ giftId: item.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Ошибка покупки');
      showToast(`✅ «${item.name}» добавлен в инвентарь!`, true);
      void fetchShop();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Ошибка покупки', false);
    } finally { setBuying(null); }
  };

  const balance = balanceState.status === 'ready' ? balanceState.available : 0;

  return (
    <section className="space-y-4 pb-4">
      {/* Toast */}
      {toast && (
        <div
          className="fixed top-4 left-1/2 z-50 -translate-x-1/2 max-w-[90vw] rounded-2xl px-4 py-3 text-sm font-bold shadow-xl"
          style={{
            background: toast.ok ? 'rgba(52,211,153,0.95)' : 'rgba(239,68,68,0.95)',
            color: '#000',
            animation: 'fadeSlideDown 0.3s ease-out',
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-yellow-400/70">Магазин</p>
        <h1 className="text-2xl font-extrabold text-white">NFT-магазин</h1>
      </div>

      {/* Balance bar */}
      <div
        className="flex items-center justify-between rounded-2xl border border-yellow-500/20 px-4 py-3"
        style={{ background: 'linear-gradient(135deg,#100c00,#1f1600)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xl">⭐</span>
          <div>
            <p className="text-[10px] text-white/40 uppercase tracking-wider">Баланс</p>
            <p className="text-lg font-extrabold text-yellow-400">{balance.toLocaleString('ru')} ★</p>
          </div>
        </div>
        <p className="text-right text-[10px] text-white/35 max-w-[160px]">
          Покупайте NFT и получайте редкие подарки
        </p>
      </div>

      {/* Tabs */}
      <div
        className="flex rounded-2xl border border-white/8 overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.03)' }}
      >
        {([
          ['shop',    '🛍 Магазин'],
          ['deposit', '🎁 Пополнение через NFT'],
        ] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="flex-1 py-3 text-sm font-bold transition-all"
            style={{
              background: tab === t ? 'rgba(251,191,36,0.15)' : 'transparent',
              color: tab === t ? '#fbbf24' : 'rgba(255,255,255,0.4)',
              borderBottom: tab === t ? '2px solid #fbbf24' : '2px solid transparent',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ─── SHOP TAB ─── */}
      {tab === 'shop' && (
        <>
          <div className="flex flex-wrap gap-2">
            {[{ rarity: 'all', count: items.length }, ...rarities].map(r => {
              const cfg = r.rarity === 'all' ? null : rc(r.rarity);
              const isActive = selectedRarity === r.rarity;
              return (
                <button
                  key={r.rarity}
                  type="button"
                  onClick={() => setSelectedRarity(r.rarity)}
                  className="rounded-xl px-3 py-1.5 text-[11px] font-bold transition-all border"
                  style={{
                    background: isActive ? (cfg?.bg ?? 'rgba(251,191,36,0.15)') : 'rgba(255,255,255,0.04)',
                    borderColor: isActive ? ((cfg?.color ?? '#fbbf24') + '88') : 'rgba(255,255,255,0.08)',
                    color: isActive ? (cfg?.color ?? '#fbbf24') : 'rgba(255,255,255,0.45)',
                  }}
                >
                  {cfg?.icon} {cfg?.label ?? 'Все'} ({r.count})
                </button>
              );
            })}
          </div>

          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/70 focus:outline-none"
          >
            <option value="price_asc">Дешевле сначала</option>
            <option value="price_desc">Дороже сначала</option>
            <option value="name">По названию</option>
            <option value="newest">Новинки</option>
          </select>

          {loading ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-2xl border border-white/8 p-3 space-y-3"
                  style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <div className="aspect-square rounded-xl bg-white/8" />
                  <div className="h-3 w-3/4 rounded bg-white/8" />
                  <div className="h-7 rounded-xl bg-white/6" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-white/8 py-12 text-center"
              style={{ background: 'rgba(255,255,255,0.02)' }}>
              <p className="text-4xl mb-3">🛍</p>
              <p className="text-sm font-bold text-white/50">Магазин пуст</p>
              <p className="text-xs text-white/25 mt-1">Загляните позже</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {items.map(item => {
                const cfg = rc(item.rarity);
                const canAfford = balance >= item.priceStars;
                const isBuying = buying === item.id;
                return (
                  <div
                    key={item.id}
                    className="flex flex-col rounded-2xl border overflow-hidden"
                    style={{
                      background: `linear-gradient(180deg,${cfg.bg},rgba(0,0,0,0.6))`,
                      borderColor: cfg.color + '33',
                    }}
                  >
                    <div
                      className="relative aspect-square w-full overflow-hidden"
                      style={{ background: `linear-gradient(135deg,${cfg.color}18,rgba(0,0,0,0.5))` }}
                    >
                      {item.imageUrl
                        ? <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                        : <div className="flex h-full w-full items-center justify-center text-5xl">{cfg.icon}</div>
                      }
                      <div
                        className="absolute top-2 left-2 rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider"
                        style={{ background: cfg.color + 'dd', color: '#000' }}
                      >
                        {cfg.icon} {cfg.label}
                      </div>
                      {!item.inStock && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                          <span className="text-xs font-bold text-white/60">Нет в наличии</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 p-3">
                      <p className="text-sm font-extrabold text-white leading-tight line-clamp-2">{item.name}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-base font-extrabold" style={{ color: cfg.color }}>{item.priceStars} ★</span>
                        {item.stockCount > 0 && item.stockCount < 10 && (
                          <span className="text-[9px] text-red-400 font-bold">Осталось {item.stockCount}</span>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={!item.inStock || !canAfford || !!buying}
                        onClick={() => void handleBuy(item)}
                        className="w-full rounded-xl py-2.5 text-xs font-extrabold uppercase tracking-wider transition active:scale-95 disabled:opacity-40"
                        style={{
                          background: item.inStock && canAfford
                            ? `linear-gradient(135deg,${cfg.color},${cfg.color}bb)`
                            : 'rgba(255,255,255,0.06)',
                          color: item.inStock && canAfford ? '#000' : 'rgba(255,255,255,0.3)',
                        }}
                      >
                        {isBuying ? '⏳...' : !item.inStock ? 'Нет' : !canAfford ? 'Мало ★' : 'Купить'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ─── DEPOSIT VIA NFT TAB ─── */}
      {tab === 'deposit' && (
        <div className="space-y-4">

          {/* How it works — accurate description */}
          <div
            className="rounded-2xl border border-yellow-500/20 p-5 space-y-4"
            style={{ background: 'linear-gradient(135deg,#100c00,#1f1600)' }}
          >
            <div className="flex items-center gap-3">
              <span className="text-3xl">🎁</span>
              <div>
                <p className="text-base font-extrabold text-white">Пополнение звёздами через NFT-подарок</p>
                <p className="text-xs text-white/45 mt-0.5">Отправьте Telegram-подарок прямо боту — звёзды зачислятся автоматически</p>
              </div>
            </div>

            <div className="space-y-3">
              {[
                {
                  step: '1',
                  icon: '💬',
                  title: 'Откройте чат с ботом',
                  desc: 'Перейдите в этот же чат с ботом в Telegram',
                },
                {
                  step: '2',
                  icon: '🎁',
                  title: 'Нажмите иконку подарка',
                  desc: 'Рядом с полем ввода сообщения — иконка 🎁. Выберите любой NFT-подарок.',
                },
                {
                  step: '3',
                  icon: '📤',
                  title: 'Отправьте подарок боту',
                  desc: 'Именно боту, не себе и не другу. Бот получит его и обработает.',
                },
                {
                  step: '4',
                  icon: '⭐',
                  title: 'Звёзды зачислятся автоматически',
                  desc: 'Бот найдёт подарок в каталоге и зачислит количество звёзд, установленное администратором.',
                },
              ].map(s => (
                <div key={s.step} className="flex items-start gap-3">
                  <div
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-extrabold"
                    style={{
                      background: 'rgba(251,191,36,0.2)',
                      color: '#fbbf24',
                      border: '1px solid rgba(251,191,36,0.3)',
                    }}
                  >
                    {s.step}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{s.icon} {s.title}</p>
                    <p className="text-xs text-white/45 mt-0.5">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* How stars are determined */}
          <div
            className="rounded-2xl border border-white/8 p-4 space-y-3"
            style={{ background: 'rgba(255,255,255,0.03)' }}
          >
            <p className="text-sm font-extrabold text-white">💰 Как определяется сумма?</p>
            <p className="text-xs text-white/50 leading-relaxed">
              Каждый NFT-подарок Telegram имеет уникальный идентификатор. Когда бот получает подарок,
              он ищет его в каталоге по этому ID. Сумма зачисления — это поле{' '}
              <span className="text-yellow-400 font-bold">«Цена в звёздах»</span>{' '}
              для данного подарка, которое устанавливает администратор.
            </p>
            <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/8 px-3 py-2.5">
              <p className="text-xs font-bold text-yellow-400">⚠️ Если подарок не в каталоге</p>
              <p className="text-xs text-white/45 mt-0.5">
                Подарок добавится в ваш инвентарь, но звёзды не зачислятся.
                Обратитесь в поддержку — администратор добавит подарок в каталог вручную.
              </p>
            </div>
          </div>

          {/* FAQ */}
          <div
            className="rounded-2xl border border-white/8 p-4 space-y-3"
            style={{ background: 'rgba(255,255,255,0.03)' }}
          >
            <p className="text-sm font-extrabold text-white">❓ Часто задаваемые вопросы</p>
            {[
              {
                q: 'Подарок отправляется на отдельный кошелёк?',
                a: 'Нет. Подарок отправляется прямо боту в чат — это стандартный механизм Telegram Gifts.',
              },
              {
                q: 'Можно ли вернуть отправленный подарок?',
                a: 'Нет, Telegram не позволяет отзывать отправленные подарки. Убедитесь что отправляете боту.',
              },
              {
                q: 'Сколько времени занимает зачисление?',
                a: 'Обычно мгновенно — в течение нескольких секунд после отправки.',
              },
            ].map((faq, i) => (
              <div key={i} className="border-t border-white/8 pt-3 first:border-t-0 first:pt-0">
                <p className="text-xs font-bold text-white">{faq.q}</p>
                <p className="text-xs text-white/45 mt-1">{faq.a}</p>
              </div>
            ))}
          </div>
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
