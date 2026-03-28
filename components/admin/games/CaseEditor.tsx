'use client';

import React, { useMemo, useState } from 'react';

type CaseItem = {
  id: string;
  name: string;
  rarity: string;
  weight: number;
  chance: number;
  color?: string;
  stars?: number;
  description?: string;
  caseId?: string;
  nftGiftId?: string;
};

type LootCase = {
  id: string;
  name: string;
  price: number;
  currency?: 'STARS' | 'BONUS';
  description?: string;
  badge?: string;
  artwork?: string;
  items: CaseItem[];
};

type CaseConfig = {
  cases: LootCase[];
};

const CHEST_ARTWORK_OPTIONS = [
  '/chests/chest_1.png',
  '/chests/chest_2.png',
  '/chests/chest_3.png',
  '/chests/chest_4.png',
  '/chests/chest_5.png',
  '/chests/chest_6.png'
] as const;

function parseConfig(value: string): CaseConfig {
  try {
    const parsed = JSON.parse(value) as CaseConfig;
    if (parsed && Array.isArray(parsed.cases)) {
      return {
        cases: parsed.cases.map((lootCase) => ({
          ...lootCase,
          badge: lootCase.badge || undefined,
          artwork: lootCase.artwork || undefined,
          items: Array.isArray(lootCase.items) ? lootCase.items.map((item) => ({
            ...item,
            caseId: item.caseId || undefined,
          })) : []
        }))
      };
    }
  } catch {
    /* ignore malformed JSON */
  }
  return { cases: [] };
}

function createEmptyCase(): LootCase {
  const id = `case-${Date.now()}`;
  return {
    id,
    name: 'Новый кейс',
    price: 100,
    currency: 'STARS',
    description: 'Описание кейса',
    badge: undefined,
    artwork: CHEST_ARTWORK_OPTIONS[0],
    items: [createEmptyItem()]
  };
}

