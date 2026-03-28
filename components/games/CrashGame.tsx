'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useTelegram } from '@/context/TelegramContext';
import { buildTelegramAuthHeaders } from '@/lib/telegram';

const CRASH_SRC = '/arcade/star-crash/index.html';

type CrashConfig = {
  baseBet?: number;
  maxMultiplier?: number;
  autoCashout?: number;
  roundDelay?: number;
};

type GameAvailability = {
  enabled: boolean;
  message?: string | null;
};

type CrashBalanceResponse = {
  available?: number;
  balance?: {
    available: number;
  };
};

function normalizeCrashConfig(value: unknown): CrashConfig | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const config: CrashConfig = {};
  if (typeof record.baseBet === 'number' && Number.isFinite(record.baseBet)) {
    config.baseBet = record.baseBet;
  }
  if (typeof record.maxMultiplier === 'number' && Number.isFinite(record.maxMultiplier)) {
    config.maxMultiplier = record.maxMultiplier;
  }
  if (typeof record.autoCashout === 'number' && Number.isFinite(record.autoCashout)) {
    config.autoCashout = record.autoCashout;
  }
  if (typeof record.roundDelay === 'number' && Number.isFinite(record.roundDelay)) {
    config.roundDelay = record.roundDelay;
  }

  return Object.keys(config).length > 0 ? config : null;
}

