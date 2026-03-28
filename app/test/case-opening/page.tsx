'use client';

import React, { useCallback, useMemo, useState } from 'react';

import clsx from 'clsx';

import CaseOpeningModal from '@/components/games/CaseOpeningModal';
import type { CaseDefinition, CaseItemDefinition } from '@/lib/config/case-default';
import { getDefaultCaseConfig } from '@/lib/config/case-default';

function pickReward(items: CaseItemDefinition[]): CaseItemDefinition {
  const totalWeight = items.reduce((acc, item) => acc + (item.weight || 0), 0) || 1;
  const roll = Math.random() * totalWeight;
  let cumulative = 0;
  for (const item of items) {
    cumulative += item.weight || 0;
    if (roll <= cumulative) {
      return item;
    }
  }
  return items[items.length - 1];
}

export default function CaseOpeningPreviewPage(): React.JSX.Element {
  const config = useMemo(() => getDefaultCaseConfig(), []);
  const cases = config.cases;

  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedCase = cases[selectedIndex] ?? cases[0] ?? null;
  const [animationMode, setAnimationMode] = useState<'lottie' | 'gif'>('gif');

  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lootCase, setLootCase] = useState<CaseDefinition | null>(null);
  const [reward, setReward] = useState<CaseItemDefinition | null>(null);

  const openPreview = useCallback(() => {
    if (!selectedCase) {
      return;
    }

    setLootCase(selectedCase);
    setReward(null);
    setModalOpen(true);
    setLoading(true);

    window.setTimeout(() => {
      setReward(pickReward(selectedCase.items));
      setLoading(false);
    }, 900);
  }, [selectedCase]);

  const openAnother = useCallback(() => {
    if (!selectedCase) {
      return;
    }
    setLootCase(selectedCase);
    setReward(null);
    setLoading(true);
    window.setTimeout(() => {
      setReward(pickReward(selectedCase.items));
      setLoading(false);
    }, 900);
  }, [selectedCase]);

  return (
    <div className="min-h-screen px-4 py-8 text-platinum">
      <CaseOpeningModal
        open={modalOpen}
        loading={loading}
        lootCase={lootCase}
        reward={reward}
        animationMode={animationMode}
        onClose={() => {
          if (loading) {
            return;
          }
          setModalOpen(false);
          setLootCase(null);
          setReward(null);
        }}
        onOpenAnother={openAnother}
      />

      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header className="rounded-3xl border border-gold-400/25 bg-black/40 p-6 backdrop-blur-md">
          <h1 className="text-2xl font-semibold text-gold-200">Тест: анимация открытия кейса</h1>
          <p className="mt-2 text-sm text-platinum/70">
            Страница нужна только для проверки в браузере (без Telegram). Если Lottie не подхватится — положи файл
            `public/lottie/treasure-box/treasure-box.json` и (если нужно) папку `public/lottie/treasure-box/images/`.
          </p>
        </header>

        <section className="rounded-3xl border border-platinum/10 bg-black/30 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-platinum/60">Выбор кейса</h2>
            <div className="flex items-center gap-2">
              <select
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/80 outline-none"
                value={animationMode}
                onChange={(e) => setAnimationMode(e.target.value as 'lottie' | 'gif')}
              >
                <option value="gif">GIF</option>
                <option value="lottie">Lottie</option>
              </select>
              <button
                type="button"
                onClick={openPreview}
                className="rounded-full bg-gold-400 px-5 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-night transition active:scale-[0.98]"
              >
                Открыть (превью)
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {cases.map((entry, index) => {
              const isActive = index === selectedIndex;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  className={clsx(
                    'group overflow-hidden rounded-2xl border p-3 text-left transition active:scale-[0.985]',
                    isActive
                      ? 'border-gold-400/60 bg-gold-400/10'
                      : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8'
                  )}
                >
                  <div className="flex items-center justify-center">
                    <img
                      src={entry.artwork ?? `/chests/chest_${(index % 6) + 1}.png`}
                      alt=""
                      className={clsx(
                        'h-20 w-20 object-contain drop-shadow-[0_18px_38px_rgba(0,0,0,0.5)] transition',
                        isActive ? 'scale-[1.03]' : 'group-hover:scale-[1.02]'
                      )}
                      loading="lazy"
                    />
                  </div>
                  <p className="mt-2 text-sm font-semibold text-white line-clamp-1">{entry.name}</p>
                  <p className="mt-1 text-xs text-platinum/60 line-clamp-2">{entry.description ?? '—'}</p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-platinum/10 bg-black/30 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-platinum/60">Что проверять</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-platinum/75">
            <li>сундук открывается плавно и без рывков</li>
            <li>после окончания анимации показывается карточка выигрыша</li>
            <li>кнопка «Открыть ещё» запускает анимацию повторно</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
