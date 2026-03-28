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

export default function CrashGame(): React.ReactNode {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [config, setConfig] = useState<CrashConfig | null>(null);
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

  const infoLines = useMemo(() => {
    if (!config) {
      return [
        { label: 'Режим', value: 'Crash — режим высокого риска' },
        { label: 'Статус', value: isLoaded ? 'Готово к игре' : 'Загрузка…' }
      ];
    }
    return [
      { label: 'Базовая ставка', value: config.baseBet ? `${config.baseBet} ★` : 'По настройке игры' },
      {
        label: 'Макс. множитель',
        value: config.maxMultiplier ? `x${config.maxMultiplier.toFixed(2)}` : 'Без ограничений'
      },
      {
        label: 'Авто-вывод',
        value: config.autoCashout ? `x${config.autoCashout.toFixed(2)}` : 'Выключен'
      },
      {
        label: 'Интервал раундов',
        value: config.roundDelay ? `${config.roundDelay} с` : 'По умолчанию'
      }
    ];
  }, [config, isLoaded]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-6">
      <header className="space-y-2 text-center sm:text-left">
        <p className="text-xs uppercase tracking-[0.18em] text-white/60">High Stakes Mode</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Star Crash</h1>
        <p className="mx-auto max-w-[52ch] text-sm text-white/60 sm:mx-0">
          Следите за ростом множителя и забирайте выигрыш до обрушения. Все параметры игры
          регулируются через административную панель.
        </p>
      </header>

      <div className="flex gap-3 overflow-x-auto rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-white/80 sm:grid sm:grid-cols-4 sm:overflow-visible">
        {infoLines.map((line) => (
          <div
            key={line.label}
            className="flex min-w-[160px] flex-col gap-1 rounded-2xl bg-white/5 px-3 py-2 sm:min-w-0"
          >
            <span className="text-[11px] uppercase tracking-[0.18em] text-white/50">{line.label}</span>
            <span className="text-base font-semibold text-white">{line.value}</span>
          </div>
        ))}
      </div>

      <div className="relative flex-1 overflow-hidden rounded-[32px] border border-white/10 bg-black/60 shadow-[0_24px_54px_rgba(8,10,18,0.6)] min-h-[360px] sm:min-h-[480px] lg:min-h-[560px]">
        {!isLoaded && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-black/70 via-black/55 to-black/75 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold-300/70 border-t-transparent" />
            <p className="text-xs uppercase tracking-[0.18em] text-white/60">Загрузка Star Crash…</p>
          </div>
        )}
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
