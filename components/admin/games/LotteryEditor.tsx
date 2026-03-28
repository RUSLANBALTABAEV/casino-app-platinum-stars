'use client';

import React, { useMemo, useState } from 'react';

type LotteryDistribution = {
  place: number;
  share: number;
};

type LotteryPool = {
  id: string;
  name: string;
  participantLimit: number;
  ticketCost: number;
  prizePercent: number;
  distribution: LotteryDistribution[];
};

type LotteryConfig = {
  pools: LotteryPool[];
};

function parseConfig(value: string): LotteryConfig {
  try {
    const parsed = JSON.parse(value) as LotteryConfig;
    if (parsed && Array.isArray(parsed.pools)) {
      return {
        pools: parsed.pools.map((pool) => ({
          ...pool,
          distribution: Array.isArray(pool.distribution) ? pool.distribution : []
        }))
      };
    }
  } catch {
    /* ignore */
  }
  return { pools: [] };
}

function createEmptyPool(): LotteryPool {
  const id = `pool-${Date.now()}`;
  return {
    id,
    name: 'Новая лотерея',
    participantLimit: 10,
    ticketCost: 5,
    prizePercent: 0.82,
    distribution: [
      { place: 1, share: 0.7 },
      { place: 2, share: 0.3 }
    ]
  };
}

function createEmptyDistribution(): LotteryDistribution {
  return {
    place: 1,
    share: 0.5
  };
}

export interface LotteryEditorProps {
  initialConfig: string;
  action: (formData: FormData) => Promise<void>;
  isDisabled?: boolean;
}

