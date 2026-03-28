'use client';

import React, { useMemo, useState } from 'react';

type RouletteSector = {
  name: string;
  rewardType: 'stars' | 'item' | 'multiplier';
  value: number;
  weight: number;
  description?: string;
  primary?: string;
  secondary?: string;
  iconUrl?: string;
};

type RouletteConfig = {
  spinCost: number;
  sectors: RouletteSector[];
  variant?: 'wheel' | 'slots';
  slots?: {
    stakeOptions: number[];
    compoundPercent: number;
    nftChance: number;
    nftGiftIds?: string[];
  };
};

function parseConfig(value: string): RouletteConfig {
  try {
    const parsed = JSON.parse(value) as RouletteConfig;
    if (parsed && Array.isArray(parsed.sectors)) {
      return {
        spinCost: Number(parsed.spinCost) || 10,
        variant: parsed.variant === 'slots' ? 'slots' : 'wheel',
        slots: {
          stakeOptions: Array.isArray(parsed.slots?.stakeOptions)
            ? parsed.slots?.stakeOptions.map((value: number) => Number(value) || 0).filter((value: number) => value > 0)
            : [10, 25, 50],
          compoundPercent: Number(parsed.slots?.compoundPercent) || 8,
          nftChance: Number(parsed.slots?.nftChance) || 2,
          nftGiftIds: Array.isArray(parsed.slots?.nftGiftIds)
            ? parsed.slots?.nftGiftIds.map((value: string) => String(value)).filter(Boolean)
            : []
        },
        sectors: parsed.sectors.map((sector) => ({
          ...sector,
          rewardType: sector.rewardType ?? 'stars',
          iconUrl: sector.iconUrl || undefined
        }))
      };
    }
  } catch {
    /* ignore */
  }
  return {
    spinCost: 10,
    variant: 'wheel',
    slots: {
      stakeOptions: [10, 25, 50],
      compoundPercent: 8,
      nftChance: 2,
      nftGiftIds: []
    },
    sectors: []
  };
}

function createEmptySector(): RouletteSector {
  return {
    name: 'Новый сектор',
    rewardType: 'stars',
    value: 10,
    weight: 1,
    description: '',
    primary: 'rgba(212,175,55,0.95)',
    secondary: 'rgba(212,175,55,0.45)',
    iconUrl: undefined
  };
}

export interface RouletteEditorProps {
  initialConfig: string;
  action: (formData: FormData) => Promise<void>;
  isDisabled?: boolean;
}