export default function CrashGame(): React.JSX.Element {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [config, setConfig] = useState<CrashConfig | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [availability, setAvailability] = useState<GameAvailability | null>(null);
  const configRef = useRef<CrashConfig | null>(null);
  const { initDataRaw } = useTelegram();

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }
    const handleLoad = () => {
      setIsLoaded(true);
      const frameWindow = frame.contentWindow;
      const currentConfig = configRef.current;
      if (frameWindow && currentConfig) {
        frameWindow.postMessage({ type: 'STAR_CRASH_CONFIG', payload: currentConfig }, '*');
      }
    };
    frame.addEventListener('load', handleLoad);
    return () => {
      frame.removeEventListener('load', handleLoad);
    };
  }, []);

  useEffect(() => {
    if (!initDataRaw) {
      return;
    }
    const controller = new AbortController();
    const loadConfig = async () => {
      try {
        const response = await fetch('/api/mini-app/games/config?gameType=CRASH', {
          headers: buildTelegramAuthHeaders(initDataRaw),
          signal: controller.signal
        });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as unknown;
        if (!payload || typeof payload !== 'object') {
          return;
        }
        const configValue = (payload as Record<string, unknown>).config;
        const statusValue = (payload as Record<string, unknown>).status;
        if (statusValue && typeof statusValue === 'object') {
          const statusRecord = statusValue as Record<string, unknown>;
          const enabled =
            typeof statusRecord.enabled === 'boolean'
              ? statusRecord.enabled
              : typeof statusRecord.disabled === 'boolean'
                ? !statusRecord.disabled
                : true;
          const message =
            typeof statusRecord.message === 'string'
              ? statusRecord.message
              : 'Игра временно недоступна.';
          setAvailability({ enabled, message });
        } else {
          setAvailability(null);
        }
        const normalized = normalizeCrashConfig(configValue);
        if (normalized) {
          configRef.current = normalized;
          setConfig(normalized);
          const frameWindow = frameRef.current?.contentWindow;
          if (isLoaded && frameWindow) {
            frameWindow.postMessage({ type: 'STAR_CRASH_CONFIG', payload: normalized }, '*');
          }
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
      }
    };
    void loadConfig();
    return () => {
      controller.abort();
    };
  }, [initDataRaw, isLoaded]);

  useEffect(() => {
    if (!initDataRaw) {
      return;
    }
    let timer: number | null = null;
    const controller = new AbortController();

    const pushBalanceToFrame = (available: number) => {
      const frameWindow = frameRef.current?.contentWindow;
      if (frameWindow) {
        frameWindow.postMessage({ type: 'STAR_CRASH_BALANCE', payload: { available } }, '*');
      }
    };

    const loadBalance = async () => {
      try {
        const response = await fetch('/api/mini-app/balance', {
          headers: buildTelegramAuthHeaders(initDataRaw),
          signal: controller.signal
        });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as CrashBalanceResponse;
        const available =
          typeof payload.available === 'number' ? payload.available : payload.balance?.available;
        if (typeof available === 'number') {
          pushBalanceToFrame(available);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
      }
    };

    void loadBalance();
    timer = window.setInterval(loadBalance, 15000);

    return () => {
      controller.abort();
      if (timer) {
        window.clearInterval(timer);
      }
    };
  }, [initDataRaw]);

  useEffect(() => {
    if (!initDataRaw || !isLoaded) {
      return;
    }
    const frameWindow = frameRef.current?.contentWindow;
    if (frameWindow) {
      frameWindow.postMessage({ type: 'STAR_CRASH_AUTH', payload: { initDataRaw } }, '*');
    }
  }, [initDataRaw, isLoaded]);

  const infoLines = useMemo(() => {
    const lines = [
      { label: 'Режим', value: 'Crash — режим высокого риска' },
      { label: 'Статус', value: isLoaded ? 'Готово к игре' : 'Загрузка…' }
    ];
    if (!config) {
      return lines;
    }

    lines.push({
      label: 'Базовая ставка',
      value: config.baseBet ? `${config.baseBet} ★` : 'По настройке игры'
    });
    lines.push({
      label: 'Макс. множитель',
      value: config.maxMultiplier ? `x${config.maxMultiplier.toFixed(2)}` : 'Без ограничений'
    });
    lines.push({
      label: 'Авто-вывод',
      value: config.autoCashout ? `x${config.autoCashout.toFixed(2)}` : 'Выключен'
    });
    lines.push({
      label: 'Интервал раундов',
      value: config.roundDelay ? `${config.roundDelay} с` : 'По умолчанию'
    });
    return lines;
  }, [config, isLoaded]);

  return (
    <div className="relative flex min-h-0 flex-1">
      <div className="relative flex h-full w-full flex-1 overflow-hidden rounded-[32px] border border-white/10 bg-black/60 shadow-[0_24px_54px_rgba(8,10,18,0.6)] min-h-[360px] sm:min-h-[480px] lg:min-h-[560px]">
        <div className="pointer-events-none absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 top-16 h-56 w-56 rounded-full bg-rose-400/20 blur-3xl" />
        <button
          aria-label={isPanelOpen ? 'Скрыть информацию о Star Crash' : 'Показать информацию о Star Crash'}
          className="absolute right-4 top-4 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white shadow-[0_10px_24px_rgba(6,7,11,0.5)] backdrop-blur transition active:scale-[0.94]"
          onClick={() => setIsPanelOpen((previous) => !previous)}
          type="button"
        >
          <span className="text-lg leading-none">⋯</span>
        </button>

        {isPanelOpen ? (
          <aside className="absolute right-4 top-16 z-30 w-[min(360px,90vw)] space-y-4 rounded-3xl border border-white/15 bg-black/85 p-5 text-white/80 shadow-[0_24px_48px_rgba(6,8,15,0.55)] backdrop-blur">
            <button
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20 active:scale-[0.92]"
              onClick={() => setIsPanelOpen(false)}
              type="button"
            >
              ×
            </button>
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-[0.24em] text-white/50">Star Crash — High Stakes Mode</p>
              <p className="text-sm text-white/70">
                Следите за ростом множителя и забирайте выигрыш до обрушения. Все параметры игры
                регулируются через административную панель.
              </p>
            </div>
            <div className="grid gap-3 text-sm text-white/80 sm:grid-cols-2">
              {infoLines.map((line) => (
                <div
                  key={`${line.label}-${line.value}`}
                  className="rounded-2xl border border-white/12 bg-white/5 px-3 py-2"
                >
                  <span className="text-[11px] uppercase tracking-[0.18em] text-white/45">{line.label}</span>
                  <span className="mt-1 block text-base font-semibold text-white">{line.value}</span>
                </div>
              ))}
            </div>
            <div className="space-y-2 text-xs uppercase tracking-[0.18em] text-white/60">
              <p className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-white/75">
                • Для запуска используйте кнопку «Запуск» в интерфейсе игры. Заберите выигрыш вовремя.
              </p>
              <p className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-white/75">
                • Настройки ставки, авто-вывода и множителя задаются в административной панели.
              </p>
            </div>
          </aside>
        ) : null}

        <div className="pointer-events-none absolute inset-x-0 top-6 z-10 flex justify-center">
          <span className="rounded-full border border-white/15 bg-black/60 px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.2em] text-white/80 shadow-[0_12px_24px_rgba(6,8,15,0.45)] backdrop-blur">
            Star Crash
          </span>
        </div>

        {!isLoaded && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-black/70 via-black/55 to-black/75 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold-300/70 border-t-transparent" />
            <p className="text-xs uppercase tracking-[0.18em] text-white/60">Загрузка Star Crash…</p>
          </div>
        )}
        {availability && !availability.enabled ? (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/80 text-center">
            <p className="text-xs uppercase tracking-[0.22em] text-rose-200/80">Игра недоступна</p>
            <p className="max-w-xs text-sm text-white/70">{availability.message ?? 'Игра временно недоступна.'}</p>
          </div>
        ) : null}
        <iframe
          allow="fullscreen"
          className="h-full w-full flex-1 border-none"
          ref={frameRef}
          src={CRASH_SRC}
          title="Star Crash"
        />
      </div>
    </div>
  );
}
