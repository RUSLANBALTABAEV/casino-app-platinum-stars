'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useTelegram } from '@/context/TelegramContext';
import { buildTelegramAuthHeaders } from '@/lib/telegram';

const CASES_SRC = '/arcade/star-cases/index.html';

type CaseItem = {
  name: string;
  rarity: string;
  weight: number;
  chance?: number;
  color?: string;
  stars?: number;
  description?: string;
};

type CaseEntry = {
  id: string;
  name: string;
  price: number;
  description?: string;
  items: CaseItem[];
};

type CaseConfig = {
  cases: CaseEntry[];
};

const DEFAULT_CASE_CONFIG: CaseConfig = {
  cases: [
    {
      id: 'astro',
      name: 'Astro Explorer',
      price: 120,
      description: 'Соберите экипировку первооткрывателя и найдите легендарные артефакты галактики.',
      items: [
        { name: 'Шлем пионера', rarity: 'Эпический', weight: 6, chance: 6, color: '#c084fc' },
        { name: 'Плащ кометы', rarity: 'Редкий', weight: 14, chance: 14, color: '#38bdf8' },
        { name: 'Карманный магнитар', rarity: 'Легендарный', weight: 2, chance: 2, color: '#fbbf24' },
        { name: 'Астро-компас', rarity: 'Необычный', weight: 22, chance: 22, color: '#60a5fa' },
        { name: 'Пыль звёзд', rarity: 'Обычный', weight: 56, chance: 56, color: '#f4f4f5' }
      ]
    },
    {
      id: 'nova',
      name: 'Nova Elite',
      price: 220,
      description: 'Премиум-набор для лидеров сезонов. Бонусы и увеличенные шансы на звёзды.',
      items: [
        { name: 'Знак Новы', rarity: 'Легендарный', weight: 4, chance: 4, color: '#f97316' },
        { name: 'Звёздный бустер', rarity: 'Эпический', weight: 10, chance: 10, color: '#c084fc' },
        { name: '500 ★', rarity: 'Редкий', weight: 16, chance: 16, color: '#facc15', stars: 500 },
        { name: '200 ★', rarity: 'Необычный', weight: 28, chance: 28, color: '#fde68a', stars: 200 },
        { name: '95 ★', rarity: 'Обычный', weight: 42, chance: 42, color: '#fff7ed', stars: 95 }
      ]
    },
    {
      id: 'guardian',
      name: 'Guardian Arsenal',
      price: 160,
      description: 'Снаряжение защитника арен. Усилители защиты и редкие жетоны.',
      items: [
        { name: 'Щит света', rarity: 'Эпический', weight: 8, chance: 8, color: '#22d3ee' },
        { name: 'Армейский дрон', rarity: 'Редкий', weight: 18, chance: 18, color: '#38bdf8' },
        { name: 'Жетон арены', rarity: 'Редкий', weight: 20, chance: 20, color: '#a5b4fc' },
        { name: 'Боевой стим', rarity: 'Необычный', weight: 24, chance: 24, color: '#f4f4f5' },
        { name: '75 ★', rarity: 'Обычный', weight: 30, chance: 30, color: '#fde68a', stars: 75 }
      ]
    },
    {
      id: 'starlounge',
      name: 'Star Lounge',
      price: 90,
      description: 'Кейс для быстрого пополнения коллекции. Бонусы для ежедневных миссий.',
      items: [
        { name: 'Аватар премиум', rarity: 'Редкий', weight: 12, chance: 12, color: '#fbbf24' },
        { name: 'Билет лотереи', rarity: 'Необычный', weight: 20, chance: 20, color: '#60a5fa' },
        { name: '45 ★', rarity: 'Обычный', weight: 40, chance: 40, color: '#fde68a', stars: 45 },
        { name: '25 ★', rarity: 'Обычный', weight: 28, chance: 28, color: '#fef3c7', stars: 25 }
      ]
    }
  ]
};

function isCaseConfig(value: unknown): value is CaseConfig {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  const casesValue = record.cases;
  return Array.isArray(casesValue) && casesValue.length > 0;
}