export function RouletteEditor({
  initialConfig,
  action,
  isDisabled = false
}: RouletteEditorProps): React.JSX.Element {
  const [config, setConfig] = useState<RouletteConfig>(() => parseConfig(initialConfig));

  const serializedConfig = useMemo(() => JSON.stringify(config, null, 2), [config]);
  const totalWeight = config.sectors.reduce((sum, sector) => sum + Number(sector.weight || 0), 0);

  const updateSector = (index: number, changes: Partial<RouletteSector>) => {
    setConfig((current) => {
      const next = structuredClone(current);
      next.sectors[index] = { ...next.sectors[index], ...changes };
      return next;
    });
  };

  const removeSector = (index: number) => {
    setConfig((current) => {
      const next = structuredClone(current);
      next.sectors.splice(index, 1);
      return next;
    });
  };

  const addSector = () => {
    setConfig((current) => ({
      ...current,
      sectors: [...current.sectors, createEmptySector()]
    }));
  };

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="rouletteConfig" value={serializedConfig} />
      <div className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs uppercase tracking-[0.16em] text-platinum/60">
        <label className="flex items-center gap-2">
          Стоимость спина (★)
          <input
            className="w-24 rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-xs text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
            type="number"
            min={1}
            value={config.spinCost}
            disabled={isDisabled}
            onChange={(
              event: React.ChangeEvent<HTMLInputElement>
            ) =>
              setConfig((current) => ({
                ...current,
                spinCost: Number.parseInt(event.target.value, 10) || 1
              }))
            }
          />
        </label>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2">
            Формат
            <select
              className="rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-xs uppercase tracking-[0.14em] text-white outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
              value={config.variant ?? 'wheel'}
              disabled={isDisabled}
              onChange={(
                event: React.ChangeEvent<HTMLSelectElement>
              ) =>
                setConfig((current) => ({
                  ...current,
                  variant: event.target.value === 'slots' ? 'slots' : 'wheel'
                }))
              }
            >
              <option value="wheel">Колесо</option>
              <option value="slots">Слоты</option>
            </select>
          </label>
          <span>Сумма весов: {totalWeight.toFixed(2)}</span>
        </div>
      </div>

      <div className="grid gap-3 rounded-2xl border border-blue-400/20 bg-blue-500/10 p-3 text-xs uppercase tracking-[0.16em] text-platinum/65 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          Ставки слотов (★ через запятую)
          <input
            className="rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-xs text-white outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
            value={(config.slots?.stakeOptions ?? []).join(', ')}
            disabled={isDisabled}
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                slots: {
                  ...current.slots,
                  stakeOptions: event.target.value
                    .split(',')
                    .map((item) => Number.parseFloat(item.trim()))
                    .filter((value) => Number.isFinite(value) && value > 0)
                }
              }))
            }
          />
        </label>
        <label className="flex flex-col gap-2">
          Сложный процент
          <input
            className="rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-xs text-white outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
            type="number"
            min={0}
            step="0.1"
            value={config.slots?.compoundPercent ?? 0}
            disabled={isDisabled}
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                slots: {
                  ...current.slots,
                  compoundPercent: Number.parseFloat(event.target.value) || 0
                }
              }))
            }
          />
        </label>
        <label className="flex flex-col gap-2">
          Шанс NFT (%)
          <input
            className="rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-xs text-emerald-100 outline-none transition focus:border-emerald-400 focus:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
            type="number"
            min={0}
            step="0.1"
            value={config.slots?.nftChance ?? 0}
            disabled={isDisabled}
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                slots: {
                  ...current.slots,
                  nftChance: Number.parseFloat(event.target.value) || 0
                }
              }))
            }
          />
        </label>
        <label className="flex flex-col gap-2">
          NFT ID (через запятую)
          <input
            className="rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-xs text-emerald-100 outline-none transition focus:border-emerald-400 focus:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
            value={(config.slots?.nftGiftIds ?? []).join(', ')}
            disabled={isDisabled}
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                slots: {
                  ...current.slots,
                  nftGiftIds: event.target.value
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean)
                }
              }))
            }
          />
        </label>
      </div>

      <div className="border-b border-platinum/10 pb-4 mb-4" /> {/* Разделитель */}

      <div className="space-y-3">
        {config.sectors.map((sector, index) => (
          <div
            key={`${sector.name}-${index}`}
            className="space-y-3 py-3"
          >
            {index > 0 && <div className="border-t border-platinum/10 pt-3 mt-3" />} {/* Разделитель между секторами */}
            <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
              <input
                className="rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                value={sector.name}
                disabled={isDisabled}
                onChange={(event) => updateSector(index, { name: event.target.value })}
              />
              <select
                className="rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-xs uppercase tracking-[0.14em] text-white outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                value={sector.rewardType}
                disabled={isDisabled}
                onChange={(event) =>
                  updateSector(index, {
                    rewardType: event.target.value as RouletteSector['rewardType']
                  })
                }
              >
                <option value="stars">Звёзды</option>
                <option value="item">Предмет</option>
                <option value="multiplier">Множитель</option>
              </select>
              <button
                className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-red-200 transition hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                type="button"
                onClick={() => removeSector(index)}
                disabled={isDisabled}
              >
                Удалить
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-platinum/60">
                Значение
                <input
                  className="w-24 rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-xs text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                  type="number"
                  min={0}
                  value={sector.value}
                  disabled={isDisabled}
                  onChange={(event) =>
                    updateSector(index, { value: Number.parseFloat(event.target.value) || 0 })
                  }
                />
              </label>
              <label className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-platinum/60">
                Вес
                <input
                  className="w-24 rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-xs text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                  type="number"
                  min={0}
                  step="0.1"
                  value={sector.weight}
                  disabled={isDisabled}
                  onChange={(event) =>
                    updateSector(index, { weight: Number.parseFloat(event.target.value) || 0 })
                  }
                />
              </label>
              <textarea
                className="min-h-[60px] rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-xs text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40 sm:col-span-2"
                placeholder="Описание"
                value={sector.description ?? ''}
                disabled={isDisabled}
                onChange={(event) => updateSector(index, { description: event.target.value })}
              />
              <label className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-platinum/60">
                Цвет верхний
                <input
                  className="w-full rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-xs text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                  value={sector.primary ?? ''}
                  disabled={isDisabled}
                  onChange={(event) => updateSector(index, { primary: event.target.value })}
                />
              </label>
              <label className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-platinum/60">
                Цвет нижний
                <input
                  className="w-full rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-xs text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                  value={sector.secondary ?? ''}
                  disabled={isDisabled}
                  onChange={(event) => updateSector(index, { secondary: event.target.value })}
                />
              </label>
              <label className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-platinum/60 sm:col-span-2">
                Иконка (URL)
                <input
                  className="w-full rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-xs text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                  value={sector.iconUrl ?? ''}
                  disabled={isDisabled}
                  onChange={(event) => updateSector(index, { iconUrl: event.target.value })}
                  placeholder="https://example.com/icon.png"
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="border-b border-platinum/10 pt-4 mt-4" /> {/* Разделитель */}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          className="px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-gold-200 transition hover:text-gold-100 disabled:cursor-not-allowed disabled:opacity-40"
          type="button"
          onClick={addSector}
          disabled={isDisabled}
        >
          Добавить сектор
        </button>
        <button
          className="px-6 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-gold-200 transition hover:text-gold-100 disabled:cursor-not-allowed disabled:opacity-50"
          type="submit"
          disabled={isDisabled}
        >
          Сохранить рулетку
        </button>
      </div>
    </form>
  );
}