function createEmptyItem(): CaseItem {
  const id = `item-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    name: 'Новый приз',
    rarity: 'Обычный',
    weight: 10,
    chance: 10,
    stars: 0,
    caseId: undefined,
    nftGiftId: undefined
  };
}

export interface CaseEditorProps {
  initialConfig: string;
  action: (formData: FormData) => Promise<void>;
  isDisabled?: boolean;
}

export function CaseEditor({ initialConfig, action, isDisabled = false }: CaseEditorProps): React.JSX.Element {
  const [config, setConfig] = useState<CaseConfig>(() => parseConfig(initialConfig));

  const serializedConfig = useMemo(() => JSON.stringify(config, null, 2), [config]);

  const handleCaseChange = (index: number, changes: Partial<LootCase>) => {
    setConfig((current) => {
      const next = structuredClone(current);
      next.cases[index] = { ...next.cases[index], ...changes };
      return next;
    });
  };

  const handleItemChange = (caseIndex: number, itemIndex: number, changes: Partial<CaseItem>) => {
    setConfig((current) => {
      const next = structuredClone(current);
      next.cases[caseIndex].items[itemIndex] = {
        ...next.cases[caseIndex].items[itemIndex],
        ...changes
      };
      return next;
    });
  };

  const handleRemoveCase = (index: number) => {
    setConfig((current) => {
      const next = structuredClone(current);
      next.cases.splice(index, 1);
      return next;
    });
  };

  const handleRemoveItem = (caseIndex: number, itemIndex: number) => {
    setConfig((current) => {
      const next = structuredClone(current);
      next.cases[caseIndex].items.splice(itemIndex, 1);
      if (next.cases[caseIndex].items.length === 0) {
        next.cases[caseIndex].items.push(createEmptyItem());
      }
      return next;
    });
  };

  const addCase = () => {
    setConfig((current) => ({
      cases: [...current.cases, createEmptyCase()]
    }));
  };

  const addItem = (caseIndex: number) => {
    setConfig((current) => {
      const next = structuredClone(current);
      next.cases[caseIndex].items.push(createEmptyItem());
      return next;
    });
  };

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="caseConfig" value={serializedConfig} />
      <div className="space-y-4">
        {config.cases.map((lootCase, caseIndex) => {
          const totalWeight = lootCase.items.reduce((sum, item) => sum + Number(item.weight || 0), 0);
          const totalChance = lootCase.items.reduce((sum, item) => sum + Number(item.chance || 0), 0);
          return (
            <div
              key={lootCase.id}
              className="space-y-4 py-3"
            >
              <div className="flex flex-col gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <input
                    className="w-full rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                    value={lootCase.name}
                    disabled={isDisabled}
                    onChange={(event) => handleCaseChange(caseIndex, { name: event.target.value })}
                  />
                  <input
                    className="w-full rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-xs uppercase tracking-[0.12em] text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                    value={lootCase.badge ?? ''}
                    disabled={isDisabled}
                    onChange={(event) => handleCaseChange(caseIndex, { badge: event.target.value || undefined })}
                    placeholder="Бейдж (необязательно)"
                  />
                  <textarea
                    className="min-h-[80px] w-full rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                    value={lootCase.description ?? ''}
                    disabled={isDisabled}
                    onChange={(event) => handleCaseChange(caseIndex, { description: event.target.value })}
                    placeholder="Описание кейса"
                  />
                </div>
                <div className="flex flex-col gap-2 text-xs uppercase tracking-[0.16em] text-platinum/60">
                  <label className="flex flex-col gap-2">
                    Картинка кейса
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                      {CHEST_ARTWORK_OPTIONS.map((option) => {
                        const isSelected = (lootCase.artwork ?? '') === option;
                        return (
                          <button
                            key={option}
                            type="button"
                            className={[
                              'group relative overflow-hidden rounded-xl border bg-white/5 p-2 transition',
                              isSelected ? 'border-gold-400/70 bg-gold-400/10' : 'border-white/10 hover:border-white/20'
                            ].join(' ')}
                            onClick={() => handleCaseChange(caseIndex, { artwork: option })}
                            disabled={isDisabled}
                            aria-label={`Выбрать ${option}`}
                          >
                            <img
                              src={option}
                              alt=""
                              className="mx-auto h-10 w-10 object-contain transition group-hover:scale-[1.03]"
                              loading="lazy"
                            />
                          </button>
                        );
                      })}
                    </div>
                    <input
                      className="w-full rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-xs text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                      value={lootCase.artwork ?? ''}
                      disabled={isDisabled}
                      onChange={(event) => handleCaseChange(caseIndex, { artwork: event.target.value || undefined })}
                      placeholder="/chests/chest_1.png"
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    Цена
                    <input
                      className="w-24 rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-xs text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                      type="number"
                      min={0}
                      disabled={isDisabled}
                      value={lootCase.price}
                      onChange={(event) =>
                        handleCaseChange(caseIndex, { price: Number.parseInt(event.target.value, 10) || 0 })
                      }
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    Валюта
                    <select
                      className="rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-xs uppercase tracking-[0.14em] text-white outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                      value={lootCase.currency ?? 'STARS'}
                      disabled={isDisabled}
                      onChange={(event) =>
                        handleCaseChange(caseIndex, {
                          currency: event.target.value === 'BONUS' ? 'BONUS' : 'STARS'
                        })
                      }
                    >
                      <option value="STARS">Звёзды</option>
                      <option value="BONUS">Бонус</option>
                    </select>
                  </label>
                  <div>
                    <p>Сумма весов: {totalWeight.toFixed(2)}</p>
                    <p>Сумма шансов: {totalChance.toFixed(2)}%</p>
                  </div>
                </div>
                <button
                  className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-red-200 transition hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                  type="button"
                  onClick={() => handleRemoveCase(caseIndex)}
                  disabled={isDisabled || config.cases.length === 1}
                >
                  Удалить кейс
                </button>
              </div>
              <div className="border-b border-platinum/10 pb-4 mb-4" />

              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.16em] text-platinum/50">Призы</p>
                <div className="space-y-3">
                  {lootCase.items.map((item, itemIndex) => {
                    const availableCases = config.cases.filter((c) => c.id !== lootCase.id);
                    const isCaseItem = item.caseId !== undefined;
                    const isNftItem = item.nftGiftId !== undefined;

                    return (
                      <div
                        key={item.id}
                        className="flex flex-col gap-3 py-3">
                        {itemIndex > 0 && <div className="border-t border-platinum/10 pt-3 mt-3" />}
                        <div className="flex flex-wrap items-center gap-3">
                          <label className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-platinum/60">
                            Тип приза
                            <select
                              className="rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-sm text-white outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                              value={isCaseItem ? 'case' : isNftItem ? 'nft' : 'item'}
                              disabled={isDisabled}
                              onChange={(e) => {
                                if (e.target.value === 'case') {
                                  handleItemChange(caseIndex, itemIndex, {
                                    caseId: availableCases[0]?.id,
                                    weight: 0,
                                    chance: 0,
                                    stars: 0,
                                    description: undefined,
                                    color: undefined,
                                    nftGiftId: ''
                                  });
                                } else if (e.target.value === 'nft') {
                                  handleItemChange(caseIndex, itemIndex, {
                                    caseId: undefined,
                                    weight: 10,
                                    chance: 10,
                                    stars: 0,
                                    description: undefined,
                                    color: undefined,
                                    nftGiftId: item.nftGiftId || ''
                                  });
                                } else {
                                  handleItemChange(caseIndex, itemIndex, {
                                    caseId: undefined,
                                    weight: 10,
                                    chance: 10,
                                    stars: 0,
                                    description: undefined,
                                    color: undefined,
                                    nftGiftId: ''
                                  });
                                }
                              }}
                            >
                              <option value="item">Предмет</option>
                              <option value="nft">NFT</option>
                              <option value="case">Кейс</option>
                            </select>
                          </label>
                        </div>
                        <input
                          className="rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                          value={item.name}
                          disabled={isDisabled}
                          onChange={(event) => handleItemChange(caseIndex, itemIndex, { name: event.target.value })}
                        />
                        {!isCaseItem && (
                          <input
                            className="rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-xs uppercase tracking-[0.12em] text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                            value={item.rarity}
                            disabled={isDisabled}
                            onChange={(event) => handleItemChange(caseIndex, itemIndex, { rarity: event.target.value })}
                          />
                        )}
                        {!isCaseItem && isNftItem ? (
                          <input
                            className="rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-xs uppercase tracking-[0.12em] text-emerald-100 placeholder:text-emerald-200/60 outline-none transition focus:border-emerald-400 focus:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                            value={item.nftGiftId ?? ''}
                            disabled={isDisabled}
                            placeholder="ID NFT подарка (например gift-snowflake)"
                            onChange={(event) =>
                              handleItemChange(caseIndex, itemIndex, { nftGiftId: event.target.value })
                            }
                          />
                        ) : null}
                        {!isCaseItem && (
                          <input
                            className="rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-xs uppercase tracking-[0.12em] text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                            value={item.color ?? ''}
                            placeholder="#FFFFFF"
                            disabled={isDisabled}
                            onChange={(event) => handleItemChange(caseIndex, itemIndex, { color: event.target.value })}
                          />
                        )}
                        {isCaseItem && (
                          <label className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-platinum/60">
                            Кейс
                            <select
                              className="border-b border-platinum/20 pb-1 px-3 py-2 text-sm text-platinum outline-none transition focus:border-gold-400"
                              value={item.caseId ?? ''}
                              disabled={isDisabled}
                              onChange={(e) => handleItemChange(caseIndex, itemIndex, { caseId: e.target.value })}
                            >
                              {availableCases.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </label>
                        )}
                        <button
                          className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-red-200 transition hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                          type="button"
                          onClick={() => handleRemoveItem(caseIndex, itemIndex)}
                          disabled={isDisabled || lootCase.items.length === 1}
                        >
                          Удалить
                        </button>
                        {!isCaseItem && (
                          <div className="grid gap-2 sm:grid-cols-2">
                            <label className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-platinum/60">
                              Вес
                              <input
                                className="w-24 rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-xs text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                                type="number"
                                min={0}
                                step="0.1"
                                disabled={isDisabled}
                                value={item.weight}
                                onChange={(event) =>
                                  handleItemChange(caseIndex, itemIndex, {
                                    weight: Number.parseFloat(event.target.value) || 0
                                  })
                                }
                              />
                            </label>
                            <label className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-platinum/60">
                              Шанс (%)
                              <input
                                className="w-24 rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-xs text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                                type="number"
                                min={0}
                                step="0.1"
                                disabled={isDisabled}
                                value={item.chance}
                                onChange={(event) =>
                                  handleItemChange(caseIndex, itemIndex, {
                                    chance: Number.parseFloat(event.target.value) || 0
                                  })
                                }
                              />
                            </label>
                            <label className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-platinum/60">
                              Звёзды
                              <input
                                className="w-24 rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-xs text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                                type="number"
                                min={0}
                                disabled={isDisabled}
                                value={item.stars ?? 0}
                                onChange={(event) =>
                                  handleItemChange(caseIndex, itemIndex, {
                                    stars: Number.parseInt(event.target.value, 10) || 0
                                  })
                                }
                              />
                            </label>
                            <textarea
                              className="min-h-[60px] rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-xs text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40 sm:col-span-2"
                              placeholder="Доп. описание / эффект"
                              disabled={isDisabled}
                              value={item.description ?? ''}
                              onChange={(event) =>
                                handleItemChange(caseIndex, itemIndex, { description: event.target.value })
                              }
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-gold-200 transition hover:text-gold-100 disabled:cursor-not-allowed disabled:opacity-40"
                  type="button"
                  onClick={() => addItem(caseIndex)}
                  disabled={isDisabled}
                >
                  Добавить приз
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          className="px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-gold-200 transition hover:text-gold-100 disabled:cursor-not-allowed disabled:opacity-40"
          type="button"
          onClick={addCase}
          disabled={isDisabled}
        >
          Добавить кейс
        </button>

        <button
          className="px-6 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-gold-200 transition hover:text-gold-100 disabled:cursor-not-allowed disabled:opacity-50"
          type="submit"
          disabled={isDisabled}
        >
          Сохранить кейсы
        </button>
      </div>
    </form>
  );
}