export default function CaseGame(): React.JSX.Element {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const configRef = useRef<CaseConfig>(DEFAULT_CASE_CONFIG);
  const { initDataRaw } = useTelegram();

  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [config, setConfig] = useState<CaseConfig>(DEFAULT_CASE_CONFIG);
  const [isPanelOpen, setIsPanelOpen] = useState<boolean>(false);

  useEffect(() => {
    configRef.current = config;
    if (!isLoaded) {
      return;
    }
    const frameWindow = frameRef.current?.contentWindow;
    if (frameWindow) {
      frameWindow.postMessage({ type: 'STAR_CASES_CONFIG', payload: config }, '*');
    }
  }, [config, isLoaded]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }

    const handleLoad = () => {
      setIsLoaded(true);
      const frameWindow = frame.contentWindow;
      if (frameWindow) {
        frameWindow.postMessage({ type: 'STAR_CASES_CONFIG', payload: configRef.current }, '*');
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
        const response = await fetch('/api/mini-app/games/config?gameType=CASE', {
          headers: buildTelegramAuthHeaders(initDataRaw),
          signal: controller.signal
        });

        if (!response.ok) {
          return;
        }

        const result = (await response.json()) as unknown;
        if (!result || typeof result !== 'object') {
          return;
        }

        const configValue = (result as Record<string, unknown>).config;
        if (isCaseConfig(configValue)) {
          setConfig(configValue);
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
  }, [initDataRaw]);

  const loadingLabel = useMemo(
    () => (config === DEFAULT_CASE_CONFIG ? 'Загрузка кейсов…' : 'Обновление конфигурации…'),
    [config]
  );

  const infoItems = useMemo(
    () => [
      { label: 'Статус', value: isLoaded ? 'Готово к игре' : 'Загрузка…' },
      { label: 'Контейнеров', value: String(config.cases.length) },
      { label: 'Источник', value: 'Star Cases Arcade' }
    ],
    [config.cases.length, isLoaded]
  );

  return (
    <div className="relative flex min-h-0 w-full flex-1">
      <button
        aria-label={isPanelOpen ? 'Скрыть описание кейсов' : 'Показать описание кейсов'}
        className="absolute right-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white shadow-[0_10px_24px_rgba(6,7,11,0.45)] backdrop-blur transition active:scale-[0.94]"
        onClick={() => setIsPanelOpen((prev) => !prev)}
        type="button"
      >
        <span className="text-lg leading-none">⋯</span>
      </button>

      {isPanelOpen ? (
        <div className="absolute right-4 top-16 z-40 w-[min(320px,85vw)] space-y-4 rounded-3xl border border-white/15 bg-black/85 p-4 text-white/80 shadow-[0_24px_48px_rgba(6,8,15,0.55)] backdrop-blur">
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/50">Legendary Vault</p>
            <h2 className="text-2xl font-semibold text-white">Star Cases</h2>
            <p className="text-sm text-white/65">
              Открывайте тематические контейнеры, настраиваемые через админку. Все изменения применяются
              на лету и доступны в Pyodide-версии игры.
            </p>
          </div>
          <div className="space-y-2 text-xs uppercase tracking-[0.16em] text-white/60">
            {infoItems.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-white/70"
              >
                <span>{item.label}</span>
                <span className="text-sm font-semibold text-white">{item.value}</span>
              </div>
            ))}
          </div>
          <button
            className="w-full rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/70 transition hover:text-white active:scale-[0.96]"
            onClick={() => setIsPanelOpen(false)}
            type="button"
          >
            Свернуть
          </button>
        </div>
      ) : null}

      <div className="relative flex-1 overflow-hidden rounded-[32px] border border-white/10 bg-black/50 shadow-[0_22px_48px_rgba(6,8,15,0.55)] min-h-[360px] sm:min-h-[480px] lg:min-h-[560px]">
        {!isLoaded && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-black/70 via-black/55 to-black/70 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold-400/70 border-t-transparent" />
            <p className="text-xs uppercase tracking-[0.18em] text-white/60">{loadingLabel}</p>
          </div>
        )}

        <iframe
          allow="fullscreen"
          className="h-full w-full flex-1 border-none"
          ref={frameRef}
          src={CASES_SRC}
          title="Star Cases"
        />
      </div>
    </div>
  );
}
