'use client';

import React, { useMemo, useState } from 'react';

type RunnerPayoutRow = {
  id: string;
  threshold: string;
  reward: string;
  label: string;
};

type RunnerConfig = {
  attemptCost: number;
  payouts: Array<{ threshold: number; reward: number; label?: string }>;
  freeAttemptsPerDay?: number;
  cooldownSeconds?: number;
};

const FALLBACK_CONFIG: RunnerConfig = {
  attemptCost: 6,
  freeAttemptsPerDay: 1,
  cooldownSeconds: 45,
  payouts: [
    { threshold: 900, reward: 6, label: 'Разогрев' },
    { threshold: 1400, reward: 14, label: 'Гиперразгон' },
    { threshold: 2000, reward: 30, label: 'Луч сезона' },
    { threshold: 2600, reward: 55, label: 'Сверхновая' }
  ]
};

function parseConfig(value: string): {
  attemptCost: string;
  freeAttemptsPerDay: string;
  cooldownSeconds: string;
  payouts: RunnerPayoutRow[];
} {
  try {
    const parsed = JSON.parse(value) as RunnerConfig;
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.payouts) && parsed.payouts.length > 0) {
      const rows = parsed.payouts.map((entry, index) => ({
        id: `payout-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        threshold:
          entry && typeof entry.threshold === 'number' && Number.isFinite(entry.threshold)
            ? String(entry.threshold)
            : '',
        reward:
          entry && typeof entry.reward === 'number' && Number.isFinite(entry.reward) ? String(entry.reward) : '',
        label: entry && typeof entry.label === 'string' ? entry.label : ''
      }));
      return {
        attemptCost:
          parsed.attemptCost && Number.isFinite(parsed.attemptCost) ? String(parsed.attemptCost) : '6',
        freeAttemptsPerDay:
          parsed.freeAttemptsPerDay !== undefined && Number.isFinite(parsed.freeAttemptsPerDay)
            ? String(parsed.freeAttemptsPerDay)
            : '',
        cooldownSeconds:
          parsed.cooldownSeconds !== undefined && Number.isFinite(parsed.cooldownSeconds)
            ? String(parsed.cooldownSeconds)
            : '',
        payouts: rows.length > 0 ? rows : fallbackRows()
      };
    }
  } catch {
    /* swallow JSON parse errors */
  }
  return {
    attemptCost: String(FALLBACK_CONFIG.attemptCost),
    freeAttemptsPerDay:
      FALLBACK_CONFIG.freeAttemptsPerDay !== undefined ? String(FALLBACK_CONFIG.freeAttemptsPerDay) : '',
    cooldownSeconds:
      FALLBACK_CONFIG.cooldownSeconds !== undefined ? String(FALLBACK_CONFIG.cooldownSeconds) : '',
    payouts: fallbackRows()
  };
}

function fallbackRows(): RunnerPayoutRow[] {
  return FALLBACK_CONFIG.payouts.map((entry, index) => ({
    id: `fallback-${index}-${Date.now()}`,
    threshold: String(entry.threshold),
    reward: String(entry.reward),
    label: entry.label ?? ''
  }));
}

function createEmptyRow(previous?: RunnerPayoutRow): RunnerPayoutRow {
  const nextThreshold = previous ? Number.parseFloat(previous.threshold) + 300 : 1000;
  const nextReward = previous ? Number.parseFloat(previous.reward) + 10 : 10;
  return {
    id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    threshold: Number.isFinite(nextThreshold) ? String(Math.max(1, Math.round(nextThreshold))) : '1000',
    reward: Number.isFinite(nextReward) ? String(Math.max(1, Math.round(nextReward))) : '10',
    label: ''
  };
}

function parsePositive(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number.parseFloat(value.trim().replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.round(parsed);
}

function parseNonNegative(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number.parseFloat(value.trim().replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Math.round(parsed);
}

export interface RunnerEditorProps {
  initialConfig: string;
  action: (formData: FormData) => Promise<void>;
  isDisabled?: boolean;
}

export function RunnerEditor({
  initialConfig,
  action,
  isDisabled = false
}: RunnerEditorProps): React.JSX.Element {
  const initialState = useMemo(() => parseConfig(initialConfig), [initialConfig]);
  const [attemptCostInput, setAttemptCostInput] = useState<string>(initialState.attemptCost);
  const [freeAttemptsInput, setFreeAttemptsInput] = useState<string>(initialState.freeAttemptsPerDay);
  const [cooldownInput, setCooldownInput] = useState<string>(initialState.cooldownSeconds);
  const [payouts, setPayouts] = useState<RunnerPayoutRow[]>(initialState.payouts);

  const { serializedConfig, isValid, safePayouts } = useMemo(() => {
    const attemptCostParsed = parsePositive(attemptCostInput) ?? 0;
    const freeAttemptsParsed = parseNonNegative(freeAttemptsInput);
    const cooldownParsed = parseNonNegative(cooldownInput);

    const normalizedPayouts = payouts
      .map((row) => {
        const threshold = parsePositive(row.threshold);
        const reward = parsePositive(row.reward);
        if (!threshold || !reward) {
          return null;
        }
        const payload: { threshold: number; reward: number; label?: string } = {
          threshold,
          reward
        };
        const trimmedLabel = row.label.trim();
        if (trimmedLabel) {
          payload.label = trimmedLabel;
        }
        return payload;
      })
      .filter((entry): entry is { threshold: number; reward: number; label?: string } => entry !== null)
      .sort((a, b) => a.threshold - b.threshold);

    const config: RunnerConfig = {
      attemptCost: attemptCostParsed > 0 ? attemptCostParsed : FALLBACK_CONFIG.attemptCost,
      payouts: normalizedPayouts.length > 0 ? normalizedPayouts : FALLBACK_CONFIG.payouts
    };

    if (freeAttemptsParsed !== null) {
      config.freeAttemptsPerDay = freeAttemptsParsed;
    }
    if (cooldownParsed !== null) {
      config.cooldownSeconds = cooldownParsed;
    }

    const serialized = JSON.stringify(config, null, 2);
    const valid = attemptCostParsed > 0 && normalizedPayouts.length > 0;

    return { serializedConfig: serialized, isValid: valid, safePayouts: normalizedPayouts };
  }, [attemptCostInput, freeAttemptsInput, cooldownInput, payouts]);

  const totalReward = useMemo(
    () => safePayouts.reduce((sum, entry) => sum + entry.reward, 0),
    [safePayouts]
  );

  const addPayout = () => {
    setPayouts((current) => {
      const previous = current[current.length - 1];
      return [...current, createEmptyRow(previous)];
    });
  };

  const updatePayout = (id: string, changes: Partial<RunnerPayoutRow>) => {
    setPayouts((current) =>
      current.map((row) => (row.id === id ? { ...row, ...changes } : row))
    );
  };

  const removePayout = (id: string) => {
    setPayouts((current) => (current.length <= 1 ? current : current.filter((row) => row.id !== id)));
  };

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="runnerConfig" value={serializedConfig} />

      <div className="flex flex-col gap-4 py-3">
        <label className="flex flex-col gap-2 py-2 text-xs uppercase tracking-[0.16em] text-platinum/50">
          Стоимость попытки
          <input
            className="rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
            value={attemptCostInput}
            disabled={isDisabled}
            min={1}
            onChange={(event) => setAttemptCostInput(event.target.value)}
            type="number"
          />
        </label>
        <label className="flex flex-col gap-2 py-2 text-xs uppercase tracking-[0.16em] text-platinum/50">
          Бесплатных попыток/день
          <input
            className="rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
            value={freeAttemptsInput}
            disabled={isDisabled}
            min={0}
            onChange={(event) => setFreeAttemptsInput(event.target.value)}
            placeholder="0"
            type="number"
          />
        </label>
        <label className="flex flex-col gap-2 py-2 text-xs uppercase tracking-[0.16em] text-platinum/50">
          Кулдаун (сек.)
          <input
            className="rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
            value={cooldownInput}
            disabled={isDisabled}
            min={0}
            onChange={(event) => setCooldownInput(event.target.value)}
            placeholder="45"
            type="number"
          />
        </label>
      </div>
      <div className="border-b border-platinum/10 pb-4 mb-4" />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-platinum">Таблица наград</p>
            <p className="text-xs text-platinum/50">
              Укажите порог очков и награду в звёздах. Пороги автоматически сортируются по возрастанию.
            </p>
          </div>
          <button
            className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200 transition hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
            type="button"
            onClick={addPayout}
            disabled={isDisabled}
          >
            Добавить порог
          </button>
        </div>

        <div className="space-y-3">
          {payouts.map((row, index) => (
            <div
              key={row.id}
              className="flex flex-col gap-3 py-3"
            >
              {index > 0 && <div className="border-t border-platinum/10 pt-3 mt-3" />}
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.16em] text-platinum/50">
                Порог (очки)
                <input
                  className="rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                  value={row.threshold}
                  disabled={isDisabled}
                  min={1}
                  onChange={(event) => updatePayout(row.id, { threshold: event.target.value })}
                  type="number"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.16em] text-platinum/50">
                Награда (★)
                <input
                  className="rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                  value={row.reward}
                  disabled={isDisabled}
                  min={1}
                  onChange={(event) => updatePayout(row.id, { reward: event.target.value })}
                  type="number"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.16em] text-platinum/50">
                Метка (опционально)
                <input
                  className="rounded-lg border border-blue-400/30 bg-blue-500/20 px-3 py-2 text-sm text-white placeholder:text-blue-200/60 outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                  value={row.label}
                  disabled={isDisabled}
                  maxLength={32}
                  onChange={(event) => updatePayout(row.id, { label: event.target.value })}
                  placeholder="Например: Сверхновая"
                  type="text"
                />
              </label>
              <button
                className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-red-200 transition hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                type="button"
                onClick={() => removePayout(row.id)}
                disabled={isDisabled || payouts.length <= 1}
                aria-label={`Удалить порог #${index + 1}`}
              >
                Удалить
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="border-b border-platinum/10 pb-4 mb-4" />

      <div className="flex flex-wrap items-center gap-4 py-3 text-xs uppercase tracking-[0.16em] text-platinum/50">
        <span>Активных порогов: {safePayouts.length}</span>
        <span>Сумма наград: {totalReward} ★</span>
        {safePayouts.length > 0 && (
          <span>
            Мин. порог: {safePayouts[0].threshold} • Макс. порог: {safePayouts[safePayouts.length - 1].threshold}
          </span>
        )}
      </div>

      <button
        className="px-6 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-gold-200 transition hover:text-gold-100 disabled:cursor-not-allowed disabled:opacity-50"
        type="submit"
        disabled={isDisabled || !isValid}
      >
        Сохранить раннер
      </button>
    </form>
  );
}