export function LotteryEditor({ initialConfig, action, isDisabled = false }: LotteryEditorProps): React.JSX.Element {
  const [config, setConfig] = useState<LotteryConfig>(() => parseConfig(initialConfig));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const jsonOutput = useMemo(() => {
    try {
      return JSON.stringify(config, null, 2);
    } catch {
      return '{}';
    }
  }, [config]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      // Валидация
      if (config.pools.length === 0) {
        throw new Error('Добавьте хотя бы одну лотерею');
      }

      for (const pool of config.pools) {
        if (!pool.id.trim()) {
          throw new Error(`Лотерея "${pool.name}": укажите ID`);
        }
        if (!pool.name.trim()) {
          throw new Error(`Лотерея "${pool.id}": укажите название`);
        }
        if (pool.participantLimit < 2) {
          throw new Error(`Лотерея "${pool.name}": минимальное количество участников - 2`);
        }
        if (pool.ticketCost <= 0) {
          throw new Error(`Лотерея "${pool.name}": стоимость билета должна быть больше 0`);
        }
        if (pool.prizePercent <= 0 || pool.prizePercent > 1) {
          throw new Error(`Лотерея "${pool.name}": процент призового фонда должен быть от 0 до 1 (0-100%)`);
        }
        if (pool.distribution.length === 0) {
          throw new Error(`Лотерея "${pool.name}": добавьте хотя бы одно место в распределении`);
        }
        
        const totalShare = pool.distribution.reduce((sum, dist) => sum + dist.share, 0);
        if (totalShare > 1.01) {
          throw new Error(`Лотерея "${pool.name}": сумма долей распределения (${(totalShare * 100).toFixed(1)}%) превышает 100%`);
        }
      }

      const formData = new FormData();
      formData.append('lotteryConfig', jsonOutput);
      await action(formData);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setIsSubmitting(false);
    }
  };

  const addPool = () => {
    setConfig({
      pools: [...config.pools, createEmptyPool()]
    });
  };

  const removePool = (index: number) => {
    setConfig({
      pools: config.pools.filter((_, i) => i !== index)
    });
  };

  const updatePool = (index: number, updates: Partial<LotteryPool>) => {
    const newPools = [...config.pools];
    newPools[index] = { ...newPools[index], ...updates };
    setConfig({ pools: newPools });
  };

  const addDistribution = (poolIndex: number) => {
    const newPools = [...config.pools];
    newPools[poolIndex].distribution = [...newPools[poolIndex].distribution, createEmptyDistribution()];
    setConfig({ pools: newPools });
  };

  const removeDistribution = (poolIndex: number, distIndex: number) => {
    const newPools = [...config.pools];
    newPools[poolIndex].distribution = newPools[poolIndex].distribution.filter((_, i) => i !== distIndex);
    setConfig({ pools: newPools });
  };

  const updateDistribution = (poolIndex: number, distIndex: number, updates: Partial<LotteryDistribution>) => {
    const newPools = [...config.pools];
    newPools[poolIndex].distribution[distIndex] = {
      ...newPools[poolIndex].distribution[distIndex],
      ...updates
    };
    setConfig({ pools: newPools });
  };

  const calculatePrizePool = (pool: LotteryPool): number => {
    return Math.floor(pool.ticketCost * pool.participantLimit * pool.prizePercent);
  };

  const calculatePrizeForPlace = (pool: LotteryPool, place: number): number => {
    const dist = pool.distribution.find((d) => d.place === place);
    if (!dist) return 0;
    const totalPool = calculatePrizePool(pool);
    return Math.floor(totalPool * dist.share);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        {config.pools.map((pool, poolIndex) => {
          const totalShare = pool.distribution.reduce((sum, dist) => sum + dist.share, 0);
          const prizePool = calculatePrizePool(pool);
          
          return (
            <div
              key={pool.id}
              className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="flex flex-col gap-1.5 text-sm">
                      <span className="text-platinum/80 font-medium">ID лотереи</span>
                      <input
                        type="text"
                        value={pool.id}
                        onChange={(e) => updatePool(poolIndex, { id: e.target.value })}
                        className="rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                        placeholder="nova-10"
                        disabled={isDisabled || isSubmitting}
                        required
                      />
                      <span className="text-xs text-platinum/50">Уникальный идентификатор</span>
                    </label>

                    <label className="flex flex-col gap-1.5 text-sm">
                      <span className="text-platinum/80 font-medium">Название</span>
                      <input
                        type="text"
                        value={pool.name}
                        onChange={(e) => updatePool(poolIndex, { name: e.target.value })}
                        className="rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                        placeholder="Nova 10"
                        disabled={isDisabled || isSubmitting}
                        required
                      />
                    </label>

                    <label className="flex flex-col gap-1.5 text-sm">
                      <span className="text-platinum/80 font-medium">Количество участников</span>
                      <input
                        type="number"
                        min="2"
                        value={pool.participantLimit}
                        onChange={(e) => updatePool(poolIndex, { participantLimit: Math.max(2, parseInt(e.target.value) || 2) })}
                        className="rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={isDisabled || isSubmitting}
                        required
                      />
                      <span className="text-xs text-platinum/50">Минимум 2 участника</span>
                    </label>

                    <label className="flex flex-col gap-1.5 text-sm">
                      <span className="text-platinum/80 font-medium">Стоимость билета (★)</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={pool.ticketCost}
                        onChange={(e) => updatePool(poolIndex, { ticketCost: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={isDisabled || isSubmitting}
                        required
                      />
                    </label>

                    <label className="flex flex-col gap-1.5 text-sm">
                      <span className="text-platinum/80 font-medium">Процент призового фонда</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={Math.round(pool.prizePercent * 100)}
                          onChange={(e) => {
                            const percent = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                            updatePool(poolIndex, { prizePercent: percent / 100 });
                          }}
                          className="flex-1 rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={isDisabled || isSubmitting}
                          required
                        />
                        <span className="text-sm text-platinum/60">%</span>
                      </div>
                      <span className="text-xs text-platinum/50">Доля от собранных средств, которая идет в призовой фонд</span>
                    </label>

                    <div className="flex flex-col gap-1.5 text-sm">
                      <span className="text-platinum/80 font-medium">Призовой фонд</span>
                      <div className="rounded-lg border border-gold-400/30 bg-gold-500/10 px-3 py-2 text-gold-300 font-semibold">
                        {prizePool} ★
                      </div>
                      <span className="text-xs text-platinum/50">
                        {pool.ticketCost} × {pool.participantLimit} × {Math.round(pool.prizePercent * 100)}%
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-platinum/80">Распределение призов</span>
                      <button
                        type="button"
                        onClick={() => addDistribution(poolIndex)}
                        className="px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-blue-300 border border-blue-400/30 bg-blue-500/10 rounded-lg transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={isDisabled || isSubmitting}
                      >
                        + Добавить место
                      </button>
                    </div>

                    <div className="space-y-2">
                      {pool.distribution.map((dist, distIndex) => {
                        const prize = calculatePrizeForPlace(pool, dist.place);
                        return (
                          <div
                            key={distIndex}
                            className="flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-white/5"
                          >
                            <label className="flex flex-col gap-1 text-xs flex-shrink-0 w-20">
                              <span className="text-platinum/60">Место</span>
                              <input
                                type="number"
                                min="1"
                                value={dist.place}
                                onChange={(e) => updateDistribution(poolIndex, distIndex, { place: Math.max(1, parseInt(e.target.value) || 1) })}
                                className="rounded border border-blue-400/30 bg-blue-500/20 px-2 py-1 text-sm text-white outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                                disabled={isDisabled || isSubmitting}
                                required
                              />
                            </label>

                            <label className="flex flex-col gap-1 text-xs flex-1">
                              <span className="text-platinum/60">Доля (0-100%)</span>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.1"
                                  value={Math.round(dist.share * 100)}
                                  onChange={(e) => {
                                    const percent = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                                    updateDistribution(poolIndex, distIndex, { share: percent / 100 });
                                  }}
                                  className="flex-1 rounded border border-blue-400/30 bg-blue-500/20 px-2 py-1 text-sm text-white outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                                  disabled={isDisabled || isSubmitting}
                                  required
                                />
                                <span className="text-xs text-platinum/50">%</span>
                              </div>
                            </label>

                            <div className="flex flex-col gap-1 text-xs flex-shrink-0 w-24">
                              <span className="text-platinum/60">Приз</span>
                              <div className="rounded border border-gold-400/30 bg-gold-500/10 px-2 py-1 text-gold-300 font-semibold text-center">
                                {prize} ★
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => removeDistribution(poolIndex, distIndex)}
                              className="px-2 py-1 text-xs text-red-300 border border-red-400/30 bg-red-500/10 rounded transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                              disabled={isDisabled || isSubmitting || pool.distribution.length === 1}
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {totalShare > 1.01 && (
                      <p className="text-xs text-red-300">
                        ⚠️ Сумма долей ({Math.round(totalShare * 100)}%) превышает 100%
                      </p>
                    )}
                    {totalShare < 0.99 && (
                      <p className="text-xs text-yellow-300">
                        ℹ️ Сумма долей ({Math.round(totalShare * 100)}%) меньше 100% - часть призового фонда не будет распределена
                      </p>
                    )}
                    {totalShare >= 0.99 && totalShare <= 1.01 && (
                      <p className="text-xs text-emerald-300">
                        ✓ Сумма долей ({Math.round(totalShare * 100)}%) корректна
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => removePool(poolIndex)}
                  className="px-3 py-1.5 text-xs text-red-300 border border-red-400/30 bg-red-500/10 rounded-lg transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40 flex-shrink-0"
                  disabled={isDisabled || isSubmitting || config.pools.length === 1}
                >
                  Удалить
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={addPool}
        className="w-full px-4 py-2 text-sm font-semibold uppercase tracking-[0.12em] text-blue-300 border border-blue-400/30 bg-blue-500/10 rounded-lg transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={isDisabled || isSubmitting}
      >
        + Добавить лотерею
      </button>

      {error && (
        <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          ✓ Конфигурация лотереи успешно сохранена
        </div>
      )}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          className="px-6 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-white bg-gold-400 rounded-lg transition hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isDisabled || isSubmitting}
        >
          {isSubmitting ? 'Сохранение...' : 'Сохранить лотереи'}
        </button>
      </div>
    </form>
  );
}




